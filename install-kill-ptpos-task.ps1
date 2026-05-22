<#
install-kill-ptpos-task.ps1 -- One-time setup. Registers a scheduled task that
silently kills PTPOS + GUARDIAN at every logon, BEFORE the operator opens YieldPOS,
so they never hold the OPOS scanner / COM ports.

How it works:
  * The GUARDIAN scheduled task fires "at logon" and launches PTPOS elevated.
  * This installer registers a second task, "KillPTPOS", that also fires at logon
    but ~20 seconds later (after GUARDIAN has spawned PTPOS), running as SYSTEM with
    Highest privileges -- so it can kill the elevated processes with NO UAC prompt.
  * PTPOS is NOT disabled: if you want to use it, just launch it manually during the
    session. The kill task only runs once per logon and won't touch a later manual start.

The kill logic itself lives in kill-ptpos.ps1. This installer copies it to a stable
location (C:\ProgramData\YieldPOS) so the task keeps working even if this folder moves.

Usage (approve the single UAC prompt):
  powershell -ExecutionPolicy Bypass -File .\install-kill-ptpos-task.ps1
  powershell -ExecutionPolicy Bypass -File .\install-kill-ptpos-task.ps1 -Uninstall
  powershell -ExecutionPolicy Bypass -File .\install-kill-ptpos-task.ps1 -DelaySeconds 30
#>

[CmdletBinding()]
param(
    [int]$DelaySeconds = 20,   # how long after logon to wait before killing (let GUARDIAN spawn PTPOS first)
    [switch]$Uninstall,        # remove the KillPTPOS task instead of installing it
    [switch]$Quiet,            # no "press a key" pauses -- use when YieldPOS runs this non-interactively
    [switch]$NoElevate         # internal: set after the UAC relaunch
)

$TaskName  = 'KillPTPOS'
$StableDir = Join-Path $env:ProgramData 'YieldPOS'
$StablePs1 = Join-Path $StableDir 'kill-ptpos.ps1'

function Write-Ok($m)   { Write-Host "  [ OK ] $m" -ForegroundColor Green }
function Write-Info($m) { Write-Host "  [INFO] $m" -ForegroundColor Cyan }
function Write-Err($m)  { Write-Host "  [FAIL] $m" -ForegroundColor Red }

# --- Self-elevate (registering a SYSTEM task needs admin) ------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $NoElevate) {
    if (-not $PSCommandPath) { Write-Err 'Save this script to disk before running it.'; exit 1 }
    Write-Host 'Administrator rights are needed to register the task -- approve the UAC prompt...' -ForegroundColor Yellow
    $psExe = (Get-Process -Id $PID).Path; if (-not $psExe) { $psExe = 'powershell.exe' }
    $a = @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$PSCommandPath`"",'-NoElevate','-DelaySeconds',$DelaySeconds)
    if ($Uninstall) { $a += '-Uninstall' }
    if ($Quiet)     { $a += '-Quiet' }
    try { $p = Start-Process -FilePath $psExe -Verb RunAs -ArgumentList $a -Wait -PassThru; exit $p.ExitCode }
    catch { Write-Err "Elevation cancelled/failed: $($_.Exception.Message)"; exit 1 }
}

Write-Host ''
Write-Host "=== KillPTPOS scheduled task setup ===" -ForegroundColor Cyan
Write-Host ''

# Log everything (the elevated window may be hidden / close before you can read it).
$logDir = Join-Path $env:ProgramData 'YieldPOS'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logPath = Join-Path $logDir 'install-log.txt'
try { Start-Transcript -Path $logPath -Force | Out-Null } catch {}
trap { "TRAP: $($_.Exception.GetType().Name): $($_.Exception.Message)" | Tee-Object -FilePath $logPath -Append | Out-Null }

# --- Uninstall path --------------------------------------------------------------
if ($Uninstall) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Ok "Removed scheduled task '$TaskName'."
    } else {
        Write-Info "Task '$TaskName' was not present."
    }
    Write-Host ''
    if (-not $Quiet) {
        Write-Host 'Press any key to close...' -ForegroundColor DarkGray
        try { [void][System.Console]::ReadKey($true) } catch {}
    }
    exit 0
}

# --- 1. Copy kill-ptpos.ps1 to a stable location ---------------------------------
$srcPs1 = Join-Path (Split-Path -Parent $PSCommandPath) 'kill-ptpos.ps1'
if (-not (Test-Path -LiteralPath $srcPs1)) { Write-Err "kill-ptpos.ps1 not found next to this installer."; exit 1 }
New-Item -ItemType Directory -Path $StableDir -Force | Out-Null
Copy-Item -LiteralPath $srcPs1 -Destination $StablePs1 -Force
Write-Ok "Copied kill script to $StablePs1"

# --- 2. (Re)register the scheduled task ------------------------------------------
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Info "Replaced existing '$TaskName' task."
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$StablePs1`" -Quiet -NoElevate"

