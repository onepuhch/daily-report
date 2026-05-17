param(
    [string]$ProjectRoot
)

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [Text.Encoding]::UTF8

function Get-ProjectRoot {
    if ($ProjectRoot) {
        return (Resolve-Path -LiteralPath $ProjectRoot).Path
    }

    return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}

function Read-DotEnv {
    param([string]$Path)

    $values = @{}
    if (-not (Test-Path -LiteralPath $Path)) {
        return $values
    }

    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) {
            continue
        }

        $parts = $trimmed -split "=", 2
        if ($parts.Count -eq 2) {
            $values[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'")
        }
    }

    return $values
}

function Write-Check {
    param(
        [string]$Status,
        [string]$Message
    )

    $prefix = switch ($Status) {
        "OK" { "[OK]  " }
        "WARN" { "[WARN]" }
        "FAIL" { "[FAIL]" }
        default { "[INFO]" }
    }

    Write-Host "$prefix $Message"
}

function Test-Placeholder {
    param([string]$Value)

    return (-not $Value) -or $Value.StartsWith("your-") -or $Value.Contains("your-project-ref")
}

$root = Get-ProjectRoot
$envPath = Join-Path $root ".env"
$envValues = Read-DotEnv -Path $envPath

Write-Host ""
Write-Host "Daily Report environment check"
Write-Host "Project: $root"
Write-Host ""

$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    $nodeVersion = (& node --version) 2>$null
    Write-Check "OK" "Node.js detected: $nodeVersion"
}
else {
    Write-Check "FAIL" "Node.js is not installed or not available in PATH."
}

$requiredFiles = @(
    "src\daily_report\admin\server.mjs",
    "src\daily_report\admin\index.html",
    "src\daily_report\admin\archive.html",
    "scripts\01_extract_preview.cmd",
    "scripts\04_refresh_infomax_excel.cmd",
    "scripts\05_infomax_daily_workflow.cmd",
    "scripts\Refresh-InfomaxWorkbook.ps1",
    "scripts\03_start_admin.cmd",
    "db\schema.sql"
)

foreach ($relative in $requiredFiles) {
    $full = Join-Path $root $relative
    if (Test-Path -LiteralPath $full) {
        Write-Check "OK" "Required file exists: $relative"
    }
    else {
        Write-Check "FAIL" "Required file missing: $relative"
    }
}

if (Test-Path -LiteralPath $envPath) {
    Write-Check "OK" ".env file exists."
}
else {
    Write-Check "WARN" ".env file is missing. Copy .env.example to .env and fill in local settings."
}

$excelFromEnv = $envValues["INFOMAX_EXCEL_PATH"]
$fallbackExcel = Join-Path $root "MARKET DAILY.xlsm"
if ($excelFromEnv -and (Test-Path -LiteralPath $excelFromEnv)) {
    Write-Check "OK" "Excel workbook found from INFOMAX_EXCEL_PATH."
}
elseif (Test-Path -LiteralPath $fallbackExcel) {
    Write-Check "OK" "Excel workbook found in project folder: MARKET DAILY.xlsm"
}
elseif ($excelFromEnv) {
    Write-Check "WARN" "INFOMAX_EXCEL_PATH is set, but the file was not found: $excelFromEnv"
}
else {
    Write-Check "WARN" "Excel workbook not found. Put MARKET DAILY.xlsm in the project folder or set INFOMAX_EXCEL_PATH."
}

if (Test-Placeholder $envValues["SUPABASE_URL"]) {
    Write-Check "WARN" "SUPABASE_URL is empty or still a placeholder."
}
else {
    Write-Check "OK" "SUPABASE_URL is configured."
}

if ((Test-Placeholder $envValues["SUPABASE_ANON_KEY"]) -and (Test-Placeholder $envValues["SUPABASE_SERVICE_ROLE_KEY"])) {
    Write-Check "WARN" "Supabase keys are empty or placeholders. SQL file workflow can still be used."
}
elseif (Test-Placeholder $envValues["SUPABASE_SERVICE_ROLE_KEY"]) {
    Write-Check "WARN" "SUPABASE_SERVICE_ROLE_KEY is not configured. Direct save may fail with permission denied."
}
else {
    Write-Check "OK" "SUPABASE_SERVICE_ROLE_KEY is configured. Direct save should be available if the key is valid."
}

$processedDir = Join-Path $root "data\processed"
$reportFiles = @()
if (Test-Path -LiteralPath $processedDir) {
    $reportFiles = @(Get-ChildItem -LiteralPath $processedDir -Filter "market_daily_*.json" -ErrorAction SilentlyContinue)
}

if ($reportFiles.Count -gt 0) {
    $latest = $reportFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    Write-Check "OK" "Processed report JSON found: $($reportFiles.Count). Latest: $($latest.Name)"
}
else {
    Write-Check "WARN" "No processed report JSON found. Run scripts\01_extract_preview.cmd first."
}

$outputDir = Join-Path $root "output"
$htmlFiles = @()
if (Test-Path -LiteralPath $outputDir) {
    $htmlFiles = @(Get-ChildItem -LiteralPath $outputDir -Filter "market_daily_*.html" -ErrorAction SilentlyContinue)
}

if ($htmlFiles.Count -gt 0) {
    Write-Check "OK" "HTML previews found: $($htmlFiles.Count)"
}
else {
    Write-Check "WARN" "No HTML preview found. Run scripts\01_extract_preview.cmd first."
}

$git = Get-Command git -ErrorAction SilentlyContinue
if ($git) {
    $gitOutput = (& git -C $root status --short 2>&1) -join "`n"
    if ($gitOutput -match "dubious ownership") {
        Write-Check "WARN" "Git safe.directory is not configured for this folder."
        Write-Host "       Run once:"
        Write-Host "       git config --global --add safe.directory `"$($root.Replace('\', '/'))`""
    }
    elseif ($LASTEXITCODE -eq 0 -and $gitOutput -notmatch "^fatal:") {
        Write-Check "OK" "Git status is readable."
    }
    else {
        Write-Check "WARN" "Git status check failed: $gitOutput"
    }
}
else {
    Write-Check "WARN" "Git is not installed or not available in PATH."
}

Write-Host ""
Write-Host "Next recommended manual checks:"
Write-Host "1. On the Infomax PC, run scripts\04_refresh_infomax_excel.cmd"
Write-Host "2. Run scripts\01_extract_preview.cmd"
Write-Host "3. Run scripts\03_start_admin.cmd"
Write-Host "4. Open http://127.0.0.1:4173/admin"
Write-Host "5. Open http://127.0.0.1:4173/reports"
Write-Host ""
