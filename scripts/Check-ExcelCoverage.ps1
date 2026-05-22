param(
    [string]$ProjectRoot,
    [string]$WorkbookPath
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

    function Test-PythonCandidate {
        param([string]$Candidate)

        try {
            & $Candidate -c "import sys; sys.exit(0 if sys.version_info[0] == 3 else 1)" *> $null
            return $LASTEXITCODE -eq 0
        }
        catch {
            return $false
        }
    }

    if ($env:DAILY_REPORT_PYTHON) {
        if (Test-PythonCandidate -Candidate $env:DAILY_REPORT_PYTHON) {
            return $env:DAILY_REPORT_PYTHON
        }
        throw "DAILY_REPORT_PYTHON is set but is not a usable Python 3 executable: $env:DAILY_REPORT_PYTHON"
    }

    $venvPython = Join-Path $Root ".venv-docling\Scripts\python.exe"
    if ((Test-Path -LiteralPath $venvPython) -and (Test-PythonCandidate -Candidate $venvPython)) {
        return $venvPython
    }

    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python -and (Test-PythonCandidate -Candidate $python.Source)) {
        return $python.Source
    }

    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py -and (Test-PythonCandidate -Candidate $py.Source)) {
        return $py.Source
    }

    throw "Python 3 was not found. Install Python, recreate .venv-docling, or set DAILY_REPORT_PYTHON."
}

function Assert-PythonModule {
    param(
        [string]$Python,
        [string]$ModuleName
    )

    & $Python -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('$ModuleName') else 1)" 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Python module '$ModuleName' is missing. Run: $Python -m pip install -r requirements.txt"
    }
}

try {
    $python = Resolve-Python -Root $ProjectRoot
    Assert-PythonModule -Python $python -ModuleName "requests"
    Assert-PythonModule -Python $python -ModuleName "openpyxl"
}
catch {
    Write-Host $_.Exception.Message
    exit 1
}

$args = @(
    (Join-Path $PSScriptRoot "check_excel_coverage.py"),
    "--project-root", $ProjectRoot,
    "--format", "markdown"
)
if ($WorkbookPath) {
    $args += @("--workbook", $WorkbookPath)
}

& $python @args
exit $LASTEXITCODE
