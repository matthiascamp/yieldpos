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
set "STAMP=%DATE:/=-%-%TIME::=-%"
set "STAMP=%STAMP: =-%"
set "STAMP=%STAMP:.=-%"

> "%LOG%" echo YieldPOS Git update started %DATE% %TIME%
call :log "Folder: %REPO%"
call :log "Mode: %MODE%"
call :log "Remote: %REMOTE_URL%"
echo.
echo YieldPOS Git updater
echo --------------------
echo This runs in a visible terminal and uses Git directly.
echo It does not reset the runtime database.
echo.

where git.exe >nul 2>nul
if errorlevel 1 (
  call :fail "Git was not found on this computer. Install Git for Windows, then try Update again."
  exit /b 1
)

cd /d "%REPO%" || (
  call :fail "Could not open the YieldPOS folder."
  exit /b 1
)

if /I "%MODE%"=="check" goto skip_parent_wait
echo(%PARENT_PID%| findstr /R "^[0-9][0-9]*$" >nul
if errorlevel 1 set "PARENT_PID="
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
if /I "%MODE%"=="check" goto after_parent_wait
timeout /t 2 /nobreak >nul
:after_parent_wait

if exist "%REPO%\.git" goto repo_update
goto staged_update

:repo_update
echo Updating existing Git checkout...
git -C "%REPO%" remote set-url origin "%REMOTE_URL%" >> "%LOG%" 2>&1
if errorlevel 1 call :log "Could not change origin URL; continuing with existing remote"

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

git -C "%REPO%" diff --quiet HEAD origin/main
if not errorlevel 1 (
  echo YieldPOS is already up to date at %BEFORE%.
  call :log "Already up to date"
  goto relaunch
)

call :backup_launch_files
echo Applying update with git pull --ff-only...
git -C "%REPO%" pull --ff-only origin main >> "%LOG%" 2>&1
if errorlevel 1 (
  call :fail "git pull failed. Local tracked changes may be blocking the update. Commit or stash code edits first; no hard reset was run."
  exit /b 1
)
call :cleanup_old_portable_exes "%REPO%"

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
goto relaunch

:staged_update
echo This folder is not a Git checkout.
echo Using a safe staged update from:
echo %REMOTE_URL%
call :log "Starting safe staged update"

set "STAGE=%TEMP%\yieldpos-update-stage-%RANDOM%-%RANDOM%"

if exist "%STAGE%" rmdir /s /q "%STAGE%" >> "%LOG%" 2>&1
echo Cloning latest main branch into a temporary staging folder...
git clone --depth 1 --branch main "%REMOTE_URL%" "%STAGE%" >> "%LOG%" 2>&1
if errorlevel 1 (
  call :fail "Could not clone the update repo. Check the repo URL and internet connection."
  exit /b 1
)

call :find_portable_exe "%STAGE%" STAGE_PORTABLE
if "%STAGE_PORTABLE%"=="" (
  call :fail "The staged update did not contain a YieldPOS-Client-*.exe portable app, so the live app was left untouched."
  exit /b 1
)
if not exist "%STAGE%\YieldPOS Register.exe" (
  call :fail "The staged update did not contain YieldPOS Register.exe, so the live app was left untouched."
  exit /b 1
)
if not exist "%STAGE%\YieldPOS Admin.exe" (
  call :fail "The staged update did not contain YieldPOS Admin.exe, so the live app was left untouched."
  exit /b 1
)

if /I "%MODE%"=="check" (
  echo Git updater staged check OK.
  call :log "Staged check completed"
  rmdir /s /q "%STAGE%" >> "%LOG%" 2>&1
  exit /b 0
)

call :backup_launch_files
echo Copying staged update into the YieldPOS folder...
robocopy "%STAGE%" "%REPO%" /E /XD ".git" "node_modules" "dist" "dist2" "release" "out" "backups" "exports" "supabase\.temp" /XF ".env" ".env.*" "*.log" "*.tmp" >> "%LOG%" 2>&1
if errorlevel 8 (
  call :fail "Copy failed. The previous launch files are backed up in %BACKUP%."
  exit /b 1
)
call :cleanup_old_portable_exes "%REPO%"

call :find_portable_exe "%REPO%" LIVE_PORTABLE
if "%LIVE_PORTABLE%"=="" (
  call :fail "Copy finished but the app EXE is missing. Restore from %BACKUP%."
  exit /b 1
)

for /f "delims=" %%H in ('git -C "%STAGE%" rev-parse --short HEAD 2^>nul') do set "AFTER=%%H"
if "%AFTER%"=="" set "AFTER=staged"
call :log "Staged update copied from %AFTER%"
rmdir /s /q "%STAGE%" >> "%LOG%" 2>&1
goto relaunch

:backup_launch_files
set "BACKUP=%REPO%\.yieldpos-update-backup-%STAMP%"
if "%STAMP%"=="" set "BACKUP=%REPO%\.yieldpos-update-backup"
mkdir "%BACKUP%" >> "%LOG%" 2>&1
call :find_portable_exe "%REPO%" CURRENT_PORTABLE
if not "%CURRENT_PORTABLE%"=="" copy /y "%REPO%\%CURRENT_PORTABLE%" "%BACKUP%\" >> "%LOG%" 2>&1
if exist "%REPO%\YieldPOS Register.exe" copy /y "%REPO%\YieldPOS Register.exe" "%BACKUP%\" >> "%LOG%" 2>&1
if exist "%REPO%\YieldPOS Admin.exe" copy /y "%REPO%\YieldPOS Admin.exe" "%BACKUP%\" >> "%LOG%" 2>&1
if exist "%REPO%\update-yieldpos-from-git.cmd" copy /y "%REPO%\update-yieldpos-from-git.cmd" "%BACKUP%\" >> "%LOG%" 2>&1
call :log "Backed up current launch files to %BACKUP%"
exit /b 0

:relaunch
if "%YIELDPOS_UPDATE_TEST_NO_RELAUNCH%"=="1" (
  call :log "Relaunch skipped by test mode"
  echo Test mode: update completed and relaunch was skipped.
  exit /b 0
)

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

call :find_portable_exe "%REPO%" LIVE_PORTABLE
if not "%LIVE_PORTABLE%"=="" (
  start "" /D "%REPO%" "%REPO%\%LIVE_PORTABLE%" --%MODE%
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

:find_portable_exe
set "%~2="
set "YIELDPOS_PACKAGE_VERSION="
call :read_package_version "%~1" YIELDPOS_PACKAGE_VERSION
if not "%YIELDPOS_PACKAGE_VERSION%"=="" (
  if exist "%~1\YieldPOS-Client-%YIELDPOS_PACKAGE_VERSION%.exe" (
    set "%~2=YieldPOS-Client-%YIELDPOS_PACKAGE_VERSION%.exe"
    exit /b 0
  )
)
for /f "delims=" %%F in ('dir /b /a-d /o-d "%~1\YieldPOS-Client-*.exe" 2^>nul') do (
  set "%~2=%%F"
  exit /b 0
)
exit /b 1

:read_package_version
set "%~2="
set "YIELDPOS_VERSION_RAW="
if not exist "%~1\package.json" exit /b 1
for /f "usebackq tokens=2 delims=:," %%V in (`findstr /R /C:"\"version\"[ ]*:" "%~1\package.json" 2^>nul`) do (
  set "YIELDPOS_VERSION_RAW=%%~V"
  goto package_version_found
)
exit /b 1
:package_version_found
set "YIELDPOS_VERSION_RAW=%YIELDPOS_VERSION_RAW: =%"
set "YIELDPOS_VERSION_RAW=%YIELDPOS_VERSION_RAW:"=%"
set "%~2=%YIELDPOS_VERSION_RAW%"
exit /b 0

:cleanup_old_portable_exes
set "YIELDPOS_PACKAGE_VERSION="
call :read_package_version "%~1" YIELDPOS_PACKAGE_VERSION
if "%YIELDPOS_PACKAGE_VERSION%"=="" exit /b 0
for %%F in ("%~1\YieldPOS-Client-*.exe") do (
  if exist "%%~fF" (
    if /I not "%%~nxF"=="YieldPOS-Client-%YIELDPOS_PACKAGE_VERSION%.exe" del /f /q "%%~fF" >> "%LOG%" 2>&1
  )
)
exit /b 0
