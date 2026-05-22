@echo off
REM Double-click (or run from a terminal) to watch live barcode scans.
REM Kills PTPOS/GUARDIAN first (UAC prompt), then prints each scan in this window.
REM Pass -Plain for bare-barcode output, e.g.:  scan-watch.cmd -Plain
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scan-watch.ps1" %*
