# setup-hardware.ps1 -- Idempotent hardware setup for a Crisp POS lane.
#
# What it does:
#   1. Confirms the print spooler is running.
#   2. Finds the USB port that the Epson TM-T82 (or compatible thermal receipt
#      printer) is plugged into.
#   3. Creates a "Crisp Receipt" print queue on that port using the
#      "Generic / Text Only" driver, which passes ESC/POS bytes through unchanged.
#   4. Sends a small ESC/POS test print and a drawer-kick command to confirm
#      the queue actually reaches the device.
#
# Safe to re-run -- skips any step that's already done. Does NOT touch other queues.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File setup-hardware.ps1
#   powershell -ExecutionPolicy Bypass -File setup-hardware.ps1 -QueueName "Crisp Receipt" -Port "USB002"
#   powershell -ExecutionPolicy Bypass -File setup-hardware.ps1 -NoTest

param(
  [string]$QueueName = "Crisp Receipt",
  [string]$Port = "",
  [string]$Driver = "Generic / Text Only",
  [switch]$NoTest
)

$ErrorActionPreference = 'Stop'

function Info($m) { Write-Host "  [INFO] $m" -ForegroundColor Cyan }
function Pass($m) { Write-Host "  [ OK ] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "  [FAIL] $m" -ForegroundColor Red }

Write-Host ""
Write-Host "=== Crisp POS hardware setup ===" -ForegroundColor Cyan
Write-Host ""

# ── 1. Spooler ────────────────────────────────────────────────────────────────
$sp = Get-Service -Name Spooler -ErrorAction SilentlyContinue
if (-not $sp) { Fail "Print Spooler service not found."; exit 1 }
if ($sp.Status -ne 'Running') {
  Warn "Spooler not running ($($sp.Status)). Attempting to start..."
  try { Start-Service Spooler -ErrorAction Stop; Pass "Spooler started." }
  catch { Fail "Could not start spooler (need admin?): $($_.Exception.Message)"; exit 1 }
} else { Pass "Spooler running." }

# ── 2. Driver ─────────────────────────────────────────────────────────────────
$drv = Get-PrinterDriver -Name $Driver -ErrorAction SilentlyContinue
if (-not $drv) {
  Fail "Driver '$Driver' not installed."
  Info "Add it via: Settings > Printers & Scanners > Add a printer > 'The printer that I want isn't listed' > 'Add a local printer with manual settings' > Generic / Text Only"
  exit 1
}
Pass "Driver '$Driver' present."

# ── 3. Pick a port ────────────────────────────────────────────────────────────
if (-not $Port) {
  # Look for a port that's claimed by an Epson TM-T82 (or any TM-* receipt printer).
  $ports = Get-PrinterPort | Where-Object { $_.Description -match 'EPSONTM-T82|TM-T82|TM-T20|TM-T88|Receipt|POS' }
  if (-not $ports) {
    # Fallback: any USBxxx port not already used by another queue.
    $used = (Get-Printer | Select-Object -ExpandProperty PortName) -as [string[]]
    $ports = Get-PrinterPort | Where-Object { $_.Name -match '^USB\d+' -and $used -notcontains $_.Name }
  }
  if (-not $ports) { Fail "No suitable USB port found for the receipt printer."; Info "Plug the Epson in and re-run."; exit 1 }
  $Port = $ports[0].Name
  Info "Auto-selected port: $Port  ($($ports[0].Description))"
} else {
  if (-not (Get-PrinterPort -Name $Port -ErrorAction SilentlyContinue)) { Fail "Port '$Port' does not exist."; exit 1 }
  Info "Using specified port: $Port"
}

# ── 4. Queue ──────────────────────────────────────────────────────────────────
$existing = Get-Printer -Name $QueueName -ErrorAction SilentlyContinue
if ($existing) {
  if ($existing.PortName -ne $Port) {
    Warn "Queue '$QueueName' exists but on port '$($existing.PortName)' (expected '$Port'). Re-pointing..."
    Set-Printer -Name $QueueName -PortName $Port -ErrorAction Stop
    Pass "Queue re-pointed to $Port."
  } else {
    Pass "Queue '$QueueName' already exists on $Port."
  }
} else {
  Info "Creating queue '$QueueName' on $Port..."
  Add-Printer -Name $QueueName -DriverName $Driver -PortName $Port -ErrorAction Stop
  Pass "Queue created."
}

# ── 5. Test print + drawer kick ──────────────────────────────────────────────
if ($NoTest) {
  Info "Skipping test print (-NoTest set)."
  Write-Host ""
  Write-Host "Done. Queue '$QueueName' is ready on $Port." -ForegroundColor Green
  exit 0
}

$rawprint = Join-Path $PSScriptRoot "rawprint.ps1"
if (-not (Test-Path $rawprint)) { Fail "rawprint.ps1 not found next to this script. Skipping test."; exit 0 }

$tmp = Join-Path $env:TEMP "crisp-setup-test.bin"
$ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
# ESC @ (init), text, two line feeds, drawer kick, then GS V 0 (full cut).
$bytes = [byte[]]@(0x1B,0x40) `
  + [System.Text.Encoding]::ASCII.GetBytes("`n  CRISP ON CREEK`n  Hardware setup test`n  $ts`n  Queue: $QueueName -> $Port`n`n`n") `
  + [byte[]]@(0x1B,0x70,0x00,0x32,0xFA) `
  + [byte[]]@(0x1D,0x56,0x00)
[System.IO.File]::WriteAllBytes($tmp, $bytes)

Info "Sending test print + drawer kick to '$QueueName'..."
$result = & powershell -ExecutionPolicy Bypass -NoProfile -File $rawprint -PrinterName $QueueName -FilePath $tmp 2>&1
Remove-Item $tmp -ErrorAction SilentlyContinue

if ($result -match '^OK') {
  Pass $result
  Write-Host ""
  Write-Host "If paper printed and the drawer popped open, you're done." -ForegroundColor Green
  Write-Host "If nothing happened: check the receipt printer is powered on,"
  Write-Host "has paper loaded, and that the lid is closed."
  Write-Host ""
  Write-Host "Now run:  node set-printer-config.js" -ForegroundColor Cyan
  Write-Host "  to persist the queue name into the Crisp POS database."
} else {
  Fail "Print test did not succeed: $result"
  exit 1
}
