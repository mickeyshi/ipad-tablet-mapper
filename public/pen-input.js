// Keep pen lifecycle independent of delayed pointer-capture notifications.
export function bindPenInput(surface, globalTarget, onSample, getMode) {
  let active = null, last = null;
  function emit(event, phase) { last = event; onSample(event, phase); }
  function begin(id, event) {
    if (active !== null) emit(last, 'cancel');
    active = id; emit(event, 'down');
  }
  function end(id, event, phase) {
    if (active !== id) return;
    active = null; emit(event, phase); last = null;
  }
  surface.addEventListener('pointerdown', event => {
    if (getMode() !== 'pointer' || event.pointerType !== 'pen') return;
    event.preventDefault(); begin(event.pointerId, event);
    try { surface.setPointerCapture(event.pointerId); } catch {}
  });
  surface.addEventListener('pointermove', event => {
    if (getMode() !== 'pointer' || event.pointerId !== active) return;
    event.preventDefault();
    const points = event.getCoalescedEvents?.() || [];
    for (const point of points.length ? points : [event]) emit(point, 'move');
  });
  for (const type of ['pointerup', 'pointercancel']) globalTarget.addEventListener(type, event => {
    if (getMode() !== 'pointer') return;
    end(event.pointerId, event, type === 'pointerup' ? 'up' : 'cancel');
  });
  // Alternative for Safari versions that omit rapid stylus Pointer Events.
  function touchPoint(touch, timeStamp, ending) {
    const alt = touch.altitudeAngle, az = touch.azimuthAngle;
    const angles = Number.isFinite(alt) && Number.isFinite(az) && alt > 0;
    return { clientX: touch.clientX, clientY: touch.clientY, pressure: ending ? 0 : touch.force || 0,
      tiltX: angles ? Math.atan2(Math.cos(az) * Math.cos(alt), Math.sin(alt)) * 180 / Math.PI : 0,
      tiltY: angles ? Math.atan2(Math.sin(az) * Math.cos(alt), Math.sin(alt)) * 180 / Math.PI : 0, timeStamp };
  }
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
    const target = type === 'touchstart' || type === 'touchmove' ? surface : globalTarget;
    target.addEventListener(type, event => {
      if (getMode() !== 'touch') return;
      for (const touch of event.changedTouches) {
        if (touch.touchType !== 'stylus') continue;
        event.preventDefault();
        const ending = type === 'touchend' || type === 'touchcancel';
        const point = touchPoint(touch, event.timeStamp, ending);
        if (type === 'touchstart') begin(touch.identifier, point);
        else if (ending) end(touch.identifier, point, type === 'touchend' ? 'up' : 'cancel');
        else if (active === touch.identifier) emit(point, 'move');
      }
    }, { passive: false });
  }
  return { active: () => active !== null, reset: () => { active = null; last = null; } };
}
