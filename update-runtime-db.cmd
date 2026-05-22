@echo off
setlocal
pushd "%~dp0"

node snapshot-runtime-db.js
if errorlevel 1 (
  echo.
  echo Update did not complete. Make sure YieldPOS has created a runtime database.
  popd
  pause
  exit /b 1
)

echo.
echo Done. Bundled database has been updated from the runtime database.
popd
pause
