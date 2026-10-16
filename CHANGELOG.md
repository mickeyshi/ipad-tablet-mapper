# Changes

## Initial prototype

- Use iPad Safari and Apple Pencil as a pressure-sensitive input tablet for Windows over local Wi-Fi, without a Mac or native iPad app.
- Pair through locally generated QR codes containing the complete session link.
- Inject Windows pen input through a compiled C# bridge, with pressure and tilt tested manually in Clip Studio Paint and Krita.
- Default iPads to stylus Touch Events to capture very short marks that were missed with Pointer Events; retain both capture modes.
- Send input before rendering browser feedback, cache drawing geometry, and keep diagnostics from shifting the input surface.
- Show stroke/sample delivery counts, network round-trip time, native processing delay, and browser event timing.
- Recover from Win32 error 87 by recreating the pen device and waiting for a new stroke; report rejected samples and detailed packet diagnostics.
- Add a full-screen drawing toggle with a monitor-proportioned surface and floating input controls.
- Map the surface to physical primary-monitor pixels, account for negative virtual-desktop origins, and clamp drawing and positioning within the monitor. A hover-only Windows probe verified the center and four corners on the 2560×1440 primary display.
- Add position-only mode and separate local-contact and injected-pen markers. Physical Pencil hover remains unavailable on the 11-inch iPad Pro 3rd generation.
- Add generated pressure-wave and reference-circle diagnostics, plus automated tests for input lifecycle, mapping, full-screen transitions, pairing, timing, and injection recovery.

Full-screen presentation and sustained drawing quality still require device testing. Driver/Wintab emulation, screen streaming, additional monitor selection, and optional stroke smoothing are not implemented.
