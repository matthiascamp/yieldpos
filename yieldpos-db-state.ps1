param(
  [ValidateSet('Save', 'Export', 'Import')]
  [string]$Action = 'Export',

  [string]$ExportPath = '',
  [string]$ImportPath = ''
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$primaryRuntimeDir = Join-Path $env:APPDATA 'YieldPOS Client'
$legacyRuntimeDir = Join-Path $env:APPDATA 'BoundOS Client'
$bundledDb = Join-Path $root 'db\crisp-pos.sqlite'
$exportDir = Join-Path $root 'exports'

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
  param([string]$Reason = 'database operation')

  $running = @(Get-YieldPosProcesses)
  if (-not $running.Count) {
    Write-Host 'YieldPOS is not running.' -ForegroundColor DarkGray
    return
  }

  Write-Host "Closing YieldPOS before $Reason..." -ForegroundColor Yellow
  foreach ($p in $running) {
    Write-Host "  Closing $($p.ProcessName) (PID $($p.Id))" -ForegroundColor DarkGray
    try {
      if ($p.MainWindowHandle -ne 0) { [void]$p.CloseMainWindow() }
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
    Write-Host 'YieldPOS did not close in time; forcing it closed so the database is consistent.' -ForegroundColor Yellow
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
    throw 'YieldPOS is still running. Close it manually and run this command again.'
  }
}

function Get-RuntimeDbPath {
  $primary = Join-Path $primaryRuntimeDir 'crisp-pos.sqlite'
  $legacy = Join-Path $legacyRuntimeDir 'crisp-pos.sqlite'
  if (Test-Path -LiteralPath $primary) { return $primary }
  if (Test-Path -LiteralPath $legacy) { return $legacy }
  throw "No runtime database found. Expected: $primary"
}

function Copy-VerifiedFile {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination,
    [Parameter(Mandatory = $true)][string]$Label
  )

  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
  Copy-Item -LiteralPath $Source -Destination $Destination -Force

  $sourceHash = (Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash
  $destHash = (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash
  if ($sourceHash -ne $destHash) {
    throw "$Label verification failed: copied hash does not match source hash."
  }
  return $destHash
}

function Backup-IfExists {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$BackupDir,
    [Parameter(Mandatory = $true)][string]$Prefix
  )

  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  $backupPath = Join-Path $BackupDir "$Prefix-$stamp.sqlite"
  Copy-VerifiedFile -Source $Path -Destination $backupPath -Label "$Prefix backup" | Out-Null
  return $backupPath
}

function Remove-SqliteSidecars {
  param([Parameter(Mandatory = $true)][string]$DbPath)
  Remove-Item -LiteralPath "$DbPath-wal" -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath "$DbPath-shm" -Force -ErrorAction SilentlyContinue
}

function Save-RuntimeDatabase {
  Stop-YieldPosProcesses -Reason 'saving the runtime database'
  $runtimeDb = Get-RuntimeDbPath
  if (-not (Test-Path -LiteralPath (Split-Path -Parent $bundledDb))) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $bundledDb) | Out-Null
  }

  $backupPath = Backup-IfExists -Path $bundledDb -BackupDir (Join-Path $root 'backups\bundled-db') -Prefix 'before-save-runtime-db'
  if ($backupPath) { Write-Host "Backed up bundled DB to: $backupPath" }

  Remove-SqliteSidecars -DbPath $bundledDb
  $hash = Copy-VerifiedFile -Source $runtimeDb -Destination $bundledDb -Label 'Bundled database save'
  Write-Host "Saved runtime DB into bundled DB: $bundledDb" -ForegroundColor Green
  Write-Host "Source runtime DB: $runtimeDb"
  Write-Host "Saved DB hash: $hash"
}

function Resolve-ExportDestination {
  if (-not $ExportPath) {
    New-Item -ItemType Directory -Force -Path $exportDir | Out-Null
    return Join-Path $exportDir "yieldpos-db-export-$stamp.zip"
  }

  $resolved = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ExportPath)
  if ($resolved.ToLowerInvariant().EndsWith('.zip')) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $resolved) | Out-Null
    return $resolved
  }

  New-Item -ItemType Directory -Force -Path $resolved | Out-Null
  return Join-Path $resolved "yieldpos-db-export-$stamp.zip"
}

