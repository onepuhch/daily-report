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

function Get-RunningInfomaxProcesses {
    param($EnvValues)

    $configured = $EnvValues["INFOMAX_RUNNING_PROCESSES"]
    if ($configured) {
        return @(
            $configured -split "," |
                ForEach-Object { $_.Trim() } |
                Where-Object { $_ }
        )
    }

    return @("infomaxmain")
}

function Get-InfomaxLauncherPath {
    param($EnvValues)

    $launcher = $EnvValues["INFOMAX_LAUNCHER_PATH"]
    if ($launcher) {
        return $launcher
    }

    $configured = $EnvValues["INFOMAX_MAIN_PATH"]
    if ($configured) {
        return $configured
    }

    return "C:\Infomax\bin\infomaxlogin.exe"
}

function Get-InfomaxStartupWaitSeconds {
    param($EnvValues)

    $configured = $EnvValues["INFOMAX_STARTUP_WAIT_SECONDS"]
    if ($configured) {
        try {
            return [Math]::Max(10, [int]$configured)
        }
        catch {
            Write-Host "Invalid INFOMAX_STARTUP_WAIT_SECONDS value '$configured'. Using 240 seconds."
        }
    }

    return 240
}

function Get-InfomaxPostLoginWaitSeconds {
    param($EnvValues)

    $configured = $EnvValues["INFOMAX_POST_LOGIN_WAIT_SECONDS"]
    if ($configured) {
        try {
            return [Math]::Max(0, [int]$configured)
        }
        catch {
            Write-Host "Invalid INFOMAX_POST_LOGIN_WAIT_SECONDS value '$configured'. Using 15 seconds."
        }
    }

    return 15
}

function Get-InfomaxReadySettleSeconds {
    param($EnvValues)

    $configured = $EnvValues["INFOMAX_READY_SETTLE_SECONDS"]
    if ($configured) {
        try {
            return [Math]::Max(0, [int]$configured)
        }
        catch {
            Write-Host "Invalid INFOMAX_READY_SETTLE_SECONDS value '$configured'. Using 120 seconds."
        }
    }

    return 120
}

function Get-InfomaxLoginWindowKeywords {
    param($EnvValues)

    $configured = $EnvValues["INFOMAX_LOGIN_WINDOW_KEYWORDS"]
    if ($configured) {
        return @(
            $configured -split "," |
                ForEach-Object { $_.Trim() } |
                Where-Object { $_ }
        )
    }

    return @("Infomax", "Login", "infomax", "login")
}

function Get-ExcelOpenMode {
    param($EnvValues)

    $configured = $EnvValues["INFOMAX_EXCEL_OPEN_MODE"]
    if ($configured) {
        return $configured.Trim().ToLowerInvariant()
    }

    return "shell"
}

function Get-ExcelAttachWaitSeconds {
    param($EnvValues)

    $configured = $EnvValues["INFOMAX_EXCEL_ATTACH_WAIT_SECONDS"]
    if ($configured) {
        try {
            return [Math]::Max(5, [int]$configured)
        }
        catch {
            Write-Host "Invalid INFOMAX_EXCEL_ATTACH_WAIT_SECONDS value '$configured'. Using 60 seconds."
        }
    }

    return 60
}

function Get-InfomaxRecoveryRetries {
    param($EnvValues)

    return Get-EnvInt -EnvValues $EnvValues -Name "INFOMAX_RECOVERY_RETRIES" -DefaultValue 1 -MinimumValue 0
}

function Get-InfomaxRestartProcessNames {
    param($EnvValues)

    $configured = $EnvValues["INFOMAX_RESTART_PROCESSES"]
    if ($configured) {
        return @(
            $configured -split "," |
                ForEach-Object { $_.Trim() } |
                Where-Object { $_ }
        )
    }

    return @("EXCEL", "infomaxmain", "imxlcommapp", "infomaxlogin")
}

