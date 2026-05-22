<# 
Standalone OPOS scanner terminal test for the Datalogic Magellan 3200VSi.

This script is deliberately separate from YieldPOS. It opens the OPOS
TableScanner profile, claims the scanner, enables it, then prints each barcode
directly to this terminal as soon as the OPOS DataEvent arrives.

Usage:
  powershell -NoProfile -ExecutionPolicy Bypass -File .\test-table-scanner.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File .\test-table-scanner.ps1 -Device TableScanner

Stop with Ctrl+C.
#>

[CmdletBinding()]
param(
    [string]$Device = 'TableScanner',
    [int]$ClaimTimeoutMs = 1500,
    [int]$HeartbeatSeconds = 10,
    [switch]$Plain,
    [switch]$NoRelaunch32Bit
)

$ErrorActionPreference = 'Stop'

function Start-SelfIn32BitSta {
    if ($NoRelaunch32Bit) { return }
    if (-not $PSCommandPath) { throw 'Save this script to disk before running it.' }

    $is64Bit = [Environment]::Is64BitProcess
    $isSta = [Threading.Thread]::CurrentThread.GetApartmentState() -eq 'STA'
    if (-not $is64Bit -and $isSta) { return }

    $ps32 = Join-Path $env:WINDIR 'SysWOW64\WindowsPowerShell\v1.0\powershell.exe'
    if (-not (Test-Path -LiteralPath $ps32)) {
        throw "Cannot find 32-bit Windows PowerShell at $ps32"
    }

    Write-Host "Restarting in 32-bit STA PowerShell for OPOS..." -ForegroundColor Yellow
    $args = @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Sta',
        '-File', $PSCommandPath,
        '-Device', $Device,
        '-ClaimTimeoutMs', $ClaimTimeoutMs,
        '-HeartbeatSeconds', $HeartbeatSeconds,
        '-NoRelaunch32Bit'
    )
    if ($Plain) { $args += '-Plain' }
    & $ps32 @args
    exit $LASTEXITCODE
}

Start-SelfIn32BitSta

Add-Type -ReferencedAssemblies @('System.Core', 'System.Windows.Forms', 'Microsoft.CSharp') -TypeDefinition @'
using Microsoft.Win32;
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
using System.Threading;
using System.Windows.Forms;

public class TableScannerTerminalTest
{
    static dynamic scanner;
    static IConnectionPoint dataEventConnectionPoint;
    static int dataEventCookie;
    static object dataEventSink;
    static volatile bool stop;
    static int scanSeq;
    static bool plainOutput;
    static readonly object scanLock = new object();
    static readonly Guid ScannerEventsIid = new Guid("CCB90183-B81E-11D2-AB74-0040054C3719");

    public static int Run(string device, int claimTimeoutMs, int heartbeatSeconds, bool plain)
    {
        plainOutput = plain;
        if (heartbeatSeconds < 1) heartbeatSeconds = 10;

        Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs e) {
            e.Cancel = true;
            stop = true;
        };

        Console.WriteLine("OPOS TableScanner terminal test");
        Console.WriteLine("Device: " + device);
        Console.WriteLine("Process: " + (IntPtr.Size == 4 ? "32-bit" : "64-bit") + ", apartment=" + Thread.CurrentThread.GetApartmentState());
        Console.WriteLine("Close YieldPOS/Profit Track first if ClaimDevice fails.");
        Console.WriteLine();

