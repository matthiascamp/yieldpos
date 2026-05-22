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

$portableCandidates = @(
  (Join-Path $root 'dist2\YieldPOS-Client-1.0.0.exe'),
  (Join-Path $root 'YieldPOS-Client-1.0.0.exe')
)
$portable = $portableCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $portable) {
  throw 'Could not find YieldPOS-Client-1.0.0.exe. Run npm run build:portable first.'
}

Copy-Item -LiteralPath $portable -Destination (Join-Path $out 'YieldPOS-Client-1.0.0.exe') -Force
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
Copy-IfExists 'test-table-scanner.ps1'
Copy-IfExists 'scan-test.js'

$readme = @"
YieldPOS flat package

Use YieldPOS Register.exe to open the register.
Use YieldPOS Admin.exe to open admin.

Recommended Desktop layout:
- $launcherOut\YieldPOS Register.exe
- $launcherOut\YieldPOS Admin.exe
- $out\YieldPOS-Client-1.0.0.exe

The launchers also work if you keep them inside this YieldPOS folder with YieldPOS-Client-1.0.0.exe.

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
