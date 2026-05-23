$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceDb = Join-Path $root 'db\crisp-pos.sqlite'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

if (-not (Test-Path -LiteralPath $sourceDb)) {
  throw "Bundled database not found: $sourceDb"
}

$running = Get-Process | Where-Object {
  $isYieldPos = $_.ProcessName -in @('YieldPOS Client', 'YieldPOS Register', 'YieldPOS Admin')
  $isLocalElectron = $false
  if ($_.ProcessName -eq 'electron') {
    try {
      $isLocalElectron = $_.Path -and $_.Path.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)
    } catch {
      $isLocalElectron = $true
    }
  }
  $isYieldPos -or $isLocalElectron
} | Select-Object -First 1

if ($running) {
  Write-Host 'YieldPOS appears to be running. Close the Register/Admin app before resetting the DB.' -ForegroundColor Yellow
  Write-Host "Found process: $($running.ProcessName) (PID $($running.Id))" -ForegroundColor Yellow
  exit 1
}

function Reset-RuntimeDatabase {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$RuntimeDir,
    [Parameter(Mandatory = $true)][bool]$CreateIfMissing
  )

  $runtimeDb = Join-Path $RuntimeDir 'crisp-pos.sqlite'
  if (-not $CreateIfMissing -and -not (Test-Path -LiteralPath $runtimeDb)) {
    return
  }

  $backupDir = Join-Path $RuntimeDir 'backups'
  $backupDb = Join-Path $backupDir "before-runtime-reset-$stamp.sqlite"
  $runtimeWal = "$runtimeDb-wal"
  $runtimeShm = "$runtimeDb-shm"

  New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
  New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

  if (Test-Path -LiteralPath $runtimeDb) {
    Copy-Item -LiteralPath $runtimeDb -Destination $backupDb -Force
    Write-Host "Backed up $Name DB to: $backupDb"
  }

  Copy-Item -LiteralPath $sourceDb -Destination $runtimeDb -Force
  Remove-Item -LiteralPath $runtimeWal -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $runtimeShm -Force -ErrorAction SilentlyContinue

  $sourceHash = (Get-FileHash -LiteralPath $sourceDb -Algorithm SHA256).Hash
  $runtimeHash = (Get-FileHash -LiteralPath $runtimeDb -Algorithm SHA256).Hash
  if ($sourceHash -ne $runtimeHash) {
    throw "$Name DB copy verification failed: $runtimeDb"
  }

  Write-Host "$Name DB replaced from local DB: $runtimeDb"
}

$primaryRuntimeDir = Join-Path $env:APPDATA 'YieldPOS Client'
$legacyRuntimeDir = Join-Path $env:APPDATA 'BoundOS Client'

Reset-RuntimeDatabase -Name 'YieldPOS Client runtime' -RuntimeDir $primaryRuntimeDir -CreateIfMissing $true
Reset-RuntimeDatabase -Name 'BoundOS legacy runtime' -RuntimeDir $legacyRuntimeDir -CreateIfMissing $false

Write-Host "Source local DB: $sourceDb"
Write-Host "Source DB size: $([Math]::Round((Get-Item -LiteralPath $sourceDb).Length / 1MB, 2)) MB"
Write-Host "Next launch will use this folder's full database and keyboard."
