@echo off
setlocal
cd /d "%~dp0.."
powershell -ExecutionPolicy Bypass -File "%~dp0Check-DailyReportEnvironment.ps1"
echo.
pause
