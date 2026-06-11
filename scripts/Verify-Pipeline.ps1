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

function Assert-ReadableText {
  param(
    [string]$Name,
    [string]$Text
  )

  Assert-Condition (-not [string]::IsNullOrWhiteSpace($Text)) "$Name text is empty."
  $badPattern = [regex]'[\uFFFD\uF900-\uFAFF]'
  Assert-Condition (-not $badPattern.IsMatch($Text)) "$Name text contains mojibake-like characters."
}

function Invoke-JsonCheck {
  param(
    [string]$Name,
    [string]$Url,
    [int]$TimeoutSec = 15
  )

  try {
    $response = Invoke-RestMethod -Method Get -Uri $Url -TimeoutSec $TimeoutSec
    Write-Host "[OK] $Name $Url"
    return $response
  } catch {
    throw "[FAIL] $Name $Url - $($_.Exception.Message)"
  }
}


function Invoke-JsonPostCheck {
  param(
    [string]$Name,
    [string]$Url,
    [string]$Body
  )

  try {
    $response = Invoke-RestMethod -Method Post -Uri $Url -TimeoutSec 20 -ContentType 'application/json; charset=utf-8' -Body $Body
    Write-Host "[OK] $Name $Url"
    return $response
  } catch {
    throw "[FAIL] $Name $Url - $($_.Exception.Message)"
  }
}

