/**
 * The version art's logos as plain maths, like the DVD screensaver: each logo cruises at a steady speed in a straight
 * line and bounces off the screen's edges, the block in the middle (the mark and the version) and the other logos. A
 * fling or a burst speeds a logo up, then it eases back to the cruise. One step moves every logo together, because
 * collisions need them all. Positions are a logo's top-left corner, in points; speeds are points per second.
 *
 * A frame callback, gestures and animated styles call these on the UI thread, so every function here is a worklet,
 * the small helpers too: a plain function called from a worklet crashes there. Worklets also take no default
 * parameters that refer to other values: a default runs before the body unpacks what the worklet captured, so on the
 * UI thread the value doesn't exist. They read constants in the body instead. src/worklets.test.ts checks both.
 */

export type Point = { x: number; y: number };
export type Box = { left: number; top: number; right: number; bottom: number };
/** Where a logo is and how fast it's going. */
export type Motion = { x: number; y: number; vx: number; vy: number };
/** A logo in the simulation: `held` while a finger has it, and `glow` (0 to 1), the fading tint after a corner hit. */
export type Body = Motion & { held: boolean; glow: number };
/** What the logos move in: their size (all the same square), the screen inside its safe area, and the middle block. */
export type World = { size: number; bounds: Box; box: Box | null };

/** The steady speed every logo cruises at. */
export const CRUISE_SPEED = 64;
/** The fastest a fling or a burst sends a logo. */
export const MAX_SPEED = 2400;
/** How quickly a logo returns to the cruise: the difference shrinks by a factor of e every 1 / CRUISE_RATE seconds, so even a full-speed fling is back to about the cruise within a second. */
export const CRUISE_RATE = 4.6;
/** The outward speed a burst (a tap on the mark) adds to every logo. */
export const BURST_KICK = 900;
/** The longest frame simulated: after a stall (a dropped frame, the app coming back) logos move one frame, not jump. */
export const MAX_STEP_S = 1 / 30;
/** Frames are split into steps no longer than this, so fast logos can't pass through each other. */
export const SUB_STEP_S = 1 / 120;
/** How close to the other wall a bounce has to be to count as hitting the corner. */
export const CORNER_SLOP = 4;
/** How long a corner hit's tint takes to fade by a factor of e. */
export const GLOW_FADE_S = 0.8;
/** Spreads the directions logos set off in from rest. */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** A velocity capped at `max` without changing its direction. `max` has no default (see above). */
export function limitSpeed(vx: number, vy: number, max: number) {
  "worklet";
  const speed = Math.hypot(vx, vy);
  if (!Number.isFinite(speed)) return { vx: 0, vy: 0 };
  return speed > max ? { vx: (vx / speed) * max, vy: (vy / speed) * max } : { vx, vy };
}

/** A released logo's velocity: the finger's, capped at MAX_SPEED (read here in the body, where it's captured). */
export function fling(vx: number, vy: number) {
  "worklet";
  return limitSpeed(vx, vy, MAX_SPEED);
}

/**
 * The velocity after `dt` seconds of easing back to the cruise: faster logos slow down, slower ones speed up, and the
 * direction stays. A logo at rest sets off along `heading` (radians).
 */
export function toCruise(vx: number, vy: number, dt: number, heading: number) {
  "worklet";
  const speed = Math.hypot(vx, vy);
  const target = CRUISE_SPEED + (speed - CRUISE_SPEED) * Math.exp(-CRUISE_RATE * dt);
  if (speed < 0.001) return { vx: Math.cos(heading) * target, vy: Math.sin(heading) * target };
  return { vx: (vx / speed) * target, vy: (vy / speed) * target };
}

/** One axis against two walls: past a wall, the logo is reflected back inside and heads away at the same speed. */
export function bounceAxis(position: number, velocity: number, min: number, max: number) {
  "worklet";
  if (max <= min) return { position: min, velocity: 0, hit: false };
  if (position < min) return { position: Math.min(2 * min - position, max), velocity: Math.abs(velocity), hit: true };
  if (position > max) return { position: Math.max(2 * max - position, min), velocity: -Math.abs(velocity), hit: true };
  return { position, velocity, hit: false };
}

