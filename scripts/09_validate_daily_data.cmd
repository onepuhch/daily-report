@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.."
echo Validating latest Daily Report data...
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0Validate-DailyData.ps1" -CrossCheck
set "EXITCODE=%ERRORLEVEL%"
echo.
if not "%EXITCODE%"=="0" (
  echo Validation failed. Review the errors above.
  echo You can also run scripts\07_check_pipeline_status.cmd for current DB status.
) else (
  echo Validation completed.
)
pause
exit /b %EXITCODE%
