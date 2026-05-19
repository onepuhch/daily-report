param(
    [string]$TaskName = "Market Daily Supabase Upload",
    [string]$ProjectRoot,
    [string]$At = "08:30",
    [int]$LookbackDays = 10,
    [switch]$VisibleExcel
)

$ErrorActionPreference = "Stop"

if (-not $ProjectRoot) {
    $ProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}
else {
    $ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
}

$scriptPath = Join-Path $ProjectRoot "scripts\Run-DailyMarketUpdate.ps1"
if (-not (Test-Path -LiteralPath $scriptPath)) {
    throw "Script not found: $scriptPath"
}

$arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$scriptPath`"",
    "-LookbackDays", "$LookbackDays"
)
if ($VisibleExcel) {
    $arguments += "-Visible"
}

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument ($arguments -join " ") `
    -WorkingDirectory $ProjectRoot

$trigger = New-ScheduledTaskTrigger -Daily -At ([datetime]::ParseExact($At, "HH:mm", $null))
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Refresh MARKET DAILY.xlsm and upload recent reports to Supabase." `
    -Force | Out-Null

Write-Output "Registered scheduled task: $TaskName"
Write-Output "Time: $At daily"
Write-Output "Script: $scriptPath"