/** A logo (a `size` square) overlapping the box leaves it by the shortest way, heading away from it. */
export function leaveBox(body: Motion, size: number, box: Box): Motion {
  "worklet";
  const right = body.x + size;
  const bottom = body.y + size;
  if (right <= box.left || body.x >= box.right || bottom <= box.top || body.y >= box.bottom) return body;
  const toLeft = right - box.left;
  const toRight = box.right - body.x;
  const toTop = bottom - box.top;
  const toBottom = box.bottom - body.y;
  const least = Math.min(toLeft, toRight, toTop, toBottom);
  if (least === toLeft) return { x: box.left - size, y: body.y, vx: -Math.abs(body.vx), vy: body.vy };
  if (least === toRight) return { x: box.right, y: body.y, vx: Math.abs(body.vx), vy: body.vy };
  if (least === toTop) return { x: body.x, y: box.top - size, vx: body.vx, vy: -Math.abs(body.vy) };
  return { x: body.x, y: box.bottom, vx: body.vx, vy: Math.abs(body.vy) };
}

/** How far through a move (0 to 1) one axis entered the box's span, or -1 when that axis didn't cross into it. */
function entry(from: number, to: number, size: number, min: number, max: number) {
  "worklet";
  if (from + size <= min && to + size > min) return (min - (from + size)) / (to - from);
  if (from >= max && to < max) return (from - max) / (from - to);
  return -1;
}

/**
 * A move from `from` to `next` that ends overlapping the box stops at the side it came in through, and bounces off it:
 * the axis that crossed into the box last is the one that hit. A logo that was already inside leaves by the shortest
 * way. Dragging uses it too, so a held logo slides along the block's edge rather than through it.
 */
export function collideBox(from: Point, next: Motion, size: number, box: Box): Motion {
  "worklet";
  if (next.x + size <= box.left || next.x >= box.right || next.y + size <= box.top || next.y >= box.bottom) return next;
  const alongX = entry(from.x, next.x, size, box.left, box.right);
  const alongY = entry(from.y, next.y, size, box.top, box.bottom);
  if (alongX < 0 && alongY < 0) return leaveBox(next, size, box);
  if (alongX >= alongY) {
    const fromLeft = from.x + size <= box.left;
    return { x: fromLeft ? box.left - size : box.right, y: next.y, vx: (fromLeft ? -1 : 1) * Math.abs(next.vx), vy: next.vy };
  }
  const fromTop = from.y + size <= box.top;
  return { x: next.x, y: fromTop ? box.top - size : box.bottom, vx: next.vx, vy: (fromTop ? -1 : 1) * Math.abs(next.vy) };
}

/**
 * Where a held logo goes as the finger moves: where it was grabbed (`anchor`) plus the finger's travel, kept on screen
 * and out of the middle (sliding along it). When an edge or the middle stops it, the travel it couldn't follow is let
 * go (the anchor moves), so it follows the finger again as soon as the finger turns back instead of jumping to catch
 * up, or through the middle.
 */
export function dragTo(anchor: Point, travel: Point, current: Point, size: number, bounds: Box, box: Box | null): { at: Point; anchor: Point } {
  "worklet";
  const freeX = anchor.x + travel.x;
  const freeY = anchor.y + travel.y;
  const kept = { x: clamp(freeX, bounds.left, bounds.right - size), y: clamp(freeY, bounds.top, bounds.bottom - size), vx: 0, vy: 0 };
  const hit = box ? collideBox(current, kept, size, box) : kept;
  const at = { x: hit.x, y: hit.y };
  return { at, anchor: at.x === freeX && at.y === freeY ? anchor : { x: at.x - travel.x, y: at.y - travel.y } };
}

/**
 * Two logos (equal squares of equal mass) that overlap. They're pushed apart along the axis they overlap least, so
 * they never stick, and if they're closing they swap their velocities along it, as in an elastic collision: momentum
 * and energy are kept. A held logo is a wall: it doesn't move, and the other bounces straight off it. Null when the
 * two don't touch.
 */
