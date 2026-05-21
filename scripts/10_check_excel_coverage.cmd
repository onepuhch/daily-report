@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.."
echo Checking Excel source coverage...
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0Check-ExcelCoverage.ps1"
set "EXITCODE=%ERRORLEVEL%"
echo.
if not "%EXITCODE%"=="0" (
  echo Excel coverage check found missing mapped metrics.
) else (
  echo Excel coverage check completed.
)
pause
exit /b %EXITCODE%
