/**
 * The version art's logos as plain maths, like the DVD screensaver: each logo cruises at a steady speed in a straight
 * line and bounces off the screen's edges, the Phaseo mark in the middle and the other logos. A fling or a burst speeds
 * a logo up, then it eases back to the cruise. One step moves every logo together, because collisions need them all.
 * Positions are a logo's top-left corner, in points; speeds are points per second.
 *
 * Shapes are the drawn ones. A logo is a rounded square, and collides as one: its inner square (the square less its
 * corners) grown by the corner radius in every direction. So rounded corners meet where they're drawn, not where a
 * sharp box's corners would be. The mark is a rounded square the same way. The screen's edges are flat. The text under
 * the mark isn't solid: logos glide under it, so they can travel all the way round the mark.
 *
 * Logos are drawn as jelly. They stretch along their motion when faster than the cruise or dragged, and squash against
 * what they hit, then spring back with a small wobble. That's drawing only: collisions always use the undeformed
 * shape. The state for it lives in each body, so the one frame callback runs it all on the UI thread.
 *
 * A frame callback, gestures and animated styles call these on the UI thread, so every function here is a worklet,
 * the small helpers too: a plain function called from a worklet crashes there. Worklets also take no default
 * parameters that refer to other values: a default runs before the body unpacks what the worklet captured, so on the
 * UI thread the value doesn't exist. They read constants in the body instead. src/worklets.test.ts checks both.
 */

export type Point = { x: number; y: number };
export type Box = { left: number; top: number; right: number; bottom: number };
/** A box with corners rounded to `radius`: the mark. */
export type Block = Box & { radius: number };
/**
 * A rounded rectangle as collisions see it: its centre, the half-sizes of its inner rectangle (the shape less its
 * rounded corners) and its corner radius. The shape is every point within `r` of the inner rectangle.
 */
export type Round = { cx: number; cy: number; hx: number; hy: number; r: number };
/** Where a logo is and how fast it's going. */
export type Motion = { x: number; y: number; vx: number; vy: number };
/**
 * A logo in the simulation: its motion, `held` while a finger has it, and `glow` (0 to 1), the fading tint after a
 * corner hit. The rest is how it's drawn:
 * - `px`, `py`: where it was at the end of the last frame, so a held logo's speed is how far the finger moved it.
 * - `sa`, `sb`: its stretch, eased toward its speed's. A stretch by s along the angle θ is stored as
 *   (ln s · cos 2θ, ln s · sin 2θ), so stretches along different axes add, and an axis and its opposite are the same.
 * - `sq`, `sqv`, `sqa`: its squash from the last hit: its scale along the contact normal less 1 (−0.18 is squashed to
 *   0.82), how fast that's changing, and the normal's angle, pointing at what it hit.
 */
export type Body = Motion & { held: boolean; glow: number; px: number; py: number; sa: number; sb: number; sq: number; sqv: number; sqa: number };
/**
 * What the logos move in: their size and corner radius (all the same rounded square), the screen inside its safe
 * area, the mark (the one solid thing in the middle), and the text drawn over the logos, which they dim under.
 */
export type World = { size: number; radius: number; bounds: Box; block: Block | null; cover: Box | null };

