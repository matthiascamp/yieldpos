@echo off
setlocal
if "%~1"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0yieldpos-db-state.ps1" -Action Import
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0yieldpos-db-state.ps1" -Action Import -ImportPath "%~1"
)
if errorlevel 1 (
  echo.
  echo Import did not complete. Check the message above and try again.
  pause
  exit /b 1
)
echo.
echo Done. You can open YieldPOS again now.
pause
