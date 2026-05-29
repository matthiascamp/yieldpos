# opos-bridge.ps1 -- OPOS COM bridge for Crisp POS (called from Node.js main process)
# Usage: powershell -ExecutionPolicy Bypass -NoProfile -NonInteractive -File opos-bridge.ps1 -Action <action> [-DeviceName <name>] [-Data <text>]
#
# Actions:
#   check         -- Check if OPOS COM objects are available (returns JSON)
#   list-devices  -- List OPOS logical device names from registry
#   print         -- Print text via OPOS POSPrinter (Data = text to print)
#   print-raw     -- Print raw ESC/POS bytes via OPOS POSPrinter (Data = base64-encoded bytes)
#   cut           -- Send paper cut command
#   open-drawer   -- Open cash drawer via OPOS CashDrawer
#   read-scale    -- Read weight from OPOS Scale
#   status        -- Get device status (printer, drawer, or scale)
#
# DeviceName: OPOS logical device name configured in SetupPOS.exe (default: tries common names)
# Output: JSON to stdout for Node.js to parse

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('check','list-devices','print','print-raw','cut','open-drawer','read-scale','status','scanner-test','scanner-listen')]
    [string]$Action,

    [string]$DeviceName = '',
    [string]$DeviceType = '',
    [string]$Data = '',
    [int]$RetrySeconds = 3
)

$ErrorActionPreference = 'Stop'

function JsonResult($ok, $data, $error) {
    $obj = @{ ok = $ok }
    if ($data) { $obj.data = $data }
    if ($error) { $obj.error = $error }
    Write-Output (ConvertTo-Json $obj -Compress -Depth 5)
}

# OPOS constants
$PTR_S_RECEIPT = 2
$CYCL_TRUE = 0  # cyclic for cut
$PTR_BC_CODE128 = 110

# ── Check if OPOS is available ───────────────────────────────────────────────
if ($Action -eq 'check') {
    $bitness = if ([Environment]::Is64BitProcess) { '64' } else { '32' }
    $result = @{ printer = $false; drawer = $false; scale = $false; scanner = $false; progIds = @(); bitness = $bitness }

    # Try known ProgIDs for the OPOS CCOs
    $progIds = @(
        @{ type = 'printer'; ids = @('OPOSPOSPrinter.OPOSPOSPrinter', 'OPOS.POSPrinter', 'OPOSPOSPrinter_CCO.OPOSPOSPrinter.1') },
        @{ type = 'drawer';  ids = @('OPOSCashDrawer.OPOSCashDrawer', 'OPOS.CashDrawer', 'OPOSCashDrawer_CCO.OPOSCashDrawer.1') },
        @{ type = 'scale';   ids = @('OPOSScale.OPOSScale', 'OPOS.Scale', 'OPOSScale_CCO.OPOSScale.1') },
        @{ type = 'scanner'; ids = @('OPOSScanner.OPOSScanner', 'OPOS.Scanner', 'OPOSScanner_CCO.OPOSScanner.1') }
    )

    foreach ($group in $progIds) {
        foreach ($id in $group.ids) {
            try {
                $obj = New-Object -ComObject $id
                $result[$group.type] = $true
                $result.progIds += @{ type = $group.type; progId = $id }
                [System.Runtime.InteropServices.Marshal]::ReleaseComObject($obj) | Out-Null
                break  # found one that works
            } catch {}
        }
    }

    # Also try by CLSID directly (from the .ocx files)
    $clsids = @(
        @{ type = 'printer'; clsid = 'CCB90150-B81E-11D2-AB74-0040054C3719' },
        @{ type = 'drawer';  clsid = 'CCB90040-B81E-11D2-AB74-0040054C3719' },
        @{ type = 'scale';   clsid = 'CCB90100-B81E-11D2-AB74-0040054C3719' },
        @{ type = 'scanner'; clsid = 'CCB901B0-B81E-11D2-AB74-0040054C3719' }
    )
    foreach ($entry in $clsids) {
        if (-not $result[$entry.type]) {
            try {
                $type = [Type]::GetTypeFromCLSID([Guid]$entry.clsid)
                if ($type) {
                    $obj = [Activator]::CreateInstance($type)
                    $result[$entry.type] = $true
                    $result.progIds += @{ type = $entry.type; progId = "CLSID:{$($entry.clsid)}" }
                    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($obj) | Out-Null
                }
            } catch {}
        }
    }

    JsonResult $true $result
    exit 0
}

