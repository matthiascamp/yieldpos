@echo off
set ELECTRON_RUN_AS_NODE=
"%~dp0node_modules\.bin\electron.cmd" "%~dp0." --register