function Invoke-JsonPutCheck {
  param(
    [string]$Name,
    [string]$Url,
    [string]$Body
  )

  try {
    $response = Invoke-RestMethod -Method Put -Uri $Url -TimeoutSec 20 -ContentType 'application/json; charset=utf-8' -Body $Body
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

function Invoke-StatusCheck {
  param(
    [string]$Name,
    [string]$Url,
    [int]$ExpectedStatus,
    [string]$Method = 'GET',
    [string]$Body
  )

  $req = [System.Net.WebRequest]::Create($Url)
  $req.Method = $Method
  $req.Timeout = 15000
  if ($PSBoundParameters.ContainsKey('Body')) {
    $req.ContentType = 'application/json'
    $bytes = [Text.Encoding]::UTF8.GetBytes($Body)
    $req.ContentLength = $bytes.Length
    $stream = $req.GetRequestStream()
    try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Close() }
  }
  try {
    $resp = $req.GetResponse()
    $actual = [int]$resp.StatusCode
    $resp.Close()
  } catch [System.Net.WebException] {
    if ($null -eq $_.Exception.Response) {
      throw "[FAIL] $Name $Url - $($_.Exception.Message)"
    }
    $actual = [int]$_.Exception.Response.StatusCode
  }
  Assert-Condition ($actual -eq $ExpectedStatus) "$Name expected HTTP $ExpectedStatus but got $actual at $Url"
  Write-Host "[OK] $Name HTTP $actual"
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
$researchCheckDate = "2099-01-02"
$researchCheckPath = Join-Path $root "data\research\research_$researchCheckDate.json"

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

  $provider = Invoke-JsonCheck "AI provider status" "$baseUrl/api/ai/provider"
  Assert-Condition ($provider.active_provider -eq "rule_based") "AI provider fallback is not active."
  Assert-Condition ($provider.available_providers -contains "rule_based") "AI provider list is missing rule_based."

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
  Invoke-HttpCheck "public report v2" "$baseUrl/report-v2"

  # Validation runs a Python cross-check (Supabase + Yahoo) and can exceed 15s on a fresh date.
  $validation = Invoke-JsonCheck "latest validation" "$baseUrl/api/validation/$latestDate" -TimeoutSec 60
  Assert-Condition ($validation.report_date -eq $latestDate) "validation date does not match latest date."
  Assert-Condition ($validation.observations -gt 0) "validation observations are empty."
  Assert-Condition ($validation.status -eq "pass") "latest validation did not pass."

  $research = Invoke-JsonCheck "research items" "$baseUrl/api/research/$latestDate"
  Assert-Condition ($research.report_date -eq $latestDate) "research date does not match latest date."
  Assert-Condition ($null -ne $research.summary) "research summary is missing."
  Assert-Condition ($research.summary.count -ge 0) "research summary count is invalid."

  $researchSaveBody = '{"items":[{"source_type":"manual_note","title":"verify-pipeline source","text":"non-destructive local research save check","relevance":"high","included":true}]}'
  $savedResearch = Invoke-JsonPutCheck "research save" "$baseUrl/api/research/$researchCheckDate" $researchSaveBody
  Assert-Condition ($savedResearch.report_date -eq $researchCheckDate) "saved research date does not match check date."
  Assert-Condition ($savedResearch.summary.count -eq 1) "saved research summary count is invalid."
  $reloadedResearch = Invoke-JsonCheck "research reload after save" "$baseUrl/api/research/$researchCheckDate"
  Assert-Condition ($reloadedResearch.items.Count -eq 1) "saved research item was not reloaded."
  Assert-Condition ($reloadedResearch.items[0].included -eq $true) "saved research include flag was not preserved."

  $draftBody = '{"reference_note":"verify-pipeline non-mutating draft check"}'
  $draft = Invoke-JsonPostCheck "comment draft" "$baseUrl/api/comments/$latestDate/draft" $draftBody
  Assert-Condition (-not [string]::IsNullOrWhiteSpace($draft.auto_comment)) "comment draft is empty."

  $aiDraftBody = '{"reference_note":"verify-pipeline AI assisted draft check","research_items":[]}'
  $aiDraft = Invoke-JsonPostCheck "AI assisted comment draft" "$baseUrl/api/comments/$latestDate/ai-draft" $aiDraftBody
  Assert-Condition (-not [string]::IsNullOrWhiteSpace($aiDraft.auto_comment)) "AI assisted comment draft is empty."
  Assert-ReadableText "AI assisted comment draft" $aiDraft.auto_comment
  $ratesCreditSection = "$([char]0xAE08)$([char]0xB9AC)/$([char]0xD06C)$([char]0xB808)$([char]0xB527)"
  $moverSection = "$([char]0xBCC0)$([char]0xB3D9)$([char]0xD3ED) $([char]0xC810)$([char]0xAC80)"
  Assert-Condition ($aiDraft.auto_comment.Contains($ratesCreditSection)) "AI assisted comment draft is missing the rates/credit section."
  Assert-Condition ($aiDraft.auto_comment.Contains($moverSection)) "AI assisted comment draft is missing the mover review section."
  Assert-Condition ($aiDraft.ai_provider.active_provider -eq "rule_based") "AI assisted draft provider status is missing."
  Assert-Condition ($null -ne $aiDraft.research_summary) "AI assisted draft research summary is missing."

  $askBody = (@{
    question = "KOSPI"
    report_date = $latestDate
  } | ConvertTo-Json -Compress)
  $ask = Invoke-JsonPostCheck "AI market answer" "$baseUrl/api/ask" $askBody
  Assert-Condition (-not [string]::IsNullOrWhiteSpace($ask.answer)) "AI answer is empty."
  Assert-ReadableText "AI market answer" $ask.answer
  Assert-Condition (@($ask.matches).Count -gt 0) "AI answer did not include matched metrics."
  Assert-Condition ($ask.ai_provider.active_provider -eq "rule_based") "AI answer provider status is missing."
  Assert-Condition ($null -ne $ask.research_summary) "AI answer research summary is missing."
  Assert-Condition (@($ask.sources).Count -gt 0) "AI answer sources are missing."

  $jobs = Invoke-JsonCheck "automation job runs" "$baseUrl/api/job-runs?limit=3"
  Assert-Condition (@($jobs.job_runs).Count -gt 0) "automation job run list is empty."
  $firstJobId = $jobs.job_runs[0].id
  Assert-Condition (-not [string]::IsNullOrWhiteSpace($firstJobId)) "latest job run id is missing."
  $jobLog = Invoke-JsonCheck "automation job log" "$baseUrl/api/job-runs/$firstJobId/log"
  Assert-Condition ($null -ne $jobLog.summary) "job log summary is missing."
  Assert-Condition (-not [string]::IsNullOrWhiteSpace($jobLog.summary.title)) "job log summary title is missing."

  Invoke-StatusCheck "empty reviewed comment blocked" "$baseUrl/api/comments/$latestDate" 400 -Method POST -Body '{"status":"reviewed","auto_comment":"","final_comment":""}'
  Invoke-StatusCheck "empty published upload blocked" "$baseUrl/api/supabase/reports/$latestDate" 400 -Method POST -Body '{"status":"published","auto_comment":"","final_comment":""}'

  $publishDryRunBody = "{`"status`":`"published`",`"final_comment`":`"verify-pipeline dry-run final comment`",`"approved_by`":`"verify-pipeline`",`"dry_run`":true}"
  $publishDryRun = Invoke-JsonPostCheck "published upload dry run" "$baseUrl/api/supabase/reports/$latestDate" $publishDryRunBody
  Assert-Condition ($publishDryRun.dry_run -eq $true) "published dry run flag is missing."
  Assert-Condition ($publishDryRun.supabase.would_upload -eq $true) "published dry run did not confirm upload readiness."
  Assert-Condition ($publishDryRun.supabase.observation_count -gt 0) "published dry run observation count is empty."

  Invoke-StatusCheck "missing-date detail returns 404" "$baseUrl/api/reports/2099-01-01" 404
  $missingMetric = Invoke-JsonCheck "unknown metric returns empty series" "$baseUrl/api/metrics/__nonexistent_metric__/series"
  Assert-Condition ($missingMetric.points.Count -eq 0) "unknown metric should return empty points but got $($missingMetric.points.Count)."

  Invoke-StatusCheck "invalid JSON body returns 400" "$baseUrl/api/ask" 400 -Method POST -Body 'not a json body'

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

  Remove-Item -LiteralPath $researchCheckPath -Force -ErrorAction SilentlyContinue

  if ($null -eq $oldPort) {
    Remove-Item Env:\DAILY_REPORT_ADMIN_PORT -ErrorAction SilentlyContinue
  } else {
    $env:DAILY_REPORT_ADMIN_PORT = $oldPort
  }
}
