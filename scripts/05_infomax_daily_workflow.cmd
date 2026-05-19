@echo off
setlocal
cd /d "%~dp0.."
set "WORKBOOK=%~dp0..\..\..\MARKET DAILY.xlsm"

echo [1/3] Refreshing Infomax Excel workbook...
powershell -ExecutionPolicy Bypass -File "%~dp0Refresh-InfomaxWorkbook.ps1" -WorkbookPath "%WORKBOOK%" -Visible
if errorlevel 1 (
  echo.
  echo Excel refresh failed. Check the message above.
  pause
  exit /b 1
)

echo.
echo [2/3] Extracting report preview and SQL files...
powershell -ExecutionPolicy Bypass -File "%~dp0Export-MarketDailyCachedValues.ps1" -WorkbookPath "%WORKBOOK%"
if errorlevel 1 (
  echo.
  echo Extraction failed. Check the message above.
  pause
  exit /b 1
)

echo.
echo [3/3] Uploading recent reports to Supabase...
powershell -ExecutionPolicy Bypass -File "%~dp0Run-DailyMarketUpdate.ps1" -SkipRefresh -LookbackDays 10
if errorlevel 1 (
  echo.
  echo Supabase upload failed. Check the message above.
  pause
  exit /b 1
)

echo.
echo Done. Run 03_start_admin.cmd if you want to inspect the admin screen.
pause
