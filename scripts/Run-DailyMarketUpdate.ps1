param(
    [string]$WorkbookPath,
    [string]$ProjectRoot,
    [int]$LookbackDays = 10,
    [string]$FromDate,
    [string]$UntilDate,
    [int]$WaitSeconds = 90,
    [switch]$Visible,
    [switch]$SkipRefresh,
    [string]$RunId,
    [string]$LogPath
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

    function Test-PythonCandidate {
        param([string]$Candidate)

        try {
            & $Candidate -c "import sys; sys.exit(0 if sys.version_info[0] == 3 else 1)" *> $null
            return $LASTEXITCODE -eq 0
        }
        catch {
            return $false
        }
    }

    if ($env:DAILY_REPORT_PYTHON) {
        if (Test-PythonCandidate -Candidate $env:DAILY_REPORT_PYTHON) {
            return $env:DAILY_REPORT_PYTHON
        }
        throw "DAILY_REPORT_PYTHON is set but is not a usable Python 3 executable: $env:DAILY_REPORT_PYTHON"
    }

    $venvPython = Join-Path $Root ".venv-docling\Scripts\python.exe"
    if ((Test-Path -LiteralPath $venvPython) -and (Test-PythonCandidate -Candidate $venvPython)) {
        return $venvPython
    }

    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python -and (Test-PythonCandidate -Candidate $python.Source)) {
        return $python.Source
    }

    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py -and (Test-PythonCandidate -Candidate $py.Source)) {
        return $py.Source
    }

    throw "Python 3 was not found. Install Python, recreate .venv-docling, or set DAILY_REPORT_PYTHON."
}

function Assert-PythonModule {
    param(
        [string]$Python,
        [string]$ModuleName
    )

    & $Python -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('$ModuleName') else 1)" 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Python module '$ModuleName' is missing. Run: $Python -m pip install -r requirements.txt"
    }
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
if (-not $LogPath) {
    $LogPath = Join-Path $logDir ("daily_update_{0}.log" -f (Get-Date).ToString("yyyyMMdd_HHmmss"))
}
if (-not $RunId) {
    $RunId = [guid]::NewGuid().ToString()
}
try {
    Start-Transcript -Path $LogPath -Append | Out-Null
    $transcriptStarted = $true
    Write-Host "Log: $LogPath"
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
Assert-PythonModule -Python $python -ModuleName "requests"
$until = if ($UntilDate) { $UntilDate } else { (Get-Date).AddDays(-1).ToString("yyyy-MM-dd") }
$fromDate = if ($FromDate) { $FromDate } else { (Get-Date).AddDays(-1 * [Math]::Max($LookbackDays, 1)).ToString("yyyy-MM-dd") }

Write-Host "Daily Market update"
Write-Host "Project: $root"
Write-Host "Workbook: $WorkbookPath"
Write-Host "Date window: $fromDate ~ $until"
Write-Host "Run id: $RunId"
Write-Host ""

Record-JobRun `
    -Python $python `
    -Status "started" `
    -RunId $RunId `
    -FromDate $fromDate `
    -UntilDate $until `
    -Message "Daily update started." `
    -LogPath $LogPath

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
            -RunId $RunId `
            -FromDate $fromDate `
            -UntilDate $until `
            -Message "Workbook refresh failed with exit code $LASTEXITCODE." `
            -LogPath $LogPath
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
        -RunId $RunId `
        -FromDate $fromDate `
        -UntilDate $until `
        -Message "JSON extraction failed with exit code $extractExitCode. Upload was not attempted." `
        -LogPath $LogPath
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
        -RunId $RunId `
        -FromDate $fromDate `
        -UntilDate $until `
        -Message "No report JSON was generated. Upload was not attempted." `
        -LogPath $LogPath
    exit 1
}

Write-Host ""
Write-Host "[3/4] Running pre-upload validation..."
$preValidationOutput = & $python `
    (Join-Path $PSScriptRoot "validate_daily_data.py") `
    --project-root $root `
    --report-date $generatedUntil `
    --skip-db `
    --cross-check 2>&1
$preValidationExitCode = $LASTEXITCODE
$preValidationOutput | ForEach-Object { Write-Host $_ }

if ($preValidationExitCode -ne 0) {
    Record-JobRun `
        -Python $python `
        -Status "failed" `
        -RunId $RunId `
        -FromDate $fromDate `
        -UntilDate $generatedUntil `
        -Message "Pre-upload data validation failed with exit code $preValidationExitCode. Upload was blocked." `
        -LogPath $LogPath
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
        -RunId $RunId `
        -FromDate $fromDate `
        -UntilDate $generatedUntil `
        -Message "Supabase import failed with exit code $importExitCode." `
        -LogPath $LogPath
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
        -RunId $RunId `
        -FromDate $fromDate `
        -UntilDate $until `
        -UploadedReports $uploadedReports `
        -UploadedObservations $uploadedObservations `
        -Message "Data validation failed with exit code $validationExitCode." `
        -LogPath $LogPath
    exit $validationExitCode
}

$successMessage = "Daily update complete. Latest generated report date: $generatedUntil; requested until: $until."
if ($generatedUntil -lt $until) {
    Write-Host ""
    Write-Host "Freshness warning: latest generated report date is $generatedUntil, but requested until was $until."
    Write-Host "This usually means the workbook did not contain a complete valid row for the requested latest date."
}

Record-JobRun `
    -Python $python `
    -Status "success" `
    -RunId $RunId `
    -FromDate $fromDate `
    -UntilDate $until `
    -UploadedReports $uploadedReports `
    -UploadedObservations $uploadedObservations `
    -Message $successMessage `
    -LogPath $LogPath

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
            -RunId $RunId `
            -FromDate $fromDate `
            -UntilDate $until `
            -Message $message `
            -LogPath $LogPath
    }
    throw
}
finally {
    if ($transcriptStarted) {
        Stop-Transcript | Out-Null
    }
}
