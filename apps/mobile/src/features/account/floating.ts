/**
 * The version art's floating logos, as plain maths. Each frame a logo nobody holds turns a little, eases from a fling
 * back to its slow drift, moves, and bounces off the screen's edges and the block in the middle (the mark and the
 * version). Positions are a logo's top-left corner, in points; speeds are points per second.
 *
 * Frame callbacks, gestures and animated styles call these on the UI thread, so every function here is a worklet,
 * the small helpers too: a plain function called from a worklet crashes there.
 */

export type Point = { x: number; y: number };
export type Body = { x: number; y: number; vx: number; vy: number };
export type Box = { left: number; top: number; right: number; bottom: number };

/** The slow drift a logo settles back to. */
export const DRIFT_SPEED = 18;
/** The fastest fling kept. */
export const MAX_SPEED = 2400;
/** How quickly a fling slows: the speed above the drift shrinks by a factor of e every 1 / FRICTION seconds. */
export const FRICTION = 1.6;
/** The share of speed a logo keeps when it bounces. */
export const RESTITUTION = 0.8;
/** The longest step: after a stall (a dropped frame, the app coming back) logos move one frame, not jump. */
export const MAX_STEP_S = 1 / 30;
/** The burst is at its widest this far through its run. */
export const BURST_PEAK = 0.3;

export function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** A fling's velocity, capped at `max` without changing its direction. */
export function limitSpeed(vx: number, vy: number, max = MAX_SPEED) {
  "worklet";
  const speed = Math.hypot(vx, vy);
  if (!Number.isFinite(speed)) return { vx: 0, vy: 0 };
  return speed > max ? { vx: (vx / speed) * max, vy: (vy / speed) * max } : { vx, vy };
}

/** A velocity turned by `angle` radians. */
export function rotate(vx: number, vy: number, angle: number) {
  "worklet";
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { vx: vx * cos - vy * sin, vy: vx * sin + vy * cos };
}

/**
 * The velocity after `dt` seconds of settling: the speed eases toward `drift` (down after a fling, up from rest) and
 * the direction stays. A logo at rest sets off along `heading` (radians).
 */
export function settle(vx: number, vy: number, dt: number, drift: number, heading: number) {
  "worklet";
  const speed = Math.hypot(vx, vy);
  const target = drift + (speed - drift) * Math.exp(-FRICTION * dt);
  if (speed < 0.001) return { vx: Math.cos(heading) * target, vy: Math.sin(heading) * target };
  return { vx: (vx / speed) * target, vy: (vy / speed) * target };
}

/** One axis against two walls: past a wall, the logo is reflected back inside and heads away, a little slower. */
export function bounceAxis(position: number, velocity: number, min: number, max: number) {
  "worklet";
  if (max <= min) return { position: min, velocity: 0 };
  if (position < min) return { position: Math.min(min + (min - position) * RESTITUTION, max), velocity: Math.abs(velocity) * RESTITUTION };
  if (position > max) return { position: Math.max(max - (position - max) * RESTITUTION, min), velocity: -Math.abs(velocity) * RESTITUTION };
  return { position, velocity };
}

/** A logo (a `size` square) overlapping the box leaves it by the shortest way, heading away from it. */
export function leaveBox(body: Body, size: number, box: Box): Body {
  "worklet";
  const right = body.x + size;
  const bottom = body.y + size;
  if (right <= box.left || body.x >= box.right || bottom <= box.top || body.y >= box.bottom) return body;
  const toLeft = right - box.left;
  const toRight = box.right - body.x;
  const toTop = bottom - box.top;
  const toBottom = box.bottom - body.y;
  const least = Math.min(toLeft, toRight, toTop, toBottom);
  if (least === toLeft) return { x: box.left - size, y: body.y, vx: -Math.abs(body.vx) * RESTITUTION, vy: body.vy };
  if (least === toRight) return { x: box.right, y: body.y, vx: Math.abs(body.vx) * RESTITUTION, vy: body.vy };
  if (least === toTop) return { x: body.x, y: box.top - size, vx: body.vx, vy: -Math.abs(body.vy) * RESTITUTION };
  return { x: body.x, y: box.bottom, vx: body.vx, vy: Math.abs(body.vy) * RESTITUTION };
}

