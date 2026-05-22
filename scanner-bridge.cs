// scanner-bridge - long-running OPOS Scanner reader for YieldPOS.
//
// Built as a standalone 32-bit STA console exe because many OPOS scanner CCOs
// are 32-bit apartment-threaded COM objects. The bridge stays off the Electron
// main thread and emits one JSON object per line on stdout.
//
// Build:
//   C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe /nologo /platform:x86 ^
//     /target:exe /reference:System.Core.dll /reference:System.Windows.Forms.dll ^
//     /reference:Microsoft.CSharp.dll /out:scanner-bridge.exe scanner-bridge.cs
//
// Run:
//   scanner-bridge.exe [profileName] [retrySeconds]
//
// stdout protocol:
//   {"event":"starting","device":"TableScanner","bitness":"32"}
//   {"event":"opened","device":"TableScanner","mode":"data_event"}
//   {"event":"scan","label":"781005416071","raw":"781005416071","type":0,"ts":"2026-05-15T08:30:35Z"}
//   {"event":"claim_failed","rc":111,"device":"TableScanner","retry_in":3,"hint":"..."}
//   {"event":"heartbeat","dataCount":0,"deviceEnabled":true,"dataEventEnabled":true,"events":4}
//   {"event":"reconnecting","retry_in":3}

