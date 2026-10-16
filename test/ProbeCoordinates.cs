using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using System.Drawing;
using System.Collections.Generic;

public static class TabletCoordinateProbe {
    [DllImport("user32.dll")] static extern bool GetPointerInfo(uint id, out TabletPen.PointerInfo info);
    sealed class Receiver : Form {
        public List<TabletPen.Point> Points = new List<TabletPen.Point>();
        protected override bool ShowWithoutActivation { get { return true; } }
        protected override void WndProc(ref Message message) {
            if (message.Msg == 0x245 || message.Msg == 0x249) {
                TabletPen.PointerInfo info;
                if (GetPointerInfo((uint)(message.WParam.ToInt64() & 0xffff), out info)) Points.Add(info.pixel);
            }
            base.WndProc(ref message);
        }
    }
    [DllImport("user32.dll", SetLastError=true)] static extern IntPtr CreateSyntheticPointerDevice(uint type, uint count, uint feedback);
    [DllImport("user32.dll", SetLastError=true)] static extern bool InjectSyntheticPointerInput(IntPtr handle, [In] TabletPen.TypeInfo[] frames, uint count);
    [DllImport("user32.dll")] static extern void DestroySyntheticPointerDevice(IntPtr handle);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out TabletPen.Point point);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int metric);
    public static void Run() {
        SetThreadDpiAwarenessContext(new IntPtr(-4));
        TabletPen.Point original;
        if (!GetCursorPos(out original)) throw new Exception("Cannot read desktop cursor");
        IntPtr handle = CreateSyntheticPointerDevice(3, 1, 3);
        if (handle == IntPtr.Zero) throw new Exception("Create failed: " + Marshal.GetLastWin32Error());
        TabletPen.TypeInfo info = new TabletPen.TypeInfo();
        info.type = 3; info.pen.pointer.pointerType = 3; info.pen.pointer.pointerId = 1;
        int x = GetSystemMetrics(0) / 2, y = GetSystemMetrics(1) / 2;
        var receiver = new Receiver();
        receiver.FormBorderStyle = FormBorderStyle.None; receiver.ShowInTaskbar = false; receiver.TopMost = true;
        receiver.StartPosition = FormStartPosition.Manual;
        receiver.Bounds = new Rectangle(GetSystemMetrics(76), GetSystemMetrics(77), GetSystemMetrics(78), GetSystemMetrics(79));
        receiver.BackColor = Color.White; receiver.Opacity = 0.02;
        receiver.Show(); Application.DoEvents();
        try {
            int[] xs = { x, x, 0, GetSystemMetrics(0) - 1, 0, GetSystemMetrics(0) - 1 };
            int[] ys = { y, y, 0, 0, GetSystemMetrics(1) - 1, GetSystemMetrics(1) - 1 };
            for (int i = 0; i < xs.Length; i++) {
                info.pen.pointer.pixel.X = xs[i] - (i > 0 ? GetSystemMetrics(76) : 0);
                info.pen.pointer.pixel.Y = ys[i] - (i > 0 ? GetSystemMetrics(77) : 0);
                // Hover only: never DOWN, INCONTACT, or FIRSTBUTTON.
                info.pen.pointer.pointerFlags = 0x20000 | 0x2 | 0x2000;
                if (!InjectSyntheticPointerInput(handle, new TabletPen.TypeInfo[] { info }, 1)) throw new Exception("Inject failed: " + Marshal.GetLastWin32Error());
                for (int tick = 0; tick < 20; tick++) { Thread.Sleep(5); Application.DoEvents(); }
                string actual = receiver.Points.Count == 0 ? "no pointer message" : receiver.Points[receiver.Points.Count - 1].X + "," + receiver.Points[receiver.Points.Count - 1].Y;
                Console.WriteLine("sent=(" + info.pen.pointer.pixel.X + "," + info.pen.pointer.pixel.Y + ") pointer=(" + actual + ")");
                receiver.Points.Clear();
            }
        } finally {
            info.pen.pointer.pointerFlags = 0x20000;
            InjectSyntheticPointerInput(handle, new TabletPen.TypeInfo[] { info }, 1);
            DestroySyntheticPointerDevice(handle);
            receiver.Dispose();
            SetCursorPos(original.X, original.Y);
        }
    }
}
