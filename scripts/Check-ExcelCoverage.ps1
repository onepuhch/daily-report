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

    $venvPython = Join-Path $Root ".venv-docling\Scripts\python.exe"
    if (Test-Path -LiteralPath $venvPython) {
        return $venvPython
    }

    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        return $python.Source
    }

    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) {
        return $py.Source
    }

    throw "Python was not found. Install Python or recreate .venv-docling."
}

$python = Resolve-Python -Root $ProjectRoot
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