# ── List OPOS device names from registry ─────────────────────────────────────
if ($Action -eq 'list-devices') {
    $devices = @()
    $regPaths = @(
        'HKLM:\SOFTWARE\OLEforRetail\ServiceOPOS',
        'HKLM:\SOFTWARE\WOW6432Node\OLEforRetail\ServiceOPOS'
    )
    foreach ($root in $regPaths) {
        if (Test-Path $root) {
            # Each subkey is a device type (POSPrinter, CashDrawer, Scale, etc.)
            foreach ($typeKey in (Get-ChildItem $root -ErrorAction SilentlyContinue)) {
                $typeName = $typeKey.PSChildName
                # Each sub-subkey is a logical device name
                foreach ($devKey in (Get-ChildItem $typeKey.PSPath -ErrorAction SilentlyContinue)) {
                    $devName = $devKey.PSChildName
                    $props = @{}
                    foreach ($val in $devKey.Property) {
                        $props[$val] = (Get-ItemProperty $devKey.PSPath).$val
                    }
                    $devices += @{
                        type = $typeName
                        name = $devName
                        path = $devKey.PSPath -replace '.*\\ServiceOPOS\\', ''
                        properties = $props
                    }
                }
            }
        }
    }
    JsonResult $true @{ devices = $devices; count = $devices.Count }
    exit 0
}

# ── Helper: find working ProgID for a device type ────────────────────────────
function Get-OposObject($type) {
    $map = @{
        'printer' = @(
            @{ progId = 'OPOSPOSPrinter.OPOSPOSPrinter' },
            @{ progId = 'OPOS.POSPrinter' },
            @{ clsid = 'CCB90150-B81E-11D2-AB74-0040054C3719' }
        )
        'drawer' = @(
            @{ progId = 'OPOSCashDrawer.OPOSCashDrawer' },
            @{ progId = 'OPOS.CashDrawer' },
            @{ clsid = 'CCB90040-B81E-11D2-AB74-0040054C3719' }
        )
        'scale' = @(
            @{ progId = 'OPOSScale.OPOSScale' },
            @{ progId = 'OPOS.Scale' },
            @{ clsid = 'CCB90100-B81E-11D2-AB74-0040054C3719' }
        )
        'scanner' = @(
            @{ progId = 'OPOSScanner.OPOSScanner' },
            @{ progId = 'OPOS.Scanner' },
            @{ clsid = 'CCB901B0-B81E-11D2-AB74-0040054C3719' }
        )
    }

    foreach ($entry in $map[$type]) {
        try {
            if ($entry.progId) {
                return (New-Object -ComObject $entry.progId)
            } else {
                $t = [Type]::GetTypeFromCLSID([Guid]$entry.clsid)
                return [Activator]::CreateInstance($t)
            }
        } catch {}
    }
    return $null
}

# ── Helper: find logical device name from registry ───────────────────────────
# Strategy: collect all registered names from the registry, then return the
# first one that matches our preferred order. This handles installations like
# the Crisp setup where multiple Datalogic logical devices are registered but
# only the ones with the right Usage code actually work for this hardware.
function Normalize-OposName {
    param([string]$Name)
    if (-not $Name) { return '' }
    return ([regex]::Replace($Name.ToLowerInvariant(), '[^a-z0-9]', ''))
}

function Test-OposNameMatch {
    param([string]$Registered, [string]$Preferred)
    if ($Registered -eq $Preferred) { return $true }
    $r = Normalize-OposName $Registered
    $p = Normalize-OposName $Preferred
    return ($r -and $p -and ($r.Contains($p) -or $p.Contains($r)))
}

