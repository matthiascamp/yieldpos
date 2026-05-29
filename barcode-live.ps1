<#
barcode-live.ps1
================
Brand-new, self-contained live barcode viewer for Datalogic Magellan scanners
(3200VSi, 1500i, and similar OPOS profiles).
Run it in YOUR OWN terminal window (or double-click barcode-live.cmd). Every time you
scan an item, the barcode prints in this window THE INSTANT the scanner fires it --
it is driven by the OPOS DataEvent, not by polling, so there is no delay.

It does everything itself, with no dependency on any other file in this folder:
  1. Frees the scanner by stopping PTPOS / GUARDIAN (they hold the OPOS claim).
     Those run elevated, so the script self-elevates once (approve the UAC prompt).
  2. Re-launches itself in 32-bit STA PowerShell, because the Datalogic OPOS CCO is
     32-bit apartment-threaded COM.
  3. Opens + claims the OPOS scanner and prints each scan immediately.

Usage (from a normal PowerShell window in this folder):
  powershell -NoProfile -ExecutionPolicy Bypass -File .\barcode-live.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File .\barcode-live.ps1 -Plain     # barcode only
  powershell -NoProfile -ExecutionPolicy Bypass -File .\barcode-live.ps1 -Device MagellanSC
  powershell -NoProfile -ExecutionPolicy Bypass -File .\barcode-live.ps1 -Device Magellan1500i
  powershell -NoProfile -ExecutionPolicy Bypass -File .\barcode-live.ps1 -NoKill     # if PTPOS already closed

Stop with Ctrl+C.
#>

[CmdletBinding()]
param(
    [string]$Device = 'TableScanner',   # OPOS profile name; auto-fallback tries registered scanner profiles.
    [switch]$Plain,                      # print only the barcode (no timestamp / sequence / type)
    [switch]$Json,                       # emit one JSON event per line (for YieldPOS to consume on stdout)
    [switch]$NoKill,                     # skip stopping PTPOS/GUARDIAN (use if they are already closed)
    [int]$ClaimTimeoutMs = 1500,
    [int]$ParentPid = 0,                 # YieldPOS parent PID; if it dies, release OPOS and exit
    [switch]$NoRelaunch32Bit             # internal: set automatically after the 32-bit relaunch
)

$ErrorActionPreference = 'Stop'

