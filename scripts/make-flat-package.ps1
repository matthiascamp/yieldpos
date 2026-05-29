param(
  [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
if (-not $OutputPath) {
  $desktop = [Environment]::GetFolderPath('DesktopDirectory')
  if (-not $desktop) { $desktop = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Desktop' }
  $OutputPath = Join-Path $desktop 'YieldPOS'
}

$out = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
New-Item -ItemType Directory -Force -Path $out | Out-Null
$launcherOut = Split-Path -Parent $out
if (-not $launcherOut) { $launcherOut = $out }
New-Item -ItemType Directory -Force -Path $launcherOut | Out-Null

function Copy-IfExistsTo([string]$relativePath, [string]$destinationDir, [string]$destinationName = '') {
  $src = Join-Path $root $relativePath
  if (-not (Test-Path -LiteralPath $src)) { return }
  if (-not $destinationName) { $destinationName = Split-Path -Leaf $relativePath }
  Copy-Item -LiteralPath $src -Destination (Join-Path $destinationDir $destinationName) -Force
}

function Copy-IfExists([string]$relativePath, [string]$destinationName = '') {
  Copy-IfExistsTo $relativePath $out $destinationName
}

function Find-PortableExe([string[]]$dirs) {
  $packagePath = Join-Path $root 'package.json'
  if (Test-Path -LiteralPath $packagePath) {
    $version = (Get-Content -Raw -LiteralPath $packagePath | ConvertFrom-Json).version
    if ($version) {
      foreach ($dir in $dirs) {
        $expected = Join-Path $dir "YieldPOS-Client-$version.exe"
        if (Test-Path -LiteralPath $expected) {
          return Get-Item -LiteralPath $expected
        }
      }
    }
  }
  $matches = @()
  foreach ($dir in $dirs) {
    if (Test-Path -LiteralPath $dir) {
      $matches += Get-ChildItem -LiteralPath $dir -Filter 'YieldPOS-Client-*.exe' -File -ErrorAction SilentlyContinue
    }
  }
  $matches | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
}

$portable = Find-PortableExe @((Join-Path $root 'dist2'), $root)
if (-not $portable) {
  throw 'Could not find YieldPOS-Client-*.exe. Run npm run build:portable first.'
}
$portableName = $portable.Name

Copy-Item -LiteralPath $portable.FullName -Destination (Join-Path $out $portableName) -Force
Copy-IfExists 'YieldPOS Admin.exe'
Copy-IfExists 'YieldPOS Register.exe'
if (-not [string]::Equals($launcherOut, $out, [StringComparison]::OrdinalIgnoreCase)) {
  Copy-IfExistsTo 'YieldPOS Admin.exe' $launcherOut
  Copy-IfExistsTo 'YieldPOS Register.exe' $launcherOut
}

# Scanner/PTPOS tools are optional for daily launching, but useful on the register PC.
Copy-IfExists 'SCANNER-AND-PTPOS.md'
Copy-IfExists 'barcode-live.cmd'
Copy-IfExists 'barcode-live.ps1'
Copy-IfExists 'scan-watch.cmd'
Copy-IfExists 'scan-watch.ps1'
Copy-IfExists 'kill-ptpos.cmd'
Copy-IfExists 'kill-ptpos.ps1'
Copy-IfExists 'install-kill-ptpos-task.cmd'
Copy-IfExists 'install-kill-ptpos-task.ps1'
Copy-IfExists 'reset-runtime-db.cmd'
Copy-IfExists 'reset-runtime-db.ps1'
Copy-IfExists 'save-runtime-db.cmd'
Copy-IfExists 'export-runtime-db.cmd'
Copy-IfExists 'import-runtime-db.cmd'
Copy-IfExists 'update-yieldpos-from-git.cmd'
Copy-IfExists 'yieldpos-db-state.ps1'
Copy-IfExists 'test-table-scanner.ps1'
Copy-IfExists 'scan-test.js'

$readme = @"
YieldPOS flat package

Use YieldPOS Register.exe to open the register.
Use YieldPOS Admin.exe to open admin.

Recommended Desktop layout:
- $launcherOut\YieldPOS Register.exe
- $launcherOut\YieldPOS Admin.exe
- $out\$portableName

The launchers also work if you keep them inside this YieldPOS folder with the YieldPOS-Client EXE.

The reset-runtime-db.cmd script replaces the PC's Electron runtime database with this package's bundled database.
The save-runtime-db.cmd script saves the PC's current runtime database back into this package's bundled database.
The export-runtime-db.cmd and import-runtime-db.cmd scripts move a full database state between PCs.
The other scripts in this folder are scanner/PTPOS diagnostics and setup helpers.
There is no dist2 or win-unpacked folder needed for normal use.
"@
Set-Content -LiteralPath (Join-Path $out 'README-FIRST.txt') -Value $readme -Encoding ASCII

Write-Host "Flat YieldPOS package ready:"
Write-Host $out
if (-not [string]::Equals($launcherOut, $out, [StringComparison]::OrdinalIgnoreCase)) {
  Write-Host "Desktop-level launchers ready:"
  Write-Host (Join-Path $launcherOut 'YieldPOS Register.exe')
  Write-Host (Join-Path $launcherOut 'YieldPOS Admin.exe')
}
