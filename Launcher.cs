using System;
using System.Diagnostics;
using System.IO;

namespace EldoradoPesca
{
    class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            try
            {
                string appDir = AppDomain.CurrentDomain.BaseDirectory;
                
                // If run from desktop shortcut or desktop copy, find original project directory
                if (!File.Exists(Path.Combine(appDir, "main.js")))
                {
                    string oneDriveDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "OneDrive", "gestao");
                    if (File.Exists(Path.Combine(oneDriveDir, "main.js")))
                    {
                        appDir = oneDriveDir;
                    }
                }

                string electronExe = Path.Combine(appDir, "node_modules", "electron", "dist", "electron.exe");

                if (File.Exists(electronExe))
                {
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = electronExe;
                    psi.Arguments = string.Format("\"{0}\"", appDir);
                    psi.WorkingDirectory = appDir;
                    psi.UseShellExecute = false;
                    psi.CreateNoWindow = true;
                    psi.WindowStyle = ProcessWindowStyle.Hidden;

                    Process.Start(psi);
                    return;
                }

                // Fallback: Start node server and open URL
                string serverJs = Path.Combine(appDir, "server.js");
                if (File.Exists(serverJs))
                {
                    ProcessStartInfo nodePsi = new ProcessStartInfo("node.exe", "server.js");
                    nodePsi.WorkingDirectory = appDir;
                    nodePsi.CreateNoWindow = true;
                    nodePsi.UseShellExecute = false;
                    try { Process.Start(nodePsi); } catch { }
                }

                Process.Start(new ProcessStartInfo("http://localhost:3000") { UseShellExecute = true });
            }
            catch (Exception)
            {
                try
                {
                    Process.Start(new ProcessStartInfo("http://localhost:3000") { UseShellExecute = true });
                }
                catch { }
            }
        }
    }
}