function Get-DeviceName($oposType, $preferredName) {
    if ($preferredName) { return $preferredName }

    $preferred = @{
        'POSPrinter' = @('Unit1', 'EpsonPrinter', 'TM-T82II', 'Printer1', 'Receipt')
        'CashDrawer' = @('Unit1', 'EpsonDrawer', 'Drawer1', 'CashDrawer1')
        'Scale'      = @('USBScale', 'TableScale', 'Unit1', 'Scale1', 'MTScale', 'Viva')
        # TableScanner FIRST: empirically verified working in DualTest on this hardware.
        # USBScanner is functionally equivalent per Datalogic docs but didn't deliver
        # DataEvents in our bridge — keeping it as fallback.
        'Scanner'    = @('TableScanner', 'Magellan1500i', 'Magellan1500iScanner', 'Magellan1500i-USB', 'Magellan1500i-USB-OEM', 'MGL1500i', 'MGL1500iScanner', 'MagellanSC', 'USBScanner', 'Bologna-USB-HID', 'USBHHScanner', 'HandScanner', 'Unit1', 'Scanner1')
    }

    # Collect every registered logical device name
    $registered = @()
    foreach ($path in @("HKLM:\SOFTWARE\OLEforRetail\ServiceOPOS\$oposType", "HKLM:\SOFTWARE\WOW6432Node\OLEforRetail\ServiceOPOS\$oposType")) {
        if (Test-Path $path) {
            $registered += (Get-ChildItem $path -ErrorAction SilentlyContinue) | ForEach-Object { $_.PSChildName }
        }
    }

    # Prefer the first known-good name that's actually registered
    if ($preferred[$oposType]) {
        foreach ($name in $preferred[$oposType]) {
            $match = $registered | Where-Object { Test-OposNameMatch $_ $name } | Select-Object -First 1
            if ($match) { return $match }
        }
    }

    # Fallbacks: first registered name (alphabetical) or first preferred default
    if ($registered.Count -gt 0) { return $registered[0] }
    if ($preferred[$oposType]) { return $preferred[$oposType][0] }
    return 'Unit1'
}

# ── Print via OPOS ───────────────────────────────────────────────────────────
if ($Action -eq 'print' -or $Action -eq 'print-raw' -or $Action -eq 'cut') {
    $printer = Get-OposObject 'printer'
    if (-not $printer) { JsonResult $false $null 'OPOS POSPrinter COM object not available'; exit 1 }

    $name = Get-DeviceName 'POSPrinter' $DeviceName
    try {
        $rc = $printer.Open($name)
        if ($rc -ne 0) { JsonResult $false $null "Open failed: rc=$rc (device name '$name' not found in SetupPOS)"; exit 1 }

        $rc = $printer.ClaimDevice(5000)
        if ($rc -ne 0) {
            $printer.Close()
            JsonResult $false $null "ClaimDevice failed: rc=$rc (another app may have the printer claimed)"
            exit 1
        }

        $printer.DeviceEnabled = $true

        if ($Action -eq 'print') {
            # Text printing - add newline if not present
            $text = $Data
            if (-not $text.EndsWith("`n")) { $text += "`n" }
            $rc = $printer.PrintNormal($PTR_S_RECEIPT, $text)
            if ($rc -ne 0) {
                $errCode = $printer.ResultCode
                $errExt = $printer.ResultCodeExtended
                $printer.DeviceEnabled = $false; $printer.ReleaseDevice(); $printer.Close()
                JsonResult $false $null "PrintNormal failed: rc=$rc errCode=$errCode errExt=$errExt"
                exit 1
            }
        } elseif ($Action -eq 'print-raw') {
            # Raw ESC/POS bytes (base64 encoded from Node.js)
            $bytes = [Convert]::FromBase64String($Data)
            $hexStr = -join ($bytes | ForEach-Object { [char]$_ })
            $rc = $printer.PrintNormal($PTR_S_RECEIPT, $hexStr)
        } elseif ($Action -eq 'cut') {
            $rc = $printer.CutPaper(100)  # 100 = full percentage
        }

        $printer.DeviceEnabled = $false
        $printer.ReleaseDevice()
        $printer.Close()

        JsonResult $true @{ deviceName = $name; action = $Action }
    } catch {
        try { $printer.DeviceEnabled = $false } catch {}
        try { $printer.ReleaseDevice() } catch {}
        try { $printer.Close() } catch {}
        JsonResult $false $null "Printer error: $($_.Exception.Message)"
        exit 1
    } finally {
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($printer) | Out-Null
    }
}

