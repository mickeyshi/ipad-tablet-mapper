using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Principal;

public static class TabletDiagnostics {
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int id);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError=true)] static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr buffer, int size, out int needed);
    [DllImport("advapi32.dll")] static extern bool IsTokenRestricted(IntPtr token);
    public static string Inspect(int id) {
        IntPtr process = OpenProcess(0x1000, false, id), token = IntPtr.Zero, buffer = IntPtr.Zero;
        if (process == IntPtr.Zero) return "Cannot query process (Win32 " + Marshal.GetLastWin32Error() + ")";
        try {
            if (!OpenProcessToken(process, 8, out token)) return "Cannot query token (Win32 " + Marshal.GetLastWin32Error() + ")";
            int size;
            GetTokenInformation(token, 25, IntPtr.Zero, 0, out size);
            buffer = Marshal.AllocHGlobal(size);
            if (!GetTokenInformation(token, 25, buffer, size, out size)) return "Cannot query integrity";
            string sid = new SecurityIdentifier(Marshal.ReadIntPtr(buffer)).Value;
            return "Integrity=" + sid + "; Restricted=" + IsTokenRestricted(token);
        } finally {
            if (buffer != IntPtr.Zero) Marshal.FreeHGlobal(buffer);
            if (token != IntPtr.Zero) CloseHandle(token);
            CloseHandle(process);
        }
    }
}