        try
        {
            string factory;
            Type t = GetScannerType(out factory);
            if (t == null)
            {
                Console.Error.WriteLine("ERROR: OPOS Scanner COM object is not registered in this process bitness.");
                Console.Error.WriteLine("Install/register the Datalogic OPOS common control and service object, then retry.");
                return 2;
            }

            scanner = Activator.CreateInstance(t);

            int rc = (int)scanner.Open(device);
            if (rc != 0)
            {
                Console.Error.WriteLine("ERROR: Open('" + device + "') failed rc=" + rc);
                PrintRegisteredProfiles();
                return 3;
            }

            rc = (int)scanner.ClaimDevice(claimTimeoutMs);
            if (rc != 0)
            {
                Console.Error.WriteLine("ERROR: ClaimDevice(" + claimTimeoutMs + ") failed rc=" + rc);
                Console.Error.WriteLine("Another program probably has the scanner claimed.");
                return 4;
            }

            try { scanner.DataEventEnabled = false; } catch {}
            try { scanner.DeviceEnabled = false; } catch {}
            try { scanner.ClearInput(); } catch {}
            try { scanner.ClearInputProperties(); } catch {}
            try { scanner.AutoDisable = false; } catch {}
            try { scanner.DecodeData = true; } catch {}

            AttachDataEventSink();

            scanner.DeviceEnabled = true;
            try { scanner.AutoDisable = false; } catch {}
            try { scanner.DecodeData = true; } catch {}
            scanner.DataEventEnabled = true;

            Console.WriteLine("READY: scan a barcode. Scan values print below.");
            Console.WriteLine("Mode: OPOS DataEvent, factory=" + factory);
            if (plainOutput) Console.WriteLine("Plain output is ON: barcode only.");
            Console.WriteLine();

            DateTime lastHeartbeat = DateTime.UtcNow;
            while (!stop)
            {
                try { Application.DoEvents(); } catch {}

                if (!plainOutput && (DateTime.UtcNow - lastHeartbeat).TotalSeconds >= heartbeatSeconds)
                {
                    PrintHeartbeat();
                    lastHeartbeat = DateTime.UtcNow;
                }

                Thread.Sleep(20);
            }

            Console.WriteLine();
            Console.WriteLine("Stopped.");
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("ERROR: " + ex.GetType().Name + ": " + ex.Message);
            return 1;
        }
        finally
        {
            Cleanup();
        }
    }

    static void AttachDataEventSink()
    {
        try
        {
            IConnectionPointContainer cpc = (IConnectionPointContainer)scanner;
            Guid iid = ScannerEventsIid;
            cpc.FindConnectionPoint(ref iid, out dataEventConnectionPoint);
            dataEventSink = new TableScannerEventSink();
            dataEventConnectionPoint.Advise(dataEventSink, out dataEventCookie);
        }
        catch (Exception ex)
        {
            throw new Exception("Could not attach OPOS DataEvent sink: " + ex.Message, ex);
        }
    }

    public static void OnDataEvent(int status)
    {
        lock (scanLock)
        {
            try
            {
                string label = "";
                string raw = "";
                int type = 0;

                try { label = ValueToText(scanner.ScanDataLabel); } catch {}
                try { raw = ValueToText(scanner.ScanData); } catch {}
                try { type = (int)scanner.ScanDataType; } catch {}
                if (label.Length == 0) label = raw;

                scanSeq++;
                if (label.Length > 0)
                {
                    if (plainOutput)
                    {
                        Console.WriteLine(label);
                    }
                    else
                    {
                        Console.WriteLine(DateTime.Now.ToString("HH:mm:ss.fff") + "\t#" + scanSeq + "\t" + label + "\ttype=" + type + "\tstatus=" + status);
                    }
                }
                else
                {
                    int dc = 0;
                    try { dc = (int)scanner.DataCount; } catch {}
                    Console.WriteLine(DateTime.Now.ToString("HH:mm:ss.fff") + "\t#" + scanSeq + "\t[EMPTY]\tdataCount=" + dc + "\tstatus=" + status);
                }
                Console.Out.Flush();
            }
            finally
            {
                try { scanner.ClearInputProperties(); } catch {}
                try { scanner.DataEventEnabled = true; } catch {}
                try
                {
                    bool enabled = (bool)scanner.DeviceEnabled;
                    if (!enabled) scanner.DeviceEnabled = true;
                }
                catch
                {
                    try { scanner.DeviceEnabled = true; } catch {}
                }
            }
        }
    }

    static void PrintHeartbeat()
    {
        int dc = 0;
        bool de = false;
        bool dee = false;
        int state = 0;
        try { dc = (int)scanner.DataCount; } catch {}
        try { de = (bool)scanner.DeviceEnabled; } catch {}
        try { dee = (bool)scanner.DataEventEnabled; } catch {}
        try { state = (int)scanner.State; } catch {}
        Console.WriteLine(DateTime.Now.ToString("HH:mm:ss") + "\theartbeat\tdataCount=" + dc + "\tdeviceEnabled=" + de + "\tdataEventEnabled=" + dee + "\tstate=" + state);
    }

    static Type GetScannerType(out string factory)
    {
        string[] progIds = {
            "OPOS.Scanner",
            "OPOSScanner.OPOSScanner",
            "OPOSScanner_CCO.OPOSScanner.1"
        };

        foreach (string progId in progIds)
        {
            try
            {
                Type t = Type.GetTypeFromProgID(progId);
                if (t == null) continue;
                factory = progId;
                return t;
            }
            catch {}
        }

        try
        {
            string clsid = "CCB901B0-B81E-11D2-AB74-0040054C3719";
            Type t = Type.GetTypeFromCLSID(new Guid(clsid));
            if (t != null)
            {
                factory = "CLSID:{" + clsid + "}";
                return t;
            }
        }
        catch {}

        factory = "";
        return null;
    }

    static void PrintRegisteredProfiles()
    {
        List<string> names = new List<string>();
        string[] paths = {
            @"SOFTWARE\OLEforRetail\ServiceOPOS\Scanner",
            @"SOFTWARE\WOW6432Node\OLEforRetail\ServiceOPOS\Scanner"
        };

        foreach (string path in paths)
        {
            try
            {
                using (RegistryKey key = Registry.LocalMachine.OpenSubKey(path))
                {
                    if (key == null) continue;
                    foreach (string name in key.GetSubKeyNames())
                    {
                        if (!names.Contains(name)) names.Add(name);
                    }
                }
            }
            catch {}
        }

        if (names.Count == 0)
        {
            Console.Error.WriteLine("No OPOS Scanner profiles found in the registry.");
            return;
        }

        Console.Error.WriteLine("Registered OPOS Scanner profiles:");
        foreach (string name in names) Console.Error.WriteLine("  " + name);
    }

    static string ValueToText(object value)
    {
        if (value == null) return "";

        string s = value as string;
        if (s != null) return CleanText(s);

        byte[] bytes = value as byte[];
        if (bytes != null) return BytesToText(bytes);

        Array arr = value as Array;
        if (arr != null)
        {
            byte[] arrayBytes = new byte[arr.Length];
            bool byteLike = true;

            for (int i = 0; i < arr.Length; i++)
            {
                try { arrayBytes[i] = Convert.ToByte(arr.GetValue(i)); }
                catch { byteLike = false; break; }
            }

            if (byteLike) return BytesToText(arrayBytes);

            StringBuilder joined = new StringBuilder();
            foreach (object item in arr)
            {
                if (item != null) joined.Append(Convert.ToString(item));
            }
            return CleanText(joined.ToString());
        }

        return CleanText(Convert.ToString(value));
    }

    static string BytesToText(byte[] bytes)
    {
        int len = bytes.Length;
        while (len > 0 && (bytes[len - 1] == 0 || bytes[len - 1] == 13 || bytes[len - 1] == 10)) len--;
        if (len <= 0) return "";
        return CleanText(Encoding.ASCII.GetString(bytes, 0, len));
    }

    static string CleanText(string text)
    {
        if (text == null) return "";
        return text.TrimEnd('\0', '\r', '\n').Trim();
    }

    static void Cleanup()
    {
        if (scanner == null) return;

        if (dataEventConnectionPoint != null && dataEventCookie != 0)
        {
            try { dataEventConnectionPoint.Unadvise(dataEventCookie); } catch {}
        }
        dataEventCookie = 0;
        dataEventSink = null;

        if (dataEventConnectionPoint != null)
        {
            try
            {
                if (Marshal.IsComObject(dataEventConnectionPoint)) Marshal.ReleaseComObject(dataEventConnectionPoint);
            }
            catch {}
        }
        dataEventConnectionPoint = null;

        try { scanner.DataEventEnabled = false; } catch {}
        try { scanner.DeviceEnabled = false; } catch {}
        try { scanner.ReleaseDevice(); } catch {}
        try { scanner.Close(); } catch {}

        try
        {
            object comObject = scanner;
            if (comObject != null && Marshal.IsComObject(comObject)) Marshal.ReleaseComObject(comObject);
        }
        catch {}
        scanner = null;
    }
}

