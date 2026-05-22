@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.."
powershell -ExecutionPolicy Bypass -File "%~dp0Verify-Pipeline.ps1" %*
exit /b %ERRORLEVEL%
