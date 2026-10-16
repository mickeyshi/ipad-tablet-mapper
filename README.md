# iPad → Windows drawing tablet prototype

Use an iPad browser and Apple Pencil as an absolute-position pen surface for Windows. No Mac, iPad app installation, or .NET SDK is required.

## Run

For desktop pen injection, double-click **Start-Tablet.cmd** in File Explorer. This launches the companion in your normal Windows session. A server started inside a restricted coding-agent environment may initialize a pen device but be denied permission to inject input.

Requirements: Windows 10 1809 or newer, 64-bit Windows PowerShell 5.1, and Node.js 22 or newer.

Run `npm install` once to install dependencies, including the local QR-code generator.

```powershell
npm start
```

Keep the terminal running. It prints a desktop link and one or more iPad links with a random session pairing code. On the iPad, open the appropriate LAN link in Safari while connected to the same Wi-Fi network. The full link, including `#...`, is required. If Windows prompts for firewall access, allow access on your private network. Do not expose the server to the internet. This prototype uses unencrypted HTTP/WebSocket on your trusted LAN; the session code grants pen control and changes whenever the server restarts.

For easier pairing, open the printed **desktop link** on Windows. Its **Connect your iPad** panel displays a QR code containing the full LAN URL and session code. Scan it using the iPad Camera and tap the link to open Safari. If Windows has multiple network addresses, select the address on the same network as the iPad. QR codes are generated locally; pairing links are never sent to a third-party QR service. The panel is provided only to connections from localhost.

The companion listens on port 8787. Set `$env:PORT = '8788'` before starting to choose another port.

## First: Windows pressure test

1. In Clip Studio Paint, choose **File → Preferences → Tablet → TabletPC** (wording can vary by version). Record your previous setting so you can restore it.
2. Choose a brush with pen pressure enabled for size. Open a blank canvas with room for a roughly 240-pixel-wide stroke.
3. Open the printed **desktop link** in your Windows browser. Wait for **Windows pen ready**.
4. Select **Pressure wave**, click **Run test in 8 seconds**, and switch to Clip Studio with its canvas centered on the primary monitor. The test draws a roughly 240-pixel-wide stroke around the monitor center, regardless of the mouse cursor position.
5. Look for a curved stroke that is narrow at its ends and wide in the middle. A successful injection API call alone does not prove Clip Studio receives pressure.

The desktop test page needs to remain visible in its browser tab during the countdown; switching to the Clip Studio application is fine. Hiding the page or switching its browser tab stops input. You can undo the stroke in Clip Studio. Click **Stop** on either connected page to stop a pending or active test. Escape stops input when the tablet page has keyboard focus; it is not a global shortcut.

## Then: iPad diagnostics and live input

Open the printed iPad link. Before enabling drawing, make Pencil strokes on the light surface and check the pressure, tilt, and sample-rate readout. Pressure should change as you press more firmly. Fingers are ignored. Local preview can be cleared or disabled.

Click **Enable drawing** on the iPad, then keep Clip Studio focused on Windows. Contact immediately draws at the mapped location; lifting ends the stroke. The surface maps to the entire primary monitor with matching proportions. This includes desktop toolbars: draw within the region that corresponds to the Clip Studio canvas. Canvas-only mapping and additional monitor selection are future work.

Only one client can control the pen. Any connected page can stop it. Disconnect, two seconds without a controller heartbeat, page hiding, and resizing disarm input. Reload after a connection failure. Use **Stop** before switching applications.

## Development and validation

```powershell
npm test
node server.mjs --diagnostic
```

Diagnostic mode serves the iPad capture page without loading or injecting Windows input. The native bridge compiles its C# source using Windows PowerShell's built-in `Add-Type`. At startup it verifies structure sizes and creates a synthetic pen device; it does not draw until explicitly armed or a test is requested.

Architecture: Safari Pointer Events → WebSocket → Node server → line-delimited JSON over a child process pipe → C# Win32 synthetic pen injection. The server checks pairing and browser origin, bounds samples and queues, and releases pen contact on disconnect. WebSocket uses a small, size-limited RFC 6455 implementation with no external dependencies.

