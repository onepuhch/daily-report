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

$python = Resolve-Python -Root $ProjectRoot
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
