---
name: opos-scanner-recovery
description: Never force-kill the OPOS scanner reader; rc=111 is OPOS_E_FAILURE not "claimed"; recovery is a physical power-cycle
metadata:
  type: feedback
---

When watching live scans (see [[scan-watch-script]]), stop the reader with **Ctrl+C, never `Stop-Process -Force`**. Force-killing the OPOS reader skips its cleanup (`ReleaseDevice` / `DeviceEnabled=false` / `Close`), which leaves the Datalogic Magellan 3200VSi hung: the aimer/illumination goes dark and the scanner's USB data interface (`USB\VID_05F9&PID_1602\*`) drops to PnP status `Unknown` (not present).

In that hung state `ClaimDevice` returns **rc=111 = `OPOS_E_FAILURE`** (a generic device-not-responding failure) — NOT "already claimed". OPOS_E_CLAIMED is 102. Do not interpret 111 as another process holding the scanner.

A **software USB disable/enable (`Disable-PnpDevice`/`Enable-PnpDevice` on VID_05F9) does NOT recover it** — the unit is hung below the OS. Recovery requires a **physical power-cycle** of the scanner (unplug USB/power ~5s, replug); then it re-enumerates, the light returns, and a fresh claim succeeds.

**Why:** the user's scanner went dark after I force-killed the reader, and a software USB reset left PID_1602 still `Unknown`.
**How to apply:** prefer the user run the reader in their own terminal (instant output, clean Ctrl+C exit). If a reader must be backgrounded, stop it gracefully, not with -Force. `barcode-live.ps1` now decodes OPOS rc codes in its error output.