# ── Open Cash Drawer via OPOS ────────────────────────────────────────────────
if ($Action -eq 'open-drawer') {
    $drawer = Get-OposObject 'drawer'
    if (-not $drawer) { JsonResult $false $null 'OPOS CashDrawer COM object not available'; exit 1 }

    $name = Get-DeviceName 'CashDrawer' $DeviceName
    try {
        $rc = $drawer.Open($name)
        if ($rc -ne 0) { JsonResult $false $null "Open failed: rc=$rc (device name '$name' not found in SetupPOS)"; exit 1 }

        $rc = $drawer.ClaimDevice(5000)
        if ($rc -ne 0) {
            $drawer.Close()
            JsonResult $false $null "ClaimDevice failed: rc=$rc"
            exit 1
        }

        $drawer.DeviceEnabled = $true
        $rc = $drawer.OpenDrawer()

        $opened = $drawer.DrawerOpened
        $drawer.DeviceEnabled = $false
        $drawer.ReleaseDevice()
        $drawer.Close()

        if ($rc -ne 0) {
            JsonResult $false $null "OpenDrawer failed: rc=$rc"
            exit 1
        }

        JsonResult $true @{ deviceName = $name; drawerOpened = $opened }
    } catch {
        try { $drawer.DeviceEnabled = $false } catch {}
        try { $drawer.ReleaseDevice() } catch {}
        try { $drawer.Close() } catch {}
        JsonResult $false $null "Drawer error: $($_.Exception.Message)"
        exit 1
    } finally {
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($drawer) | Out-Null
    }
}

# ── Read Scale via OPOS ──────────────────────────────────────────────────────
if ($Action -eq 'read-scale') {
    $scale = Get-OposObject 'scale'
    if (-not $scale) { JsonResult $false $null 'OPOS Scale COM object not available'; exit 1 }

    $name = Get-DeviceName 'Scale' $DeviceName
    try {
        $rc = $scale.Open($name)
        if ($rc -ne 0) { JsonResult $false $null "Open failed: rc=$rc (device name '$name' not found)"; exit 1 }

        $rc = $scale.ClaimDevice(5000)
        if ($rc -ne 0) {
            $scale.Close()
            JsonResult $false $null "ClaimDevice failed: rc=$rc"
            exit 1
        }

        $scale.DeviceEnabled = $true

        # ReadWeight with 5 second timeout
        $weightVar = 0
        $rc = $scale.ReadWeight([ref]$weightVar, 5000)

        $weight = $scale.ScaleLiveWeight
        $unit = $scale.WeightUnit  # 1=gram, 2=kilogram, 3=ounce, 4=pound
        $unitStr = switch ($unit) { 1 { 'g' }; 2 { 'kg' }; 3 { 'oz' }; 4 { 'lb' }; default { 'unknown' } }
        $zeroReady = $scale.ZeroValid
        $status = if ($rc -eq 0) { 'stable' } elseif ($rc -eq 107) { 'in_motion' } else { "error_$rc" }

        $scale.DeviceEnabled = $false
        $scale.ReleaseDevice()
        $scale.Close()

        JsonResult $true @{
            weight = $weight / 1000.0  # OPOS reports in WeightUnit increments
            unit = $unitStr
            status = $status
            stable = ($rc -eq 0)
            raw = $weight
            deviceName = $name
        }
    } catch {
        try { $scale.DeviceEnabled = $false } catch {}
        try { $scale.ReleaseDevice() } catch {}
        try { $scale.Close() } catch {}
        JsonResult $false $null "Scale error: $($_.Exception.Message)"
        exit 1
    } finally {
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($scale) | Out-Null
    }
}

# ── Scanner: one-shot test (open + claim + release) ─────────────────────────
if ($Action -eq 'scanner-test') {
    $scanner = Get-OposObject 'scanner'
    if (-not $scanner) { JsonResult $false $null 'OPOS Scanner COM object not available'; exit 1 }

    $name = Get-DeviceName 'Scanner' $DeviceName
    try {
        $rc = $scanner.Open($name)
        if ($rc -ne 0) { JsonResult $false $null "Open failed: rc=$rc (device name '$name' not registered in SetupPOS)"; exit 1 }

        $rc = $scanner.ClaimDevice(2000)
        if ($rc -ne 0) {
            $null = $scanner.Close()
            JsonResult $false $null "ClaimDevice failed: rc=$rc (likely held by another app -- e.g. Profit Track)"
            exit 1
        }

        $scanner.DeviceEnabled = $true
        $info = @{ deviceName = $name; claimed = $true; enabled = $true; state = $scanner.State }
        $scanner.DeviceEnabled = $false
        $null = $scanner.ReleaseDevice()
        $null = $scanner.Close()
        JsonResult $true $info
    } catch {
        try { $scanner.DeviceEnabled = $false } catch {}
        try { $scanner.ReleaseDevice() } catch {}
        try { $scanner.Close() } catch {}
        JsonResult $false $null "Scanner test error: $($_.Exception.Message)"
        exit 1
    } finally {
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($scanner) | Out-Null
    }
    exit 0
}

