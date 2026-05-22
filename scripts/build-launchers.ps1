$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$template = Join-Path $PSScriptRoot 'YieldPosLauncher.cs'
$icon = Join-Path $root 'dist2\.icon-ico\icon.ico'
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $csc)) {
  $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
}
if (-not (Test-Path -LiteralPath $csc)) {
  throw 'Could not find the Windows .NET C# compiler.'
}
if (-not (Test-Path -LiteralPath $icon)) {
  throw "Could not find icon: $icon. Run npm run build first."
}

function Build-Launcher([string]$mode, [string]$outputName) {
  $tmp = Join-Path $env:TEMP "$outputName.cs"
  $source = (Get-Content -Raw -LiteralPath $template).Replace('__MODE__', $mode)
  Set-Content -LiteralPath $tmp -Value $source -Encoding UTF8
  $out = Join-Path $root $outputName
  & $csc /nologo /target:winexe /platform:anycpu /optimize+ /win32icon:$icon /r:System.Windows.Forms.dll /out:$out $tmp
  if ($LASTEXITCODE -ne 0) { throw "Failed to build $outputName" }
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
}

Build-Launcher 'admin' 'YieldPOS Admin.exe'
Build-Launcher 'register' 'YieldPOS Register.exe'
Write-Host 'Built YieldPOS launcher EXEs.'
