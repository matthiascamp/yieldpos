@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0reset-runtime-db.ps1"
if errorlevel 1 (
  echo.
  echo Reset did not complete. Check the message above and try again.
  pause
  exit /b 1
)
echo.
echo Done. You can open YieldPOS again now.
pause