function Get-EnvBool {
    param(
        $EnvValues,
        [string]$Name,
        [bool]$DefaultValue
    )

    $value = $EnvValues[$Name]
    if (-not $value) {
        return $DefaultValue
    }

    return @("1", "true", "yes", "y", "on") -contains $value.ToString().Trim().ToLowerInvariant()
}

function Get-EnvInt {
    param(
        $EnvValues,
        [string]$Name,
        [int]$DefaultValue,
        [int]$MinimumValue = 0
    )

    $value = $EnvValues[$Name]
    if (-not $value) {
        return $DefaultValue
    }

    try {
        return [Math]::Max($MinimumValue, [int]$value)
    }
    catch {
        Write-Host "Invalid $Name value '$value'. Using $DefaultValue."
        return $DefaultValue
    }
}

function Stop-InfomaxExcelSession {
    param([string[]]$ProcessNames)

    Write-Host "Restarting stale Infomax/Excel session. Stopping process(es): $($ProcessNames -join ', ')"
    foreach ($processName in $ProcessNames) {
        $processes = @(Get-Process -Name $processName -ErrorAction SilentlyContinue)
        foreach ($process in $processes) {
            try {
                Write-Host "Stopping $($process.ProcessName) pid=$($process.Id)"
                Stop-Process -Id $process.Id -Force -ErrorAction Stop
            }
            catch {
                Write-Host "Could not stop $($process.ProcessName) pid=$($process.Id): $($_.Exception.Message)"
            }
        }
    }

    Start-Sleep -Seconds 5
}

function Get-ActiveExcelApplication {
    try {
        return [Runtime.InteropServices.Marshal]::GetActiveObject("Excel.Application")
    }
    catch {
        return $null
    }
}

function Get-WorkbookByPath {
    param(
        $Excel,
        [string]$WorkbookPath
    )

    foreach ($candidate in @($Excel.Workbooks)) {
        try {
            if ($candidate.FullName -eq $WorkbookPath) {
                return $candidate
            }
        }
        catch {
        }
    }

    return $null
}

function Assert-NoLookupFailures {
    param($Workbook)

    $matches = @()
    foreach ($sheet in @($Workbook.Worksheets)) {
        try {
            $usedRange = $sheet.UsedRange
            $values = $usedRange.Value2
            if ($null -eq $values) {
                continue
            }

            if ($values -is [Array]) {
                $rowLower = $values.GetLowerBound(0)
                $rowUpper = $values.GetUpperBound(0)
                $colLower = $values.GetLowerBound(1)
                $colUpper = $values.GetUpperBound(1)
                for ($row = $rowLower; $row -le $rowUpper; $row += 1) {
                    for ($col = $colLower; $col -le $colUpper; $col += 1) {
                        $cellValue = $values[$row, $col]
                        if ($null -ne $cellValue -and $cellValue.ToString().Contains("조회 실패")) {
                            $matches += "$($sheet.Name)!R$row`C$col"
                            if ($matches.Count -ge 10) {
                                break
                            }
                        }
                    }
                    if ($matches.Count -ge 10) {
                        break
                    }
                }
            }
            elseif ($values.ToString().Contains("조회 실패")) {
                $matches += "$($sheet.Name)!UsedRange"
            }
        }
        catch {
            Write-Host "Lookup failure scan skipped for sheet '$($sheet.Name)': $($_.Exception.Message)"
        }
    }

    if ($matches.Count -gt 0) {
        throw "Infomax lookup failure detected before save. Workbook was not saved. Cells: $($matches -join ', ')"
    }
}

function Open-WorkbookWithShell {
    param(
        [string]$WorkbookPath,
        [int]$AttachWaitSeconds,
        [bool]$Visible
    )

    Write-Host "Opening workbook through Windows shell so Infomax Excel add-in can attach normally..."
    Start-Process -FilePath $WorkbookPath | Out-Null

    $deadline = (Get-Date).AddSeconds($AttachWaitSeconds)
    do {
        Start-Sleep -Seconds 2
        $excel = Get-ActiveExcelApplication
        if ($null -eq $excel) {
            continue
        }

        try {
            $excel.Visible = $Visible
        }
        catch {
        }

        $workbook = Get-WorkbookByPath -Excel $excel -WorkbookPath $WorkbookPath
        if ($null -ne $workbook) {
            return @{
                Excel = $excel
                Workbook = $workbook
                OwnsExcel = $false
            }
        }
    } while ((Get-Date) -lt $deadline)

    throw "Workbook was opened through Windows shell, but Excel COM attachment did not become available within $AttachWaitSeconds seconds."
}

