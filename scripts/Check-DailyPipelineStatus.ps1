param(
    [string]$ProjectRoot
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

Write-Host "Daily Market pipeline status"
Write-Host "Project: $ProjectRoot"
Write-Host ""

Write-Host "[Scheduled task]"
$task = Get-ScheduledTask -TaskName "Market Daily Supabase Upload" -ErrorAction SilentlyContinue
if ($task) {
    $info = Get-ScheduledTaskInfo -TaskName "Market Daily Supabase Upload"
    [pscustomobject]@{
        TaskName = $task.TaskName
        State = $task.State
        LastRunTime = if ($info.LastRunTime) { $info.LastRunTime.ToString("yyyy-MM-dd HH:mm:ss") } else { $null }
        LastTaskResult = $info.LastTaskResult
        NextRunTime = if ($info.NextRunTime) { $info.NextRunTime.ToString("yyyy-MM-dd HH:mm:ss") } else { $null }
        MissedRuns = $info.NumberOfMissedRuns
    } | Format-List
}
else {
    Write-Host "Scheduled task not registered or not visible for the current Windows user."
}

Write-Host "[Recent logs]"
$logDir = Join-Path $ProjectRoot "data\logs"
if (Test-Path -LiteralPath $logDir) {
    Get-ChildItem -LiteralPath $logDir -Filter "daily_update_*.log" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 5 Name, @{Name = "LastWriteTime"; Expression = { $_.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss") } }, Length |
        Format-Table -AutoSize
}
else {
    Write-Host "No log directory found."
}

Write-Host ""
Write-Host "[Supabase]"
$python = Resolve-Python -Root $ProjectRoot
$statusOutput = & $python (Join-Path $PSScriptRoot "check_supabase_status.py") 2>&1
$statusExitCode = $LASTEXITCODE
$statusOutput | ForEach-Object { Write-Host $_ }

try {
    $statusJson = ($statusOutput -join "`n") | ConvertFrom-Json
    if ($statusJson.status -eq "ok" -and $statusJson.freshness) {
        Write-Host ""
        Write-Host "[Freshness]"
        if ($statusJson.freshness.is_current) {
            Write-Host "OK: latest report date $($statusJson.freshness.latest_report_date) matches expected $($statusJson.freshness.expected_latest_report_date)."
        }
        else {
            Write-Host "WARN: latest report date is $($statusJson.freshness.latest_report_date); expected $($statusJson.freshness.expected_latest_report_date)."
            Write-Host "Check whether MARKET DAILY.xlsm contains a complete valid row for the expected date, then rerun from Admin if needed."
        }
    }
}
catch {
}

if ($statusExitCode -ne 0) {
    Write-Host ""
    Write-Host "Supabase status check did not complete. Review the message above, then check Admin > Automation Log if the local Admin server is running."
}
