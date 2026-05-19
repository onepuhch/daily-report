param(
    [string]$WorkbookPath,
    [string]$ProjectRoot,
    [int]$LookbackDays = 10,
    [int]$WaitSeconds = 90,
    [switch]$Visible,
    [switch]$SkipRefresh
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$transcriptStarted = $false

function Get-ProjectRoot {
    if ($ProjectRoot) {
        return (Resolve-Path -LiteralPath $ProjectRoot).Path
    }

    return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}

function Resolve-Python {
    param([string]$Root)

    $venvPython = Join-Path $Root ".venv-docling\Scripts\python.exe"
    if (Test-Path -LiteralPath $venvPython) {
        return $venvPython
    }

    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        return $python.Source
    }

    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) {
        return $py.Source
    }

    throw "Python was not found. Install Python or recreate .venv-docling."
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

function Record-JobRun {
    param(
        [string]$Python,
        [string]$Status,
        [string]$RunId,
        [string]$FromDate,
        [string]$UntilDate,
        [int]$UploadedReports = -1,
        [int]$UploadedObservations = -1,
        [string]$Message = "",
        [string]$LogPath = ""
    )

    $args = @(
        (Join-Path $PSScriptRoot "record_job_run.py"),
        "--run-id", $RunId,
        "--status", $Status,
        "--message", $Message,
        "--log-path", $LogPath
    )
    if ($FromDate) {
        $args += @("--report-from", $FromDate)
    }
    if ($UntilDate) {
        $args += @("--report-until", $UntilDate)
    }
    if ($UploadedReports -ge 0) {
        $args += @("--uploaded-reports", "$UploadedReports")
    }
    if ($UploadedObservations -ge 0) {
        $args += @("--uploaded-observations", "$UploadedObservations")
    }

    try {
        & $Python @args | ForEach-Object { Write-Host $_ }
    }
    catch {
        Write-Host "Job run recording skipped: $($_.Exception.Message)"
    }
}

$root = Get-ProjectRoot
$envValues = Read-DotEnv -Path (Join-Path $root ".env")
if ($envValues.Count -eq 0) {
    $envValues = Read-DotEnv -Path (Join-Path (Split-Path -Parent $root) ".env")
}
$logDir = Join-Path $root "data\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logPath = Join-Path $logDir ("daily_update_{0}.log" -f (Get-Date).ToString("yyyyMMdd_HHmmss"))
$runId = [guid]::NewGuid().ToString()
try {
    Start-Transcript -Path $logPath -Append | Out-Null
    $transcriptStarted = $true
    Write-Host "Log: $logPath"
}
catch {
    Write-Host "Could not start transcript: $($_.Exception.Message)"
}

try {
if (-not $WorkbookPath) {
    $candidates = @(
        $envValues["INFOMAX_EXCEL_PATH"],
        (Join-Path (Split-Path -Parent (Split-Path -Parent $root)) "MARKET DAILY.xlsm"),
        (Join-Path (Split-Path -Parent $root) "MARKET DAILY.xlsm"),
        (Join-Path $root "MARKET DAILY.xlsm")
    ) | Where-Object { $_ }

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            $WorkbookPath = $candidate
            break
        }
    }
}

if (-not (Test-Path -LiteralPath $WorkbookPath)) {
    throw "Workbook not found: $WorkbookPath"
}

$WorkbookPath = (Resolve-Path -LiteralPath $WorkbookPath).Path
$python = Resolve-Python -Root $root
$until = (Get-Date).AddDays(-1).ToString("yyyy-MM-dd")
$fromDate = (Get-Date).AddDays(-1 * [Math]::Max($LookbackDays, 1)).ToString("yyyy-MM-dd")

Write-Host "Daily Market update"
Write-Host "Project: $root"
Write-Host "Workbook: $WorkbookPath"
Write-Host "Date window: $fromDate ~ $until"
Write-Host "Run id: $runId"
Write-Host ""

Record-JobRun `
    -Python $python `
    -Status "started" `
    -RunId $runId `
    -FromDate $fromDate `
    -UntilDate $until `
    -Message "Daily update started." `
    -LogPath $logPath

if (-not $SkipRefresh) {
    Write-Host "[1/4] Refreshing workbook..."
    $refreshArgs = @(
        "-ExecutionPolicy", "Bypass",
        "-File", (Join-Path $PSScriptRoot "Refresh-InfomaxWorkbook.ps1"),
        "-WorkbookPath", $WorkbookPath,
        "-ProjectRoot", $root,
        "-WaitSeconds", "$WaitSeconds"
    )
    if ($Visible) {
        $refreshArgs += "-Visible"
    }
    & powershell.exe @refreshArgs
    if ($LASTEXITCODE -ne 0) {
        Record-JobRun `
            -Python $python `
            -Status "failed" `
            -RunId $runId `
            -FromDate $fromDate `
            -UntilDate $until `
            -Message "Workbook refresh failed with exit code $LASTEXITCODE." `
            -LogPath $logPath
        exit $LASTEXITCODE
    }
}
else {
    Write-Host "[1/4] Skipping workbook refresh."
}

