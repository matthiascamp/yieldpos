@echo off
REM Double-click (or run from a terminal) to stop PTPOS + GUARDIAN.
REM The .ps1 self-elevates via UAC -- approve the prompt.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0kill-ptpos.ps1" %*
