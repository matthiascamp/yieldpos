using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class YieldPosLauncher
{
    private const string PortableExeName = "YieldPOS-Client-1.0.0.exe";

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            string mode = "__MODE__";
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string portableExe = FindPortableExe(baseDir);

            if (string.IsNullOrEmpty(portableExe))
            {
                MessageBox.Show(
                    "Cannot find " + PortableExeName + ".\n\nKeep the YieldPOS package folder in Downloads, or keep YieldPOS Admin.exe, YieldPOS Register.exe, and " + PortableExeName + " in the same folder.",
                    "YieldPOS launcher",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return 2;
            }

            string appDir = Path.GetDirectoryName(portableExe);

            var psi = new ProcessStartInfo
            {
                FileName = portableExe,
                Arguments = mode,
                WorkingDirectory = appDir,
                UseShellExecute = false
            };
            psi.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");

            Process.Start(psi);
            return 0;
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "YieldPOS launcher", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }

    private static string FindPortableExe(string launcherDir)
    {
        string local = Path.Combine(launcherDir, PortableExeName);
        if (File.Exists(local)) return local;

        foreach (string candidate in GetDownloadsCandidates())
        {
            if (File.Exists(candidate)) return candidate;
        }

        return null;
    }

    private static string[] GetDownloadsCandidates()
    {
        string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (string.IsNullOrEmpty(userProfile)) return new string[0];

        string downloads = Path.Combine(userProfile, "Downloads");
        if (!Directory.Exists(downloads)) return new string[0];

        var results = new System.Collections.Generic.List<string>();
        AddIfExists(results, Path.Combine(downloads, PortableExeName));

        string[] preferredFolders = {
            "YieldPOS-App-Package-Final",
            "YieldPOS-App-Package",
            "YieldPOS",
            "yieldpos"
        };

        foreach (string folder in preferredFolders)
        {
            AddIfExists(results, Path.Combine(downloads, folder, PortableExeName));
        }

        try
        {
            var dirs = new System.Collections.Generic.List<DirectoryInfo>();
            foreach (DirectoryInfo dir in new DirectoryInfo(downloads).GetDirectories("YieldPOS*"))
            {
                dirs.Add(dir);
            }

            dirs.Sort((a, b) => b.LastWriteTimeUtc.CompareTo(a.LastWriteTimeUtc));
            foreach (DirectoryInfo dir in dirs)
            {
                AddIfExists(results, Path.Combine(dir.FullName, PortableExeName));
                AddIfExists(results, Path.Combine(dir.FullName, "dist2", PortableExeName));
            }
        }
        catch {}

        return results.ToArray();
    }

    private static void AddIfExists(System.Collections.Generic.List<string> results, string path)
    {
        if (!File.Exists(path)) return;
        foreach (string existing in results)
        {
            if (string.Equals(existing, path, StringComparison.OrdinalIgnoreCase)) return;
        }
        results.Add(path);
    }
}
