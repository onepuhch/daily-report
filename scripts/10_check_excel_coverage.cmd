@echo off
setlocal
cd /d "%~dp0.."
echo Checking Excel source coverage...
echo.
".venv-docling\Scripts\python.exe" "scripts\check_excel_coverage.py" --format markdown
set "EXITCODE=%ERRORLEVEL%"
echo.
if not "%EXITCODE%"=="0" (
  echo Excel coverage check found missing mapped metrics.
) else (
  echo Excel coverage check completed.
)
pause
exit /b %EXITCODE%
