export function mapToMonitor(x, y, screen) {
  const pixel = (value, size, origin) => origin + Math.round(Math.max(0, Math.min(1, value)) * (size - 1));
  return { x: pixel(x, screen.width, screen.left || 0), y: pixel(y, screen.height, screen.top || 0) };
}
export function fromMonitor(x, y, screen) {
  return { x: (x - (screen.left || 0)) / (screen.width - 1), y: (y - (screen.top || 0)) / (screen.height - 1) };
}