function Open-WorkbookWithCom {
    param(
        [string]$WorkbookPath,
        [bool]$Visible
    )

    Write-Host "Opening workbook through Excel COM automation."
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $Visible
    $excel.DisplayAlerts = $false
    $excel.AskToUpdateLinks = $false
    $workbook = $excel.Workbooks.Open($WorkbookPath)

    return @{
        Excel = $excel
        Workbook = $workbook
        OwnsExcel = $true
    }
}

function Get-MissingInfomaxProcesses {
    param([string[]]$RequiredProcesses)

    $running = @(Get-Process -ErrorAction SilentlyContinue | ForEach-Object { $_.ProcessName.ToLowerInvariant() })
    return @(
        $RequiredProcesses |
            Where-Object { $running -notcontains $_.ToLowerInvariant() }
    )
}

function Test-AnyInfomaxProcessRunning {
    param([string[]]$RunningProcesses)

    $running = @(Get-Process -ErrorAction SilentlyContinue | ForEach-Object { $_.ProcessName.ToLowerInvariant() })
    foreach ($processName in $RunningProcesses) {
        if ($running -contains $processName.ToLowerInvariant()) {
            return $true
        }
    }

    return $false
}

function Wait-InfomaxRunning {
    param(
        [string[]]$RequiredProcesses,
        [int]$TimeoutSeconds
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $missing = @(Get-MissingInfomaxProcesses -RequiredProcesses $RequiredProcesses)
        if ($missing.Count -eq 0) {
            return
        }

        Start-Sleep -Seconds 5
    } while ((Get-Date) -lt $deadline)

    $expected = $RequiredProcesses -join ", "
    $missingText = (@(Get-MissingInfomaxProcesses -RequiredProcesses $RequiredProcesses) -join ", ")
    throw "Infomax startup did not become ready within $TimeoutSeconds seconds. Missing process(es): $missingText. Check Infomax login/network state, then rerun. Expected process(es): $expected."
}

function Throw-InfomaxStartupTimeout {
    param(
        [string[]]$RequiredProcesses,
        [int]$TimeoutSeconds
    )

    $expected = $RequiredProcesses -join ", "
    $missingText = (@(Get-MissingInfomaxProcesses -RequiredProcesses $RequiredProcesses) -join ", ")
    throw "Infomax startup did not become ready within $TimeoutSeconds seconds. Missing process(es): $missingText. Check Infomax login/network state, then rerun. Expected process(es): $expected."
}

