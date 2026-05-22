param(
    [string]$ProjectRoot,
    [string]$ReportDate,
    [switch]$CrossCheck,
    [switch]$StrictCrossCheck,
    [switch]$SkipDb
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8

if (-not $ProjectRoot) {
    $ProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}
else {
    $ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
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

try {
    $python = Resolve-Python -Root $ProjectRoot
    Assert-PythonModule -Python $python -ModuleName "requests"
}
catch {
    Write-Host $_.Exception.Message
    exit 1
}

$scriptArgs = @(
    (Join-Path $PSScriptRoot "validate_daily_data.py"),
    "--project-root", $ProjectRoot
)
if ($ReportDate) {
    $scriptArgs += @("--report-date", $ReportDate)
}
if ($CrossCheck) {
    $scriptArgs += "--cross-check"
}
if ($StrictCrossCheck) {
    $scriptArgs += "--strict-cross-check"
}
if ($SkipDb) {
    $scriptArgs += "--skip-db"
}

$jsonText = (& $python @scriptArgs) -join "`n"
$exitCode = $LASTEXITCODE

try {
    $result = $jsonText | ConvertFrom-Json
}
catch {
    Write-Host $jsonText
    exit $exitCode
}

if (-not $result -or -not $result.report_date) {
    Write-Host $jsonText
    exit $(if ($exitCode -ne 0) { $exitCode } else { 1 })
}

Write-Host "Daily Report validation result"
Write-Host "Report date : $($result.report_date)"
Write-Host "Observations: $($result.observations)"
Write-Host "Status      : $($result.status)"
Write-Host ""

if ($result.cross_checks -and $result.cross_checks.Count -gt 0) {
    Write-Host "External cross-check"
    $result.cross_checks |
        Select-Object `
            @{Name = "Metric"; Expression = { $_.name } },
            @{Name = "Symbol"; Expression = { $_.symbol } },
            @{Name = "Local"; Expression = { "{0:N4}" -f [double]$_.local } },
            @{Name = "External"; Expression = { "{0:N4}" -f [double]$_.external } },
            @{Name = "DiffPct"; Expression = { "{0:N2}%" -f [double]$_.diff_pct } },
            @{Name = "Tolerance"; Expression = { "{0:N2}%" -f [double]$_.tolerance_pct } },
            @{Name = "Result"; Expression = { if ($_.passed) { "PASS" } else { "WARN" } } } |
        Format-Table -AutoSize
    Write-Host ""

    Write-Host "Yahoo Finance links"
    foreach ($item in $result.cross_checks) {
        Write-Host ("- {0} ({1}): {2}" -f $item.name, $item.symbol, $item.url)
    }
    Write-Host ""
}

if ($result.errors -and $result.errors.Count -gt 0) {
    Write-Host "Errors"
    foreach ($item in $result.errors) {
        Write-Host "- $item"
    }
    Write-Host ""
}

if ($result.warnings -and $result.warnings.Count -gt 0) {
    Write-Host "Warnings"
    $externalSkipped = @($result.warnings | Where-Object { $_ -like "External check skipped for *" })
    $otherWarnings = @($result.warnings | Where-Object { $_ -notlike "External check skipped for *" })
    foreach ($item in $otherWarnings) {
        Write-Host "- $item"
    }
    if ($externalSkipped.Count -gt 0) {
        Write-Host "- External checks skipped: $($externalSkipped.Count). Check internet/security policy if Yahoo cross-check is required."
    }
    Write-Host ""
}

if ($result.status -eq "pass" -and (-not $result.warnings -or $result.warnings.Count -eq 0)) {
    Write-Host "Validation passed: local JSON, Supabase rows, and configured cross-checks are within tolerance."
}
elseif ($result.status -eq "pass") {
    Write-Host "Validation passed with warnings: local JSON and Supabase rows are valid, but review warnings above."
}
else {
    Write-Host "Validation failed: review the errors above."
}

if ($exitCode -ne 0) {
    exit $exitCode
}
