@echo off
setlocal
cd /d "%~dp0.."

echo [1/2] Refreshing Infomax Excel workbook...
powershell -ExecutionPolicy Bypass -File "%~dp0Refresh-InfomaxWorkbook.ps1" -Visible
if errorlevel 1 (
  echo.
  echo Excel refresh failed. Check the message above.
  pause
  exit /b 1
)

echo.
echo [2/2] Extracting report preview and SQL files...
powershell -ExecutionPolicy Bypass -File "%~dp0Export-MarketDailyCachedValues.ps1"
if errorlevel 1 (
  echo.
  echo Extraction failed. Check the message above.
  pause
  exit /b 1
)

echo.
echo Done. Now run 03_start_admin.cmd and open http://127.0.0.1:4173/admin
pause