# --- Step 1: free the scanner from PTPOS / GUARDIAN ------------------------------------
# These processes run elevated and hold the OPOS scanner claim exclusively, so we must
# stop them (with admin rights) before anything else can open the scanner.
function Free-Scanner {
    if ($NoKill) { return }
    $targets = @('PTPOS', 'GUARDIAN')
    $running = Get-Process -Name $targets -ErrorAction SilentlyContinue
    if (-not $running) { return }

    # Are we elevated? PTPOS runs as admin, so we need admin to stop it.
    $isAdmin = ([Security.Principal.WindowsPrincipal] `
        [Security.Principal.WindowsIdentity]::GetCurrent()
    ).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)

    if (-not $isAdmin) {
        Write-Host 'PTPOS/GUARDIAN run elevated -- requesting admin rights to stop them (approve the UAC prompt)...' -ForegroundColor Yellow
        $stopArgs = ($targets | ForEach-Object { "'$_'" }) -join ','
        $cmd = "Stop-Process -Name $stopArgs -Force -ErrorAction SilentlyContinue"
        Start-Process -FilePath 'powershell.exe' `
            -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $cmd) `
            -Verb RunAs -Wait
    } else {
        Stop-Process -Name $targets -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 400
}

# --- Step 2: relaunch in 32-bit STA PowerShell for the OPOS COM object -----------------
function Start-SelfIn32BitSta {
    if ($NoRelaunch32Bit) { return }
    if (-not $PSCommandPath) { throw 'Save this script to disk before running it.' }

    $is64Bit = [Environment]::Is64BitProcess
    $isSta = [Threading.Thread]::CurrentThread.GetApartmentState() -eq 'STA'
    if (-not $is64Bit -and $isSta) { return }   # already correct

    $ps32 = Join-Path $env:WINDIR 'SysWOW64\WindowsPowerShell\v1.0\powershell.exe'
    if (-not (Test-Path -LiteralPath $ps32)) { throw "Cannot find 32-bit PowerShell at $ps32" }

    Write-Host 'Switching to 32-bit STA PowerShell for the OPOS scanner...' -ForegroundColor DarkGray
    $relaunchArgs = @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Sta',
        '-File', $PSCommandPath,
        '-Device', $Device,
        '-ClaimTimeoutMs', $ClaimTimeoutMs,
        '-ParentPid', $ParentPid,
        '-NoKill',            # PTPOS already handled in the first pass
        '-NoRelaunch32Bit'
    )
    if ($Plain) { $relaunchArgs += '-Plain' }
    if ($Json)  { $relaunchArgs += '-Json' }
    & $ps32 @relaunchArgs
    exit $LASTEXITCODE
}

Free-Scanner
Start-SelfIn32BitSta

# --- Step 3: open the OPOS scanner and print each scan instantly ----------------------
Add-Type -ReferencedAssemblies @('System.Core', 'System.Windows.Forms', 'Microsoft.CSharp') -TypeDefinition @'
using Microsoft.Win32;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
using System.Threading;
using System.Windows.Forms;

public class BarcodeLive
{
    static dynamic scanner;
    static IConnectionPoint cp;
    static int cookie;
    static object sink;
    static volatile bool stop;
    static int seq;
    static bool plain;
    static bool json;
    static readonly object gate = new object();
    static readonly Guid ScannerEventsIid = new Guid("CCB90183-B81E-11D2-AB74-0040054C3719");

    // JSON helpers (used when -Json: YieldPOS reads these events on stdout)
    static void EmitJson(string s) { Console.WriteLine(s); Console.Out.Flush(); }

    static string JsonStr(string v)
    {
        if (v == null) return "\"\"";
        StringBuilder sb = new StringBuilder("\"");
        foreach (char c in v)
        {
            switch (c)
            {
                case '"':  sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\b': sb.Append("\\b");  break;
                case '\f': sb.Append("\\f");  break;
                case '\n': sb.Append("\\n");  break;
                case '\r': sb.Append("\\r");  break;
                case '\t': sb.Append("\\t");  break;
                default:
                    if (c < 32) sb.AppendFormat("\\u{0:X4}", (int)c);
                    else sb.Append(c);
                    break;
            }
        }
        sb.Append("\"");
        return sb.ToString();
    }

    static string JsonArray(string[] values)
    {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < values.Length; i++)
        {
            if (i > 0) sb.Append(",");
            sb.Append(JsonStr(values[i]));
        }
        sb.Append("]");
        return sb.ToString();
    }

    public static int Run(string device, int claimTimeoutMs, bool plainOut, bool jsonOut, int parentPid)
    {
        plain = plainOut;
        json = jsonOut;
        Console.CancelKeyPress += delegate(object s, ConsoleCancelEventArgs e) { e.Cancel = true; stop = true; };

        // Graceful shutdown signal: when our parent (YieldPOS) closes our stdin,
        // ReadLine() returns null -> we set stop and fall through to Cleanup(), which
        // releases the OPOS device. This avoids a hard kill that would skip cleanup
        // and leave the Datalogic scanner hung until a physical power-cycle.
        Thread stdinWatch = new Thread(delegate() {
            try { while (Console.In.ReadLine() != null) { } } catch {}
            stop = true;
        });
        stdinWatch.IsBackground = true;
        stdinWatch.Start();

        // If YieldPOS is killed or the updater closes it before stdin is flushed,
        // release the scanner anyway so PTPos can claim it again.
        if (parentPid > 0)
        {
            Thread parentWatch = new Thread(delegate() {
                while (!stop)
                {
                    try
                    {
                        Process p = Process.GetProcessById(parentPid);
                        if (p.HasExited) { stop = true; break; }
                    }
                    catch { stop = true; break; }
                    Thread.Sleep(500);
                }
            });
            parentWatch.IsBackground = true;
            parentWatch.Start();
        }

        try
        {
            string factory;
            Type t = GetScannerType(out factory);
            if (t == null)
            {
                if (json) EmitJson("{\"event\":\"fatal\",\"message\":\"OPOS Scanner COM object is not registered for this process bitness\"}");
                else Console.Error.WriteLine("ERROR: OPOS Scanner COM object is not registered for this process bitness.");
                return 2;
            }

            int openResult = OpenAndClaimAny(t, ref device, claimTimeoutMs);
            if (openResult != 0) return openResult;

            try { scanner.DataEventEnabled = false; } catch {}
            try { scanner.DeviceEnabled = false; } catch {}
            try { scanner.ClearInput(); } catch {}
            try { scanner.ClearInputProperties(); } catch {}
            try { scanner.AutoDisable = false; } catch {}
            try { scanner.DecodeData = true; } catch {}

            AttachSink();

            scanner.DeviceEnabled = true;
            try { scanner.AutoDisable = false; } catch {}
            try { scanner.DecodeData = true; } catch {}
            scanner.DataEventEnabled = true;

            if (json)
            {
                EmitJson("{\"event\":\"opened\",\"device\":" + JsonStr(device) + ",\"via\":\"barcode-live\"}");
            }
            else
            {
                Console.WriteLine();
                Console.WriteLine("=== LIVE BARCODE FEED ===  (profile: " + device + ")");
                Console.WriteLine("Scan an item -- it appears here instantly.  Ctrl+C to stop.");
                Console.WriteLine();
            }

            // Pump COM messages so DataEvents fire the moment a scan arrives.
            while (!stop)
            {
                try { Application.DoEvents(); } catch {}
                Thread.Sleep(15);
            }

            if (!json)
            {
                Console.WriteLine();
                Console.WriteLine("Stopped.");
            }
            return 0;
        }
        catch (Exception ex)
        {
            if (json) EmitJson("{\"event\":\"error\",\"message\":" + JsonStr(ex.GetType().Name + ": " + ex.Message) + "}");
            else Console.Error.WriteLine("ERROR: " + ex.GetType().Name + ": " + ex.Message);
            return 1;
        }
        finally { Cleanup(); }
    }

    static int OpenAndClaimAny(Type scannerType, ref string device, int claimTimeoutMs)
    {
        string[] candidates = GetCandidateDeviceNames(device);
        if (json)
        {
            EmitJson("{\"event\":\"starting\",\"device\":" + JsonStr(device) + ",\"candidates\":" + JsonArray(candidates) + ",\"bitness\":" + JsonStr((IntPtr.Size * 8).ToString()) + "}");
        }
        else if (candidates.Length > 1)
        {
            Console.Error.WriteLine("Trying OPOS scanner profiles: " + string.Join(", ", candidates));
        }

        string lastDevice = device;
        int lastOpenRc = 0;
        int lastClaimRc = 0;
        bool sawOpen = false;

        foreach (string candidate in candidates)
        {
            lastDevice = candidate;
            scanner = Activator.CreateInstance(scannerType);

            int rc = (int)scanner.Open(candidate);
            if (rc != 0)
            {
                lastOpenRc = rc;
                if (!json) Console.Error.WriteLine("Open('" + candidate + "') failed rc=" + rc);
                Cleanup();
                continue;
            }

            sawOpen = true;
            rc = (int)scanner.ClaimDevice(claimTimeoutMs);
            if (rc == 0)
            {
                device = candidate;
                return 0;
            }

            lastClaimRc = rc;
            if (!json) Console.Error.WriteLine("ClaimDevice('" + candidate + "') failed rc=" + rc + " (" + OposCode(rc) + ")");
            Cleanup();

            if (IsBusyClaimRc(rc))
            {
                if (json)
                {
                    EmitJson("{\"event\":\"claim_failed\",\"rc\":" + rc + ",\"device\":" + JsonStr(candidate) +
                             ",\"retry_in\":3,\"hint\":" + JsonStr(OposCode(rc) + " - another app (PTPOS) holds it, or the scanner needs a power-cycle") + "}");
                }
                else
                {
                    Console.Error.WriteLine("ERROR: ClaimDevice failed rc=" + rc + " (" + OposCode(rc) + ")");
                    if (rc == 102) Console.Error.WriteLine("  -> another program already has the scanner claimed (close PTPOS / YieldPOS).");
                    else if (rc == 112) Console.Error.WriteLine("  -> claim timed out: scanner busy or not responding. Power-cycle and retry.");
                }
                return 4;
            }
        }

        if (sawOpen)
        {
            if (json)
            {
                EmitJson("{\"event\":\"claim_failed\",\"rc\":" + lastClaimRc + ",\"device\":" + JsonStr(lastDevice) +
                         ",\"retry_in\":3,\"hint\":" + JsonStr(OposCode(lastClaimRc) + " - tried OPOS scanner profiles: " + string.Join(", ", candidates)) + "}");
            }
            else
            {
                Console.Error.WriteLine("ERROR: ClaimDevice failed for every candidate. Last rc=" + lastClaimRc + " (" + OposCode(lastClaimRc) + ")");
                PrintProfiles();
            }
            return 4;
        }

        if (json) EmitJson("{\"event\":\"open_failed\",\"rc\":" + lastOpenRc + ",\"device\":" + JsonStr(lastDevice) + ",\"candidates\":" + JsonArray(candidates) + "}");
        else { Console.Error.WriteLine("ERROR: no OPOS scanner profile opened. Last Open('" + lastDevice + "') rc=" + lastOpenRc); PrintProfiles(); }
        return 3;
    }

    static void AttachSink()
    {
        IConnectionPointContainer cpc = (IConnectionPointContainer)scanner;
        Guid iid = ScannerEventsIid;
        cpc.FindConnectionPoint(ref iid, out cp);
        sink = new BarcodeEventSink();
        cp.Advise(sink, out cookie);
    }

    public static void OnDataEvent(int status)
    {
        lock (gate)
        {
            try
            {
                string label = "";
                int type = 0;
                try { label = ValueToText(scanner.ScanDataLabel); } catch {}
                if (label.Length == 0) { try { label = ValueToText(scanner.ScanData); } catch {} }
                try { type = (int)scanner.ScanDataType; } catch {}

                seq++;
                if (json)
                    EmitJson("{\"event\":\"scan\",\"label\":" + JsonStr(label) + ",\"raw\":" + JsonStr(label) + ",\"type\":" + type + ",\"seq\":" + seq + "}");
                else if (plain)
                    Console.WriteLine(label);
                else
                    Console.WriteLine(DateTime.Now.ToString("HH:mm:ss.fff") + "   #" + seq + "   " + label + "   (type " + type + ")");
                Console.Out.Flush();
            }
            finally
            {
                try { scanner.ClearInputProperties(); } catch {}
                try { scanner.DataEventEnabled = true; } catch {}
                try { if (!(bool)scanner.DeviceEnabled) scanner.DeviceEnabled = true; } catch { try { scanner.DeviceEnabled = true; } catch {} }
            }
        }
    }

    static string OposCode(int rc)
    {
        switch (rc)
        {
            case 101: return "OPOS_E_CLOSED";
            case 102: return "OPOS_E_CLAIMED";
            case 103: return "OPOS_E_NOTCLAIMED";
            case 104: return "OPOS_E_NOSERVICE";
            case 105: return "OPOS_E_DISABLED";
            case 106: return "OPOS_E_ILLEGAL";
            case 107: return "OPOS_E_NOHARDWARE";
            case 108: return "OPOS_E_OFFLINE";
            case 109: return "OPOS_E_NOEXIST";
            case 110: return "OPOS_E_EXISTS";
            case 111: return "OPOS_E_FAILURE";
            case 112: return "OPOS_E_TIMEOUT";
            case 113: return "OPOS_E_BUSY";
            default:  return "rc " + rc;
        }
    }

    static bool IsBusyClaimRc(int rc)
    {
        return rc == 102 || rc == 112 || rc == 113;
    }

    static Type GetScannerType(out string factory)
    {
        string[] progIds = { "OPOS.Scanner", "OPOSScanner.OPOSScanner", "OPOSScanner_CCO.OPOSScanner.1" };
        foreach (string p in progIds)
        {
            try { Type t = Type.GetTypeFromProgID(p); if (t != null) { factory = p; return t; } } catch {}
        }
        try
        {
            Type t = Type.GetTypeFromCLSID(new Guid("CCB901B0-B81E-11D2-AB74-0040054C3719"));
            if (t != null) { factory = "CLSID"; return t; }
        }
        catch {}
        factory = "";
        return null;
    }

    static string[] GetCandidateDeviceNames(string requested)
    {
        List<string> result = new List<string>();
        HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        List<string> registered = GetRegisteredScannerNames();
        string[] preferred = {
            "TableScanner",
            "Magellan1500i",
            "Magellan1500iScanner",
            "Magellan1500i-USB",
            "Magellan1500i-USB-OEM",
            "MGL1500i",
            "MGL1500iScanner",
            "MagellanSC",
            "USBScanner",
            "Bologna-USB-HID",
            "USBHHScanner",
            "HandScanner",
            "Unit1",
            "Scanner1"
        };

        AddDeviceName(result, seen, requested);
        foreach (string preferredName in preferred)
        {
            if (registered.Count == 0) AddDeviceName(result, seen, preferredName);
            else AddMatchingRegisteredNames(result, seen, registered, preferredName);
        }
        foreach (string registeredName in registered) AddDeviceName(result, seen, registeredName);

        if (result.Count == 0) result.Add("TableScanner");
        return result.ToArray();
    }

    static List<string> GetRegisteredScannerNames()
    {
        string[] paths = { @"SOFTWARE\OLEforRetail\ServiceOPOS\Scanner", @"SOFTWARE\WOW6432Node\OLEforRetail\ServiceOPOS\Scanner" };
        List<string> names = new List<string>();
        HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (string path in paths)
        {
            try
            {
                using (RegistryKey k = Registry.LocalMachine.OpenSubKey(path))
                {
                    if (k == null) continue;
                    foreach (string n in k.GetSubKeyNames()) if (seen.Add(n)) names.Add(n);
                }
            }
            catch {}
        }
        return names;
    }

    static void AddMatchingRegisteredNames(List<string> result, HashSet<string> seen, List<string> registered, string preferred)
    {
        foreach (string name in registered)
        {
            if (ProfileNamesMatch(name, preferred)) AddDeviceName(result, seen, name);
        }
    }

    static void AddDeviceName(List<string> names, HashSet<string> seen, string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return;
        name = name.Trim();
        if (seen.Add(name)) names.Add(name);
    }

    static bool ProfileNamesMatch(string registered, string preferred)
    {
        if (string.Equals(registered, preferred, StringComparison.OrdinalIgnoreCase)) return true;
        string a = NormalizeProfileName(registered);
        string b = NormalizeProfileName(preferred);
        return a.Length > 0 && b.Length > 0 && (a.IndexOf(b, StringComparison.OrdinalIgnoreCase) >= 0 || b.IndexOf(a, StringComparison.OrdinalIgnoreCase) >= 0);
    }

    static string NormalizeProfileName(string name)
    {
        if (name == null) return "";
        StringBuilder sb = new StringBuilder();
        foreach (char c in name)
        {
            if (char.IsLetterOrDigit(c)) sb.Append(char.ToLowerInvariant(c));
        }
        return sb.ToString();
    }

    static void PrintProfiles()
    {
        string[] paths = { @"SOFTWARE\OLEforRetail\ServiceOPOS\Scanner", @"SOFTWARE\WOW6432Node\OLEforRetail\ServiceOPOS\Scanner" };
        List<string> names = new List<string>();
        foreach (string path in paths)
        {
            try { using (RegistryKey k = Registry.LocalMachine.OpenSubKey(path)) { if (k != null) foreach (string n in k.GetSubKeyNames()) if (!names.Contains(n)) names.Add(n); } } catch {}
        }
        if (names.Count > 0) { Console.Error.WriteLine("Registered OPOS Scanner profiles:"); foreach (string n in names) Console.Error.WriteLine("  " + n); }
    }

    static string ValueToText(object value)
    {
        if (value == null) return "";
        string s = value as string; if (s != null) return Clean(s);
        byte[] bytes = value as byte[]; if (bytes != null) return BytesToText(bytes);
        Array arr = value as Array;
        if (arr != null)
        {
            byte[] ab = new byte[arr.Length]; bool byteLike = true;
            for (int i = 0; i < arr.Length; i++) { try { ab[i] = Convert.ToByte(arr.GetValue(i)); } catch { byteLike = false; break; } }
            if (byteLike) return BytesToText(ab);
            StringBuilder sb = new StringBuilder(); foreach (object o in arr) if (o != null) sb.Append(Convert.ToString(o));
            return Clean(sb.ToString());
        }
        return Clean(Convert.ToString(value));
    }

    static string BytesToText(byte[] b)
    {
        int len = b.Length;
        while (len > 0 && (b[len-1] == 0 || b[len-1] == 13 || b[len-1] == 10)) len--;
        if (len <= 0) return "";
        return Clean(Encoding.ASCII.GetString(b, 0, len));
    }

    static string Clean(string t) { return t == null ? "" : t.TrimEnd('\0','\r','\n').Trim(); }

    static void Cleanup()
    {
        if (scanner == null) return;
        if (cp != null && cookie != 0) { try { cp.Unadvise(cookie); } catch {} }
        cookie = 0; sink = null;
        if (cp != null) { try { if (Marshal.IsComObject(cp)) Marshal.ReleaseComObject(cp); } catch {} }
        cp = null;
        try { scanner.DataEventEnabled = false; } catch {}
        try { scanner.DeviceEnabled = false; } catch {}
        try { scanner.ReleaseDevice(); } catch {}
        try { scanner.Close(); } catch {}
        try { if (Marshal.IsComObject((object)scanner)) Marshal.ReleaseComObject((object)scanner); } catch {}
        scanner = null;
    }
}

[ComVisible(true)]
[Guid("CCB90183-B81E-11D2-AB74-0040054C3719")]
[InterfaceType(ComInterfaceType.InterfaceIsIDispatch)]
public interface IScannerEvents
{
    [DispId(1)] void DataEvent(int status);
    [DispId(2)] void DirectIOEvent(int eventNumber, ref int pData, ref string pString);
    [DispId(3)] void ErrorEvent(int resultCode, int resultCodeExtended, int errorLocus, ref int pErrorResponse);
    [DispId(5)] void StatusUpdateEvent(int data);
}

[ComVisible(true)]
[ClassInterface(ClassInterfaceType.None)]
public class BarcodeEventSink : IScannerEvents
{
    public void DataEvent(int status) { BarcodeLive.OnDataEvent(status); }
    public void DirectIOEvent(int eventNumber, ref int pData, ref string pString) { }
    public void ErrorEvent(int resultCode, int resultCodeExtended, int errorLocus, ref int pErrorResponse) { }
    public void StatusUpdateEvent(int data) { }
}
'@

exit ([BarcodeLive]::Run($Device, $ClaimTimeoutMs, [bool]$Plain, [bool]$Json, $ParentPid))
