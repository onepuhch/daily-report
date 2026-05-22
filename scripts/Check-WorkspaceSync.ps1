param(
    [switch]$Fetch,
    [string]$ProjectRoot
)

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [Text.Encoding]::UTF8

function Write-Check {
    param(
        [string]$Status,
        [string]$Message
    )

    $prefix = switch ($Status) {
        "OK" { "[OK]  " }
        "WARN" { "[WARN]" }
        "FAIL" { "[FAIL]" }
        default { "[INFO]" }
    }

    Write-Host "$prefix $Message"
}

function Get-ProjectRoot {
    if ($ProjectRoot) {
        return (Resolve-Path -LiteralPath $ProjectRoot).Path
    }
    return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
    return (& git -c "safe.directory=$($root.Replace('\', '/'))" -C $root @GitArgs 2>&1)
}

function Get-ReportDateFromName {
    param([string]$Name)
    if ($Name -match "market_daily_(\d{4}-\d{2}-\d{2})") {
        return $Matches[1]
    }
    return $null
}

function Resolve-Python {
    param([string]$Root)

    $candidates = @()
    if ($env:DAILY_REPORT_PYTHON) {
        $candidates += $env:DAILY_REPORT_PYTHON.Trim('"')
    }

    $venvPython = Join-Path $Root ".venv-docling\Scripts\python.exe"
    $candidates += $venvPython

    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        $candidates += $python.Source
    }

    foreach ($candidate in $candidates) {
        if (-not $candidate -or -not (Test-Path -LiteralPath $candidate)) {
            continue
        }
        try {
            & $candidate -c "import requests, sys; sys.exit(0)" *> $null
            if ($LASTEXITCODE -eq 0) {
                return $candidate
            }
        }
        catch {
            continue
        }
    }

    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) {
        try {
            & $py.Source -3 -c "import requests, sys; sys.exit(0)" *> $null
            if ($LASTEXITCODE -eq 0) {
                return $py.Source
            }
        }
        catch {
            return $null
        }
    }

    return $null
}

$root = Get-ProjectRoot
Write-Host ""
Write-Host "Daily Report workspace sync check"
Write-Host "Project: $root"
Write-Host ""

$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
    Write-Check "FAIL" "Git is not available on PATH."
}
else {
    if ($Fetch) {
        Write-Host "[INFO] Fetching origin before comparing local branch..."
        $fetchOutput = Invoke-Git "fetch" "origin"
        if ($LASTEXITCODE -ne 0) {
            Write-Check "WARN" "git fetch origin failed: $($fetchOutput -join ' ')"
        }
    }

    $branch = (Invoke-Git "branch" "--show-current" | Select-Object -First 1)
    $head = (Invoke-Git "rev-parse" "--short" "HEAD" | Select-Object -First 1)
    $upstream = (Invoke-Git "rev-parse" "--abbrev-ref" "--symbolic-full-name" "@{upstream}" | Select-Object -First 1)
    $dirty = @(Invoke-Git "status" "--short")

    Write-Host "[INFO] Branch: $branch"
    Write-Host "[INFO] HEAD: $head"

    if ($LASTEXITCODE -ne 0 -or -not $upstream -or $upstream -match "fatal:") {
        Write-Check "WARN" "No upstream branch configured."
    }
    else {
        Write-Host "[INFO] Upstream: $upstream"
        $counts = (Invoke-Git "rev-list" "--left-right" "--count" "HEAD...@{upstream}" | Select-Object -First 1)
        if ($counts -match "^\s*(\d+)\s+(\d+)\s*$") {
            $ahead = [int]$Matches[1]
            $behind = [int]$Matches[2]
            if ($ahead -eq 0 -and $behind -eq 0) {
                Write-Check "OK" "Local branch is aligned with $upstream."
            }
            else {
                Write-Check "WARN" "Local branch differs from $upstream. Ahead: $ahead, behind: $behind."
            }
        }
    }

    if ($dirty.Count -eq 0) {
        Write-Check "OK" "Working tree is clean."
    }
    else {
        Write-Check "WARN" "Working tree has $($dirty.Count) changed/untracked path(s)."
        $dirty | Select-Object -First 12 | ForEach-Object { Write-Host "       $_" }
    }
}

$processedDir = Join-Path $root "data\processed"
$latestLocalReport = $null
if (Test-Path -LiteralPath $processedDir) {
    $latestLocalReport = Get-ChildItem -LiteralPath $processedDir -Filter "market_daily_*.json" -ErrorAction SilentlyContinue |
        Sort-Object { Get-ReportDateFromName $_.Name } -Descending |
        Select-Object -First 1
}

$latestLocalDate = if ($latestLocalReport) { Get-ReportDateFromName $latestLocalReport.Name } else { $null }
if ($latestLocalDate) {
    Write-Check "OK" "Latest local processed JSON: $latestLocalDate ($($latestLocalReport.Name))"
}
else {
    Write-Check "WARN" "No local processed JSON found under data\processed."
}

$outputDir = Join-Path $root "output"
$latestOutput = $null
if (Test-Path -LiteralPath $outputDir) {
    $latestOutput = Get-ChildItem -LiteralPath $outputDir -Filter "market_daily_*.html" -ErrorAction SilentlyContinue |
        Sort-Object { Get-ReportDateFromName $_.Name } -Descending |
        Select-Object -First 1
}

$latestOutputDate = if ($latestOutput) { Get-ReportDateFromName $latestOutput.Name } else { $null }
if ($latestOutputDate) {
    Write-Check "OK" "Latest local HTML output: $latestOutputDate ($($latestOutput.Name))"
}
else {
    Write-Check "WARN" "No local HTML output found under output."
}

$python = Resolve-Python -Root $root
if ($python) {
    $statusRaw = & $python (Join-Path $root "scripts\check_supabase_status.py") 2>&1
    if ($LASTEXITCODE -eq 0) {
        try {
            $status = ($statusRaw -join "`n") | ConvertFrom-Json
            $supabaseDate = $status.freshness.latest_report_date
            if ($supabaseDate) {
                Write-Check "OK" "Latest Supabase report: $supabaseDate"
                if ($latestLocalDate -and $latestLocalDate -ne $supabaseDate) {
                    Write-Check "WARN" "Local processed JSON date ($latestLocalDate) differs from Supabase latest ($supabaseDate). This is expected if generated files were not copied between PCs."
                }
                if ($latestOutputDate -and $latestOutputDate -ne $supabaseDate) {
                    Write-Check "WARN" "Local HTML output date ($latestOutputDate) differs from Supabase latest ($supabaseDate)."
                }
            }
        }
        catch {
            Write-Check "WARN" "Could not parse Supabase status JSON."
        }
    }
    else {
        Write-Check "WARN" "Supabase status check failed: $($statusRaw -join ' ')"
    }
}
else {
    Write-Check "WARN" "Python not found; skipped Supabase latest-date comparison."
}

Write-Host ""
Write-Host "Recommended before coding on another PC:"
Write-Host "1. git pull"
Write-Host "2. scripts\check-workspace-sync.cmd"
Write-Host "3. scripts\verify-pipeline.cmd"
Write-Host ""
