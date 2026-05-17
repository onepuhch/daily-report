@echo off
setlocal
cd /d "%~dp0.."
powershell -ExecutionPolicy Bypass -File "%~dp0Refresh-InfomaxWorkbook.ps1" -Visible
echo.
echo Done. If the workbook refreshed correctly, run 01_extract_preview.cmd next.
pause
