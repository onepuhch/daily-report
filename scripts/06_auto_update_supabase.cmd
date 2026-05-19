@echo off
setlocal
cd /d "%~dp0.."
set "WORKBOOK=%~dp0..\..\..\MARKET DAILY.xlsm"
powershell -ExecutionPolicy Bypass -File "%~dp0Run-DailyMarketUpdate.ps1" -WorkbookPath "%WORKBOOK%"
exit /b %ERRORLEVEL%
