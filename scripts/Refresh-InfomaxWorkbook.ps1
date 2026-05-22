param(
    [string]$WorkbookPath,
    [string]$ProjectRoot,
    [int]$WaitSeconds = 90,
    [switch]$Visible
)

$ErrorActionPreference = "Stop"
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

function Release-ComObject {
    param($ComObject)

    if ($null -ne $ComObject -and [System.Runtime.InteropServices.Marshal]::IsComObject($ComObject)) {
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($ComObject)
    }
}

function Get-RequiredInfomaxProcesses {
    param($EnvValues)

    $configured = $EnvValues["INFOMAX_REQUIRED_PROCESSES"]
    if ($configured) {
        return @(
            $configured -split "," |
                ForEach-Object { $_.Trim() } |
                Where-Object { $_ }
        )
    }

    return @("infomaxmain", "imxlcommapp")
}

function Test-InfomaxRunning {
    param([string[]]$RequiredProcesses)

    $running = @(Get-Process -ErrorAction SilentlyContinue | ForEach-Object { $_.ProcessName.ToLowerInvariant() })
    $missing = @(
        $RequiredProcesses |
            Where-Object { $running -notcontains $_.ToLowerInvariant() }
    )

    if ($missing.Count -gt 0) {
        $expected = $RequiredProcesses -join ", "
        $missingText = $missing -join ", "
        throw "Infomax program is not running or the Excel add-in bridge is unavailable. Missing process(es): $missingText. Start Infomax first, wait until login/data services are ready, then rerun. Expected process(es): $expected."
    }
}

$root = Get-ProjectRoot
$envValues = Read-DotEnv -Path (Join-Path $root ".env")

if (-not $WorkbookPath) {
    $WorkbookPath = $envValues["INFOMAX_EXCEL_PATH"]
}
if (-not $WorkbookPath) {
    $WorkbookPath = Join-Path $root "MARKET DAILY.xlsm"
}
if (-not (Test-Path -LiteralPath $WorkbookPath)) {
    throw "Workbook not found: $WorkbookPath"
}

$WorkbookPath = (Resolve-Path -LiteralPath $WorkbookPath).Path
$excel = $null
$workbook = $null

Write-Host "Infomax Excel refresh"
Write-Host "Workbook: $WorkbookPath"
Write-Host ""

try {
    $requiredInfomaxProcesses = Get-RequiredInfomaxProcesses -EnvValues $envValues
    Write-Host "Checking Infomax process(es): $($requiredInfomaxProcesses -join ', ')"
    Test-InfomaxRunning -RequiredProcesses $requiredInfomaxProcesses
    Write-Host "Infomax process check passed."
    Write-Host ""

    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = [bool]$Visible
    $excel.DisplayAlerts = $false
    $excel.AskToUpdateLinks = $false

    $workbook = $excel.Workbooks.Open($WorkbookPath)

    Write-Host "Refreshing workbook connections and formulas..."
    $workbook.RefreshAll()

    try {
        $excel.CalculateUntilAsyncQueriesDone()
    }
    catch {
        Write-Host "CalculateUntilAsyncQueriesDone is not available in this Excel session. Continuing."
    }

    try {
        $excel.CalculateFullRebuild()
    }
    catch {
        Write-Host "CalculateFullRebuild failed. Continuing after RefreshAll."
    }

    if ($WaitSeconds -gt 0) {
        Write-Host "Waiting $WaitSeconds seconds for Infomax formulas to finish..."
        Start-Sleep -Seconds $WaitSeconds
    }

    Write-Host "Saving workbook..."
    $workbook.Save()
    Write-Host "Done. Workbook refreshed and saved."
}
finally {
    if ($null -ne $workbook) {
        try {
            $workbook.Close($true)
        }
        catch {
            Write-Host "Workbook close failed: $($_.Exception.Message)"
        }
        Release-ComObject $workbook
    }

    if ($null -ne $excel) {
        try {
            $excel.Quit()
        }
        catch {
            Write-Host "Excel quit failed: $($_.Exception.Message)"
        }
        Release-ComObject $excel
    }

    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
