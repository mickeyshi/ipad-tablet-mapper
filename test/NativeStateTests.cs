using System;
using System.IO;
using System.Collections.Generic;
using System.Web.Script.Serialization;

public static class PenStateTests {
    static int checks;
    static void Check(bool condition, string message) { checks++; if (!condition) throw new Exception(message); }
    sealed class FakeNative {
        public int Creates, Destroys, Attempts, NextError, FailAt;
        public bool Contact;
        public List<TabletPen.TypeInfo> Frames = new List<TabletPen.TypeInfo>();
        public IntPtr Create() { return new IntPtr(++Creates); }
        public void Destroy(IntPtr handle) { Destroys++; Contact = false; }
        public int Inject(IntPtr handle, TabletPen.TypeInfo info) {
            Attempts++;
            if (NextError != 0) { int error = NextError; NextError = 0; return error; }
            if (Attempts == FailAt) return 87;
            var pointer = info.pen.pointer;
            Check(info.pen.pressure <= 1024 && Math.Abs(info.pen.tiltX) <= 90 && Math.Abs(info.pen.tiltY) <= 90, "Invalid pressure/tilt");
            if ((pointer.pointerFlags & 0x10000) != 0) { Check(!Contact, "Down during contact"); Contact = true; }
            else if ((pointer.pointerFlags & 0x40000) != 0) {
                Check(Contact, "Up without contact");
                var previous = Frames[Frames.Count - 1].pen.pointer.pixel;
                Check(previous.X == pointer.pixel.X && previous.Y == pointer.pixel.Y, "Up moved from last injected position");
                Contact = false;
            } else Check(Contact, "Move without contact");
            Frames.Add(info); return 0;
        }
        public TabletPen Pen() { return new TabletPen(Create, Inject, Destroy); }
    }
    static void Lifecycles() {
        var fake = new FakeNative();
        using (var pen = fake.Pen()) {
            for (int i = 0; i < 2000; i++) {
                pen.Sample("down", 100, 100, 0.4, 12, -12);
                pen.Sample("up", i % 2 == 0 ? 100 : 110, 100, 0, 0, 0);
                Check(!pen.IsDown && !fake.Contact, "Stroke left contact down");
            }
            pen.Sample("down", 100, 100, 0.5, 0, 0);
            pen.Sample("down", 120, 120, 0.5, 0, 0);
            pen.Sample("cancel", 900, 900, 0, 0, 0);
            Check((fake.Frames[fake.Frames.Count - 1].pen.pointer.pointerFlags & 0x8000) != 0, "Cancel flag missing");
            int before = fake.Attempts; fake.NextError = 21;
            pen.Sample("down", 100, 100, 0.5, 0, 0);
            Check(fake.Attempts == before + 2, "Not-ready frame was not retried");
            pen.Release();
        }
        Check(fake.Creates == fake.Destroys, "Device leaked");
    }
    static void Recovery() {
        var fake = new FakeNative(); fake.FailAt = 2;
        var input = new StringReader(
            "{\"phase\":\"down\",\"x\":100,\"y\":100,\"pressure\":0.5,\"stroke\":1,\"sequence\":1}\n" +
            "{\"phase\":\"move\",\"x\":110,\"y\":100,\"pressure\":0.5,\"stroke\":1,\"sequence\":2}\n" +
            "{\"phase\":\"move\",\"x\":120,\"y\":100,\"pressure\":0.5,\"stroke\":1,\"sequence\":3}\n" +
            "{\"phase\":\"up\",\"x\":120,\"y\":100,\"stroke\":1,\"sequence\":4}\n" +
            "{\"phase\":\"down\",\"x\":130,\"y\":100,\"pressure\":0.5,\"stroke\":2,\"sequence\":5}\n" +
            "{\"phase\":\"up\",\"x\":130,\"y\":100,\"stroke\":2,\"sequence\":6}\n");
        var output = new StringWriter(); var oldInput = Console.In; var oldOutput = Console.Out;
        try { Console.SetIn(input); Console.SetOut(output); using (var pen = fake.Pen()) TabletBridge.Run(pen); }
        finally { Console.SetIn(oldInput); Console.SetOut(oldOutput); }
        var json = new JavaScriptSerializer(); int recoveries = 0, strokes = 0;
        foreach (string line in output.ToString().Split(new char[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)) {
            var message = json.Deserialize<Dictionary<string, object>>(line);
            Check((string)message["type"] != "error", "Recovery became fatal: " + line);
            if ((string)message["type"] == "recovery") { recoveries++; Check(((string)message["details"]).Contains("phase=move"), "Missing failure context"); }
            if ((string)message["type"] == "stroke") { strokes++; Check(Convert.ToInt64(message["stroke"]) == 2, "Acknowledged broken stroke"); }
        }
        Check(recoveries == 1 && strokes == 1, "Must recover once and complete next stroke");
        Check(fake.Frames.Count == 3, "Replayed interrupted stroke instead of discarding remainder");
        Check(fake.Creates == 2 && fake.Destroys == 2, "Recovery device leak");
    }
    static void Coordinates() {
        var bounds = new TabletPen.Rect(); bounds.Left = 0; bounds.Top = 0; bounds.Right = 2560; bounds.Bottom = 1440;
        var edge = TabletPen.ClampDesktop(2560, 1440, bounds);
        Check(edge.X == 2559 && edge.Y == 1439, "Edge escaped primary monitor");
        var origin = TabletPen.ClampDesktop(-100, -100, bounds);
        Check(origin.X == 0 && origin.Y == 0, "Negative input escaped primary monitor");
        var injection = TabletPen.InjectionPoint(edge, -1920, 0);
        Check(injection.X == 4479 && injection.Y == 1439, "Virtual desktop origin was not applied");
        var fake = new FakeNative();
        using (var pen = fake.Pen()) {
            pen.Sample("down", 100000, 100000, 0.5, 0, 0);
            pen.Release();
            var point = fake.Frames[0].pen.pointer.pixel;
            Check(point.X == pen.Left + pen.Width - 1 - pen.VirtualLeft && point.Y == pen.Top + pen.Height - 1 - pen.VirtualTop, "Native packet escaped physical primary bounds");
            TabletPen.Point cursor;
            Check(pen.TryCursor(out cursor) && cursor.X == pen.Left + pen.Width - 1 && cursor.Y == pen.Top + pen.Height - 1, "Cursor feedback used unrelated mouse position");
        }
    }
    public static int Run() { Lifecycles(); Recovery(); Coordinates(); return checks; }
}