function Invoke-InfomaxLoginSubmit {
    param(
        $LauncherProcess,
        [int]$LoginSubmitDelaySeconds,
        [string[]]$WindowKeywords,
        [bool]$BlindEnter
    )

    Write-Host "Auto-submit login is enabled. Waiting $LoginSubmitDelaySeconds seconds before sending Enter to the Infomax login window..."
    if ($LoginSubmitDelaySeconds -gt 0) {
        Start-Sleep -Seconds $LoginSubmitDelaySeconds
    }

    try {
        $shell = New-Object -ComObject WScript.Shell
        for ($attempt = 1; $attempt -le 6; $attempt += 1) {
            if ($LauncherProcess -and $shell.AppActivate($LauncherProcess.Id)) {
                Start-Sleep -Milliseconds 500
                $shell.SendKeys("{ENTER}")
                Write-Host "Sent Enter to Infomax login window using launcher process id."
                return $true
            }

            foreach ($keyword in $WindowKeywords) {
                if ($shell.AppActivate($keyword)) {
                    Start-Sleep -Milliseconds 500
                    $shell.SendKeys("{ENTER}")
                    Write-Host "Sent Enter to Infomax login window using title keyword: $keyword"
                    return $true
                }
            }

            $windowProcesses = @(
                Get-Process -ErrorAction SilentlyContinue |
                    Where-Object {
                        $title = $_.MainWindowTitle
                        $matched = $false
                        if ($title) {
                            foreach ($keyword in $WindowKeywords) {
                                if ($title -like "*$keyword*") {
                                    $matched = $true
                                    break
                                }
                            }
                        }

                        $matched
                    }
            )

            foreach ($process in $windowProcesses) {
                if ($shell.AppActivate($process.Id)) {
                    Start-Sleep -Milliseconds 500
                    $shell.SendKeys("{ENTER}")
                    Write-Host "Sent Enter to Infomax login window: $($process.MainWindowTitle)"
                    return $true
                }
            }

            Start-Sleep -Seconds 2
        }

        if ($BlindEnter) {
            Write-Host "Could not activate Infomax login window. Sending Enter to the currently active window as fallback."
            Start-Sleep -Milliseconds 500
            $shell.SendKeys("{ENTER}")
            return $true
        }

        $visibleWindows = @(
            Get-Process -ErrorAction SilentlyContinue |
                Where-Object { $_.MainWindowTitle } |
                Select-Object -First 20 ProcessName, MainWindowTitle
        )
        if ($visibleWindows.Count -gt 0) {
            Write-Host "Visible windows while looking for Infomax login:"
            $visibleWindows | ForEach-Object { Write-Host "  $($_.ProcessName): $($_.MainWindowTitle)" }
        }

        Write-Host "Could not activate Infomax login window automatically. If login is waiting, click the login button manually."
        return $false
    }
    catch {
        Write-Host "Auto-submit login failed: $($_.Exception.Message)"
        return $false
    }
}