[ComVisible(true)]
[Guid("CCB90183-B81E-11D2-AB74-0040054C3719")]
[InterfaceType(ComInterfaceType.InterfaceIsIDispatch)]
public interface ITableScannerEvents
{
    [DispId(1)]
    void DataEvent(int status);

    [DispId(2)]
    void DirectIOEvent(int eventNumber, ref int pData, ref string pString);

    [DispId(3)]
    void ErrorEvent(int resultCode, int resultCodeExtended, int errorLocus, ref int pErrorResponse);

    [DispId(5)]
    void StatusUpdateEvent(int data);
}

[ComVisible(true)]
[ClassInterface(ClassInterfaceType.None)]
public class TableScannerEventSink : ITableScannerEvents
{
    public void DataEvent(int status)
    {
        TableScannerTerminalTest.OnDataEvent(status);
    }

    public void DirectIOEvent(int eventNumber, ref int pData, ref string pString)
    {
    }

    public void ErrorEvent(int resultCode, int resultCodeExtended, int errorLocus, ref int pErrorResponse)
    {
    }

    public void StatusUpdateEvent(int data)
    {
    }
}
'@

$exitCode = [TableScannerTerminalTest]::Run($Device, $ClaimTimeoutMs, $HeartbeatSeconds, [bool]$Plain)
exit $exitCode
