param(
    [int]$LookbackDays = 10,
    [switch]$SkipRefresh,
    [switch]$NoValidation
)

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$logDir = Join-Path $projectRoot "data\logs"

Write-Host "Manual Daily Report recovery upload"
Write-Host "Project: $projectRoot"
Write-Host ""

$updateArgs = @(
    "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $PSScriptRoot "Run-DailyMarketUpdate.ps1"),
    "-LookbackDays", "$LookbackDays",
    "-Visible"
)
if ($SkipRefresh) {
    $updateArgs += "-SkipRefresh"
}

& powershell.exe @updateArgs
$updateExit = $LASTEXITCODE

if ($updateExit -ne 0) {
    Write-Host ""
    Write-Host "[FAILED] Manual upload failed. Exit code: $updateExit"
    Write-Host "Recent logs:"
    if (Test-Path -LiteralPath $logDir) {
        Get-ChildItem -LiteralPath $logDir -Filter "daily_update_*.log" |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 3 FullName, LastWriteTime, Length |
            Format-Table -AutoSize

        $latestLog = Get-ChildItem -LiteralPath $logDir -Filter "daily_update_*.log" |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if ($latestLog) {
            Write-Host ""
            Write-Host "Last 60 log lines:"
            Get-Content -LiteralPath $latestLog.FullName -Encoding UTF8 | Select-Object -Last 60
        }
    }
    Write-Host ""
    Write-Host "Run scripts\07_check_pipeline_status.cmd and send the output/log to the owner."
    exit $updateExit
}

if (-not $NoValidation) {
    Write-Host ""
    Write-Host "Running validation..."
    & powershell.exe -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "Validate-DailyData.ps1") -CrossCheck
    $validationExit = $LASTEXITCODE
    if ($validationExit -ne 0) {
        Write-Host ""
        Write-Host "[WARNING] Upload succeeded but validation failed. Review the validation output above."
        exit $validationExit
    }
}

Write-Host ""
Write-Host "Manual recovery upload completed."
exit 0
