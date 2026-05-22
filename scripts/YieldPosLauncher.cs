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
                    "Cannot find " + PortableExeName + ".\n\nPut the YieldPOS folder on the Desktop or in Downloads, with this launcher beside it. The launcher also works if it is in the same folder as " + PortableExeName + ".",
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

        foreach (string candidate in GetPortableExeCandidates(launcherDir))
        {
            if (File.Exists(candidate)) return candidate;
        }

        return null;
    }

    private static string[] GetPortableExeCandidates(string launcherDir)
    {
        var results = new System.Collections.Generic.List<string>();
        foreach (string root in GetSearchRoots(launcherDir))
        {
            AddCandidatesFromRoot(results, root);
        }
        return results.ToArray();
    }

    private static string[] GetSearchRoots(string launcherDir)
    {
        var roots = new System.Collections.Generic.List<string>();

        AddDirectoryIfExists(roots, launcherDir);

        string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        AddDirectoryIfExists(roots, desktop);

        string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (!string.IsNullOrEmpty(userProfile))
        {
            AddDirectoryIfExists(roots, Path.Combine(userProfile, "Desktop"));
            AddDirectoryIfExists(roots, Path.Combine(userProfile, "OneDrive", "Desktop"));
            AddDirectoryIfExists(roots, Path.Combine(userProfile, "Downloads"));
        }

        return roots.ToArray();
    }

    private static void AddCandidatesFromRoot(System.Collections.Generic.List<string> results, string root)
    {
        AddIfExists(results, Path.Combine(root, PortableExeName));
        AddIfExists(results, Path.Combine(root, "dist2", PortableExeName));

        string[] preferredFolders = {
            "YieldPOS",
            "yieldpos"
        };

        foreach (string folder in preferredFolders)
        {
            AddIfExists(results, Path.Combine(root, folder, PortableExeName));
            AddIfExists(results, Path.Combine(root, folder, "dist2", PortableExeName));
        }

        try
        {
            var dirs = new System.Collections.Generic.List<DirectoryInfo>();
            foreach (DirectoryInfo dir in new DirectoryInfo(root).GetDirectories("YieldPOS*"))
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
    }

    private static void AddDirectoryIfExists(System.Collections.Generic.List<string> results, string path)
    {
        if (string.IsNullOrEmpty(path) || !Directory.Exists(path)) return;
        string fullPath = Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        foreach (string existing in results)
        {
            if (string.Equals(existing, fullPath, StringComparison.OrdinalIgnoreCase)) return;
        }
        results.Add(fullPath);
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
