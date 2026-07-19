export const WINDOW_FLOOR = 3;
export const WINDOW_CEILING = 8;
export const WINDOW_INCREMENT = 1;

export function nextWindow(size, event) {
  const current = Number.isInteger(size) && size >= WINDOW_FLOOR ? size : WINDOW_FLOOR;
  if (event === 'approved' || event === 'merged') return Math.min(WINDOW_CEILING, current + WINDOW_INCREMENT);
  if (event === 'changes-requested') return Math.max(WINDOW_FLOOR, Math.ceil(current / 2));
  return current;
}

export function windowDelta(size) {
  return { kind: 'window', size };
}
