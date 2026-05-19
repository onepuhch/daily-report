@echo off
setlocal
cd /d "%~dp0.."
powershell -ExecutionPolicy Bypass -File "%~dp0Run-DailyMarketUpdate.ps1" -SkipRefresh -LookbackDays 10
echo.
echo Done. Check Supabase tables: reports, market_observations, report_comments.
pause
