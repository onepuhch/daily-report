param(
    [string]$JsonPath,
    [string]$ReportDate,
    [string]$ProjectRoot
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Get-ScriptProjectRoot {
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

function Get-LatestJsonPath {
    param([string]$Root)

    $dir = Join-Path $Root "data\processed"
    if (-not (Test-Path -LiteralPath $dir)) {
        return $null
    }

    return Get-ChildItem -LiteralPath $dir -Filter "market_daily_*.json" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1 -ExpandProperty FullName
}

function Invoke-SupabaseRest {
    param(
        [string]$BaseUrl,
        [string]$ApiKey,
        [string]$Method,
        [string]$Path,
        $Body,
        [hashtable]$ExtraHeaders = @{}
    )

    $headers = @{
        "apikey"        = $ApiKey
        "Content-Type"  = "application/json"
        "Prefer"        = "resolution=merge-duplicates,return=representation"
    }

    if ($ApiKey -like "eyJ*") {
        $headers["Authorization"] = "Bearer $ApiKey"
    }

    foreach ($key in $ExtraHeaders.Keys) {
        $headers[$key] = $ExtraHeaders[$key]
    }

    $uri = "$($BaseUrl.TrimEnd('/'))/rest/v1/$Path"
    $json = $Body | ConvertTo-Json -Depth 8
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -Body $json
}

$root = Get-ScriptProjectRoot
$envValues = Read-DotEnv -Path (Join-Path $root ".env")

$supabaseUrl = $envValues["SUPABASE_URL"]
$serviceRoleKey = $envValues["SUPABASE_SERVICE_ROLE_KEY"]
$anonKey = $envValues["SUPABASE_ANON_KEY"]

# Supabase can show multiple key types. For this local REST script, use the
# legacy JWT service-role key only when it is present; otherwise use anon.
$supabaseKey = $anonKey
if ($serviceRoleKey -and $serviceRoleKey -like "eyJ*") {
    $supabaseKey = $serviceRoleKey
}

if (-not $supabaseUrl -or $supabaseUrl -like "https://your-*") {
    throw "SUPABASE_URL is missing or still uses the placeholder value in .env."
}
if (-not $supabaseKey -or $supabaseKey -like "your-*") {
    throw "Supabase key is missing or still uses the placeholder value in .env."
}

if (-not $JsonPath) {
    if ($ReportDate) {
        $JsonPath = Join-Path $root "data\processed\market_daily_$ReportDate.json"
    }
    else {
        $JsonPath = Get-LatestJsonPath -Root $root
    }
}

if (-not $JsonPath -or -not (Test-Path -LiteralPath $JsonPath)) {
    throw "JSON report file not found. Run Export-MarketDailyCachedValues.ps1 first."
}

$report = Get-Content -LiteralPath $JsonPath -Encoding UTF8 -Raw | ConvertFrom-Json

$reportBody = @(
    [pscustomobject]@{
        report_date = $report.report_date
        status      = "draft"
        title       = $report.title
    }
)

$createdReport = Invoke-SupabaseRest `
    -BaseUrl $supabaseUrl `
    -ApiKey $supabaseKey `
    -Method "POST" `
    -Path "reports?on_conflict=report_date" `
    -Body $reportBody

if ($createdReport -is [array]) {
    $reportId = $createdReport[0].id
}
else {
    $reportId = $createdReport.id
}

if (-not $reportId) {
    throw "Could not resolve report id after upserting reports."
}

$observationBody = @()
foreach ($item in $report.observations) {
    $observationBody += [pscustomobject]@{
        report_id       = $reportId
        observed_date   = $item.observed_date
        category        = $item.category
        metric_key      = $item.metric_key
        metric_name     = $item.metric_name
        value           = $item.value
        unit            = $item.unit
        change_1d       = $item.change_1d
        change_1d_unit  = $item.change_1d_unit
        change_ytd      = $item.change_ytd
        change_ytd_unit = $item.change_ytd_unit
        source          = $item.source
        source_sheet    = $item.source_sheet
        source_cell     = $item.source_cell
        raw_value       = $item.raw_value
    }
}

if ($observationBody.Count -gt 0) {
    Invoke-SupabaseRest `
        -BaseUrl $supabaseUrl `
        -ApiKey $supabaseKey `
        -Method "POST" `
        -Path "market_observations?on_conflict=report_id,metric_key" `
        -Body $observationBody | Out-Null
}

$commentBody = @(
    [pscustomobject]@{
        report_id      = $reportId
        auto_comment   = $null
        final_comment  = $null
        reference_note = $null
        tags           = @()
    }
)

Invoke-SupabaseRest `
    -BaseUrl $supabaseUrl `
    -ApiKey $supabaseKey `
    -Method "POST" `
    -Path "report_comments?on_conflict=report_id" `
    -Body $commentBody | Out-Null

Write-Output "Uploaded report date: $($report.report_date)"
Write-Output "Report id: $reportId"
Write-Output "Observations uploaded: $($observationBody.Count)"
