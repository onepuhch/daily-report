param(
  [int]$Port = 0,
  [string]$MetricKey = "kospi",
  [int]$StartupTimeoutSeconds = 20
)

$ErrorActionPreference = "Stop"

function Get-FreeTcpPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), 0)
  try {
    $listener.Start()
    return $listener.LocalEndpoint.Port
  } finally {
    $listener.Stop()
  }
}

function Assert-Condition {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function Invoke-JsonCheck {
  param(
    [string]$Name,
    [string]$Url
  )

  try {
    $response = Invoke-RestMethod -Method Get -Uri $Url -TimeoutSec 15
    Write-Host "[OK] $Name $Url"
    return $response
  } catch {
    throw "[FAIL] $Name $Url - $($_.Exception.Message)"
  }
}

function Invoke-HttpCheck {
  param(
    [string]$Name,
    [string]$Url
  )

  try {
    $response = Invoke-WebRequest -Method Get -Uri $Url -TimeoutSec 15 -UseBasicParsing
    Assert-Condition ($response.StatusCode -eq 200) "$Name returned HTTP $($response.StatusCode)"
    Write-Host "[OK] $Name HTTP 200"
  } catch {
    throw "[FAIL] $Name $Url - $($_.Exception.Message)"
  }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path -LiteralPath (Join-Path $scriptDir "..")
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw "node is not available on PATH."
}

if ($Port -le 0) {
  $Port = Get-FreeTcpPort
}

$baseUrl = "http://127.0.0.1:$Port"
$tmpDir = Join-Path $root "data\tmp-verify"
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
$stdout = Join-Path $tmpDir "server-$Port.out.log"
$stderr = Join-Path $tmpDir "server-$Port.err.log"

$oldPort = $env:DAILY_REPORT_ADMIN_PORT
$server = $null
$succeeded = $false

try {
  $env:DAILY_REPORT_ADMIN_PORT = [string]$Port
  $server = Start-Process `
    -FilePath $node.Source `
    -ArgumentList "src\daily_report\admin\server.mjs" `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -PassThru

  $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
  do {
    if ($server.HasExited) {
      $errorText = if (Test-Path -LiteralPath $stderr) { Get-Content -Raw -LiteralPath $stderr } else { "" }
      throw "server exited before health check. $errorText"
    }

    try {
      $health = Invoke-RestMethod -Method Get -Uri "$baseUrl/api/health" -TimeoutSec 2
      if ($health.ok -eq $true) {
        break
      }
    } catch {
      Start-Sleep -Milliseconds 400
    }
  } while ((Get-Date) -lt $deadline)

  Assert-Condition ($health.ok -eq $true) "server did not become healthy within $StartupTimeoutSeconds seconds."
  Write-Host "[OK] health $baseUrl/api/health"

  $reports = Invoke-JsonCheck "reports" "$baseUrl/api/reports"
  Assert-Condition ($reports.reports.Count -gt 0) "reports list is empty."
  Assert-Condition (-not [string]::IsNullOrWhiteSpace($reports.reports[0].date)) "latest report date is missing."

  $latestDate = $reports.reports[0].date
  $detail = Invoke-JsonCheck "report detail" "$baseUrl/api/reports/$latestDate"
  $detailDate = if ($detail.report_date) { $detail.report_date } elseif ($detail.date) { $detail.date } else { $detail.report.date }
  $detailObservations = if ($detail.observations) { $detail.observations } else { $detail.report.observations }
  Assert-Condition ($detailDate -eq $latestDate) "report detail date does not match latest date."
  Assert-Condition ($detailObservations.Count -gt 0) "report detail observations are empty."

  $history = Invoke-JsonCheck "history" "$baseUrl/api/history?days=3"
  $historyMetricCount = @($history.history.PSObject.Properties).Count
  Assert-Condition ($historyMetricCount -gt 0) "history metrics are empty."

  $series = Invoke-JsonCheck "metric series" "$baseUrl/api/metrics/$MetricKey/series"
  Assert-Condition ($series.points.Count -gt 0) "metric series points are empty for $MetricKey."

  Invoke-HttpCheck "admin" "$baseUrl/admin"
  Invoke-HttpCheck "public report" "$baseUrl/report"

  Write-Host "[PASS] verify-pipeline latest=$latestDate observations=$($detailObservations.Count) metric=$MetricKey points=$($series.points.Count)"
  $succeeded = $true
} finally {
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
    $server.WaitForExit(5000) | Out-Null
  }

  if ($succeeded) {
    Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue
  }

  if ($null -eq $oldPort) {
    Remove-Item Env:\DAILY_REPORT_ADMIN_PORT -ErrorAction SilentlyContinue
  } else {
    $env:DAILY_REPORT_ADMIN_PORT = $oldPort
  }
}