Write-Host ""
Write-Host "[2/4] Writing JSON without uploading..."
$extractOutput = & $python `
    (Join-Path $PSScriptRoot "import_historical_market_data.py") `
    --workbook $WorkbookPath `
    --project-root $root `
    --from-date $fromDate `
    --until $until `
    --write-json `
    --dry-run 2>&1
$extractExitCode = $LASTEXITCODE
$extractOutput | ForEach-Object { Write-Host $_ }

if ($extractExitCode -ne 0) {
    Record-JobRun `
        -Python $python `
        -Status "failed" `
        -RunId $runId `
        -FromDate $fromDate `
        -UntilDate $until `
        -Message "JSON extraction failed with exit code $extractExitCode. Upload was not attempted." `
        -LogPath $logPath
    exit $extractExitCode
}

$generatedReportCount = 0
$generatedUntil = $null
foreach ($line in $extractOutput) {
    try {
        $parsed = $line | ConvertFrom-Json
        if ($null -ne $parsed.reports) {
            $generatedReportCount = [int]$parsed.reports
        }
        if ($parsed.until) {
            $generatedUntil = [string]$parsed.until
        }
    }
    catch {
    }
}

if ($generatedReportCount -le 0 -or -not $generatedUntil) {
    Record-JobRun `
        -Python $python `
        -Status "failed" `
        -RunId $runId `
        -FromDate $fromDate `
        -UntilDate $until `
        -Message "No report JSON was generated. Upload was not attempted." `
        -LogPath $logPath
    exit 1
}

Write-Host ""
Write-Host "[3/4] Running pre-upload validation..."
$preValidationOutput = & $python `
    (Join-Path $PSScriptRoot "validate_daily_data.py") `
    --project-root $root `
    --report-date $generatedUntil `
    --skip-db `
    --cross-check `
    --strict-cross-check 2>&1
$preValidationExitCode = $LASTEXITCODE
$preValidationOutput | ForEach-Object { Write-Host $_ }

if ($preValidationExitCode -ne 0) {
    Record-JobRun `
        -Python $python `
        -Status "failed" `
        -RunId $runId `
        -FromDate $fromDate `
        -UntilDate $generatedUntil `
        -Message "Pre-upload data validation failed with exit code $preValidationExitCode. Upload was blocked." `
        -LogPath $logPath
    exit $preValidationExitCode
}

Write-Host ""
Write-Host "[4/4] Uploading validated reports to Supabase..."
$importOutput = & $python `
    (Join-Path $PSScriptRoot "import_historical_market_data.py") `
    --workbook $WorkbookPath `
    --project-root $root `
    --from-date $fromDate `
    --until $until 2>&1
$importExitCode = $LASTEXITCODE
$importOutput | ForEach-Object { Write-Host $_ }

if ($importExitCode -ne 0) {
    Record-JobRun `
        -Python $python `
        -Status "failed" `
        -RunId $runId `
        -FromDate $fromDate `
        -UntilDate $generatedUntil `
        -Message "Supabase import failed with exit code $importExitCode." `
        -LogPath $logPath
    exit $importExitCode
}

$uploadedReports = -1
$uploadedObservations = -1
foreach ($line in $importOutput) {
    try {
        $parsed = $line | ConvertFrom-Json
        if ($null -ne $parsed.uploaded_reports) {
            $uploadedReports = [int]$parsed.uploaded_reports
        }
        if ($null -ne $parsed.uploaded_observations) {
            $uploadedObservations = [int]$parsed.uploaded_observations
        }
    }
    catch {
    }
}

Write-Host ""
Write-Host "Running post-upload DB validation..."
$validationOutput = & $python `
    (Join-Path $PSScriptRoot "validate_daily_data.py") `
    --project-root $root `
    --report-date $generatedUntil 2>&1
$validationExitCode = $LASTEXITCODE
$validationOutput | ForEach-Object { Write-Host $_ }

if ($validationExitCode -ne 0) {
    Record-JobRun `
        -Python $python `
        -Status "failed" `
        -RunId $runId `
        -FromDate $fromDate `
        -UntilDate $until `
        -UploadedReports $uploadedReports `
        -UploadedObservations $uploadedObservations `
        -Message "Data validation failed with exit code $validationExitCode." `
        -LogPath $logPath
    exit $validationExitCode
}

Record-JobRun `
    -Python $python `
    -Status "success" `
    -RunId $runId `
    -FromDate $fromDate `
    -UntilDate $until `
    -UploadedReports $uploadedReports `
    -UploadedObservations $uploadedObservations `
    -Message "Daily update complete." `
    -LogPath $logPath

Write-Host ""
Write-Host "Daily Market update complete."
}
catch {
    $message = $_.Exception.Message
    Write-Host "Daily Market update failed: $message"
    if ($python) {
        Record-JobRun `
            -Python $python `
            -Status "failed" `
            -RunId $runId `
            -FromDate $fromDate `
            -UntilDate $until `
            -Message $message `
            -LogPath $logPath
    }
    throw
}
finally {
    if ($transcriptStarted) {
        Stop-Transcript | Out-Null
    }
}