Known limits: actual Safari Pencil sampling and Clip Studio pressure compatibility require device testing; there is no Pencil hover, native Pencil gesture integration, driver/Wintab emulation, background operation guarantee, or measured end-to-end latency. Browser event timestamps are captured but not synchronized with Windows. Local preview is diagnostic feedback, not a representation of Clip Studio's brush.

## Access denied during a stroke

If `InjectSyntheticPointerInput` reports Win32 error 5, stop the existing server and open **Start-Tablet.cmd** directly from File Explorer. Use the new pairing links printed there. Keep Clip Studio running normally, without **Run as administrator**. Windows input isolation can block interaction with more privileged applications, and a restricted process token can impose additional limits. Startup logs show the companion's integrity SID and whether its token is restricted; `Restricted=False` is expected for this test. This does not require disabling UAC or changing system security settings.

Pen creation and idle release tests do not establish that input injection is permitted. Only the actual stroke test verifies that path. Permission failures disable the pen until restart, preventing repeated failed release commands. Error 87 uses the recovery behavior below.

## Responsiveness and short strokes

The input loop runs in compiled C# after PowerShell startup; samples no longer pass through PowerShell JSON conversion and method dispatch. Short strokes preserve the pen-up endpoint even when no move event arrives. Delayed pointer-capture notifications do not stop drawing; a new contact cancels a stale stroke before starting another.

The iPad footer shows **Captured** (browser pen-down events), **Sent** (pen-down messages sent while enabled), and **Injected** (complete strokes accepted by the Windows injection API). Counters reset when enabling drawing. Injected does not mean Clip Studio rendered the stroke. **Windows pipe** measures the final sample's server-to-native processing delay, excluding Wi-Fi, Safari capture, and Clip Studio rendering.

iPads default to **iPad touch** capture because device testing showed that very short dots reached Clip Studio in this mode but were missed in Pointer mode. Only one input mode runs at a time; touch mode uses Safari's stylus touch events and force. Switching modes stops drawing. Disable **Local preview** to compare responsiveness without browser preview rendering.

The footer also shows sample messages **sent** and **processed by Windows**, plus client-server **network RTT**. Pause with input still enabled to compare the sample counts after queues drain. Equal counts mean these messages reached and were processed by the native bridge, not that Safari captured every physical movement or that Clip Studio rendered every sample. RTT excludes native injection and rendering; Windows pipe delay excludes Wi-Fi and browser capture. No smoothing, prediction, or intentional sample dropping is applied.

## Cursor placement

The blue marker displays the latest successfully injected pen position, polled at 20 Hz while a client is connected (except during the generated pressure test). It remains visible when the Pencil is lifted. Before the first pen input it falls back to the Windows mouse cursor. Windows tracks synthetic pen and mouse positions separately, so subsequent mouse movement does not replace the pen marker. The dashed orange marker shows the local Pencil contact point independently of local preview.

The 11-inch iPad Pro 3rd generation does not report physical Apple Pencil hover. The blue marker cannot track a lifted Pencil moving above the glass. Use **Position only: on**, with input enabled, to touch or slide the Pencil and position the desktop cursor without drawing; lift, switch **Position only: off**, and the next contact draws normally. Position mode does not start strokes. The canvas must still occupy the corresponding region of the primary monitor.

## Full-screen drawing and monitor mapping

Tap **Full screen** to hide the header, diagnostics, and pairing panel and maximize the drawing area. It keeps the primary monitor's aspect ratio: 2560×1440 produces a 16:9 surface with unused space above/below or at the sides, without stretching circles. Use landscape orientation for the largest useful area. Floating controls provide **Enable drawing**, **Position only**, **Stop**, and **Exit full screen**. Changing full-screen mode or rotating releases/disarms input; enable drawing afterward.

The page requests native browser full screen where supported (including modern iPad Safari). If the request is unavailable or rejected, it still provides an immersive page layout, with browser chrome remaining. Exit using the floating button or the browser's full-screen exit gesture. Pencil input only starts inside the light surface, not the letterbox area.

