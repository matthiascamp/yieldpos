# rawprint.ps1 — Send raw bytes to a Windows printer via winspool.drv
# Usage: powershell -ExecutionPolicy Bypass -File rawprint.ps1 -PrinterName "name" -FilePath "path"
param(
    [Parameter(Mandatory=$true)][string]$PrinterName,
    [Parameter(Mandatory=$true)][string]$FilePath
)

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public class RawPrint {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DOCINFOW {
        public string pDocName;
        public string pOutputFile;
        public string pDatatype;
    }

    [DllImport("winspool.Drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOW di);

    [DllImport("winspool.Drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    [DllImport("winspool.Drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    public static string SendRaw(string printerName, byte[] data) {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) {
            return "FAIL:OpenPrinter failed (error " + Marshal.GetLastWin32Error() + ") - printer '" + printerName + "' not found";
        }
        var di = new DOCINFOW { pDocName = "Receipt", pOutputFile = null, pDatatype = "RAW" };
        if (!StartDocPrinter(hPrinter, 1, ref di)) {
            int err = Marshal.GetLastWin32Error();
            ClosePrinter(hPrinter);
            return "FAIL:StartDocPrinter failed (error " + err + ")";
        }
        if (!StartPagePrinter(hPrinter)) {
            int err = Marshal.GetLastWin32Error();
            EndDocPrinter(hPrinter);
            ClosePrinter(hPrinter);
            return "FAIL:StartPagePrinter failed (error " + err + ")";
        }
        IntPtr pBuf = Marshal.AllocHGlobal(data.Length);
        Marshal.Copy(data, 0, pBuf, data.Length);
        int written;
        bool writeOk = WritePrinter(hPrinter, pBuf, data.Length, out written);
        Marshal.FreeHGlobal(pBuf);
        EndPagePrinter(hPrinter);
        EndDocPrinter(hPrinter);
        ClosePrinter(hPrinter);
        if (!writeOk) return "FAIL:WritePrinter failed (error " + Marshal.GetLastWin32Error() + ")";
        if (written != data.Length) return "FAIL:WritePrinter wrote " + written + "/" + data.Length + " bytes";
        return "OK:" + written + " bytes sent";
    }
}
'@

$bytes = [System.IO.File]::ReadAllBytes($FilePath)
$result = [RawPrint]::SendRaw($PrinterName, $bytes)
Write-Output $result