export type StepOptions = {
  size: number;
  /** Where logos can go: the screen inside its safe area. */
  bounds: Box;
  /** The middle block they bounce off, or null before it's measured. */
  box: Box | null;
  /** This logo's drift speed and the way it sets off from rest. */
  drift: number;
  heading: number;
  /** How fast its path curves right now, in radians per second, so the drift wanders rather than runs straight. */
  turn: number;
};

/** One frame for a logo nobody is holding. */
export function step(body: Body, seconds: number, options: StepOptions): Body {
  "worklet";
  const dt = clamp(seconds, 0, MAX_STEP_S);
  const turned = rotate(body.vx, body.vy, options.turn * dt);
  const velocity = settle(turned.vx, turned.vy, dt, options.drift, options.heading);
  const x = bounceAxis(body.x + velocity.vx * dt, velocity.vx, options.bounds.left, options.bounds.right - options.size);
  const y = bounceAxis(body.y + velocity.vy * dt, velocity.vy, options.bounds.top, options.bounds.bottom - options.size);
  const moved = { x: x.position, y: y.position, vx: x.velocity, vy: y.velocity };
  return options.box ? leaveBox(moved, options.size, options.box) : moved;
}

/** How far out the burst is over its run (0 to 1): out fast to full reach by BURST_PEAK, then eased back to 0. */
export function burstCurve(t: number) {
  "worklet";
  const p = clamp(t, 0, 1);
  if (p <= BURST_PEAK) return 1 - (1 - p / BURST_PEAK) ** 3;
  const u = (p - BURST_PEAK) / (1 - BURST_PEAK);
  return 1 - (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2);
}

/**
 * Where a logo is drawn during the burst: pushed straight away from `centre` by `reach` × the curve (along `angle`
 * when it sits on the centre), and kept on screen. Its body doesn't move, so it drifts on from where it was.
 */
export function burstPosition(body: Point, size: number, centre: Point, reach: number, t: number, angle: number, bounds: Box): Point {
  "worklet";
  const dx = body.x + size / 2 - centre.x;
  const dy = body.y + size / 2 - centre.y;
  const length = Math.hypot(dx, dy);
  const ux = length > 1 ? dx / length : Math.cos(angle);
  const uy = length > 1 ? dy / length : Math.sin(angle);
  const push = reach * burstCurve(t);
  return { x: clamp(body.x + ux * push, bounds.left, bounds.right - size), y: clamp(body.y + uy * push, bounds.top, bounds.bottom - size) };
}

/**
 * Where the logos start, and stay when the system reduces motion: evenly round an ellipse halfway between the middle
 * block and the screen's edges, starting at the top, then moved out of the block and kept on screen. `angle` is each
 * one's direction from the middle.
 */
export function ringLayout(count: number, size: number, bounds: Box, box: Box): (Point & { angle: number })[] {
  "worklet";
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  const half = size / 2;
  const radius = (inner: number, outer: number) => (outer > inner ? (inner + outer) / 2 : outer);
  const rx = radius((box.right - box.left) / 2 + half, Math.min(cx - bounds.left, bounds.right - cx) - half);
  const ry = radius((box.bottom - box.top) / 2 + half, Math.min(cy - bounds.top, bounds.bottom - cy) - half);
  const points: (Point & { angle: number })[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = -Math.PI / 2 + ((index + 0.5) / count) * Math.PI * 2;
    const placed = leaveBox({ x: cx + rx * Math.cos(angle) - half, y: cy + ry * Math.sin(angle) - half, vx: 0, vy: 0 }, size, box);
    points.push({ x: clamp(placed.x, bounds.left, bounds.right - size), y: clamp(placed.y, bounds.top, bounds.bottom - size), angle });
  }
  return points;
}
