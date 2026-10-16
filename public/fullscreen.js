export function fitSurface(width, height, ratio, padding = 0) {
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const surfaceWidth = Math.min(availableWidth, availableHeight * ratio);
  return { width: surfaceWidth, height: surfaceWidth / ratio };
}

export function fullscreenController(doc, target, onChange) {
  let active = false, nativeRequested = false;
  const nativeElement = () => doc.fullscreenElement || doc.webkitFullscreenElement;
  function update(value) { if (active !== value) { active = value; onChange(value); } }
  async function enter() {
    update(true);
    const request = target?.requestFullscreen || target?.webkitRequestFullscreen;
    if (!request) return; // Immersive layout still works without browser fullscreen.
    try { nativeRequested = true; await request.call(target); }
    catch { nativeRequested = false; }
  }
  async function exit() {
    update(false); nativeRequested = false;
    if (nativeElement() !== target) return;
    const leave = doc.exitFullscreen || doc.webkitExitFullscreen;
    try { if (leave) await leave.call(doc); }
    catch { if (nativeElement() === target) update(true); }
  }
  function changed() {
    if (nativeElement() === target) { nativeRequested = true; update(true); }
    else if (nativeRequested) { nativeRequested = false; update(false); }
  }
  doc.addEventListener('fullscreenchange', changed);
  doc.addEventListener('webkitfullscreenchange', changed);
  return { enter, exit, toggle: () => active ? exit() : enter(), active: () => active };
}
