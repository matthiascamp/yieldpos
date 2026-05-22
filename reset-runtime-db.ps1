$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceDb = Join-Path $root 'db\crisp-pos.sqlite'
$runtimeDir = Join-Path $env:APPDATA 'YieldPOS Client'
$runtimeDb = Join-Path $runtimeDir 'crisp-pos.sqlite'
$runtimeWal = "$runtimeDb-wal"
$runtimeShm = "$runtimeDb-shm"
$backupDir = Join-Path $runtimeDir 'backups'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDb = Join-Path $backupDir "before-runtime-reset-$stamp.sqlite"

if (-not (Test-Path -LiteralPath $sourceDb)) {
  throw "Bundled database not found: $sourceDb"
}

$running = Get-Process | Where-Object {
  $_.ProcessName -in @('YieldPOS Client', 'YieldPOS Register', 'YieldPOS Admin', 'electron')
} | Select-Object -First 1

if ($running) {
  Write-Host 'YieldPOS appears to be running. Close the Register/Admin app before resetting the DB.' -ForegroundColor Yellow
  Write-Host "Found process: $($running.ProcessName) (PID $($running.Id))" -ForegroundColor Yellow
  exit 1
}

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

if (Test-Path -LiteralPath $runtimeDb) {
  Copy-Item -LiteralPath $runtimeDb -Destination $backupDb -Force
  Write-Host "Backed up old runtime DB to: $backupDb"
}

Copy-Item -LiteralPath $sourceDb -Destination $runtimeDb -Force
Remove-Item -LiteralPath $runtimeWal -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $runtimeShm -Force -ErrorAction SilentlyContinue

Write-Host "Runtime DB reset from bundled DB: $sourceDb"
Write-Host "Runtime DB size: $([Math]::Round((Get-Item -LiteralPath $runtimeDb).Length / 1MB, 2)) MB"
Write-Host "Next launch will use the full database and keyboard from this downloaded folder."