function Wait-InfomaxStartupAfterLaunch {
    param(
        [string[]]$RequiredProcesses,
        [int]$TimeoutSeconds,
        [bool]$AutoSubmitLogin,
        [int]$LoginSubmitDelaySeconds,
        [int]$PostLoginWaitSeconds,
        [bool]$BlindEnter,
        [string[]]$LoginWindowKeywords,
        $LauncherProcess
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $firstSubmit = $true
    $submitAttempt = 1

    do {
        $missing = @(Get-MissingInfomaxProcesses -RequiredProcesses $RequiredProcesses)
        if ($missing.Count -eq 0) {
            return
        }

        if ($AutoSubmitLogin) {
            $delay = if ($firstSubmit) { $LoginSubmitDelaySeconds } else { 0 }
            Write-Host "Infomax login submit attempt $submitAttempt. Missing process(es): $($missing -join ', ')"
            [void](Invoke-InfomaxLoginSubmit `
                -LauncherProcess $LauncherProcess `
                -LoginSubmitDelaySeconds $delay `
                -WindowKeywords $LoginWindowKeywords `
                -BlindEnter $BlindEnter)
            if ($PostLoginWaitSeconds -gt 0) {
                Write-Host "Waiting $PostLoginWaitSeconds seconds after login submit for Infomax startup..."
                Start-Sleep -Seconds $PostLoginWaitSeconds
            }
            $firstSubmit = $false
            $submitAttempt += 1
        }

        $remainingSeconds = [int][Math]::Ceiling(($deadline - (Get-Date)).TotalSeconds)
        if ($remainingSeconds -le 0) {
            break
        }

        Start-Sleep -Seconds ([Math]::Min(10, $remainingSeconds))
    } while ((Get-Date) -lt $deadline)

    Throw-InfomaxStartupTimeout -RequiredProcesses $RequiredProcesses -TimeoutSeconds $TimeoutSeconds
}

function Test-InfomaxRunning {
    param(
        [string[]]$RequiredProcesses,
        [string[]]$RunningProcesses,
        [string]$InfomaxLauncherPath,
        [int]$StartupWaitSeconds,
        [bool]$AutoSubmitLogin,
        [int]$LoginSubmitDelaySeconds,
        [int]$PostLoginWaitSeconds,
        [bool]$BlindEnter,
        [string[]]$LoginWindowKeywords
    )

    $missing = @(Get-MissingInfomaxProcesses -RequiredProcesses $RequiredProcesses)
    if ($missing.Count -eq 0) {
        Write-Host "Infomax required process check passed."
        return
    }

    if (Test-AnyInfomaxProcessRunning -RunningProcesses $RunningProcesses) {
        Write-Host "Infomax is already running. Skipping launcher/login and opening the workbook directly."
        Write-Host "Missing optional process(es): $($missing -join ', '). Excel will attempt to initialize the add-in bridge."
        return
    }

    Write-Host "Infomax process(es) missing: $($missing -join ', ')"
    if (-not (Test-Path -LiteralPath $InfomaxLauncherPath)) {
        $expected = $RequiredProcesses -join ", "
        throw "Infomax program is not running and the configured launcher was not found: $InfomaxLauncherPath. Start Infomax first, then rerun. Expected process(es): $expected."
    }

    Write-Host "Starting Infomax launcher: $InfomaxLauncherPath"
    $launcherProcess = Start-Process -FilePath $InfomaxLauncherPath -WorkingDirectory (Split-Path -Parent $InfomaxLauncherPath) -PassThru

    Write-Host "Waiting up to $StartupWaitSeconds seconds for Infomax and Excel add-in bridge to become ready..."
    Wait-InfomaxStartupAfterLaunch `
        -RequiredProcesses $RequiredProcesses `
        -TimeoutSeconds $StartupWaitSeconds `
        -AutoSubmitLogin $AutoSubmitLogin `
        -LoginSubmitDelaySeconds $LoginSubmitDelaySeconds `
        -PostLoginWaitSeconds $PostLoginWaitSeconds `
        -BlindEnter $BlindEnter `
        -LoginWindowKeywords $LoginWindowKeywords `
        -LauncherProcess $launcherProcess
}

$root = Get-ProjectRoot
$envValues = Read-DotEnv -Path (Join-Path (Split-Path -Parent $root) ".env")
$localEnvValues = Read-DotEnv -Path (Join-Path $root ".env")
foreach ($key in $localEnvValues.Keys) {
    $envValues[$key] = $localEnvValues[$key]
}

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
$ownsExcel = $true

Write-Host "Infomax Excel refresh"
Write-Host "Workbook: $WorkbookPath"
Write-Host ""

try {
    $requiredInfomaxProcesses = Get-RequiredInfomaxProcesses -EnvValues $envValues
    $runningInfomaxProcesses = Get-RunningInfomaxProcesses -EnvValues $envValues
    $infomaxLauncherPath = Get-InfomaxLauncherPath -EnvValues $envValues
    $infomaxStartupWaitSeconds = Get-InfomaxStartupWaitSeconds -EnvValues $envValues
    $infomaxPostLoginWaitSeconds = Get-InfomaxPostLoginWaitSeconds -EnvValues $envValues
    $infomaxReadySettleSeconds = Get-InfomaxReadySettleSeconds -EnvValues $envValues
    $infomaxLoginWindowKeywords = Get-InfomaxLoginWindowKeywords -EnvValues $envValues
    $excelOpenMode = Get-ExcelOpenMode -EnvValues $envValues
    $excelAttachWaitSeconds = Get-ExcelAttachWaitSeconds -EnvValues $envValues
    $autoSubmitLogin = Get-EnvBool -EnvValues $envValues -Name "INFOMAX_LOGIN_AUTO_SUBMIT" -DefaultValue $true
    $blindEnterLogin = Get-EnvBool -EnvValues $envValues -Name "INFOMAX_LOGIN_BLIND_ENTER" -DefaultValue $true
    $loginSubmitDelaySeconds = Get-EnvInt -EnvValues $envValues -Name "INFOMAX_LOGIN_SUBMIT_DELAY_SECONDS" -DefaultValue 3 -MinimumValue 0
    $recoveryRetries = Get-InfomaxRecoveryRetries -EnvValues $envValues
    $restartProcessNames = Get-InfomaxRestartProcessNames -EnvValues $envValues
    $maxAttempts = 1 + $recoveryRetries

    for ($attempt = 1; $attempt -le $maxAttempts; $attempt += 1) {
        $isRecoveryAttempt = $attempt -gt 1
        if ($isRecoveryAttempt) {
            Stop-InfomaxExcelSession -ProcessNames $restartProcessNames
        }

        try {
            Write-Host "Refresh attempt $attempt/$maxAttempts."
            Write-Host "Checking Infomax process(es): $($requiredInfomaxProcesses -join ', ')"
            Test-InfomaxRunning `
                -RequiredProcesses $requiredInfomaxProcesses `
                -RunningProcesses $runningInfomaxProcesses `
                -InfomaxLauncherPath $infomaxLauncherPath `
                -StartupWaitSeconds $infomaxStartupWaitSeconds `
                -AutoSubmitLogin $autoSubmitLogin `
                -LoginSubmitDelaySeconds $loginSubmitDelaySeconds `
                -PostLoginWaitSeconds $infomaxPostLoginWaitSeconds `
                -BlindEnter $blindEnterLogin `
                -LoginWindowKeywords $infomaxLoginWindowKeywords
            Write-Host "Infomax process check passed."
            if ($infomaxReadySettleSeconds -gt 0) {
                Write-Host "Waiting $infomaxReadySettleSeconds seconds for Infomax add-in bridge to settle before opening Excel..."
                Start-Sleep -Seconds $infomaxReadySettleSeconds
            }
            Write-Host ""

            if ($excelOpenMode -eq "com") {
                $opened = Open-WorkbookWithCom -WorkbookPath $WorkbookPath -Visible ([bool]$Visible)
            }
            else {
                $opened = Open-WorkbookWithShell `
                    -WorkbookPath $WorkbookPath `
                    -AttachWaitSeconds $excelAttachWaitSeconds `
                    -Visible ([bool]$Visible)
            }

            $excel = $opened.Excel
            $workbook = $opened.Workbook
            $ownsExcel = [bool]$opened.OwnsExcel

            try {
                $excel.DisplayAlerts = $false
                $excel.AskToUpdateLinks = $false
            }
            catch {
                Write-Host "Could not update Excel alert settings. Continuing."
            }

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

            Write-Host "Checking workbook for Infomax lookup failures before save..."
            Assert-NoLookupFailures -Workbook $workbook

            Write-Host "Saving workbook..."
            $workbook.Save()
            Write-Host "Done. Workbook refreshed and saved."
            break
        }
        catch {
            $message = $_.Exception.Message
            Write-Host "Refresh attempt $attempt failed: $message"
            if ($attempt -ge $maxAttempts) {
                throw
            }

            if ($null -ne $workbook) {
                try {
                    $workbook.Close($false)
                }
                catch {
                    Write-Host "Workbook close after failed attempt skipped: $($_.Exception.Message)"
                }
                Release-ComObject $workbook
                $workbook = $null
            }

            if ($null -ne $excel) {
                if ($ownsExcel) {
                    try {
                        $excel.Quit()
                    }
                    catch {
                        Write-Host "Excel quit after failed attempt skipped: $($_.Exception.Message)"
                    }
                }
                Release-ComObject $excel
                $excel = $null
            }

            [GC]::Collect()
            [GC]::WaitForPendingFinalizers()
            Write-Host "Retrying after Infomax/Excel restart..."
        }
    }
}
finally {
    if ($null -ne $workbook) {
        try {
            $workbook.Close($true)
        }
        catch {
            Write-Host "Workbook close skipped: Excel rejected the close request after save. This is non-fatal when the workbook was already saved. $($_.Exception.Message)"
        }
        Release-ComObject $workbook
    }

    if ($null -ne $excel) {
        if ($ownsExcel) {
            try {
                $excel.Quit()
            }
            catch {
                Write-Host "Excel quit failed: $($_.Exception.Message)"
            }
        }
        Release-ComObject $excel
    }

    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
