<#
kill-ptpos.ps1 -- Forcefully stop PTPOS and its GUARDIAN watchdog so they release
the OPOS scanner / serial COM ports that YieldPOS needs.

Why this exists:
  On the lane PCs PTPOS.EXE and GUARDIAN.EXE are launched ELEVATED by a Scheduled
  Task named "GUARDIAN" (RunLevel = Highest). GUARDIAN is the parent watchdog and
  re-spawns PTPOS within about a second if PTPOS alone is killed. YieldPOS runs
  non-elevated, so its built-in Stop-Process call gets "Access is denied" on the
  higher-integrity processes and nothing actually dies.

  This script fixes both problems:
    1. It self-elevates (UAC prompt) so it has the rights to kill them.
    2. It stops the GUARDIAN scheduled task and kills the guardian FIRST, then
       PTPOS, looping a few passes to beat the watchdog respawn.

Usage:
  powershell -ExecutionPolicy Bypass -File .\kill-ptpos.ps1
  powershell -ExecutionPolicy Bypass -File .\kill-ptpos.ps1 -Quiet            # no pause, minimal output (for scripting)
  powershell -ExecutionPolicy Bypass -File .\kill-ptpos.ps1 -DisableAutostart # also disable the GUARDIAN scheduled task so it won't come back at next logon

Exit code: 0 = nothing left running, 1 = something survived (still elevated/denied).
#>

[CmdletBinding()]
param(
    [switch]$Quiet,            # no "press a key" pause, terser output -- use when called from another script
    [switch]$DisableAutostart, # also disable the "GUARDIAN" scheduled task so PTPOS does not relaunch on next logon/boot
    [switch]$NoElevate         # internal: set automatically after the UAC relaunch so we don't loop
)

# Exact process image names to kill (without .exe). Matched exactly via Get-Process
# so we never touch unrelated processes such as Firebird's "fbguard".
$GuardianNames = @('GUARDIAN', 'GuardianTalker')          # watchdogs -- must die first
$PosNames      = @('PTPOS', 'PTPOSSSCO')                  # the POS app(s) the watchdog protects
$TaskName      = 'GUARDIAN'                               # the Scheduled Task that launches the watchdog elevated

function Write-Step($m) { if (-not $Quiet) { Write-Host "  $m" -ForegroundColor Cyan } }
function Write-Ok($m)   { Write-Host "  [ OK ] $m" -ForegroundColor Green }
function Write-Warn($m) { Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Write-Err($m)  { Write-Host "  [FAIL] $m" -ForegroundColor Red }

# --- Self-elevate ----------------------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin -and -not $NoElevate) {
    if (-not $PSCommandPath) { Write-Err 'Save this script to disk before running it.'; exit 1 }
    Write-Host 'PTPOS/GUARDIAN run elevated -- requesting administrator rights (approve the UAC prompt)...' -ForegroundColor Yellow

    $psExe = (Get-Process -Id $PID).Path
    if (-not $psExe) { $psExe = 'powershell.exe' }
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-NoElevate')
    if ($Quiet)            { $argList += '-Quiet' }
    if ($DisableAutostart) { $argList += '-DisableAutostart' }

    try {
        # -Wait so a caller (e.g. scan-watch.ps1) blocks until PTPOS is actually gone.
        $p = Start-Process -FilePath $psExe -Verb RunAs -ArgumentList $argList -Wait -PassThru
        exit $p.ExitCode
    } catch {
        Write-Err "Elevation was cancelled or failed: $($_.Exception.Message)"
        exit 1
    }
}

Write-Host ''
Write-Host '=== Stop PTPOS + GUARDIAN ===' -ForegroundColor Cyan
Write-Host ''

# --- 1. Stop (optionally disable) the GUARDIAN scheduled task ---------------------
# Stopping the running task instance + the live guardian process is what stops the
# respawn. Disabling is only needed if you want PTPOS to stay down across reboots.
try {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($task) {
        try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction Stop; Write-Step "Stopped scheduled task '$TaskName'." } catch {}
        if ($DisableAutostart) {
            try { Disable-ScheduledTask -TaskName $TaskName -ErrorAction Stop | Out-Null; Write-Ok "Disabled scheduled task '$TaskName' (PTPOS will NOT auto-start at next logon)." }
            catch { Write-Warn "Could not disable scheduled task '$TaskName': $($_.Exception.Message)" }
        }
    }
} catch {}

# --- 2. Kill loop: guardians first, then the POS apps -----------------------------
function Kill-ByNames($names) {
    $killed = @()
    foreach ($n in $names) {
        $procs = Get-Process -Name $n -ErrorAction SilentlyContinue
        foreach ($p in $procs) {
            $id = $p.Id
            try {
                # /T also takes down child processes (guardian -> ptpos) in one shot.
                & taskkill.exe /PID $id /T /F 2>&1 | Out-Null
                if ($LASTEXITCODE -ne 0) { Stop-Process -Id $id -Force -ErrorAction Stop }
                $killed += "$n (PID $id)"
            } catch {
                Write-Warn "Could not kill $n (PID $id): $($_.Exception.Message)"
            }
        }
    }
    return $killed
}

$maxPasses = 5
$allKilled = @()
for ($pass = 1; $pass -le $maxPasses; $pass++) {
    $still = @(Get-Process -Name ($GuardianNames + $PosNames) -ErrorAction SilentlyContinue)
    if ($still.Count -eq 0) { break }

    Write-Step "Pass $pass : killing guardians first, then PTPOS..."
    $allKilled += Kill-ByNames $GuardianNames   # parents/watchdogs first
    Start-Sleep -Milliseconds 200
    $allKilled += Kill-ByNames $PosNames        # then the POS apps
    Start-Sleep -Milliseconds 400               # give the watchdog its respawn window, then re-check
}

# --- 3. Report -------------------------------------------------------------------
$remaining = @(Get-Process -Name ($GuardianNames + $PosNames) -ErrorAction SilentlyContinue |
               Select-Object -ExpandProperty ProcessName -Unique)

Write-Host ''
if ($allKilled.Count -gt 0) {
    $allKilled = $allKilled | Select-Object -Unique
    Write-Ok ("Killed: " + ($allKilled -join ', '))
} else {
    Write-Step 'Nothing matching PTPOS/GUARDIAN was running.'
}

$exit = 0
if ($remaining.Count -gt 0) {
    Write-Err ("Still running: " + ($remaining -join ', ') + ". They may have relaunched or denied access.")
    Write-Warn 'If this persists, run this script again, or use -DisableAutostart and reboot.'
    $exit = 1
} else {
    Write-Ok 'PTPOS and GUARDIAN are stopped. The OPOS scanner / COM ports are now free for YieldPOS.'
}
Write-Host ''

if (-not $Quiet) {
    Write-Host 'Press any key to close...' -ForegroundColor DarkGray
    try { [void][System.Console]::ReadKey($true) } catch { Start-Sleep -Seconds 2 }
}
exit $exit
