// Reference paths bypass iPad capture and Wi-Fi using the real Windows pen bridge.
export function testStroke(screen, pattern = 'wave') {
  const cx = (screen.left || 0) + (screen.width - 1) / 2, cy = (screen.top || 0) + (screen.height - 1) / 2;
  const steps = pattern === 'circle' ? 360 : 120;
  const radius = Math.min(160, (screen.width - 1) * 0.4, (screen.height - 1) * 0.4);
  const width = Math.min(240, screen.width - 1);
  const samples = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, angle = t * Math.PI * 2;
    samples.push({
      phase: i === 0 ? 'down' : 'move',
      x: pattern === 'circle' ? cx + radius * Math.cos(angle) : cx - width / 2 + width * t,
      y: pattern === 'circle' ? cy + radius * Math.sin(angle) : cy + Math.min(30, cy * 0.8) * Math.sin(angle),
      pressure: pattern === 'circle' ? 0.6 : 0.1 + 0.9 * Math.sin(t * Math.PI),
      tiltX: 0, tiltY: 0,
    });
  }
  samples.push({ ...samples.at(-1), phase: 'up', pressure: 0 });
  return samples;
}
