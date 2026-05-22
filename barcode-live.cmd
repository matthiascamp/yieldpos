@echo off
REM Double-click this (or run it from a terminal) to watch barcodes live.
REM Each scan prints in this window the instant the scanner fires it.
REM Pass -Plain for bare-barcode output, e.g.:  barcode-live.cmd -Plain
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0barcode-live.ps1" %*
pause