$trigger = New-ScheduledTaskTrigger -AtLogOn
$trigger.Delay = "PT${DelaySeconds}S"   # ISO-8601 duration: wait DelaySeconds after logon

$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

try {
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
        -Principal $principal -Settings $settings `
        -Description 'Kills PTPOS + GUARDIAN at logon so they release the OPOS scanner/COM ports for YieldPOS.' -ErrorAction Stop | Out-Null
} catch {
    Write-Err "Register-ScheduledTask failed: $($_.Exception.Message)"
    "REGISTER-ERROR: $($_.Exception.GetType().FullName): $($_.Exception.Message)" | Out-File -FilePath $logPath -Append -Encoding utf8
    try { Stop-Transcript | Out-Null } catch {}
    if (-not $Quiet) { try { [void][System.Console]::ReadKey($true) } catch {} }
    exit 1
}

Write-Ok "Registered '$TaskName': runs as SYSTEM, ${DelaySeconds}s after each logon."

# --- 3. Grant interactive users the right to RUN the task on demand --------------
# By default only admins/SYSTEM can start a SYSTEM task. YieldPOS runs non-elevated
# and triggers this task (schtasks /run) at startup, so grant Authenticated Users
# read+execute. Admins/SYSTEM keep full control; nobody but them can modify it.
try {
    $svc = New-Object -ComObject Schedule.Service
    $svc.Connect()
    $folder = $svc.GetFolder('\')
    $rt = $folder.GetTask("\$TaskName")
    # FA=full for Builtin Admins (BA) + System (SY); FRFX=read+execute for Authenticated Users (AU)
    $sddl = 'D:(A;;FA;;;BA)(A;;FA;;;SY)(A;;FRFX;;;AU)'
    $rt.SetSecurityDescriptor($sddl, 0)
    Write-Ok 'Granted on-demand run rights to all signed-in users (no UAC needed to trigger).'
} catch {
    Write-Warn "Could not set run permissions (the task still runs at logon): $($_.Exception.Message)"
}

# --- 4. Run it once now so PTPOS is gone immediately (we're already elevated) -----
try {
    Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    Write-Ok 'Triggered an immediate kill pass.'
} catch {
    Write-Warn "Could not trigger immediate run: $($_.Exception.Message)"
}
Write-Host ''
Write-Info "To use PTPOS on purpose: just launch it manually during the session -- this task only runs once at logon."
Write-Info "To run it right now without waiting for a logon:  Start-ScheduledTask -TaskName $TaskName"
Write-Info "To remove it later:  install-kill-ptpos-task.ps1 -Uninstall"
Write-Host ''
try { Stop-Transcript | Out-Null } catch {}
if (-not $Quiet) {
    Write-Host 'Press any key to close...' -ForegroundColor DarkGray
    try { [void][System.Console]::ReadKey($true) } catch {}
}
exit 0
