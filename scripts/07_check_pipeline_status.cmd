@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.."
powershell -ExecutionPolicy Bypass -File "%~dp0Check-DailyPipelineStatus.ps1"
pause
