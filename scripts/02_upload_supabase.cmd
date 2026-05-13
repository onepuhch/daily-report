@echo off
setlocal
cd /d "%~dp0.."
powershell -ExecutionPolicy Bypass -File "%~dp0Import-MarketDailyToSupabase.ps1"
echo.
echo Done. Check Supabase tables: reports, market_observations, report_comments.
pause
