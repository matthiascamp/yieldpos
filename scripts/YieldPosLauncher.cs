using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class YieldPosLauncher
{
    private const string PortableExePattern = "YieldPOS-Client-*.exe";

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
                    "Cannot find a YieldPOS-Client app EXE.\n\nPut the YieldPOS folder on the Desktop or in Downloads, with this launcher beside it. The launcher also works if it is in the same folder as the YieldPOS-Client EXE.",
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
        string local = FindPreferredPortableExe(launcherDir);
        if (!string.IsNullOrEmpty(local)) return local;

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
        AddNewestIfExists(results, root);
        AddNewestIfExists(results, Path.Combine(root, "dist2"));

        string[] preferredFolders = {
            "YieldPOS",
            "yieldpos"
        };

        foreach (string folder in preferredFolders)
        {
            AddNewestIfExists(results, Path.Combine(root, folder));
            AddNewestIfExists(results, Path.Combine(root, folder, "dist2"));
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
                AddNewestIfExists(results, dir.FullName);
                AddNewestIfExists(results, Path.Combine(dir.FullName, "dist2"));
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

    private static void AddNewestIfExists(System.Collections.Generic.List<string> results, string dir)
    {
        string exe = FindPreferredPortableExe(dir);
        if (!string.IsNullOrEmpty(exe)) AddIfExists(results, exe);
    }

    private static string FindPreferredPortableExe(string dir)
    {
        string packageVersion = ReadPackageVersion(dir);
        if (!string.IsNullOrEmpty(packageVersion))
        {
            string expected = Path.Combine(dir, "YieldPOS-Client-" + packageVersion + ".exe");
            if (File.Exists(expected)) return expected;
        }
        return FindNewestPortableExe(dir);
    }

    private static string FindNewestPortableExe(string dir)
    {
        try
        {
            if (string.IsNullOrEmpty(dir) || !Directory.Exists(dir)) return null;
            FileInfo[] files = new DirectoryInfo(dir).GetFiles(PortableExePattern);
            if (files.Length == 0) return null;
            Array.Sort(files, (a, b) => b.LastWriteTimeUtc.CompareTo(a.LastWriteTimeUtc));
            return files[0].FullName;
        }
        catch
        {
            return null;
        }
    }

    private static string ReadPackageVersion(string dir)
    {
        try
        {
            if (string.IsNullOrEmpty(dir)) return null;
            string packagePath = Path.Combine(dir, "package.json");
            if (!File.Exists(packagePath)) return null;
            foreach (string line in File.ReadAllLines(packagePath))
            {
                string trimmed = line.Trim();
                if (!trimmed.StartsWith("\"version\"", StringComparison.OrdinalIgnoreCase)) continue;
                int colon = trimmed.IndexOf(':');
                if (colon < 0) return null;
                return trimmed.Substring(colon + 1).Trim().Trim(',').Trim('"');
            }
        }
        catch {}
        return null;
    }
}
