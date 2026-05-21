@echo off
setlocal
cd /d "%~dp0.."
if "%DAILY_REPORT_ADMIN_PORT%"=="" set "DAILY_REPORT_ADMIN_PORT=4173"
echo Starting Daily Report Admin on http://127.0.0.1:%DAILY_REPORT_ADMIN_PORT%/admin
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:%DAILY_REPORT_ADMIN_PORT%/admin'"
node src\daily_report\admin\server.mjs
pause
