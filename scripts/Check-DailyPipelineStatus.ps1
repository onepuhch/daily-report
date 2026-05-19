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
        LastRunTime = $info.LastRunTime
        LastTaskResult = $info.LastTaskResult
        NextRunTime = $info.NextRunTime
        MissedRuns = $info.NumberOfMissedRuns
    } | Format-List
}
else {
    Write-Host "Scheduled task not registered."
}

Write-Host "[Recent logs]"
$logDir = Join-Path $ProjectRoot "data\logs"
if (Test-Path -LiteralPath $logDir) {
    Get-ChildItem -LiteralPath $logDir -Filter "daily_update_*.log" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 5 Name, LastWriteTime, Length |
        Format-Table -AutoSize
}
else {
    Write-Host "No log directory found."
}

Write-Host ""
Write-Host "[Supabase]"
$python = Resolve-Python -Root $ProjectRoot
& $python (Join-Path $PSScriptRoot "check_supabase_status.py")
