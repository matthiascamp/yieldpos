@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0yieldpos-db-state.ps1" -Action Save
if errorlevel 1 (
  echo.
  echo Save did not complete. Check the message above and try again.
  pause
  exit /b 1
)
echo.
echo Done. The current runtime database has been saved into this YieldPOS folder.
pause