# ── Scanner: long-running listener (emits one JSON line per scan) ────────────
# Output protocol (one JSON object per line on stdout):
#   {"event":"opened","device":"Bologna-USB-HID"}
#   {"event":"scan","label":"9300617017831","raw":"9300617017831","type":102,"ts":"..."}
#   {"event":"claim_failed","rc":110,"message":"...","retry_in":3}
#   {"event":"warning","message":"..."}
#   {"event":"closed"}
# Behaviour: retries Claim every $RetrySeconds when held by another app. Exit only on fatal error or Ctrl+C.
if ($Action -eq 'scanner-listen') {
    # Datalogic's OPOS Scanner delivers data via the COM DataEvent. PowerShell's
    # Register-ObjectEvent cannot enumerate it (returns "event does not exist"),
    # because the CCO's outbound event interface isn't visible via PS late-binding.
    # C#'s runtime binder (Microsoft.CSharp dynamic) CAN bind to it via IDispatch.
    # We compile a thin C# host with Add-Type, instantiate it from PS, and let it
    # write JSON scan events directly to stdout.
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue

    Add-Type -ReferencedAssemblies Microsoft.CSharp, System.Core, System.Windows.Forms -TypeDefinition @'
using System;
using System.Threading;
using System.Text;

public class OposScanBridge {
    public dynamic Scanner;
    private bool _stop;
    private Action<int> _handler;

    private static string JsonEscape(string s) {
        if (s == null) return "";
        var sb = new StringBuilder();
        foreach (var c in s) {
            switch (c) {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\b': sb.Append("\\b"); break;
                case '\f': sb.Append("\\f"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < 32) sb.AppendFormat("\\u{0:X4}", (int)c);
                    else sb.Append(c);
                    break;
            }
        }
        return sb.ToString();
    }

    public static void Emit(string json) {
        Console.WriteLine(json);
        Console.Out.Flush();
    }

    public bool Setup(string device) {
        try {
            Type t = Type.GetTypeFromProgID("OPOS.Scanner");
            if (t == null) {
                Emit("{\"event\":\"fatal\",\"message\":\"OPOS.Scanner ProgID not registered\"}");
                return false;
            }
            Scanner = Activator.CreateInstance(t);

            int rc = (int)Scanner.Open(device);
            if (rc != 0) {
                Emit("{\"event\":\"open_failed\",\"rc\":" + rc + ",\"device\":\"" + JsonEscape(device) + "\"}");
                return false;
            }

            rc = (int)Scanner.ClaimDevice(1500);
            if (rc != 0) {
                Emit("{\"event\":\"claim_failed\",\"rc\":" + rc + ",\"device\":\"" + JsonEscape(device) + "\",\"retry_in\":3,\"hint\":\"Another app (e.g. Profit Track) holds the scanner\"}");
                try { Scanner.Close(); } catch {}
                return false;
            }

            // CRITICAL: subscribe to DataEvent BEFORE setting DeviceEnabled = true.
            // Per Datalogic's official C# sample (OPOSSamples/OPOSScannerSample),
            // the SO's connection point latches at DeviceEnabled flip; if no
            // sink is connected at that moment, events are buffered with no
            // listener and dropped, and the SO never re-checks for new sinks.
            _handler = new Action<int>(OnDataEvent);
            Scanner.DataEvent += _handler;

            // Enable AFTER subscription, in the order from the canonical sample.
            Scanner.DeviceEnabled = true;
            Scanner.DataEventEnabled = true;
            try { Scanner.DecodeData = true; } catch {}
            try { Scanner.AutoDisable = false; } catch {}

            Emit("{\"event\":\"opened\",\"device\":\"" + JsonEscape(device) + "\",\"via\":\"csharp_dynamic\"}");
            return true;
        } catch (Exception ex) {
            Emit("{\"event\":\"setup_error\",\"message\":\"" + JsonEscape(ex.Message) + "\",\"detail\":\"" + JsonEscape(ex.GetType().Name) + "\"}");
            return false;
        }
    }

    private void OnDataEvent(int status) {
        try {
            string label = "";
            int btype = 0;
            try { object v = Scanner.ScanDataLabel; if (v != null) label = v.ToString(); } catch {}
            try { object v = Scanner.ScanDataType;  if (v != null) btype = Convert.ToInt32(v); } catch {}
            Emit("{\"event\":\"scan\",\"label\":\"" + JsonEscape(label) + "\",\"type\":" + btype + ",\"ts\":\"" + DateTime.UtcNow.ToString("o") + "\"}");
            try { Scanner.DataEventEnabled = true; } catch {}
        } catch (Exception ex) {
            Emit("{\"event\":\"scan_error\",\"message\":\"" + JsonEscape(ex.Message) + "\"}");
        }
    }

    public void Stop() {
        _stop = true;
        try { if (Scanner != null) { Scanner.DataEvent -= _handler; } } catch {}
        try { if (Scanner != null) { Scanner.DeviceEnabled = false; Scanner.ReleaseDevice(); Scanner.Close(); } } catch {}
        Scanner = null;
    }

    public void PumpUntilStopped() {
        while (!_stop) {
            try { System.Windows.Forms.Application.DoEvents(); } catch {}
            Thread.Sleep(80);
        }
    }
}
'@

    function Emit($obj) { Write-Output (ConvertTo-Json $obj -Compress -Depth 5); [Console]::Out.Flush() }

    $name = Get-DeviceName 'Scanner' $DeviceName
    $bitness = if ([Environment]::Is64BitProcess) { '64' } else { '32' }
    Emit @{ event = 'starting'; device = $name; bitness = $bitness }

    # C# event-driven path. If Setup succeeds, the C# class hooks DataEvent
    # via dynamic and emits scans directly. We just pump messages here.
    while ($true) {
        $bridge = New-Object OposScanBridge
        if ($bridge.Setup($name)) {
            $bridge.PumpUntilStopped()   # blocks forever; only returns on stop
        }
        try { $bridge.Stop() } catch {}
        Emit @{ event = 'reconnecting'; retry_in = $RetrySeconds }
        Start-Sleep -Seconds $RetrySeconds
    }
    # The PS-only retry loop below is retained as dead-code fallback (skipped)
    return

    while ($true) {
        $scanner = Get-OposObject 'scanner'
        if (-not $scanner) {
            Emit @{ event = 'fatal'; message = 'OPOS Scanner CCO not available -- install Datalogic/Epson OPOS ADK or run with 32-bit PowerShell' }
            exit 1
        }

        try {
            $rc = $scanner.Open($name)
            if ($rc -ne 0) {
                Emit @{ event = 'open_failed'; rc = $rc; device = $name }
                [System.Runtime.InteropServices.Marshal]::ReleaseComObject($scanner) | Out-Null
                Start-Sleep -Seconds $RetrySeconds
                continue
            }

            $rc = $scanner.ClaimDevice(1500)
            if ($rc -ne 0) {
                Emit @{ event = 'claim_failed'; rc = $rc; device = $name; retry_in = $RetrySeconds; hint = 'Another app (e.g. Profit Track) holds the scanner' }
                $null = $scanner.Close()
                [System.Runtime.InteropServices.Marshal]::ReleaseComObject($scanner) | Out-Null
                Start-Sleep -Seconds $RetrySeconds
                continue
            }

            # Hardened init: explicit disable→enable cycle, flush stale buffer,
            # AutoDisable=false so scanner stays armed for continuous scanning,
            # DecodeData=true so the SO parses raw scans into ScanDataLabel.
            try { $scanner.DeviceEnabled = $false } catch {}
            try { $null = $scanner.ClearInput() } catch {}
            $scanner.DeviceEnabled = $true
            # AutoDisable=false: scanner stays armed for continuous scanning
            # (mcpos pattern). DecodeData=true: SO parses ScanData into ScanDataLabel.
            try { $scanner.AutoDisable = $false } catch {}
            try { $scanner.DecodeData = $true } catch {}
            $scanner.DataEventEnabled = $true

            # Emit one diagnostic snapshot so we can see the SO state right after init
            $diag = @{}
            try { $diag.deviceEnabled = [bool]$scanner.DeviceEnabled } catch {}
            try { $diag.dataEventEnabled = [bool]$scanner.DataEventEnabled } catch {}
            try { $diag.autoDisable = [bool]$scanner.AutoDisable } catch {}
            try { $diag.decodeData = [bool]$scanner.DecodeData } catch {}
            try { $diag.dataCount = [int]$scanner.DataCount } catch {}
            try { $diag.state = [int]$scanner.State } catch {}
            try { $diag.powerState = [int]$scanner.PowerState } catch {}
            try { $diag.capPowerReporting = [int]$scanner.CapPowerReporting } catch {}
            Emit @{ event = 'opened'; device = $name; props = $diag }

            # Event-driven data delivery via Register-ObjectEvent.
            # Per Datalogic's C# tutorial, scans arrive via the DataEvent COM
            # event, NOT via DataCount polling. The action block reads
            # ScanDataLabel and re-arms DataEventEnabled.
            $srcId = 'OposScan_' + [Guid]::NewGuid().ToString('N')
            # NOTE: variable named 'sink' (not 'action') to avoid collision with
            # the script's own $Action parameter (which has a [ValidateSet]
            # constraint that rejects scriptblocks)
            $sink = {
                $s = $Event.Sender
                $label = ''; $type = 0
                try { $label = [string]$s.ScanDataLabel } catch {}
                try { $type  = [int]$s.ScanDataType } catch {}
                $payload = @{ event = 'scan'; label = $label; type = $type; ts = (Get-Date).ToString('o') }
                Write-Output (ConvertTo-Json $payload -Compress)
                [Console]::Out.Flush()
                try { $s.DataEventEnabled = $true } catch {}
            }
            $eventOk = $false
            try {
                Register-ObjectEvent -InputObject $scanner -EventName 'DataEvent' -SourceIdentifier $srcId -Action $sink | Out-Null
                $eventOk = $true
                Emit @{ event = 'event_sink_registered'; sourceId = $srcId }
            } catch {
                Emit @{ event = 'event_sink_failed'; message = $_.Exception.Message }
            }

            # Idle loop. Pumps messages and emits heartbeats. Includes a
            # fallback DataCount poll in case the event sink couldn't register.
            $lastHeartbeat = Get-Date
            while ($true) {
                try { [System.Windows.Forms.Application]::DoEvents() } catch {}

                try {
                    $count = $scanner.DataCount
                } catch {
                    Emit @{ event = 'poll_error'; message = $_.Exception.Message }
                    break
                }

                if (-not $eventOk -and $count -gt 0) {
                    $label = ''
                    $type = 0
                    $errs = @()
                    $sdInfo = ''

                    # Try ScanDataLabel (parsed label string)
                    try {
                        $sdl = $scanner.ScanDataLabel
                        if ($null -ne $sdl) { $label = [string]$sdl }
                        $sdInfo += "sdl_type=$($sdl.GetType().Name);sdl_len=$($label.Length);"
                    } catch { $errs += "ScanDataLabel: $($_.Exception.Message)" }

                    # Fallback: ScanData (raw barcode -- may be byte[] or string)
                    if (-not $label) {
                        try {
                            $sd = $scanner.ScanData
                            if ($null -ne $sd) {
                                $sdInfo += "sd_type=$($sd.GetType().Name);"
                                if ($sd -is [byte[]]) {
                                    $label = [System.Text.Encoding]::ASCII.GetString($sd).TrimEnd([char]0)
                                    $sdInfo += "sd_bytes=$($sd.Length);"
                                } elseif ($sd -is [array]) {
                                    $bytes = [byte[]]($sd | ForEach-Object { [byte]$_ })
                                    $label = [System.Text.Encoding]::ASCII.GetString($bytes).TrimEnd([char]0)
                                    $sdInfo += "sd_arr=$($sd.Length);"
                                } else {
                                    $label = [string]$sd
                                    $sdInfo += "sd_str=$($label.Length);"
                                }
                            }
                        } catch { $errs += "ScanData: $($_.Exception.Message)" }
                    }

                    try { $type = [int]$scanner.ScanDataType } catch { $errs += "Type: $($_.Exception.Message)" }

                    # Consume + rearm. With AutoDisable=true, we also need to re-enable.
                    $clearOk = $false
                    try { $null = $scanner.ClearInput(); $clearOk = $true } catch { $errs += "ClearInput: $($_.Exception.Message)" }
                    try { $scanner.DeviceEnabled = $true } catch { $errs += "Re-enable: $($_.Exception.Message)" }
                    try { $scanner.DataEventEnabled = $true } catch { $errs += "Rearm: $($_.Exception.Message)" }

                    if ($label) {
                        Emit @{ event = 'scan'; label = $label; type = $type; ts = (Get-Date).ToString('o') }
                    } else {
                        # Loud diagnostic when SO has data but we can't extract a label
                        Emit @{ event = 'scan_empty'; dataCount = $count; sdInfo = $sdInfo; errs = $errs; clearOk = $clearOk }
                        # Throttle: if buffer won't clear, break out and re-claim from scratch
                        Start-Sleep -Milliseconds 500
                    }
                }

                # Heartbeat every ~5s -- proves the loop is alive and exposes
                # SO property values for diagnostics
                if (((Get-Date) - $lastHeartbeat).TotalSeconds -ge 5) {
                    $hb = @{}
                    try { $hb.dataCount = [int]$scanner.DataCount } catch {}
                    try { $hb.deviceEnabled = [bool]$scanner.DeviceEnabled } catch {}
                    try { $hb.dataEventEnabled = [bool]$scanner.DataEventEnabled } catch {}
                    try { $hb.state = [int]$scanner.State } catch {}
                    Emit @{ event = 'heartbeat'; props = $hb }
                    $lastHeartbeat = Get-Date
                }

                Start-Sleep -Milliseconds 80
            }
        } catch {
            Emit @{ event = 'error'; message = $_.Exception.Message }
        } finally {
            try { if ($srcId) { Unregister-Event -SourceIdentifier $srcId -ErrorAction SilentlyContinue } } catch {}
            try { $scanner.DeviceEnabled = $false } catch {}
            try { $null = $scanner.ReleaseDevice() } catch {}
            try { $null = $scanner.Close() } catch {}
            try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($scanner) | Out-Null } catch {}
        }

        Emit @{ event = 'reconnecting'; retry_in = $RetrySeconds }
        Start-Sleep -Seconds $RetrySeconds
    }
}

