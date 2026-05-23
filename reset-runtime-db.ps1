$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceDb = Join-Path $root 'db\crisp-pos.sqlite'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

if (-not (Test-Path -LiteralPath $sourceDb)) {
  throw "Bundled database not found: $sourceDb"
}

function Get-YieldPosProcesses {
  Get-Process | Where-Object {
    $processName = [string]$_.ProcessName
    $isYieldPos = $processName -in @('YieldPOS Client', 'YieldPOS Register', 'YieldPOS Admin', 'BoundOS Client') -or
      $processName -like 'YieldPOS*' -or
      $processName -like 'BoundOS*'
    $isLocalElectron = $false
    if ($_.ProcessName -eq 'electron') {
      try {
        $isLocalElectron = $_.Path -and $_.Path.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)
      } catch {
        $isLocalElectron = $true
      }
    }
    $isYieldPos -or $isLocalElectron
  }
}

function Stop-YieldPosProcesses {
  $running = @(Get-YieldPosProcesses)
  if (-not $running.Count) {
    Write-Host 'YieldPOS is not running.' -ForegroundColor DarkGray
    return
  }

  Write-Host 'Closing YieldPOS before replacing the runtime database...' -ForegroundColor Yellow
  foreach ($p in $running) {
    Write-Host "  Closing $($p.ProcessName) (PID $($p.Id))" -ForegroundColor DarkGray
    try {
      if ($p.MainWindowHandle -ne 0) {
        [void]$p.CloseMainWindow()
      }
    } catch {}
  }

  $deadline = (Get-Date).AddSeconds(8)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 250
    if (-not @(Get-YieldPosProcesses).Count) {
      Write-Host 'YieldPOS closed cleanly.' -ForegroundColor Green
      return
    }
  }

  $stillRunning = @(Get-YieldPosProcesses)
  if ($stillRunning.Count) {
    Write-Host 'YieldPOS did not close in time; forcing it closed so the DB can be replaced.' -ForegroundColor Yellow
    foreach ($p in $stillRunning) {
      try {
        Stop-Process -Id $p.Id -Force -ErrorAction Stop
        Write-Host "  Stopped $($p.ProcessName) (PID $($p.Id))" -ForegroundColor DarkGray
      } catch {
        Write-Host "  Could not stop $($p.ProcessName) (PID $($p.Id)): $($_.Exception.Message)" -ForegroundColor Red
      }
    }
    Start-Sleep -Seconds 1
  }

  if (@(Get-YieldPosProcesses).Count) {
    throw 'YieldPOS is still running. Close it manually and run this script again.'
  }
}

Stop-YieldPosProcesses

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

  $copied = $false
  for ($attempt = 1; $attempt -le 5; $attempt++) {
    try {
      Copy-Item -LiteralPath $sourceDb -Destination $runtimeDb -Force
      $copied = $true
      break
    } catch {
      if ($attempt -eq 5) { throw }
      Write-Host "Copy attempt $attempt failed; retrying..." -ForegroundColor Yellow
      Start-Sleep -Seconds 1
    }
  }
  if (-not $copied) {
    throw "$Name DB copy failed: $runtimeDb"
  }
  Remove-Item -LiteralPath $runtimeWal -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $runtimeShm -Force -ErrorAction SilentlyContinue

  $sourceHash = (Get-FileHash -LiteralPath $sourceDb -Algorithm SHA256).Hash
  $runtimeHash = (Get-FileHash -LiteralPath $runtimeDb -Algorithm SHA256).Hash
  if ($sourceHash -ne $runtimeHash) {
    throw "$Name DB copy verification failed: $runtimeDb"
  }

  Write-Host "$Name DB replaced and verified: $runtimeDb" -ForegroundColor Green
}

$primaryRuntimeDir = Join-Path $env:APPDATA 'YieldPOS Client'
$legacyRuntimeDir = Join-Path $env:APPDATA 'BoundOS Client'

Reset-RuntimeDatabase -Name 'YieldPOS Client runtime' -RuntimeDir $primaryRuntimeDir -CreateIfMissing $true
Reset-RuntimeDatabase -Name 'BoundOS legacy runtime' -RuntimeDir $legacyRuntimeDir -CreateIfMissing $false

Write-Host "Source local DB: $sourceDb"
Write-Host "Source DB hash: $((Get-FileHash -LiteralPath $sourceDb -Algorithm SHA256).Hash)"
Write-Host "Source DB size: $([Math]::Round((Get-Item -LiteralPath $sourceDb).Length / 1MB, 2)) MB"
Write-Host "Reset complete. Next launch will use this folder's full database and keyboard." -ForegroundColor Green