export function collidePair(a: Body, b: Body, size: number): Body[] | null {
  "worklet";
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const overlapX = size - Math.abs(dx);
  const overlapY = size - Math.abs(dy);
  if (overlapX <= 0 || overlapY <= 0 || (a.held && b.held)) return null;
  const alongX = overlapX < overlapY;
  // The contact normal, pointing from a to b along that axis.
  const sign = (alongX ? dx : dy) < 0 ? -1 : 1;
  const depth = alongX ? overlapX : overlapY;
  const pushA = a.held ? 0 : b.held ? depth : depth / 2;
  const pushB = depth - pushA;
  const va = a.held ? 0 : alongX ? a.vx : a.vy;
  const vb = b.held ? 0 : alongX ? b.vx : b.vy;
  let na = va;
  let nb = vb;
  if ((vb - va) * sign < 0) {
    if (a.held) nb = sign * Math.abs(vb);
    else if (b.held) na = -sign * Math.abs(va);
    else {
      na = vb;
      nb = va;
    }
  }
  const nextA = alongX
    ? { x: a.x - sign * pushA, y: a.y, vx: a.held ? a.vx : na, vy: a.vy, held: a.held, glow: a.glow }
    : { x: a.x, y: a.y - sign * pushA, vx: a.vx, vy: a.held ? a.vy : na, held: a.held, glow: a.glow };
  const nextB = alongX
    ? { x: b.x + sign * pushB, y: b.y, vx: b.held ? b.vx : nb, vy: b.vy, held: b.held, glow: b.glow }
    : { x: b.x, y: b.y + sign * pushB, vx: b.vx, vy: b.held ? b.vy : nb, held: b.held, glow: b.glow };
  return [nextA, nextB];
}

/**
 * One logo nobody holds, `dt` seconds on: it eases toward the cruise, moves, and bounces off the edges and the middle.
 * Hitting a corner (both walls at once, near enough) lights its tint, which otherwise fades.
 */
export function moveBody(body: Body, index: number, dt: number, world: World): Body {
  "worklet";
  if (body.held) return body;
  const size = world.size;
  const bounds = world.bounds;
  const velocity = toCruise(body.vx, body.vy, dt, index * GOLDEN_ANGLE);
  const maxX = bounds.right - size;
  const maxY = bounds.bottom - size;
  const x = bounceAxis(body.x + velocity.vx * dt, velocity.vx, bounds.left, maxX);
  const y = bounceAxis(body.y + velocity.vy * dt, velocity.vy, bounds.top, maxY);
  const nearX = x.position - bounds.left <= CORNER_SLOP || maxX - x.position <= CORNER_SLOP;
  const nearY = y.position - bounds.top <= CORNER_SLOP || maxY - y.position <= CORNER_SLOP;
  const corner = (x.hit && nearY) || (y.hit && nearX);
  const glow = corner ? 1 : body.glow * Math.exp(-dt / GLOW_FADE_S);
  const moved = { x: x.position, y: y.position, vx: x.velocity, vy: y.velocity };
  const hit = world.box ? collideBox(body, moved, size, world.box) : moved;
  return { x: hit.x, y: hit.y, vx: hit.vx, vy: hit.vy, held: false, glow: glow < 0.01 ? 0 : glow };
}

/** After the logos push each other apart: back on screen and out of the middle (the screen wins if both can't). */
export function keepInside(body: Body, world: World): Body {
  "worklet";
  if (body.held) return body;
  const minX = world.bounds.left;
  const maxX = world.bounds.right - world.size;
  const minY = world.bounds.top;
  const maxY = world.bounds.bottom - world.size;
  const inside = { x: clamp(body.x, minX, maxX), y: clamp(body.y, minY, maxY), vx: body.vx, vy: body.vy };
  const out = world.box ? leaveBox(inside, world.size, world.box) : inside;
  return { x: clamp(out.x, minX, maxX), y: clamp(out.y, minY, maxY), vx: out.vx, vy: out.vy, held: false, glow: body.glow };
}

/**
 * Every logo, `seconds` on. The time is clamped to MAX_STEP_S and split into equal steps of at most SUB_STEP_S; each
 * step moves every free logo, then settles each pair that touches, then puts any logo a push moved off screen back.
 */
