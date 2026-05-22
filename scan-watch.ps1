<#
scan-watch.ps1 -- Watch live barcode scans from the Datalogic Magellan 3200VSi in
this terminal. Every time you scan an item, its barcode prints here.

What it does:
  1. (unless -NoKill) Stops PTPOS + GUARDIAN via kill-ptpos.ps1 so they release the
     OPOS scanner claim. PTPOS holds the scanner exclusively; until it is gone the
     scanner cannot be opened by anything else (including YieldPOS).
  2. Opens the Datalogic OPOS scanner profile ("TableScanner" by default) and prints
     each scan as it arrives, e.g.:
         14:07:32.118   #1   9300675024235   type=104
     Use -Plain to print just the bare barcode (handy for piping/copying).

Usage:
  powershell -ExecutionPolicy Bypass -File .\scan-watch.ps1
  powershell -ExecutionPolicy Bypass -File .\scan-watch.ps1 -Plain
  powershell -ExecutionPolicy Bypass -File .\scan-watch.ps1 -Device MagellanSC
  powershell -ExecutionPolicy Bypass -File .\scan-watch.ps1 -NoKill   # if PTPOS is already stopped

Stop with Ctrl+C.

Note: the actual OPOS reader lives in test-table-scanner.ps1 (it must run in 32-bit
STA PowerShell because the Datalogic OPOS CCO is 32-bit apartment-threaded COM).
scan-watch.ps1 just frees the scanner first, then hands off to it.
#>

[CmdletBinding()]
param(
    [string]$Device = 'TableScanner',  # OPOS profile name. Registered options on this PC include TableScanner, MagellanSC, USBScanner.
    [switch]$Plain,                    # print only the barcode, no timestamp/sequence/type
    [switch]$NoKill                    # skip the PTPOS/GUARDIAN kill (use if they are already stopped)
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $PSCommandPath

# --- 1. Free the scanner from PTPOS ----------------------------------------------
if (-not $NoKill) {
    $killScript = Join-Path $here 'kill-ptpos.ps1'
    if (Test-Path -LiteralPath $killScript) {
        Write-Host 'Releasing the scanner from PTPOS/GUARDIAN first...' -ForegroundColor Yellow
        # -Quiet: no pause; kill-ptpos self-elevates and -Wait blocks until PTPOS is gone.
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $killScript -Quiet
        if ($LASTEXITCODE -ne 0) {
            Write-Host 'WARNING: PTPOS/GUARDIAN may still be running -- the scanner claim could fail below.' -ForegroundColor Yellow
            Write-Host '         Re-run, or run kill-ptpos.cmd manually and approve the UAC prompt.' -ForegroundColor Yellow
        }
        Start-Sleep -Milliseconds 300
    } else {
        Write-Host "WARNING: kill-ptpos.ps1 not found next to this script; skipping kill." -ForegroundColor Yellow
    }
}

# --- 2. Hand off to the OPOS scanner terminal reader -----------------------------
$reader = Join-Path $here 'test-table-scanner.ps1'
if (-not (Test-Path -LiteralPath $reader)) {
    Write-Host "ERROR: test-table-scanner.ps1 not found next to this script." -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host "Opening OPOS scanner '$Device' -- SCAN AN ITEM and the barcode appears below." -ForegroundColor Green
Write-Host 'Ctrl+C to stop.' -ForegroundColor DarkGray
Write-Host ''

$readerArgs = @('-Device', $Device)
if ($Plain) { $readerArgs += '-Plain' }

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $reader @readerArgs
exit $LASTEXITCODE
