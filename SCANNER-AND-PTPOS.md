# Scanner + PTPOS fix

## The problem
The lane scanner (Datalogic **Magellan 3200VSi**, read over OPOS profile `TableScanner`)
wasn't feeding scans into YieldPOS, and YieldPOS couldn't kill PTPOS on startup.
The same scanner path now also covers the Datalogic **Magellan 1500i** when it is
configured as USB keyboard/HID or when Datalogic OPOS registers a Scanner profile.

**Root cause:** PTPOS holds the OPOS scanner exclusively. PTPOS.EXE and its watchdog
GUARDIAN.EXE are launched **elevated** by a Scheduled Task named `GUARDIAN`
(`C:\PTPOS\Guardian\GUARDIAN.exe`, RunLevel = Highest), at logon. GUARDIAN is the
parent of PTPOS and **re-spawns it within ~1 s** if PTPOS alone is killed.

YieldPOS runs non-elevated, so its built-in `killPtposProcesses()` gets *Access is
denied* on the higher-integrity processes and nothing dies. Confirmed: `taskkill /F`
as the same (non-admin) user returns "Access is denied".

## The fix (two parts)
1. **Kill correctly** — kill GUARDIAN *first* (and stop its task), then PTPOS, from an
   **elevated** context. That's `kill-ptpos.ps1`.
2. **Do it automatically, with no UAC prompt** — a SYSTEM scheduled task `KillPTPOS`
   runs the kill ~20 s after each logon. SYSTEM can terminate the elevated processes.

PTPOS is **not** disabled — to use it, just launch it manually during the session.
The kill task only fires once at logon and won't touch a later manual start.

## Files
| File | What it does |
|------|--------------|
| `kill-ptpos.ps1` / `.cmd` | Stop PTPOS + GUARDIAN now (self-elevates via UAC). `-DisableAutostart` also disables the GUARDIAN task. |
| `install-kill-ptpos-task.ps1` / `.cmd` | **Run once** to register the automatic logon kill (SYSTEM, no UAC at runtime). `-Uninstall` removes it. |
| `scan-watch.ps1` / `.cmd` | Frees the scanner, then prints every barcode you scan, live in the terminal. `-Plain` = bare barcode. |
| `test-table-scanner.ps1` | The underlying OPOS reader (32-bit STA) that `scan-watch` hands off to. |

## How to use
**Set up the automatic kill (once):**
```
install-kill-ptpos-task.cmd          REM approve the single UAC prompt
```
Then it's automatic on every logon. To kill right now without rebooting:
```
kill-ptpos.cmd                       REM or:  Start-ScheduledTask -TaskName KillPTPOS
```

**Watch live scans in a terminal:**
```
scan-watch.cmd                       REM kills PTPOS, then prints each scan
scan-watch.cmd -Plain                REM just the barcode digits
```
Scans print like:
```
14:07:32.118   #1   9300675024235   type=104
```

## Notes
- The scripts live in this folder; the installer copies `kill-ptpos.ps1` to
  `C:\ProgramData\YieldPOS\` so the scheduled task survives if this folder is moved.
- If a scan still doesn't appear: confirm PTPOS is gone (`Get-Process PTPOS,GUARDIAN`),
  and that the scanner is on an OPOS Scanner profile. Known-good/profile candidates
  include `TableScanner`, `MagellanSC`, `USBScanner`, `Magellan1500i`, and `MGL1500i`.
  The app also tries every registered OPOS Scanner profile it can find.
