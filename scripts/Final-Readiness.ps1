param(
  [int]$Port = 4173,
  [int]$MaxScreenshotAgeHours = 96
)

$ErrorActionPreference = "Stop"

function Assert-Condition {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function Invoke-HttpReadyCheck {
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

function Test-ScreenshotFile {
  param(
    [string]$Name,
    [string]$Path,
    [int]$MaxAgeHours
  )

  Assert-Condition (Test-Path -LiteralPath $Path) "$Name screenshot is missing: $Path"

  $file = Get-Item -LiteralPath $Path
  Assert-Condition ($file.Length -gt 10240) "$Name screenshot is unexpectedly small: $($file.Length) bytes"

  $ageHours = ((Get-Date) - $file.LastWriteTime).TotalHours
  Assert-Condition ($ageHours -le $MaxAgeHours) "$Name screenshot is older than $MaxAgeHours hours: $($file.LastWriteTime)"

  Write-Host "[OK] $Name screenshot $($file.Length) bytes, updated $($file.LastWriteTime)"
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path -LiteralPath (Join-Path $scriptDir "..")
$baseUrl = "http://127.0.0.1:$Port"

Write-Host "[INFO] Checking current review server at $baseUrl"
Invoke-HttpReadyCheck "current health" "$baseUrl/api/health"
Invoke-HttpReadyCheck "current admin" "$baseUrl/admin"
Invoke-HttpReadyCheck "current report v2" "$baseUrl/report-v2"

Write-Host "[INFO] Running non-destructive pipeline smoke test"
& (Join-Path $scriptDir "Verify-Pipeline.ps1")

$shotDir = Join-Path $root "design ref\figma-financial-dashboard"
Test-ScreenshotFile "report-v2 desktop" (Join-Path $shotDir "report-v2-desktop-check.png") $MaxScreenshotAgeHours
Test-ScreenshotFile "report-v2 mobile" (Join-Path $shotDir "report-v2-mobile-check.png") $MaxScreenshotAgeHours
Test-ScreenshotFile "admin comment workflow" (Join-Path $shotDir "admin-comment-workflow-check.png") $MaxScreenshotAgeHours

Write-Host "[PASS] final-readiness current_server=$baseUrl max_screenshot_age_hours=$MaxScreenshotAgeHours"
