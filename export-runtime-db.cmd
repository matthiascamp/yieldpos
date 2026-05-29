@echo off
setlocal
if "%~1"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0yieldpos-db-state.ps1" -Action Export
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0yieldpos-db-state.ps1" -Action Export -ExportPath "%~1"
)
if errorlevel 1 (
  echo.
  echo Export did not complete. Check the message above and try again.
  pause
  exit /b 1
)
echo.
echo Done. The full database export is ready.
pause
