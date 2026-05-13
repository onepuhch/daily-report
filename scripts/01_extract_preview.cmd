@echo off
setlocal
cd /d "%~dp0.."
powershell -ExecutionPolicy Bypass -File "%~dp0Export-MarketDailyCachedValues.ps1"
echo.
echo Done. Check the output folder for the HTML preview.
pause
