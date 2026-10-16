using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;

public sealed class TabletPen : IDisposable {
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct MonitorInfo { public int Size; public Rect Monitor, Work; public uint Flags; }
    [StructLayout(LayoutKind.Sequential)] public struct PointerInfo {
        public uint pointerType, pointerId, frameId, pointerFlags;
        public IntPtr sourceDevice, hwndTarget;
        public Point pixel, himetric, pixelRaw, himetricRaw;
        public uint time, historyCount;
        public int inputData;
        public uint keyStates;
        public ulong performanceCount;
        public uint buttonChange;
    }
    [StructLayout(LayoutKind.Sequential)] public struct PenInfo {
        public PointerInfo pointer;
        public uint flags, mask, pressure, rotation;
        public int tiltX, tiltY;
    }
    // POINTER_TYPE_INFO contains a union whose largest member is POINTER_TOUCH_INFO.
    [StructLayout(LayoutKind.Explicit, Size=152)] public struct TypeInfo {
        [FieldOffset(0)] public uint type;
        [FieldOffset(8)] public PenInfo pen;
    }
    [DllImport("user32.dll", SetLastError=true)] static extern IntPtr CreateSyntheticPointerDevice(uint type, uint count, uint feedback);
    [DllImport("user32.dll", SetLastError=true)] static extern bool InjectSyntheticPointerInput(IntPtr device, [In] TypeInfo[] info, uint count);
    [DllImport("user32.dll")] static extern void DestroySyntheticPointerDevice(IntPtr device);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int metric);
    [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromPoint(Point point, uint flags);
    [DllImport("user32.dll", SetLastError=true)] static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll", SetLastError=true)] static extern bool SetCursorPos(int x, int y);
    IntPtr device;
    readonly Func<IntPtr> createDevice;
    readonly Func<IntPtr, TypeInfo, int> injectFrame;
    readonly Action<IntPtr> destroyDevice;
    long lastInjection;
    TypeInfo lastFrame;
    bool haveLastFrame;
    bool down;
    int lastX, lastY;
    double lastPressure;
    readonly Rect bounds;
    readonly int virtualLeft, virtualTop;
    bool havePenPosition;
    Point penPosition;
    public bool IsDown { get { return down; } }
    public int Width { get { return bounds.Right - bounds.Left; } }
    public int Height { get { return bounds.Bottom - bounds.Top; } }
    public int Left { get { return bounds.Left; } }
    public int Top { get { return bounds.Top; } }
    public int VirtualLeft { get { return virtualLeft; } }
    public int VirtualTop { get { return virtualTop; } }
    static IntPtr CreateDevice() {
        IntPtr handle = CreateSyntheticPointerDevice(3, 1, 3);
        if (handle == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
        return handle;
    }
    static int InjectFrame(IntPtr handle, TypeInfo info) {
        return InjectSyntheticPointerInput(handle, new TypeInfo[] { info }, 1) ? 0 : Marshal.GetLastWin32Error();
    }
    public TabletPen() : this(CreateDevice, InjectFrame, DestroySyntheticPointerDevice) {}
    // Injectable native boundary for state-machine tests without desktop input.
    public TabletPen(Func<IntPtr> create, Func<IntPtr, TypeInfo, int> inject, Action<IntPtr> destroy) {
        if (IntPtr.Size != 8) throw new Exception("Use 64-bit Windows PowerShell.");
        if (SetThreadDpiAwarenessContext(new IntPtr(-4)) == IntPtr.Zero)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not set physical-pixel DPI awareness on the pen thread.");
        if (Marshal.SizeOf(typeof(PointerInfo)) != 96 || Marshal.SizeOf(typeof(PenInfo)) != 120 || Marshal.SizeOf(typeof(TypeInfo)) != 152)
            throw new Exception("Unexpected Windows pointer structure layout.");
        createDevice = create; injectFrame = inject; destroyDevice = destroy;
        MonitorInfo monitor = new MonitorInfo(); monitor.Size = Marshal.SizeOf(typeof(MonitorInfo));
        if (!GetMonitorInfo(MonitorFromPoint(new Point(), 1), ref monitor)) throw new Win32Exception(Marshal.GetLastWin32Error());
        bounds = monitor.Monitor;
        virtualLeft = GetSystemMetrics(76); virtualTop = GetSystemMetrics(77);
        device = createDevice();
    }
    public static Point ClampDesktop(double x, double y, Rect monitor) {
        Point point;
        point.X = (int)Math.Round(Math.Max(monitor.Left, Math.Min(monitor.Right - 1, x)));
        point.Y = (int)Math.Round(Math.Max(monitor.Top, Math.Min(monitor.Bottom - 1, y)));
        return point;
    }
    public static Point InjectionPoint(Point desktop, int originX, int originY) {
        Point point; point.X = desktop.X - originX; point.Y = desktop.Y - originY; return point;
    }
    public void ResetDevice() {
        down = false;
        if (device != IntPtr.Zero) destroyDevice(device);
        device = IntPtr.Zero;
        haveLastFrame = false; lastInjection = 0;
        havePenPosition = false;
        device = createDevice();
    }
    void WaitForInjectionSlot() {
        // Burst delivery can put endpoint move/up or consecutive strokes in the
        // same OS injection time window. Do not invent future timestamps.
        long spacing = Math.Max(1, Stopwatch.Frequency / 10000);
        while (lastInjection != 0 && Stopwatch.GetTimestamp() - lastInjection < spacing) Thread.SpinWait(16);
    }
    public bool TryCursor(out Point point) {
        // Windows maintains synthetic pen and mouse cursor positions separately.
        if (havePenPosition) { point = penPosition; return true; }
        return GetCursorPos(out point);
    }
    public void Position(double x, double y) {
        Release();
        Point point = ClampDesktop(x, y, bounds);
        if (!SetCursorPos(point.X, point.Y)) throw new Win32Exception(Marshal.GetLastWin32Error());
        penPosition = point; havePenPosition = true;
    }
    public void Sample(string phase, double x, double y, double pressure, double tx, double ty) {
        if (device == IntPtr.Zero) throw new Exception("Pen device unavailable. Restart the companion.");
        bool ending = phase == "up" || phase == "cancel";
        if (ending && !down) return;
        if (phase == "move" && !down) return;
        if (phase == "down" && down) Release();
        Point desktop = ClampDesktop(x, y, bounds);
        x = desktop.X; y = desktop.Y;
        // A very short stroke can have only down/up events. Preserve its endpoint.
        if (phase == "up" && ((int)Math.Round(x) != lastX || (int)Math.Round(y) != lastY))
            Sample("move", x, y, lastPressure, tx, ty);
        if (ending) { x = lastX; y = lastY; }
        TypeInfo info = new TypeInfo();
        info.type = 3;
        info.pen.pointer.pointerType = 3;
        info.pen.pointer.pointerId = 1;
        // Injection coordinates are relative to the top-left of the virtual desktop.
        desktop.X = (int)x; desktop.Y = (int)y;
        info.pen.pointer.pixel = InjectionPoint(desktop, virtualLeft, virtualTop);
        info.pen.pointer.pointerFlags = ending ? 0x40000u | 0x2000u | (phase == "cancel" ? 0x8000u : 0u) : (phase == "down" ? 0x10000u : 0x20000u) | 0x2u | 0x4u | 0x10u | 0x2000u;
        info.pen.mask = 1 | 4 | 8;
        info.pen.pressure = ending ? 0 : (uint)Math.Round(Math.Max(0, Math.Min(1, pressure)) * 1024);
        info.pen.tiltX = (int)Math.Round(Math.Max(-90, Math.Min(90, tx)));
        info.pen.tiltY = (int)Math.Round(Math.Max(-90, Math.Min(90, ty)));
        int error = 0;
        for (int attempt = 0; attempt < 3; attempt++) {
            WaitForInjectionSlot();
            error = injectFrame(device, info);
            lastInjection = Stopwatch.GetTimestamp();
            if (error != 21) break; // Retry only ERROR_NOT_READY, using the same frame.
        }
        if (error != 0) {
            string packet = String.Format(CultureInfo.InvariantCulture,
                " phase={0}, downBefore={1}, flags=0x{2:X}, xy=({3},{4}), pressure={5}, tilt=({6},{7}), previous={8}",
                phase, down, info.pen.pointer.pointerFlags, info.pen.pointer.pixel.X, info.pen.pointer.pixel.Y,
                info.pen.pressure, info.pen.tiltX, info.pen.tiltY,
                haveLastFrame ? String.Format(CultureInfo.InvariantCulture, "flags=0x{0:X}/xy=({1},{2})", lastFrame.pen.pointer.pointerFlags, lastFrame.pen.pointer.pixel.X, lastFrame.pen.pointer.pixel.Y) : "none");
            string message = error == 5
                ? "Windows denied pen injection (Win32 5). Start Start-Tablet.cmd from File Explorer in your normal Windows session, and run Clip Studio normally rather than as administrator."
                : "InjectSyntheticPointerInput failed: " + new Win32Exception(error).Message + " (Win32 " + error + ").";
            throw new Win32Exception(error, message + packet);
        }
        lastFrame = info; haveLastFrame = true;
        penPosition = desktop; havePenPosition = true;
        down = !ending;
        if (!ending) lastPressure = pressure;
        lastX = desktop.X; lastY = desktop.Y;
    }
    public void Release() { if (down) Sample("up", lastX, lastY, 0, 0, 0); }
    public void Dispose() { try { Release(); } finally { if (device != IntPtr.Zero) destroyDevice(device); device = IntPtr.Zero; down = false; } }
}
