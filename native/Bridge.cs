using System;
using System.ComponentModel;
using System.Web.Script.Serialization;

public static class TabletBridge {
    public sealed class Command {
        public string type { get; set; }
        public string phase { get; set; }
        public double x { get; set; }
        public double y { get; set; }
        public double pressure { get; set; }
        public double tiltX { get; set; }
        public double tiltY { get; set; }
        public long stroke { get; set; }
        public long sentAt { get; set; }
        public long sequence { get; set; }
    }
    public static void Run() {
        using (var pen = new TabletPen()) Run(pen);
    }
    public static void Run(TabletPen pen) {
        var json = new JavaScriptSerializer();
        {
            Console.WriteLine(json.Serialize(new { type = "ready", width = pen.Width, height = pen.Height, left = pen.Left, top = pen.Top, virtualLeft = pen.VirtualLeft, virtualTop = pen.VirtualTop, security = TabletDiagnostics.Inspect(System.Diagnostics.Process.GetCurrentProcess().Id) }));
            string line;
            bool failed = false;
            long processed = 0, sequence = 0;
            long rejected = 0, recoveries = 0;
            int consecutiveRecoveries = 0;
            bool awaitNewDown = false;
            while ((line = Console.ReadLine()) != null) {
                if (failed) continue;
                try {
                    var command = json.Deserialize<Command>(line);
                    if (command.type == "release") { pen.Release(); processed = 0; sequence = 0; rejected = 0; awaitNewDown = false; continue; }
                    if (command.type == "status") {
                        TabletPen.Point cursor;
                        bool available = pen.TryCursor(out cursor);
                        Console.WriteLine(json.Serialize(new { type = "status", x = cursor.X, y = cursor.Y, cursorAvailable = available, penDown = pen.IsDown, processed = processed, sequence = sequence, rejected = rejected, recoveries = recoveries }));
                        continue;
                    }
                    if (command.type == "position") { pen.Position(command.x, command.y); continue; }
                    if (awaitNewDown && command.phase != "down") { if (command.sequence > 0) rejected++; continue; }
                    if (command.phase == "down") awaitNewDown = false;
                    bool wasDown = pen.IsDown;
                    pen.Sample(command.phase, command.x, command.y, command.pressure, command.tiltX, command.tiltY);
                    if (command.sequence > 0) { processed++; sequence = command.sequence; }
                    if (command.phase == "up" && wasDown) consecutiveRecoveries = 0;
                    if (command.phase == "up" && wasDown && command.stroke > 0) {
                        long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                        Console.WriteLine(json.Serialize(new { type = "stroke", stroke = command.stroke, pipeDelayMs = Math.Max(0, now - command.sentAt) }));
                    }
                } catch (Exception error) {
                    var nativeError = error as Win32Exception;
                    if (nativeError != null && nativeError.NativeErrorCode == 87 && consecutiveRecoveries < 3) {
                        try {
                            pen.ResetDevice();
                            awaitNewDown = true; rejected++; recoveries++; consecutiveRecoveries++;
                            Console.WriteLine(json.Serialize(new { type = "recovery", message = "Windows rejected a pen packet. Pen reset; the interrupted stroke may be incomplete. Lift the Pencil and start a new stroke.", details = error.Message, recoveries = recoveries, rejected = rejected }));
                            continue;
                        } catch (Exception resetError) { error = new Exception(error.Message + " Pen reset failed: " + resetError.Message); }
                    }
                    failed = true;
                    try { pen.Dispose(); } catch {}
                    Console.WriteLine(json.Serialize(new { type = "error", message = error.Message }));
                }
            }
        }
    }
}
