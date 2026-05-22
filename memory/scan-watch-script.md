---
name: scan-watch-script
description: How to watch live barcode scans from the Datalogic Magellan 3200VSi in a terminal
metadata:
  type: reference
---

To see scanned barcodes print live in a terminal: run `scan-watch.cmd` (or `powershell -ExecutionPolicy Bypass -File scan-watch.ps1`). It first kills PTPOS/GUARDIAN (which hold the OPOS scanner claim — see [[ptpos-runs-elevated]]) then opens the Datalogic OPOS `TableScanner` profile and prints each scan as `HH:mm:ss.fff  #seq  <barcode>`. `-Plain` prints just the barcode. The proven low-level OPOS reader it reuses is `test-table-scanner.ps1`. The scanner reader auto-relaunches itself in 32-bit STA PowerShell because the Datalogic OPOS CCO is 32-bit apartment-threaded COM.
