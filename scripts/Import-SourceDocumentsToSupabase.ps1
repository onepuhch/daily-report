param(
    [string]$JsonlPath,
    [string]$ProjectRoot,
    [switch]$DryRun
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

function Invoke-SupabaseRest {
    param(
        [string]$BaseUrl,
        [string]$ApiKey,
        [string]$Method,
        [string]$Path,
        $Body = $null,
        [hashtable]$ExtraHeaders = @{}
    )

    $headers = @{
        "apikey"        = $ApiKey
        "Authorization" = "Bearer $ApiKey"
        "Content-Type"  = "application/json"
        "Prefer"        = "return=representation"
    }

    foreach ($key in $ExtraHeaders.Keys) {
        $headers[$key] = $ExtraHeaders[$key]
    }

    $uri = "$($BaseUrl.TrimEnd('/'))/rest/v1/$Path"
    if ($null -eq $Body) {
        return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers
    }

    $json = $Body | ConvertTo-Json -Depth 8
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -Body $json
}

$root = Get-ScriptProjectRoot
if (-not $JsonlPath) {
    $JsonlPath = Join-Path $root "data\historical_ocr\source_documents.jsonl"
}

if (-not (Test-Path -LiteralPath $JsonlPath)) {
    throw "JSONL file not found: $JsonlPath"
}

$envValues = Read-DotEnv -Path (Join-Path $root ".env")
if ($envValues.Count -eq 0) {
    $parentEnv = Join-Path (Split-Path -Parent $root) ".env"
    $envValues = Read-DotEnv -Path $parentEnv
}
$supabaseUrl = $envValues["SUPABASE_URL"]
$serviceRoleKey = $envValues["SUPABASE_SERVICE_ROLE_KEY"]
$anonKey = $envValues["SUPABASE_ANON_KEY"]
$supabaseKey = $anonKey
if ($serviceRoleKey) {
    $supabaseKey = $serviceRoleKey
}

if (-not $supabaseUrl -or $supabaseUrl -like "https://your-*") {
    throw "SUPABASE_URL is missing or still uses the placeholder value in .env."
}
if (-not $supabaseKey -or $supabaseKey -like "your-*") {
    throw "Supabase key is missing or still uses the placeholder value in .env."
}

$rows = @()
foreach ($line in Get-Content -LiteralPath $JsonlPath -Encoding UTF8) {
    if (-not $line.Trim()) {
        continue
    }
    $doc = $line | ConvertFrom-Json
    $rows += [pscustomobject]@{
        source_type    = $doc.source_type
        source_date    = $doc.source_date
        title          = $doc.title
        file_path      = $doc.file_path
        extracted_text = $doc.extracted_text
        summary        = $doc.summary
        tags           = $doc.tags
    }
}

if ($DryRun) {
    Write-Output "Dry run. Rows ready: $($rows.Count)"
    $rows | Select-Object -First 5 source_date, title, file_path, summary
    return
}

$uploaded = 0
foreach ($row in $rows) {
    $encodedPath = [uri]::EscapeDataString($row.file_path)
    Invoke-SupabaseRest `
        -BaseUrl $supabaseUrl `
        -ApiKey $supabaseKey `
        -Method "DELETE" `
        -Path "source_documents?file_path=eq.$encodedPath" | Out-Null

    Invoke-SupabaseRest `
        -BaseUrl $supabaseUrl `
        -ApiKey $supabaseKey `
        -Method "POST" `
        -Path "source_documents" `
        -Body @($row) | Out-Null

    $uploaded += 1
    if ($uploaded % 25 -eq 0) {
        Write-Output "Uploaded $uploaded/$($rows.Count)"
    }
}

Write-Output "Uploaded source_documents: $uploaded"
