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