export function stepWorld(bodies: Body[], seconds: number, world: World): Body[] {
  "worklet";
  const dt = clamp(seconds, 0, MAX_STEP_S);
  const steps = Math.max(1, Math.ceil(dt / SUB_STEP_S - 1e-6));
  const h = dt / steps;
  let next = bodies;
  for (let step = 0; step < steps; step += 1) {
    const moved: Body[] = [];
    for (let index = 0; index < next.length; index += 1) moved.push(moveBody(next[index]!, index, h, world));
    for (let i = 0; i < moved.length; i += 1) {
      for (let j = i + 1; j < moved.length; j += 1) {
        const hit = collidePair(moved[i]!, moved[j]!, world.size);
        if (hit) {
          moved[i] = hit[0]!;
          moved[j] = hit[1]!;
        }
      }
    }
    for (let index = 0; index < moved.length; index += 1) moved[index] = keepInside(moved[index]!, world);
    next = moved;
  }
  return next;
}

/**
 * The logos at their places round the middle, each cruising off diagonally away from it, as the DVD logo moves; a
 * little turn each keeps them from moving in step.
 */
export function launch(home: Point[]): Body[] {
  "worklet";
  const cx = home.reduce((sum, point) => sum + point.x, 0) / Math.max(1, home.length);
  const cy = home.reduce((sum, point) => sum + point.y, 0) / Math.max(1, home.length);
  const bodies: Body[] = [];
  for (let index = 0; index < home.length; index += 1) {
    const point = home[index]!;
    const heading = Math.atan2(point.y < cy ? -1 : 1, point.x < cx ? -1 : 1) + ((index % 3) - 1) * 0.16;
    bodies.push({ x: point.x, y: point.y, vx: Math.cos(heading) * CRUISE_SPEED, vy: Math.sin(heading) * CRUISE_SPEED, held: false, glow: 0 });
  }
  return bodies;
}

/** The burst: every free logo gets BURST_KICK more speed straight out from `centre`, capped, then eases back. */
export function kick(bodies: Body[], centre: Point, size: number): Body[] {
  "worklet";
  const next: Body[] = [];
  for (let index = 0; index < bodies.length; index += 1) {
    const body = bodies[index]!;
    if (body.held) {
      next.push(body);
      continue;
    }
    const dx = body.x + size / 2 - centre.x;
    const dy = body.y + size / 2 - centre.y;
    const length = Math.hypot(dx, dy);
    const ux = length > 1 ? dx / length : Math.cos(index * GOLDEN_ANGLE);
    const uy = length > 1 ? dy / length : Math.sin(index * GOLDEN_ANGLE);
    const velocity = limitSpeed(body.vx + ux * BURST_KICK, body.vy + uy * BURST_KICK, MAX_SPEED);
    next.push({ x: body.x, y: body.y, vx: velocity.vx, vy: velocity.vy, held: false, glow: body.glow });
  }
  return next;
}

/** The logos with the one at `index` replaced (unchanged if there's no logo there). */
function replaceAt(bodies: Body[], index: number, body: Body): Body[] {
  "worklet";
  if (index < 0 || index >= bodies.length) return bodies;
  const next = bodies.slice();
  next[index] = body;
  return next;
}

/** A finger lands on a logo: it stops under it (keeping its velocity for when it's let go) and others bounce off it. */
export function pickUp(bodies: Body[], index: number): Body[] {
  "worklet";
  const body = bodies[index];
  return body ? replaceAt(bodies, index, { x: body.x, y: body.y, vx: body.vx, vy: body.vy, held: true, glow: body.glow }) : bodies;
}

/** A held logo moved to `at`. */
export function holdAt(bodies: Body[], index: number, at: Point): Body[] {
  "worklet";
  const body = bodies[index];
  return body ? replaceAt(bodies, index, { x: at.x, y: at.y, vx: body.vx, vy: body.vy, held: true, glow: body.glow }) : bodies;
}

/** A dragged logo let go: it flies off at the finger's speed, capped, and eases back to the cruise. */
export function throwBody(bodies: Body[], index: number, vx: number, vy: number): Body[] {
  "worklet";
  const body = bodies[index];
  if (!body) return bodies;
  const velocity = fling(vx, vy);
  return replaceAt(bodies, index, { x: body.x, y: body.y, vx: velocity.vx, vy: velocity.vy, held: false, glow: body.glow });
}

/** A logo let go without a drag (a tap, or a hold that didn't move): it carries on as it was going. */
export function letGo(bodies: Body[], index: number): Body[] {
  "worklet";
  const body = bodies[index];
  return body && body.held ? replaceAt(bodies, index, { x: body.x, y: body.y, vx: body.vx, vy: body.vy, held: false, glow: body.glow }) : bodies;
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
