---
name: app-scanner-via-barcode-live
description: YieldPOS now reads the OPOS scanner via barcode-live.ps1 -Json (not scanner-bridge.exe) and force-quits PTPOS via the SYSTEM KillPTPOS task
metadata:
  type: project
---

As of 2026-05-22, the YieldPOS Electron app's scanner integration was rewired (main.js):

- **Scanner source:** `startScannerListener()` now spawns 32-bit PowerShell running `barcode-live.ps1 -NoKill -Json -NoRelaunch32Bit -Sta` (via `BARCODE_LIVE_PS1`), NOT the old `scanner-bridge.exe`. `barcode-live.ps1` gained a `-Json` switch that emits one JSON event per line (`opened`/`scan`/`claim_failed`/`open_failed`/`fatal`/`error`) matching the existing `handleScannerEvent` protocol, which sends `scanner:data` IPC → the renderer's `onScannerData` (index.html) → `submitScannedCode()` → cart. `scanner-bridge.exe` and `opos-bridge.ps1`'s `scanner-listen` action are now dead code for the live feed.
- **Graceful stop:** `barcode-live.ps1` watches stdin on a background thread; `stopScannerListener()` closes stdin (then hard-kills after 1.5s only as fallback) so OPOS `Cleanup()` runs. This is deliberate — a hard kill hangs the scanner (see [[opos-scanner-recovery]]).
- **OPOS reader default ON:** `_initScannerStartup()` now starts the reader unless `scanner_opos_enabled='0'` (previously it was off unless explicitly enabled/configured).
- **PTPOS kill:** startup now calls `ensureKillPtposTask()` (installs the SYSTEM `KillPTPOS` scheduled task once via `install-kill-ptpos-task.ps1 -Quiet`, one UAC prompt) + `killPtposViaTask()` (`schtasks /run`, no UAC — the installer grants Authenticated Users run rights via SDDL `D:(A;;FA;;;BA)(A;;FA;;;SY)(A;;FRFX;;;AU)`), then the legacy inline `killPtposProcesses()` as best-effort. This replaces relying on the non-elevated inline kill that silently failed (see [[ptpos-runs-elevated]]).
- These four scripts are bundled in package.json (`files` + `asarUnpack`): barcode-live.ps1, install-kill-ptpos-task.ps1, kill-ptpos.ps1 (scanner-bridge.exe still listed but unused).