using Microsoft.Win32;
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices.ComTypes;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public class ScannerBridge
{
    static dynamic scanner;
    static string requestedDevice;
    static string activeDevice;
    static string scannerFactory;
    static volatile bool stop;
    static IConnectionPoint dataEventConnectionPoint;
    static int dataEventCookie;
    static object dataEventSink;
    static bool eventMode;
    static string eventHookMessage = "";
    static readonly object scanLock = new object();
    static int dataEventsSeen;
    static int scansEmitted;
    static DateTime lastPollWaitingEmit = DateTime.MinValue;

    // From the Datalogic OPOSScanner type library:
    // _IOPOSScannerEvents = ccb90183-b81e-11d2-ab74-0040054c3719
    // DataEvent DISPID = 1
    static readonly Guid ScannerEventsIid = new Guid("CCB90183-B81E-11D2-AB74-0040054C3719");

    [STAThread]
    static void Main(string[] args)
    {
        requestedDevice = args.Length > 0 ? args[0] : "TableScanner";
        int retrySeconds = 3;
        if (args.Length > 1) int.TryParse(args[1], out retrySeconds);
        if (retrySeconds < 1) retrySeconds = 3;

        Console.CancelKeyPress += (s, e) => { e.Cancel = true; stop = true; };

        Emit("{\"event\":\"starting\",\"device\":\"" + JsonEscape(requestedDevice) + "\",\"bitness\":\"" + (IntPtr.Size == 4 ? "32" : "64") + "\",\"apartment\":\"" + Thread.CurrentThread.GetApartmentState() + "\"}");

        while (!stop)
        {
            int lastOpenRc = 0;
            string lastOpenDevice = requestedDevice;
            string lastOpenError = "";

            try
            {
                string[] candidates = GetCandidateDeviceNames(requestedDevice);
                bool ccoAvailable = false;

                foreach (string candidate in candidates)
                {
                    scanner = CreateScannerObject(out scannerFactory);
                    if (scanner == null) break;
                    ccoAvailable = true;

                    int rc = 0;
                    try
                    {
                        rc = (int)scanner.Open(candidate);
                    }
                    catch (Exception openEx)
                    {
                        lastOpenDevice = candidate;
                        lastOpenError = openEx.Message;
                        CleanupScanner(false);
                        continue;
                    }

                    if (rc == 0)
                    {
                        activeDevice = candidate;
                        break;
                    }

                    lastOpenRc = rc;
                    lastOpenDevice = candidate;
                    lastOpenError = "";
                    CleanupScanner(false);
                }

                if (scanner == null)
                {
                    if (!ccoAvailable)
                    {
                        Emit("{\"event\":\"fatal\",\"message\":\"OPOS Scanner COM object not registered\"}");
                        return;
                    }

                    Emit("{\"event\":\"open_failed\",\"rc\":" + lastOpenRc + ",\"device\":\"" + JsonEscape(lastOpenDevice) + "\",\"message\":\"" + JsonEscape(lastOpenError) + "\"}");
                    Sleep(retrySeconds * 1000);
                    continue;
                }

                int claimRc = (int)scanner.ClaimDevice(1500);
                if (claimRc != 0)
                {
                    Emit("{\"event\":\"claim_failed\",\"rc\":" + claimRc + ",\"device\":\"" + JsonEscape(activeDevice) + "\",\"retry_in\":" + retrySeconds + ",\"hint\":\"Another app (e.g. Profit Track) holds the scanner\"}");
                    CleanupScanner(false);
                    Sleep(retrySeconds * 1000);
                    continue;
                }

                OpenScannerMode();
                PumpLoop();
            }
            catch (Exception ex)
            {
                Emit("{\"event\":\"error\",\"message\":\"" + JsonEscape(ex.Message) + "\",\"type\":\"" + JsonEscape(ex.GetType().Name) + "\"}");
            }
            finally
            {
                CleanupScanner(true);
            }

            if (!stop)
            {
                Emit("{\"event\":\"reconnecting\",\"retry_in\":" + retrySeconds + "}");
                Sleep(retrySeconds * 1000);
            }
        }

        Emit("{\"event\":\"shutdown\"}");
    }

    static void OpenScannerMode()
    {
        eventMode = false;
        eventHookMessage = "";
        dataEventsSeen = 0;
        scansEmitted = 0;
        lastPollWaitingEmit = DateTime.MinValue;

        // Flush stale data properties before the first scan. Stale ScanDataLabel
        // is the classic "one scan behind" failure mode when code polls DataCount.
        try { scanner.DataEventEnabled = false; } catch {}
        try { scanner.DeviceEnabled = false; } catch {}
        try { scanner.ClearInput(); } catch {}
        try { scanner.ClearInputProperties(); } catch {}

        try { scanner.AutoDisable = false; } catch {}
        try { scanner.DecodeData = true; } catch {}

        // The correct OPOS path is event-driven: the control copies the current
        // scan into ScanDataLabel immediately before delivering DataEvent.
        // Advise the Datalogic _IOPOSScannerEvents connection point before
        // enabling so the first scan cannot be buffered with no listener.
        TryAttachDataEventSink();

        scanner.DeviceEnabled = true;
        try { scanner.AutoDisable = false; } catch {}
        try { scanner.DecodeData = true; } catch {}
        scanner.DataEventEnabled = true;

        Emit("{\"event\":\"opened\",\"device\":\"" + JsonEscape(activeDevice) + "\",\"mode\":\"" + (eventMode ? "data_event" : "poll_fallback") + "\",\"factory\":\"" + JsonEscape(scannerFactory) + "\",\"eventHook\":\"" + JsonEscape(eventHookMessage) + "\",\"props\":" + ScannerPropsJson() + "}");
    }

    static void TryAttachDataEventSink()
    {
        try
        {
            object comObject = scanner;
            IConnectionPointContainer cpc = (IConnectionPointContainer)comObject;
            Guid eventIid = ScannerEventsIid;
            cpc.FindConnectionPoint(ref eventIid, out dataEventConnectionPoint);

            dataEventSink = new ScannerEventSink();
            dataEventConnectionPoint.Advise(dataEventSink, out dataEventCookie);

            eventMode = true;
            eventHookMessage = "manual_connection_point";
        }
        catch (Exception ex)
        {
            eventMode = false;
            dataEventConnectionPoint = null;
            dataEventCookie = 0;
            dataEventSink = null;
            eventHookMessage = ex.GetType().Name + ": " + ex.Message;
            Emit("{\"event\":\"event_sink_failed\",\"message\":\"" + JsonEscape(eventHookMessage) + "\",\"eventIid\":\"" + ScannerEventsIid + "\"}");
        }
    }

    static void PumpLoop()
    {
        DateTime lastHeartbeat = DateTime.UtcNow;

        while (!stop)
        {
            try { System.Windows.Forms.Application.DoEvents(); } catch {}

            if (!eventMode)
            {
                if (!PollOnce()) return;
            }

            if ((DateTime.UtcNow - lastHeartbeat).TotalSeconds >= 10)
            {
                EmitHeartbeat();
                lastHeartbeat = DateTime.UtcNow;
            }

            Sleep(25);
        }
    }

    static bool PollOnce()
    {
        try
        {
            int count = 0;
            try { count = (int)scanner.DataCount; } catch {}
            if (count <= 0) return true;

            // Poll fallback is deliberately conservative: never read a stale
            // ScanDataLabel left over from the previous DataEvent. Clear input
            // properties first, then re-arm and wait until OPOS has actually
            // dequeued a frame into the data properties.
            try { scanner.ClearInputProperties(); } catch {}
            try { scanner.DataEventEnabled = true; } catch {}

            bool dequeued = false;
            DateTime waitUntil = DateTime.UtcNow.AddMilliseconds(700);
            while (DateTime.UtcNow < waitUntil && !stop)
            {
                try { System.Windows.Forms.Application.DoEvents(); } catch {}

                string waitingLabel = "";
                bool dataEventEnabled = true;
                int currentCount = count;
                try { waitingLabel = ValueToText(scanner.ScanDataLabel); } catch {}
                try { dataEventEnabled = (bool)scanner.DataEventEnabled; } catch {}
                try { currentCount = (int)scanner.DataCount; } catch {}

                if (!string.IsNullOrEmpty(waitingLabel) || !dataEventEnabled || currentCount < count)
                {
                    dequeued = true;
                    break;
                }

                Thread.Sleep(15);
            }

            if (!dequeued)
            {
                if ((DateTime.UtcNow - lastPollWaitingEmit).TotalSeconds >= 2)
                {
                    Emit("{\"event\":\"poll_waiting\",\"dataCount\":" + count + ",\"message\":\"queued input has not been copied to ScanDataLabel yet\"}");
                    lastPollWaitingEmit = DateTime.UtcNow;
                }
                return true;
            }

            string label = "";
            string raw = "";
            int type = 0;

            try { label = ValueToText(scanner.ScanDataLabel); } catch {}
            try { raw = ValueToText(scanner.ScanData); } catch {}
            try { type = (int)scanner.ScanDataType; } catch {}
            if (string.IsNullOrEmpty(label)) label = raw;

            try { scanner.ClearInput(); } catch {}
            try { scanner.ClearInputProperties(); } catch {}
            try { scanner.DataEventEnabled = true; } catch {}

            if (!string.IsNullOrEmpty(label))
            {
                scansEmitted++;
                Emit("{\"event\":\"scan\",\"seq\":" + scansEmitted + ",\"label\":\"" + JsonEscape(label) + "\",\"raw\":\"" + JsonEscape(raw) + "\",\"type\":" + type + ",\"mode\":\"poll_fallback\",\"dataCount\":" + count + ",\"ts\":\"" + DateTime.UtcNow.ToString("o") + "\"}");
            }
            else
            {
                int afterCount = 0;
                try { afterCount = (int)scanner.DataCount; } catch {}
                Emit("{\"event\":\"scan_empty\",\"mode\":\"poll_fallback\",\"dataCount\":" + count + ",\"afterClearDataCount\":" + afterCount + "}");
            }

            return true;
        }
        catch (Exception ex)
        {
            Emit("{\"event\":\"poll_error\",\"message\":\"" + JsonEscape(ex.Message) + "\",\"type\":\"" + JsonEscape(ex.GetType().Name) + "\"}");
            return false;
        }
    }

    static void OnDataEvent(int status)
    {
        lock (scanLock)
        {
            try
            {
                dataEventsSeen++;

                string label = "";
                string raw = "";
                int type = 0;

                try { label = ValueToText(scanner.ScanDataLabel); } catch {}
                try { raw = ValueToText(scanner.ScanData); } catch {}
                try { type = (int)scanner.ScanDataType; } catch {}

                if (string.IsNullOrEmpty(label)) label = raw;

                if (!string.IsNullOrEmpty(label))
                {
                    scansEmitted++;
                    Emit("{\"event\":\"scan\",\"seq\":" + scansEmitted + ",\"label\":\"" + JsonEscape(label) + "\",\"raw\":\"" + JsonEscape(raw) + "\",\"type\":" + type + ",\"status\":" + status + ",\"mode\":\"data_event\",\"ts\":\"" + DateTime.UtcNow.ToString("o") + "\"}");
                }
                else
                {
                    int dc = 0;
                    try { dc = (int)scanner.DataCount; } catch {}
                    Emit("{\"event\":\"scan_empty\",\"status\":" + status + ",\"dataCount\":" + dc + "}");
                    try { scanner.ClearInput(); } catch {}
                }
            }
            catch (Exception ex)
            {
                Emit("{\"event\":\"event_error\",\"message\":\"" + JsonEscape(ex.Message) + "\",\"type\":\"" + JsonEscape(ex.GetType().Name) + "\"}");
            }
            finally
            {
                // Re-arm the event source immediately. AutoDisable=false should keep
                // the scanner on, but some service objects still drop DeviceEnabled.
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

    public static void OnDataEventFromSink(int status)
    {
        OnDataEvent(status);
    }

    static void EmitHeartbeat()
    {
        int dc = 0;
        bool de = false;
        bool dee = false;
        int state = 0;

        try { dc = (int)scanner.DataCount; } catch {}
        try { de = (bool)scanner.DeviceEnabled; } catch {}
        try { dee = (bool)scanner.DataEventEnabled; } catch {}
        try { state = (int)scanner.State; } catch {}

        Emit("{\"event\":\"heartbeat\",\"mode\":\"" + (eventMode ? "data_event" : "poll_fallback") + "\",\"dataCount\":" + dc + ",\"deviceEnabled\":" + (de ? "true" : "false") + ",\"dataEventEnabled\":" + (dee ? "true" : "false") + ",\"state\":" + state + ",\"events\":" + dataEventsSeen + ",\"scans\":" + scansEmitted + "}");
    }

    static string ScannerPropsJson()
    {
        int dc = 0;
        int state = 0;
        int powerState = 0;
        bool de = false;
        bool dee = false;
        bool autoDisable = false;
        bool decodeData = false;

        try { dc = (int)scanner.DataCount; } catch {}
        try { state = (int)scanner.State; } catch {}
        try { powerState = (int)scanner.PowerState; } catch {}
        try { de = (bool)scanner.DeviceEnabled; } catch {}
        try { dee = (bool)scanner.DataEventEnabled; } catch {}
        try { autoDisable = (bool)scanner.AutoDisable; } catch {}
        try { decodeData = (bool)scanner.DecodeData; } catch {}

        return "{\"dataCount\":" + dc
            + ",\"deviceEnabled\":" + (de ? "true" : "false")
            + ",\"dataEventEnabled\":" + (dee ? "true" : "false")
            + ",\"autoDisable\":" + (autoDisable ? "true" : "false")
            + ",\"decodeData\":" + (decodeData ? "true" : "false")
            + ",\"state\":" + state
            + ",\"powerState\":" + powerState
            + "}";
    }

    static object CreateScannerObject(out string source)
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
                source = progId;
                return Activator.CreateInstance(t);
            }
            catch {}
        }

        try
        {
            string clsid = "CCB901B0-B81E-11D2-AB74-0040054C3719";
            Type t = Type.GetTypeFromCLSID(new Guid(clsid));
            if (t != null)
            {
                source = "CLSID:{" + clsid + "}";
                return Activator.CreateInstance(t);
            }
        }
        catch {}

        source = "";
        return null;
    }

    static string[] GetCandidateDeviceNames(string requested)
    {
        List<string> result = new List<string>();
        HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        List<string> registered = GetRegisteredScannerNames();
        string[] preferred = {
            "TableScanner",
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
            if (registered.Count == 0 || ContainsName(registered, preferredName))
            {
                AddDeviceName(result, seen, preferredName);
            }
        }

        foreach (string registeredName in registered) AddDeviceName(result, seen, registeredName);

        if (result.Count == 0) result.Add("TableScanner");
        return result.ToArray();
    }

    static List<string> GetRegisteredScannerNames()
    {
        List<string> names = new List<string>();
        HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
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
                        if (seen.Add(name)) names.Add(name);
                    }
                }
            }
            catch {}
        }

        return names;
    }

    static void AddDeviceName(List<string> names, HashSet<string> seen, string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return;
        name = name.Trim();
        if (seen.Add(name)) names.Add(name);
    }

    static bool ContainsName(List<string> names, string candidate)
    {
        foreach (string name in names)
        {
            if (string.Equals(name, candidate, StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }

    static void CleanupScanner(bool detachEvent)
    {
        if (scanner == null) return;

        if (detachEvent && dataEventConnectionPoint != null && dataEventCookie != 0)
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
        eventMode = false;

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
        activeDevice = "";
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

    static void Emit(string json)
    {
        try { Console.Out.WriteLine(json); Console.Out.Flush(); } catch {}
    }

    static void Sleep(int ms)
    {
        int remaining = ms;
        while (remaining > 0 && !stop)
        {
            int slice = remaining > 50 ? 50 : remaining;
            try { System.Windows.Forms.Application.DoEvents(); } catch {}
            Thread.Sleep(slice);
            remaining -= slice;
        }
    }

    static string JsonEscape(string s)
    {
        if (s == null) return "";
        var sb = new StringBuilder(s.Length + 8);
        foreach (var c in s)
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
        return sb.ToString();
    }
}

[ComVisible(true)]
[Guid("CCB90183-B81E-11D2-AB74-0040054C3719")]
[InterfaceType(ComInterfaceType.InterfaceIsIDispatch)]
public interface IScannerEvents
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
public class ScannerEventSink : IScannerEvents
{
    public void DataEvent(int status)
    {
        ScannerBridge.OnDataEventFromSink(status);
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
