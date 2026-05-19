@echo off
setlocal
cd /d "%~dp0.."
powershell -ExecutionPolicy Bypass -File "%~dp0Check-DailyPipelineStatus.ps1"
pause
