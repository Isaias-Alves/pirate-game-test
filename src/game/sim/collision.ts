export interface Circle {
  x: number;
  y: number;
  radius: number;
}

/** True when two circles overlap. */
export function circlesOverlap(a: Circle, b: Circle): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r = a.radius + b.radius;
  return dx * dx + dy * dy < r * r;
}

/**
 * Pushes `mover` out of `blocker` along the contact normal.
 * Returns true if a correction was applied.
 */
export function pushOutOfCircle(mover: Circle, blocker: Circle): boolean {
  const dx = mover.x - blocker.x;
  const dy = mover.y - blocker.y;
  const minDist = mover.radius + blocker.radius;
  const distSq = dx * dx + dy * dy;
  if (distSq >= minDist * minDist) return false;
  const dist = Math.sqrt(distSq);
  // Perfectly centered: pick an arbitrary but stable direction.
  const nx = dist > 1e-6 ? dx / dist : 1;
  const ny = dist > 1e-6 ? dy / dist : 0;
  mover.x = blocker.x + nx * minDist;
  mover.y = blocker.y + ny * minDist;
  return true;
}

/** Clamps a circle fully inside a [0,width]x[0,height] arena. Returns true if it moved. */
export function clampToArena(c: Circle, width: number, height: number): boolean {
  const x = Math.min(Math.max(c.x, c.radius), width - c.radius);
  const y = Math.min(Math.max(c.y, c.radius), height - c.radius);
  const moved = x !== c.x || y !== c.y;
  c.x = x;
  c.y = y;
  return moved;
}

/** Segment-vs-circle test, so fast projectiles cannot tunnel through targets between steps. */
export function segmentHitsCircle(x1: number, y1: number, x2: number, y2: number, c: Circle, pad = 0): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 0 ? Math.min(1, Math.max(0, ((c.x - x1) * dx + (c.y - y1) * dy) / lenSq)) : 0;
  const px = x1 + t * dx - c.x;
  const py = y1 + t * dy - c.y;
  const r = c.radius + pad;
  return px * px + py * py <= r * r;
}
