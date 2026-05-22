---
name: ptpos-runs-elevated
description: Why YieldPOS's startup kill of PTPOS/GUARDIAN fails on the lane PCs
metadata:
  type: project
---

On the POS lane PCs, PTPOS and its watchdog run **elevated (RunLevel=Highest)**, launched by a Scheduled Task named "GUARDIAN" (`C:\PTPOS\Guardian\GUARDIAN.exe`). GUARDIAN.EXE is the parent of PTPOS.EXE and re-spawns it within ~1s if PTPOS dies.

YieldPOS's `killPtposProcesses()` in main.js runs from non-elevated Electron, so `Stop-Process -Force` / `taskkill /F` both fail with **Access Denied** on the higher-integrity processes — the failure is swallowed into the per-process `error` field, so nothing actually dies. Confirmed 2026-05-22: `taskkill /PID <ptpos> /F` as the same user (POSLANE02\PTUser, non-admin) → "Access is denied".

**Two fixes required to kill them:** (1) run elevated (UAC), and (2) kill GUARDIAN *first* (and stop the scheduled task) before PTPOS, or the guardian resurrects it.

Install path `C:\PTPOS\` also has `GuardianTalker.exe`, `PTPOS.EXE`, `PTPOSSSCO.EXE`. Standalone fix lives in `kill-ptpos.ps1` (self-elevating, guardian-first). Scanner is a Datalogic Magellan 3200VSi read via OPOS profile `TableScanner` (also `MagellanSC`); PTPOS holds the OPOS claim until killed. See [[scan-watch-script]].
