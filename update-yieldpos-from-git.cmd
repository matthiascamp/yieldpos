@echo off
setlocal EnableExtensions
title YieldPOS Git Update

set "REPO=%~1"
set "MODE=%~2"
set "PARENT_PID=%~3"
set "REMOTE_URL=%~4"
if "%REPO%"=="" set "REPO=%~dp0"
if "%MODE%"=="" set "MODE=register"
if "%REMOTE_URL%"=="" set "REMOTE_URL=https://github.com/matthiascamp/yieldpos.git"
set "LOG=%REPO%\yieldpos-git-update-last.log"

> "%LOG%" echo YieldPOS Git update started %DATE% %TIME%
call :log "Repo: %REPO%"
call :log "Mode: %MODE%"
call :log "Remote: %REMOTE_URL%"
echo.
echo YieldPOS Git updater
echo --------------------
echo This updater uses Git directly. It does not download ZIP files, install a helper EXE,
echo run hidden scripts, or reset the runtime database.
echo.

where git.exe >nul 2>nul
if errorlevel 1 (
  call :fail "Git was not found on this computer. Install Git for Windows, then try Update again."
  exit /b 1
)

cd /d "%REPO%" || (call :fail "Could not open the YieldPOS folder." & exit /b 1)

if "%PARENT_PID%"=="" goto skip_parent_wait
echo Waiting for YieldPOS to close...
set /a WAIT_COUNT=0
:wait_parent
tasklist /FI "PID eq %PARENT_PID%" 2>nul | find "%PARENT_PID%" >nul
if errorlevel 1 goto parent_closed
if %WAIT_COUNT% GEQ 45 goto parent_closed
timeout /t 2 /nobreak >nul
set /a WAIT_COUNT+=1
goto wait_parent
:parent_closed
:skip_parent_wait

timeout /t 2 /nobreak >nul

if not exist "%REPO%\.git" (
  echo This folder is not a Git checkout yet.
  echo Bootstrapping Git from:
  echo %REMOTE_URL%
  call :log "Bootstrapping Git checkout"
  git -C "%REPO%" init >> "%LOG%" 2>&1
  if errorlevel 1 (
    call :fail "git init failed. Check folder permissions."
    exit /b 1
  )
  git -C "%REPO%" remote remove origin >> "%LOG%" 2>&1
  git -C "%REPO%" remote add origin "%REMOTE_URL%" >> "%LOG%" 2>&1
  if errorlevel 1 (
    call :fail "Could not add the update repo URL. Check that the address is correct."
    exit /b 1
  )
) else (
  git -C "%REPO%" remote set-url origin "%REMOTE_URL%" >> "%LOG%" 2>&1
  if errorlevel 1 (
    call :log "Could not change origin URL; continuing with existing remote"
  )
)

for /f "delims=" %%H in ('git -C "%REPO%" rev-parse --short HEAD 2^>nul') do set "BEFORE=%%H"
if "%BEFORE%"=="" set "BEFORE=unknown"
call :log "Current commit: %BEFORE%"

echo Fetching latest main branch...
git -C "%REPO%" fetch origin main --prune >> "%LOG%" 2>&1
if errorlevel 1 (
  call :fail "git fetch failed. Check internet access and GitHub permissions."
  exit /b 1
)

for /f "delims=" %%H in ('git -C "%REPO%" rev-parse --short origin/main 2^>nul') do set "TARGET=%%H"
if "%TARGET%"=="" (
  call :fail "Could not read origin/main after fetch."
  exit /b 1
)
call :log "Target commit: %TARGET%"

if /I "%MODE%"=="check" (
  echo Git updater check OK. Current: %BEFORE%, origin/main: %TARGET%.
  call :log "Check mode completed"
  exit /b 0
)

set "NEED_NPM=0"
git -C "%REPO%" diff --name-only HEAD origin/main | findstr /R /I /C:"^package.json$" /C:"^package-lock.json$" >nul
if not errorlevel 1 set "NEED_NPM=1"

if "%BEFORE%"=="unknown" (
  set "NEED_NPM=1"
  echo Applying first Git checkout...
  git -C "%REPO%" reset --hard origin/main >> "%LOG%" 2>&1
  if errorlevel 1 (
    call :fail "Initial checkout failed. Check folder permissions and repo access."
    exit /b 1
  )
  goto after_pull
)

git -C "%REPO%" diff --quiet HEAD origin/main
if not errorlevel 1 (
  echo YieldPOS is already up to date at %BEFORE%.
  call :log "Already up to date"
  goto relaunch
)

echo Applying update with git pull --ff-only...
git -C "%REPO%" pull --ff-only origin main >> "%LOG%" 2>&1
if errorlevel 1 (
  call :fail "git pull failed. If this folder has local code edits, commit or stash them first."
  exit /b 1
)

:after_pull

if "%NEED_NPM%"=="1" (
  where npm.cmd >nul 2>nul
  if errorlevel 1 (
    call :fail "package files changed, but npm was not found. Install Node.js/npm and run npm install."
    exit /b 1
  )
  echo Package files changed; running npm install...
  call npm install >> "%LOG%" 2>&1
  if errorlevel 1 (
    call :fail "npm install failed. See yieldpos-git-update-last.log."
    exit /b 1
  )
)

for /f "delims=" %%H in ('git -C "%REPO%" rev-parse --short HEAD 2^>nul') do set "AFTER=%%H"
if "%AFTER%"=="" set "AFTER=unknown"
echo Updated YieldPOS from %BEFORE% to %AFTER%.
call :log "Updated from %BEFORE% to %AFTER%"

:relaunch
echo Relaunching YieldPOS...
if /I "%MODE%"=="admin" (
  set "LAUNCHER=YieldPOS Admin.exe"
) else (
  set "LAUNCHER=YieldPOS Register.exe"
)

if exist "%REPO%\%LAUNCHER%" (
  start "" /D "%REPO%" "%REPO%\%LAUNCHER%"
  goto done
)

if exist "%REPO%\YieldPOS-Client-1.0.0.exe" (
  start "" /D "%REPO%" "%REPO%\YieldPOS-Client-1.0.0.exe" --%MODE%
  goto done
)

if exist "%REPO%\package.json" (
  if /I "%MODE%"=="admin" (
    start "YieldPOS Admin" /D "%REPO%" cmd.exe /c "npm run admin"
  ) else (
    start "YieldPOS Register" /D "%REPO%" cmd.exe /c "npm run register"
  )
  goto done
)

call :fail "Update finished, but no launcher was found."
exit /b 1

:done
call :log "Relaunch requested"
echo Done. This window will close shortly.
timeout /t 6 /nobreak >nul
exit /b 0

:log
>> "%LOG%" echo [%DATE% %TIME%] %~1
exit /b 0

:fail
echo.
echo UPDATE FAILED
echo %~1
call :log "FAILED: %~1"
echo.
echo Details were written to:
echo %LOG%
echo.
pause
exit /b 1