The native injection thread runs with explicit per-monitor DPI awareness and reads the primary monitor's physical bounds. Normalized input maps to inclusive pixel coordinates: `(0,0)` through `(2559,1439)` on a 2560×1440 display. Both drawing and position-only input are clamped again in the native bridge. Synthetic pen injection uses coordinates relative to the virtual desktop's top-left; ordinary cursor positioning uses desktop coordinates. Negative virtual-screen origins are converted explicitly. Restart the companion after changing monitor layout or resolution.

A hover-only Windows probe verified the physical center and all four primary-monitor corners on the development desktop. Automated tests cover corners, clamping, negative origins, aspect ratio, and full-screen entry/exit/fallback. Actual Safari full-screen presentation still requires device verification.

## Comparing jagged curves in drawing apps

On the desktop page, select **Reference circle** and click **Run test in 8 seconds**. Switch to the target app with a blank canvas centered on the primary monitor. This draws a mathematical circle of roughly 320 pixels diameter at constant pressure over about 3.6 seconds. It bypasses Safari, Wi-Fi, and hand movement, but uses the same Windows pen bridge. Coordinates are still quantized to screen pixels and timer cadence is approximate. The circle does not require an iPad connection. Keep the desktop page in its active browser tab; hiding it cancels the test.

Compare the generated circle in Clip Studio and Krita, using a simple round brush without texture and with brush stabilization off for diagnosis. If generated circles are clean but iPad circles wobble, investigate capture, mapping, and natural hand movement. If generated circles also wobble, investigate the Windows injection/application path. This comparison narrows the cause; it does not uniquely identify it.

For Krita, select **Settings → Configure Krita → Tablet Settings → Windows 8+ Pointer Input (Windows Ink)** and restart Krita. The companion injects Windows pointer input and does not implement Wintab. Use **Open Tablet Tester** to verify tablet events (blue line) and changing pressure. Mouse events (red line) alone have no pressure. If tablet pressure changes but brush width does not, check that the chosen brush enables pressure for size. See the [Krita tablet settings manual](https://docs.krita.org/en/reference_manual/preferences/tablet_settings.html).

## Browser latency diagnostics

Input is transmitted immediately from the event handler. Cursor updates and optional local preview draw once per animation frame, independently of transmission. Preview buffering is bounded and never drops transmitted samples. Surface geometry is cached between contacts; the diagnostics footer has a fixed height so changing readout text cannot move the drawing surface during a stroke.

**Event age p95** measures the gap between browser event timestamps and handler processing for the most recent 256 usable timestamps. **Sample gap p95** measures timestamp gaps within strokes, excluding pauses between them. These measure browser event timing, not Pencil sensor latency or end-to-end display latency. Statistics refresh once per second. A 16.7 ms sample gap suggests roughly 60 Hz event delivery, even if Wi-Fi RTT and Windows processing delay are small. Compare continuous strokes with local preview disabled and a simple brush without stabilization in the drawing app. These changes remove browser work from the input path; the device must be retested to measure the actual benefit.

## Rejected pen packets (Win32 87)

Injection calls have a minimum 0.1 ms spacing to avoid overlapping OS injection time windows during burst delivery. This is a defensive timing measure, not a confirmed explanation for error 87. Only transient Win32 21 (`ERROR_NOT_READY`) retries the same packet, at most three attempts. Error 87 (`ERROR_INVALID_PARAMETER`) instead recreates the pen device, abandons the remainder of that stroke, and waits for a fresh pen-down. The interrupted stroke may be incomplete. Three consecutive recoveries without a completed stroke exhaust the automatic recovery allowance; a subsequent failure stops the bridge.

The footer reports **Rejected** samples (including the skipped remainder of an interrupted stroke) and lifetime **Pen resets**. Rejected samples reset when input is re-enabled; pen resets reset with the companion. The terminal prints the rejected packet's phase, flags, screen coordinates, pressure, tilt, previous injected flags/position, and prior contact state. If recovery occurs frequently, copy the **Pen recovery** lines for diagnosis. Recovery preserves availability but does not establish that the root cause has been fixed.

Native regression tests use a simulated API boundary to exercise 2,000 short strokes, endpoint movement, cancellation, not-ready retry, and interrupted-stroke recovery without drawing on the desktop. Actual Windows/Krita sustained input still requires device testing.
