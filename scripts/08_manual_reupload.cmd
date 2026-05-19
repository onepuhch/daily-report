@echo off
setlocal
cd /d "%~dp0.."
echo Manual Daily Report DB upload/recovery
echo.
echo This opens Excel, refreshes data, uploads recent reports, and runs validation.
echo If Excel is already refreshed and saved, close this window and run:
echo powershell -ExecutionPolicy Bypass -File scripts\Run-ManualReupload.ps1 -SkipRefresh
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0Run-ManualReupload.ps1"
set "EXITCODE=%ERRORLEVEL%"
echo.
if not "%EXITCODE%"=="0" (
  echo Manual recovery failed. Please keep this window open and send the output/log to the owner.
) else (
  echo Manual recovery completed successfully.
)
pause
exit /b %EXITCODE%