function Export-RuntimeDatabase {
  Stop-YieldPosProcesses -Reason 'exporting the runtime database'
  $runtimeDb = Get-RuntimeDbPath
  $destination = Resolve-ExportDestination
  $tempDir = Join-Path $env:TEMP "yieldpos-db-export-$stamp"
  if (Test-Path -LiteralPath $tempDir) { Remove-Item -LiteralPath $tempDir -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

  try {
    $exportDb = Join-Path $tempDir 'crisp-pos.sqlite'
    $hash = Copy-VerifiedFile -Source $runtimeDb -Destination $exportDb -Label 'Runtime database export'

    foreach ($suffix in @('-wal', '-shm')) {
      $sidecar = "$runtimeDb$suffix"
      if (Test-Path -LiteralPath $sidecar) {
        Copy-Item -LiteralPath $sidecar -Destination (Join-Path $tempDir "crisp-pos.sqlite$suffix") -Force
      }
    }

    $manifest = [pscustomobject]@{
      app = 'YieldPOS'
      format = 'yieldpos-sqlite-export-v1'
      exported_at = (Get-Date).ToString('o')
      source_runtime_db = $runtimeDb
      database_file = 'crisp-pos.sqlite'
      database_sha256 = $hash
      database_size = (Get-Item -LiteralPath $runtimeDb).Length
    }
    $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $tempDir 'manifest.json') -Encoding UTF8

    if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Force }
    Compress-Archive -Path (Join-Path $tempDir '*') -DestinationPath $destination -Force
    Write-Host "Exported full database state to: $destination" -ForegroundColor Green
    Write-Host "Export DB hash: $hash"
  } finally {
    Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Resolve-ImportSource {
  if ($ImportPath) {
    $resolved = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ImportPath)
    if (-not (Test-Path -LiteralPath $resolved)) { throw "Import file not found: $resolved" }
    return $resolved
  }

  if (-not (Test-Path -LiteralPath $exportDir)) {
    throw "No exports folder found. Drag an export zip onto import-runtime-db.cmd or pass the zip path."
  }

  $latest = Get-ChildItem -LiteralPath $exportDir -Filter 'yieldpos-db-export-*.zip' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $latest) {
    throw "No export zips found in: $exportDir"
  }

  Write-Host "Latest export found: $($latest.FullName)" -ForegroundColor Yellow
  $answer = Read-Host 'Import this export into the runtime database? Type YES to continue'
  if ($answer -ne 'YES') { throw 'Import cancelled.' }
  return $latest.FullName
}

function Get-ImportDatabaseFromZip {
  param(
    [Parameter(Mandatory = $true)][string]$ZipPath,
    [Parameter(Mandatory = $true)][string]$TempDir
  )

  Expand-Archive -LiteralPath $ZipPath -DestinationPath $TempDir -Force
  $db = Get-ChildItem -LiteralPath $TempDir -Recurse -Filter 'crisp-pos.sqlite' | Select-Object -First 1
  if (-not $db) { throw "Export archive does not contain crisp-pos.sqlite: $ZipPath" }

  $manifest = Get-ChildItem -LiteralPath $TempDir -Recurse -Filter 'manifest.json' | Select-Object -First 1
  if ($manifest) {
    try {
      $meta = Get-Content -Raw -LiteralPath $manifest.FullName | ConvertFrom-Json
      if ($meta.database_sha256) {
        $actualHash = (Get-FileHash -LiteralPath $db.FullName -Algorithm SHA256).Hash
        if ($actualHash -ne $meta.database_sha256) {
          throw "Import hash mismatch. Expected $($meta.database_sha256), got $actualHash."
        }
      }
    } catch {
      throw "Export manifest validation failed: $($_.Exception.Message)"
    }
  }

  return $db.FullName
}

function Import-DatabaseToRuntimeDir {
  param(
    [Parameter(Mandatory = $true)][string]$SourceDb,
    [Parameter(Mandatory = $true)][string]$RuntimeDir,
    [Parameter(Mandatory = $true)][bool]$CreateIfMissing,
    [Parameter(Mandatory = $true)][string]$Name
  )

  $runtimeDb = Join-Path $RuntimeDir 'crisp-pos.sqlite'
  if (-not $CreateIfMissing -and -not (Test-Path -LiteralPath $runtimeDb)) { return }

  New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
  $backupPath = Backup-IfExists -Path $runtimeDb -BackupDir (Join-Path $RuntimeDir 'backups') -Prefix 'before-import-db'
  if ($backupPath) { Write-Host "Backed up $Name DB to: $backupPath" }

  Remove-SqliteSidecars -DbPath $runtimeDb
  $hash = Copy-VerifiedFile -Source $SourceDb -Destination $runtimeDb -Label "$Name import"
  foreach ($suffix in @('-wal', '-shm')) {
    $sourceSidecar = "$SourceDb$suffix"
    $destSidecar = "$runtimeDb$suffix"
    if (Test-Path -LiteralPath $sourceSidecar) {
      Copy-Item -LiteralPath $sourceSidecar -Destination $destSidecar -Force
    }
  }
  Write-Host "$Name DB imported: $runtimeDb" -ForegroundColor Green
  Write-Host "$Name DB hash: $hash"
}

function Import-RuntimeDatabase {
  $source = Resolve-ImportSource
  Stop-YieldPosProcesses -Reason 'importing a database export'

  $tempDir = Join-Path $env:TEMP "yieldpos-db-import-$stamp"
  if (Test-Path -LiteralPath $tempDir) { Remove-Item -LiteralPath $tempDir -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

  try {
    $lower = $source.ToLowerInvariant()
    if ($lower.EndsWith('.zip')) {
      $importDb = Get-ImportDatabaseFromZip -ZipPath $source -TempDir $tempDir
    } elseif ($lower.EndsWith('.sqlite')) {
      $importDb = $source
    } else {
      throw 'Import file must be a YieldPOS export .zip or a crisp-pos.sqlite file.'
    }

    Import-DatabaseToRuntimeDir -SourceDb $importDb -RuntimeDir $primaryRuntimeDir -CreateIfMissing $true -Name 'YieldPOS Client runtime'
    Import-DatabaseToRuntimeDir -SourceDb $importDb -RuntimeDir $legacyRuntimeDir -CreateIfMissing $false -Name 'BoundOS legacy runtime'
    Write-Host 'Import complete. Open YieldPOS to use the imported database.' -ForegroundColor Green
  } finally {
    Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}

switch ($Action) {
  'Save' { Save-RuntimeDatabase }
  'Export' { Export-RuntimeDatabase }
  'Import' { Import-RuntimeDatabase }
}