# ── Device Status ────────────────────────────────────────────────────────────
if ($Action -eq 'status') {
    $type = if ($DeviceType) { $DeviceType } else { 'printer' }
    $oposType = switch ($type) { 'printer' { 'POSPrinter' }; 'drawer' { 'CashDrawer' }; 'scale' { 'Scale' }; default { $type } }

    $obj = Get-OposObject $type
    if (-not $obj) { JsonResult $false $null "OPOS $type COM object not available"; exit 1 }

    $name = Get-DeviceName $oposType $DeviceName
    try {
        $rc = $obj.Open($name)
        if ($rc -ne 0) { JsonResult $false $null "Open failed: rc=$rc"; exit 1 }

        $rc = $obj.ClaimDevice(2000)
        if ($rc -ne 0) { $obj.Close(); JsonResult $false $null "ClaimDevice failed: rc=$rc"; exit 1 }

        $obj.DeviceEnabled = $true

        $info = @{
            deviceName = $name
            type = $type
            claimed = $true
            enabled = $true
            state = $obj.State  # 1=closed, 2=idle, 3=busy, 4=error
        }

        # Type-specific status
        if ($type -eq 'printer') {
            $info.coverOpen = $obj.CoverOpen
            $info.receiptEmpty = $obj.RecEmpty
            $info.receiptNearEnd = $obj.RecNearEnd
        } elseif ($type -eq 'drawer') {
            $info.drawerOpened = $obj.DrawerOpened
        }

        $obj.DeviceEnabled = $false
        $obj.ReleaseDevice()
        $obj.Close()

        JsonResult $true $info
    } catch {
        try { $obj.DeviceEnabled = $false } catch {}
        try { $obj.ReleaseDevice() } catch {}
        try { $obj.Close() } catch {}
        JsonResult $false $null "Status error: $($_.Exception.Message)"
        exit 1
    } finally {
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($obj) | Out-Null
    }
}