/** The steady speed every logo cruises at. */
export const CRUISE_SPEED = 64;
/** The fastest a fling or a burst sends a logo. */
export const MAX_SPEED = 2400;
/** How quickly a logo returns to the cruise: the difference shrinks by a factor of e every 1 / CRUISE_RATE seconds, so even a full-speed fling is back to about the cruise within a second. */
export const CRUISE_RATE = 4.6;
/** Headings stay at least this far (radians, 25°) off flat and upright, so no logo ends up bouncing in a line between two edges, or between an edge and the mark, where it could never get round it. */
export const MIN_TILT = (25 * Math.PI) / 180;
/** How fast a heading too near flat or upright turns toward the diagonal (radians per second): within a third of a second. */
export const TILT_RATE = 1.5;
/** The outward speed a burst (a tap on the mark) adds to every logo. */
export const BURST_KICK = 900;
/** The longest frame simulated: after a stall (a dropped frame, the app coming back) logos move one frame, not jump. */
export const MAX_STEP_S = 1 / 30;
/** Frames are split into steps no longer than this, so fast logos can't pass through each other... */
export const SUB_STEP_S = 1 / 120;
/** ...and short enough that no logo moves further than this in one, so a fast logo meets what it hits at its surface, never so deep inside that the shortest way out is the wrong side. */
export const MAX_SUB_MOVE = 4;
/** The most steps a frame takes (only a fling near the cap after a stall needs this many). */
export const MAX_SUB_STEPS = 24;
/** How close to the other wall a bounce has to be to count as hitting the corner. */
export const CORNER_SLOP = 4;
/** How long a corner hit's tint takes to fade by a factor of e. */
export const GLOW_FADE_S = 0.8;
/** Spreads the directions logos set off in from rest. */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** A held logo is lifted: drawn this much bigger, and just as big to the logos that hit it and the edges it's dragged along. */
export const LIFT_SCALE = 1.08;
/** How much speed stretches a logo: at first its length grows by this per pt/s (a free logo's speed above the cruise, a held one's finger speed). */
export const STRETCH_PER_SPEED = 0.0003;
/** The longest a logo stretches (and 1 / this as wide, so its area stays), approached smoothly. */
export const MAX_STRETCH = 1.3;
/** The stretch follows the speed with this time constant (seconds), so a jittery finger doesn't make it flicker. */
export const STRETCH_EASE_S = 0.06;
/** A hard hit squashes a logo along the contact normal to this (and 1 / this across it, so its area stays). */
export const SQUASH_SCALE = 0.82;
/** A hit closing at this speed or faster squashes fully; slower ones less, in proportion. */
export const SQUASH_FULL_SPEED = 800;
/** Hits slower than this don't squash at all (a graze, a logo pushed along another). */
export const SQUASH_MIN_SPEED = 30;
/** The squash springs back as a damped spring with this natural frequency (rad/s) and damping ratio: one small overshoot, about a quarter of the squash, and settled within about 0.3 s. */
export const SQUASH_FREQUENCY = 26;
export const SQUASH_DAMPING = 0.4;
/** How much a logo fades under the text: fully under it, it's drawn at 1 − this. */
export const COVER_DIM = 0.65;

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
 * direction stays, unless a hit has knocked it within MIN_TILT of flat or upright: then it turns toward the diagonal
 * (at TILT_RATE, keeping which way it's going), as the DVD logo always moves. A logo at rest sets off along `heading`
 * (radians).
 */
export function toCruise(vx: number, vy: number, dt: number, heading: number) {
  "worklet";
  const speed = Math.hypot(vx, vy);
  const target = CRUISE_SPEED + (speed - CRUISE_SPEED) * Math.exp(-CRUISE_RATE * dt);
  if (speed < 0.001) return { vx: Math.cos(heading) * target, vy: Math.sin(heading) * target };
  const tilt = Math.atan2(Math.abs(vy), Math.abs(vx));
  if (tilt >= MIN_TILT && tilt <= Math.PI / 2 - MIN_TILT) return { vx: (vx / speed) * target, vy: (vy / speed) * target };
  const turned = tilt < MIN_TILT ? Math.min(MIN_TILT, tilt + TILT_RATE * dt) : Math.max(Math.PI / 2 - MIN_TILT, tilt - TILT_RATE * dt);
  return { vx: (vx < 0 ? -1 : 1) * Math.cos(turned) * target, vy: (vy < 0 ? -1 : 1) * Math.sin(turned) * target };
}

/** One axis against two walls: past a wall, the logo is reflected back inside and heads away at the same speed. */
export function bounceAxis(position: number, velocity: number, min: number, max: number) {
  "worklet";
  if (max <= min) return { position: min, velocity: 0, hit: false };
  if (position < min) return { position: Math.min(2 * min - position, max), velocity: Math.abs(velocity), hit: true };
  if (position > max) return { position: Math.max(2 * max - position, min), velocity: -Math.abs(velocity), hit: true };
  return { position, velocity, hit: false };
}

/** A logo at (x, y) moving at (vx, vy), in its own shape: not held, no tint, no stretch or squash. */
export function makeBody(x: number, y: number, vx: number, vy: number): Body {
  "worklet";
  return { x, y, vx, vy, held: false, glow: 0, px: x, py: y, sa: 0, sb: 0, sq: 0, sqv: 0, sqa: 0 };
}

/** A logo's collision shape at (x, y): its `size` square with corners of `radius`, scaled by `scale` about its centre (1, or LIFT_SCALE while held). */
export function tileShape(x: number, y: number, size: number, radius: number, scale: number): Round {
  "worklet";
  const half = (size / 2) * scale;
  const r = clamp(radius * scale, 0, half);
  return { cx: x + size / 2, cy: y + size / 2, hx: half - r, hy: half - r, r };
}

/** A block's collision shape. */
export function blockShape(block: Block): Round {
  "worklet";
  const hx = Math.max(0, (block.right - block.left) / 2);
  const hy = Math.max(0, (block.bottom - block.top) / 2);
  const r = clamp(block.radius, 0, Math.min(hx, hy));
  return { cx: (block.left + block.right) / 2, cy: (block.top + block.bottom) / 2, hx: hx - r, hy: hy - r, r };
}

/**
 * How far apart two rounded rectangles are, and which way. `gap` is the distance between their outlines (negative when
 * they overlap, by that much), and (nx, ny) the unit normal from a toward b it's measured along. It's the distance
 * between the closest points of their inner rectangles, less both radii: side by side that's the plain distance
 * between the sides, along the axis; corner to corner it's along the line between the corners' centres, so rounded
 * corners touch where they're drawn. Inner rectangles that overlap (only in a deep overlap) part along the axis that
 * overlaps least.
 */
export function separation(a: Round, b: Round): { nx: number; ny: number; gap: number } {
  "worklet";
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  const gx = Math.abs(dx) - a.hx - b.hx;
  const gy = Math.abs(dy) - a.hy - b.hy;
  const radii = a.r + b.r;
  if (gx > 0 && gy > 0) {
    const distance = Math.hypot(gx, gy);
    return { nx: (sx * gx) / distance, ny: (sy * gy) / distance, gap: distance - radii };
  }
  if (gx > 0 || (gy <= 0 && gx >= gy)) return { nx: sx, ny: 0, gap: gx - radii };
  return { nx: 0, ny: sy, gap: gy - radii };
}

/** How much a hit closing at `speed` squashes a logo: nothing for soft touches, up to 1 − SQUASH_SCALE for hard ones. */
export function squashAmount(speed: number) {
  "worklet";
  return (1 - SQUASH_SCALE) * clamp((speed - SQUASH_MIN_SPEED) / (SQUASH_FULL_SPEED - SQUASH_MIN_SPEED), 0, 1);
}

/**
 * A logo hit along (nx, ny), pointing at what it hit, at `speed`: squashed along that normal if this hit squashes it
 * more than it is already. The hit spends its stretch, so a fast logo squashes flat rather than staying long.
 */
export function squash(body: Body, nx: number, ny: number, speed: number): Body {
  "worklet";
  const amount = squashAmount(speed);
  if (amount <= 0 || amount <= -body.sq) return body;
  return { ...body, sq: -amount, sqv: 0, sqa: Math.atan2(ny, nx), sa: 0, sb: 0 };
}

/** The squash and its rate `dt` seconds on, as an exact damped spring back to 0, so it's the same at any frame rate. */
export function springStep(q: number, v: number, dt: number) {
  "worklet";
  const w = SQUASH_FREQUENCY;
  const decay = SQUASH_DAMPING * w;
  const wd = w * Math.sqrt(1 - SQUASH_DAMPING * SQUASH_DAMPING);
  const e = Math.exp(-decay * dt);
  const c = Math.cos(wd * dt);
  const s = Math.sin(wd * dt);
  const b = (v + decay * q) / wd;
  return { q: e * (q * c + b * s), v: e * (v * c - ((decay * v + w * w * q) / wd) * s) };
}

/** How long a logo moving at `speed` is drawn along its motion: 1 at rest, then 1 + STRETCH_PER_SPEED per pt/s, easing into MAX_STRETCH. Its width is the inverse. */
export function stretchFactor(speed: number) {
  "worklet";
  if (!(speed > 0)) return 1;
  const extra = MAX_STRETCH - 1;
  return 1 + extra * Math.tanh((STRETCH_PER_SPEED * speed) / extra);
}

/**
 * A logo's drawing state `dt` seconds on: its stretch eases toward its speed's (a free logo's speed above the cruise,
 * so a cruising logo isn't stretched; a held logo's finger speed, `dragVX`, `dragVY`), and its squash springs back.
 * While it's squashed the stretch waits, so a fast logo's hit reads as a squash before it stretches away again.
 */
export function relax(body: Body, dt: number, dragVX: number, dragVY: number): Body {
  "worklet";
  const vx = body.held ? dragVX : body.vx;
  const vy = body.held ? dragVY : body.vy;
  const speed = Math.hypot(vx, vy);
  const waiting = body.sq < 0 ? clamp(1 + body.sq / (1 - SQUASH_SCALE), 0, 1) : 1;
  const stretch = waiting * Math.log(stretchFactor(body.held ? speed : speed - CRUISE_SPEED));
  const angle = 2 * Math.atan2(vy, vx);
  const ta = stretch > 0 ? stretch * Math.cos(angle) : 0;
  const tb = stretch > 0 ? stretch * Math.sin(angle) : 0;
  const keep = Math.exp(-dt / STRETCH_EASE_S);
  const sa = ta + (body.sa - ta) * keep;
  const sb = tb + (body.sb - tb) * keep;
  const spring = springStep(body.sq, body.sqv, dt);
  const still = Math.abs(spring.q) < 1e-4 && Math.abs(spring.v) < 1e-3;
  const round = Math.hypot(sa, sb) < 1e-5;
  return { ...body, sa: round ? 0 : sa, sb: round ? 0 : sb, sq: still ? 0 : spring.q, sqv: still ? 0 : spring.v };
}

/**
 * How to draw a logo: scale it by `along` along `angle` (radians) and by `across` across it (their product is 1, so
 * its area stays), then shift it by (dx, dy), which keeps a squashed logo's side on what it hit. Stretch and squash add
 * as logarithms in the doubled-angle plane, so together they're still one area-keeping stretch along one axis.
 */
export function deformation(body: Body, size: number, radius: number) {
  "worklet";
  const scale = Math.max(0.5, 1 + body.sq);
  const log = Math.log(scale);
  const a = body.sa + log * Math.cos(2 * body.sqa);
  const b = body.sb + log * Math.sin(2 * body.sqa);
  const amount = Math.hypot(a, b);
  // The squash takes (1 − scale) of the logo's reach toward the contact off that side; moving it that far back keeps
  // the side where it touched. The reach of a rounded square along an angle is its inner square's plus the radius.
  const c = Math.cos(body.sqa);
  const s = Math.sin(body.sqa);
  const r = clamp(radius, 0, size / 2);
  const shift = (1 - scale) * ((size / 2 - r) * (Math.abs(c) + Math.abs(s)) + r);
  return { angle: amount > 0 ? Math.atan2(b, a) / 2 : 0, along: Math.exp(amount), across: Math.exp(-amount), dx: shift * c, dy: shift * s };
}

/** How much of a logo at (x, y) is under `box` (0 to 1, by area), for fading it under the text. */
export function coverage(x: number, y: number, size: number, box: Box | null) {
  "worklet";
  if (!box || size <= 0) return 0;
  const width = Math.max(0, Math.min(x + size, box.right) - Math.max(x, box.left));
  const height = Math.max(0, Math.min(y + size, box.bottom) - Math.max(y, box.top));
  return (width * height) / (size * size);
}

/** A logo (a `size` square) overlapping the box leaves it by the shortest way, heading away from it. Places logos clear of the middle. */
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

/**
 * A logo against the block: if they overlap it's pushed out along the contact normal until they just touch, and if
 * it's moving in it bounces off at the same speed (reflected about the normal, so off a rounded corner it leaves
 * diagonally). `hit` is the speed it hit at (0 if it didn't), along (nx, ny), pointing at the block.
 */
export function leaveBlock(motion: Motion, size: number, radius: number, block: Block): Motion & { hit: number; nx: number; ny: number } {
  "worklet";
  const contact = separation(blockShape(block), tileShape(motion.x, motion.y, size, radius, 1));
  if (contact.gap >= 0) return { x: motion.x, y: motion.y, vx: motion.vx, vy: motion.vy, hit: 0, nx: -contact.nx, ny: -contact.ny };
  // The normal points from the block to the logo, so moving in is a negative speed along it.
  const into = motion.vx * contact.nx + motion.vy * contact.ny;
  const bounce = into < 0 ? -2 * into : 0;
  return {
    x: motion.x - contact.nx * contact.gap,
    y: motion.y - contact.ny * contact.gap,
    vx: motion.vx + bounce * contact.nx,
    vy: motion.vy + bounce * contact.ny,
    hit: into < 0 ? -into : 0,
    nx: -contact.nx,
    ny: -contact.ny,
  };
}

/**
 * Where a held logo goes as the finger moves: where it was grabbed (`anchor`) plus the finger's travel, kept on screen
 * and out of the mark. It moves there in short hops, each pushed out of the mark along the contact normal, so it
 * slides along the mark's sides and round its rounded corners rather than through it. When an edge or the mark stops
 * it, the travel it couldn't follow is let go (the anchor moves), so it follows the finger again as soon as the finger
 * turns back instead of jumping to catch up. It's lifted, so it keeps its lifted size clear of both.
 */
export function dragTo(anchor: Point, travel: Point, current: Point, world: World): { at: Point; anchor: Point } {
  "worklet";
  const size = world.size;
  const bounds = world.bounds;
  const block = world.block;
  const lift = ((LIFT_SCALE - 1) * size) / 2;
  const minX = bounds.left + lift;
  const maxX = bounds.right - size - lift;
  const minY = bounds.top + lift;
  const maxY = bounds.bottom - size - lift;
  const freeX = anchor.x + travel.x;
  const freeY = anchor.y + travel.y;
  const targetX = clamp(freeX, minX, maxX);
  const targetY = clamp(freeY, minY, maxY);
  let x = current.x;
  let y = current.y;
  let blocked = false;
  if (block) {
    const hops = clamp(Math.ceil(Math.hypot(targetX - x, targetY - y) / MAX_SUB_MOVE), 1, 256);
    const stepX = (targetX - x) / hops;
    const stepY = (targetY - y) / hops;
    for (let hop = 0; hop < hops; hop += 1) {
      x += stepX;
      y += stepY;
      const contact = separation(blockShape(block), tileShape(x, y, size, world.radius, LIFT_SCALE));
      if (contact.gap < 0) {
        x = clamp(x - contact.nx * contact.gap, minX, maxX);
        y = clamp(y - contact.ny * contact.gap, minY, maxY);
        blocked = true;
      }
    }
  }
  const at = blocked ? { x, y } : { x: targetX, y: targetY };
  return { at, anchor: at.x === freeX && at.y === freeY ? anchor : { x: at.x - travel.x, y: at.y - travel.y } };
}

/**
 * Two logos (equal rounded squares of equal mass) that overlap. They're pushed apart along the contact normal (side to
 * side it's an axis, corner to corner the line between the corners) until they just touch, so they never stick, and
 * if they're closing they swap their velocities along it, as in an elastic collision: momentum and energy are kept.
 * Both squash against each other. A held logo is a wall, at its lifted size: it doesn't move, and the other bounces
 * straight off it. Null when the two don't touch.
 */
export function collidePair(a: Body, b: Body, size: number, radius: number): Body[] | null {
  "worklet";
  if (a.held && b.held) return null;
  const contact = separation(tileShape(a.x, a.y, size, radius, a.held ? LIFT_SCALE : 1), tileShape(b.x, b.y, size, radius, b.held ? LIFT_SCALE : 1));
  if (contact.gap >= 0) return null;
  const nx = contact.nx;
  const ny = contact.ny;
  const depth = -contact.gap;
  const pushA = a.held ? 0 : b.held ? depth : depth / 2;
  const pushB = depth - pushA;
  const va = a.vx * nx + a.vy * ny;
  const vb = b.vx * nx + b.vy * ny;
  // How each one's speed along the normal changes, and how hard they met.
  let da = 0;
  let db = 0;
  let speed = 0;
  if (a.held) {
    if (vb < 0) {
      db = -2 * vb;
      speed = -vb;
    }
  } else if (b.held) {
    if (va > 0) {
      da = -2 * va;
      speed = va;
    }
  } else if (vb - va < 0) {
    da = vb - va;
    db = va - vb;
    speed = va - vb;
  }
  const nextA = { ...a, x: a.x - nx * pushA, y: a.y - ny * pushA, vx: a.vx + da * nx, vy: a.vy + da * ny };
  const nextB = { ...b, x: b.x + nx * pushB, y: b.y + ny * pushB, vx: b.vx + db * nx, vy: b.vy + db * ny };
  return [squash(nextA, nx, ny, speed), squash(nextB, -nx, -ny, speed)];
}

/**
 * One logo nobody holds, `dt` seconds on: it eases toward the cruise, moves, and bounces off the edges and the mark.
 * Both edges in one step is a corner: it bounces off both at once and squashes along the diagonal. Hitting a corner
 * (both edges at once, near enough) lights its tint, which otherwise fades.
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
  // Everything it hit, as one push toward what it hit at the speed it hit: a corner pushes along the diagonal.
  let pushX = x.hit ? -x.velocity : 0;
  let pushY = y.hit ? -y.velocity : 0;
  let moved: Motion = { x: x.position, y: y.position, vx: x.velocity, vy: y.velocity };
  if (world.block) {
    const off = leaveBlock(moved, size, world.radius, world.block);
    moved = { x: off.x, y: off.y, vx: off.vx, vy: off.vy };
    pushX += off.nx * off.hit;
    pushY += off.ny * off.hit;
  }
  const next = { ...body, x: moved.x, y: moved.y, vx: moved.vx, vy: moved.vy, glow: glow < 0.01 ? 0 : glow };
  const push = Math.hypot(pushX, pushY);
  return push > 0 ? squash(next, pushX / push, pushY / push, push) : next;
}

/** After the logos push each other apart: back on screen and out of the mark (the screen wins if both can't). */
export function keepInside(body: Body, world: World): Body {
  "worklet";
  if (body.held) return body;
  const minX = world.bounds.left;
  const maxX = world.bounds.right - world.size;
  const minY = world.bounds.top;
  const maxY = world.bounds.bottom - world.size;
  const inside = { x: clamp(body.x, minX, maxX), y: clamp(body.y, minY, maxY), vx: body.vx, vy: body.vy };
  if (!world.block) return { ...body, x: inside.x, y: inside.y };
  const off = leaveBlock(inside, world.size, world.radius, world.block);
  const next = { ...body, x: clamp(off.x, minX, maxX), y: clamp(off.y, minY, maxY), vx: off.vx, vy: off.vy };
  return off.hit > 0 ? squash(next, off.nx, off.ny, off.hit) : next;
}

/**
 * Every logo, `seconds` on. The time is clamped to MAX_STEP_S and split into equal steps of at most SUB_STEP_S, and
 * more when something's fast, so nothing moves more than MAX_SUB_MOVE in one. Each step moves every free logo, settles
 * each pair that touches, puts any logo a push moved off screen or into the mark back, and moves each one's stretch
 * and squash on. A held logo's stretch follows how far the finger moved it this frame.
 */
export function stepWorld(bodies: Body[], seconds: number, world: World): Body[] {
  "worklet";
  const dt = clamp(seconds, 0, MAX_STEP_S);
  let fastest = 0;
  const dragX: number[] = [];
  const dragY: number[] = [];
  for (let index = 0; index < bodies.length; index += 1) {
    const body = bodies[index]!;
    if (!body.held) fastest = Math.max(fastest, Math.hypot(body.vx, body.vy));
    dragX.push(body.held && dt > 0 ? (body.x - body.px) / dt : 0);
    dragY.push(body.held && dt > 0 ? (body.y - body.py) / dt : 0);
  }
  const steps = clamp(Math.ceil(Math.max(dt / SUB_STEP_S, (fastest * dt) / MAX_SUB_MOVE) - 1e-6), 1, MAX_SUB_STEPS);
  const h = dt / steps;
  let next = bodies;
  for (let step = 0; step < steps; step += 1) {
    const moved: Body[] = [];
    for (let index = 0; index < next.length; index += 1) moved.push(moveBody(next[index]!, index, h, world));
    for (let i = 0; i < moved.length; i += 1) {
      for (let j = i + 1; j < moved.length; j += 1) {
        const hit = collidePair(moved[i]!, moved[j]!, world.size, world.radius);
        if (hit) {
          moved[i] = hit[0]!;
          moved[j] = hit[1]!;
        }
      }
    }
    for (let index = 0; index < moved.length; index += 1) moved[index] = relax(keepInside(moved[index]!, world), h, dragX[index]!, dragY[index]!);
    next = moved;
  }
  const settled: Body[] = [];
  for (let index = 0; index < next.length; index += 1) {
    const body = next[index]!;
    settled.push({ ...body, px: body.x, py: body.y });
  }
  return settled;
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
    bodies.push(makeBody(point.x, point.y, Math.cos(heading) * CRUISE_SPEED, Math.sin(heading) * CRUISE_SPEED));
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
    next.push({ ...body, vx: velocity.vx, vy: velocity.vy });
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
  return body ? replaceAt(bodies, index, { ...body, held: true }) : bodies;
}

/** A held logo moved to `at`. */
export function holdAt(bodies: Body[], index: number, at: Point): Body[] {
  "worklet";
  const body = bodies[index];
  return body ? replaceAt(bodies, index, { ...body, x: at.x, y: at.y, held: true }) : bodies;
}

/** A dragged logo let go: it flies off at the finger's speed, capped, and eases back to the cruise. */
export function throwBody(bodies: Body[], index: number, vx: number, vy: number): Body[] {
  "worklet";
  const body = bodies[index];
  if (!body) return bodies;
  const velocity = fling(vx, vy);
  return replaceAt(bodies, index, { ...body, vx: velocity.vx, vy: velocity.vy, held: false });
}

/** A logo let go without a drag (a tap, or a hold that didn't move): it carries on as it was going. */
export function letGo(bodies: Body[], index: number): Body[] {
  "worklet";
  const body = bodies[index];
  return body && body.held ? replaceAt(bodies, index, { ...body, held: false }) : bodies;
}

/**
 * Where the logos start, and stay when the system reduces motion: evenly round an ellipse halfway between the middle
 * (the mark and its text) and the screen's edges, starting at the top, then moved out of the middle and kept on
 * screen. `angle` is each one's direction from the middle.
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
