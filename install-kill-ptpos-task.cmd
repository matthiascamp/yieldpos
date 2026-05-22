@echo off
REM Run ONCE to set up the automatic logon kill of PTPOS/GUARDIAN (approve UAC).
REM Add  -Uninstall  to remove it again, e.g.:  install-kill-ptpos-task.cmd -Uninstall
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-kill-ptpos-task.ps1" %*
