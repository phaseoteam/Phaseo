import {
  BURST_KICK, CRUISE_SPEED, LIFT_SCALE, MAX_SPEED, MAX_STEP_S, MAX_STRETCH, MIN_TILT, SQUASH_SCALE, STRETCH_PER_SPEED, blockShape, bounceAxis, collidePair, coverage, deformation,
  dragTo, fling, holdAt, kick, launch, leaveBlock, leaveBox, letGo, limitSpeed, makeBody, pickUp, relax, ringLayout, separation, springStep, squashAmount, stepWorld,
  stretchFactor, throwBody, tileShape, toCruise, type Block, type Body, type Box, type Round, type World,
} from "./floating";

const PHONE: Box = { left: 8, top: 40, right: 404, bottom: 860 };
/** The mark: a 112 pt rounded square in the middle, the one solid thing there. */
const MARK: Block = { left: 150, top: 300, right: 262, bottom: 412, radius: 8 };
const SIZE = 48;
const RADIUS = 8;
const WORLD: World = { size: SIZE, radius: RADIUS, bounds: PHONE, block: MARK, cover: null };
const OPEN: World = { size: SIZE, radius: RADIUS, bounds: PHONE, block: null, cover: null };

const body = (x: number, y: number, vx: number, vy: number, patch: Partial<Body> = {}): Body => ({ ...makeBody(x, y, vx, vy), ...patch });
const speed = (b: { vx: number; vy: number }) => Math.hypot(b.vx, b.vy);
const shape = (b: Body) => tileShape(b.x, b.y, SIZE, RADIUS, b.held ? LIFT_SCALE : 1);
/** The distance between two logos' drawn outlines (negative when they overlap). */
const gap = (a: Body, b: Body) => separation(shape(a), shape(b)).gap;
const markGap = (b: { x: number; y: number }) => separation(blockShape(MARK), tileShape(b.x, b.y, SIZE, RADIUS, 1)).gap;
const onScreen = (b: Body, bounds: Box = PHONE, size: number = SIZE) =>
  b.x >= bounds.left - 1e-9 && b.x <= bounds.right - size + 1e-9 && b.y >= bounds.top - 1e-9 && b.y <= bounds.bottom - size + 1e-9;
function run(bodies: Body[], seconds: number, world: World, each?: (bodies: Body[]) => void) {
  let next = bodies;
  for (let frame = 0; frame < Math.round(seconds * 60); frame += 1) {
    next = stepWorld(next, 1 / 60, world);
    each?.(next);
  }
  return next;
}

describe("separation (rounded rectangles)", () => {
  // A 48 pt logo with 8 pt corners is its 32 pt inner square grown by 8.
  const at = (x: number, y: number): Round => tileShape(x, y, SIZE, RADIUS, 1);

  it("measures side to side along the axis, as a box would", () => {
    expect(separation(at(0, 0), at(58, 20))).toEqual({ nx: 1, ny: 0, gap: 10 });
    expect(separation(at(0, 0), at(-20, -60))).toEqual({ nx: 0, ny: -1, gap: 12 });
    // Offset by most of a side, the flat parts still face each other: touching.
    expect(separation(at(0, 0), at(48, 30))).toEqual({ nx: 1, ny: 0, gap: 0 });
  });

  it("measures corner to corner between the rounded corners, along the diagonal", () => {
    // Their boxes touch at the corner, but the drawn corners are 16√2 − 16 ≈ 6.6 pt apart: the old box collisions
    // bounced here, with that gap showing.
    const apart = separation(at(0, 0), at(48, 48));
    expect(apart.gap).toBeCloseTo(16 * Math.SQRT2 - 16, 10);
    expect(apart.nx).toBeCloseTo(Math.SQRT1_2, 10);
    expect(apart.ny).toBeCloseTo(Math.SQRT1_2, 10);
    // They touch once the corners meet, with their boxes overlapping by 4.7 pt each way.
    const t = 16 - 16 * Math.SQRT1_2;
    expect(separation(at(0, 0), at(48 - t, 48 - t)).gap).toBeCloseTo(0, 10);
    // Off the diagonal, the normal follows the line between the corners' centres.
    const off = separation(at(0, 0), at(52, 44));
    expect(off.nx / off.ny).toBeCloseTo(20 / 12, 10);
    expect(off.gap).toBeCloseTo(Math.hypot(20, 12) - 16, 10);
  });

  it("measures a corner against a flat side along the side's normal, turning smoothly round the corner", () => {
    const mark = blockShape(MARK);
    // A logo right of the mark, mostly above its top edge: only its lower corner is beside the mark's side.
    expect(separation(mark, at(MARK.right + 3, MARK.top - 20))).toEqual({ nx: 1, ny: 0, gap: 3 });
    // Where the flat side ends the normal is still flat, and just past it, it starts to turn.
    const edge = separation(mark, at(MARK.right, 268));
    expect(edge).toEqual({ nx: 1, ny: 0, gap: 0 });
    const past = separation(mark, at(MARK.right, 267.9));
    expect(past.nx).toBeCloseTo(1, 3);
    expect(past.ny).toBeLessThan(0);
    expect(past.gap).toBeCloseTo(0, 3);
  });

  it("parts a deep overlap along the axis that overlaps least", () => {
    expect(separation(at(100, 200), at(130, 205))).toEqual({ nx: 1, ny: 0, gap: -18 });
    expect(separation(at(100, 200), at(100, 200))).toEqual({ nx: 1, ny: 0, gap: -SIZE });
  });

  it("makes a lifted logo's shape bigger about its centre", () => {
    const lifted = tileShape(100, 100, SIZE, RADIUS, LIFT_SCALE);
    expect(lifted.cx).toBe(124);
    expect(lifted.hx + lifted.r).toBeCloseTo((SIZE / 2) * LIFT_SCALE, 10);
    expect(lifted.r).toBeCloseTo(RADIUS * LIFT_SCALE, 10);
  });
});

describe("bounceAxis", () => {
  it("leaves a logo between the walls alone", () => {
    expect(bounceAxis(50, -30, 0, 100)).toEqual({ position: 50, velocity: -30, hit: false });
  });

  it("reflects a logo past a wall back inside at the same speed, like the DVD logo", () => {
    expect(bounceAxis(-10, -200, 0, 100)).toEqual({ position: 10, velocity: 200, hit: true });
    expect(bounceAxis(110, 200, 0, 100)).toEqual({ position: 90, velocity: -200, hit: true });
  });

  it("never lands past the far wall, even from a huge overshoot", () => {
    expect(bounceAxis(-5000, -9000, 0, 100).position).toBe(100);
    expect(bounceAxis(5000, 9000, 0, 100).position).toBe(0);
  });

  it("pins a logo with no room to move", () => {
    expect(bounceAxis(30, 50, 10, 5)).toEqual({ position: 10, velocity: 0, hit: false });
  });
});

describe("limitSpeed and fling", () => {
  it("caps a speed and keeps its direction", () => {
    const capped = limitSpeed(600, 800, 100);
    expect(speed(capped)).toBeCloseTo(100, 6);
    expect(capped.vy / capped.vx).toBeCloseTo(800 / 600, 6);
    expect(limitSpeed(30, 40, 100)).toEqual({ vx: 30, vy: 40 });
    expect(limitSpeed(Number.NaN, 4, 100)).toEqual({ vx: 0, vy: 0 });
  });

  it("caps a fling at MAX_SPEED", () => {
    expect(speed(fling(6000, 8000))).toBeCloseTo(MAX_SPEED, 6);
    expect(fling(30, 40)).toEqual({ vx: 30, vy: 40 });
  });
});

describe("toCruise", () => {
  it("eases a fast logo down to the cruise without changing its direction or dropping below it", () => {
    let velocity = { vx: 1800, vy: -1350 };
    const speeds: number[] = [];
    for (let frame = 0; frame < 120; frame += 1) {
      velocity = toCruise(velocity.vx, velocity.vy, 1 / 60, 0);
      speeds.push(speed(velocity));
    }
    expect(speeds.every((value, index) => index === 0 || value <= speeds[index - 1]!)).toBe(true);
    expect(Math.min(...speeds)).toBeGreaterThanOrEqual(CRUISE_SPEED);
    expect(speeds.at(-1)).toBeCloseTo(CRUISE_SPEED, 0);
    expect(velocity.vy / velocity.vx).toBeCloseTo(-0.75, 6);
  });

  it("speeds a slow logo up to the cruise, and sets one at rest off along its heading", () => {
    let slow = { vx: 6, vy: 8 };
    let rest = { vx: 0, vy: 0 };
    for (let frame = 0; frame < 120; frame += 1) {
      slow = toCruise(slow.vx, slow.vy, 1 / 60, 0);
      rest = toCruise(rest.vx, rest.vy, 1 / 60, (3 * Math.PI) / 4);
    }
    expect(speed(slow)).toBeCloseTo(CRUISE_SPEED, 0);
    expect(slow.vy / slow.vx).toBeCloseTo(8 / 6, 9);
    expect(rest.vx).toBeCloseTo(-CRUISE_SPEED * Math.SQRT1_2, 0);
    expect(rest.vy).toBeCloseTo(CRUISE_SPEED * Math.SQRT1_2, 0);
  });

  it("turns a flat or upright heading toward the diagonal within a third of a second, keeping its way", () => {
    for (const start of [{ vx: -CRUISE_SPEED, vy: 0 }, { vx: 3, vy: -CRUISE_SPEED }, { vx: CRUISE_SPEED, vy: 5 }]) {
      let velocity = start;
      for (let frame = 0; frame < 20; frame += 1) velocity = toCruise(velocity.vx, velocity.vy, 1 / 60, 0);
      const tilt = Math.atan2(Math.abs(velocity.vy), Math.abs(velocity.vx));
      expect(Math.min(tilt, Math.PI / 2 - tilt)).toBeCloseTo(MIN_TILT, 9);
      expect(Math.sign(velocity.vx)).toBe(start.vx < 0 ? -1 : 1);
      expect(Math.sign(velocity.vy)).toBe(start.vy < 0 ? -1 : 1);
      expect(speed(velocity)).toBeCloseTo(CRUISE_SPEED, 1);
    }
    // A diagonal-ish heading is left alone.
    const diagonal = toCruise(48, -40, 1 / 60, 0);
    expect(diagonal.vy / diagonal.vx).toBeCloseTo(-40 / 48, 12);
  });
});

describe("leaveBox (placing logos clear of the middle)", () => {
  const box: Box = { left: 100, top: 100, right: 200, bottom: 200 };

  it("leaves a logo clear of the box alone", () => {
    const motion = { x: 40, y: 40, vx: 5, vy: 5 };
    expect(leaveBox(motion, 50, box)).toBe(motion);
    expect(leaveBox({ x: 50, y: 120, vx: 5, vy: 0 }, 50, box)).toEqual({ x: 50, y: 120, vx: 5, vy: 0 });
  });

  it("pushes a logo out of the nearest side, heading away", () => {
    expect(leaveBox({ x: 60, y: 130, vx: 40, vy: 3 }, 50, box)).toEqual({ x: 50, y: 130, vx: -40, vy: 3 });
    expect(leaveBox({ x: 190, y: 130, vx: -40, vy: 3 }, 50, box)).toEqual({ x: 200, y: 130, vx: 40, vy: 3 });
    expect(leaveBox({ x: 130, y: 55, vx: 2, vy: 40 }, 50, box)).toEqual({ x: 130, y: 50, vx: 2, vy: -40 });
    expect(leaveBox({ x: 130, y: 195, vx: 2, vy: -40 }, 50, box)).toEqual({ x: 130, y: 200, vx: 2, vy: 40 });
  });
});

describe("leaveBlock (the mark)", () => {
  it("leaves a logo that doesn't touch it alone", () => {
    expect(leaveBlock({ x: MARK.left - SIZE - 1, y: 330, vx: 50, vy: 0 }, SIZE, RADIUS, MARK)).toMatchObject({ x: MARK.left - SIZE - 1, vx: 50, hit: 0 });
    // Diagonally off its corner, with the boxes overlapping, the rounded corners still don't touch.
    expect(leaveBlock({ x: MARK.left - SIZE + 3, y: MARK.top - SIZE + 3, vx: 50, vy: 50 }, SIZE, RADIUS, MARK).hit).toBe(0);
  });

  it("stops a logo against a flat side, just touching, and bounces it off at the same speed", () => {
    const off = leaveBlock({ x: MARK.left - SIZE + 2, y: 330, vx: 300, vy: 40 }, SIZE, RADIUS, MARK);
    expect(off).toEqual({ x: MARK.left - SIZE, y: 330, vx: -300, vy: 40, hit: 300, nx: 1, ny: -0 });
    expect(markGap(off)).toBeCloseTo(0, 10);
  });

  it("bounces a logo off a rounded corner along the diagonal, just touching", () => {
    const t = 6;
    const off = leaveBlock({ x: MARK.left - SIZE + t, y: MARK.top - SIZE + t, vx: 200, vy: 200 }, SIZE, RADIUS, MARK);
    expect(markGap(off)).toBeCloseTo(0, 10);
    expect(off.vx).toBeCloseTo(-200, 10);
    expect(off.vy).toBeCloseTo(-200, 10);
    expect(off.hit).toBeCloseTo(200 * Math.SQRT2, 10);
    expect(off.nx).toBeCloseTo(Math.SQRT1_2, 10);
    expect(off.ny).toBeCloseTo(Math.SQRT1_2, 10);
  });

  it("glances a logo off a corner it only clips, turning it rather than sending it back", () => {
    const off = leaveBlock({ x: MARK.left - SIZE + 4, y: MARK.top - SIZE + 10, vx: 200, vy: 0 }, SIZE, RADIUS, MARK);
    expect(markGap(off)).toBeCloseTo(0, 10);
    expect(off.vy).toBeLessThan(0);
    expect(speed(off)).toBeCloseTo(200, 10);
  });
});

describe("dragTo", () => {
  const screen: Box = { left: 0, top: 0, right: 400, bottom: 800 };
  const block: Block = { left: 100, top: 300, right: 300, bottom: 500, radius: 8 };
  const world: World = { size: 50, radius: 8, bounds: screen, block, cover: null };
  const lift = ((LIFT_SCALE - 1) * 50) / 2;
  const liftedGap = (at: { x: number; y: number }) => separation(blockShape(block), tileShape(at.x, at.y, 50, 8, LIFT_SCALE)).gap;

  it("follows the finger where nothing is in the way", () => {
    expect(dragTo({ x: 20, y: 40 }, { x: 30, y: -10 }, { x: 25, y: 35 }, world)).toEqual({ at: { x: 50, y: 30 }, anchor: { x: 20, y: 40 } });
  });

  it("stops at the screen's edge (lifted) and follows again as soon as the finger turns back", () => {
    const pushed = dragTo({ x: 300, y: 40 }, { x: 200, y: 0 }, { x: 340, y: 40 }, { ...world, block: null });
    expect(pushed.at).toEqual({ x: 350 - lift, y: 40 });
    const back = dragTo(pushed.anchor, { x: 190, y: 0 }, pushed.at, { ...world, block: null });
    expect(back.at.x).toBeCloseTo(340 - lift, 10);
  });

  it("never jumps across the mark or into it, however far the finger goes", () => {
    let anchor = { x: 40, y: 380 };
    let at = { x: 40, y: 380 };
    const path: { x: number; y: number }[] = [];
    for (let i = 1; i <= 40; i += 1) path.push({ x: i * 10, y: 0 });
    for (let i = 1; i <= 30; i += 1) path.push({ x: 400, y: -i * 10 });
    for (let i = 1; i <= 30; i += 1) path.push({ x: 400 + i * 10, y: -300 });
    let previous = { x: 0, y: 0 };
    for (const travel of path) {
      const moved = dragTo(anchor, travel, at, world);
      expect(Math.hypot(moved.at.x - at.x, moved.at.y - at.y)).toBeLessThanOrEqual(Math.hypot(travel.x - previous.x, travel.y - previous.y) + 0.5);
      expect(liftedGap(moved.at)).toBeGreaterThanOrEqual(-1e-6);
      anchor = moved.anchor;
      at = moved.at;
      previous = travel;
    }
    expect(at.y + 50 + lift).toBeLessThanOrEqual(block.top + 1e-6);
    expect(at.x).toBeGreaterThan(block.left);
  });

  it("slides a held logo round the mark's rounded corner, touching it all the way", () => {
    // Dragged straight right with its bottom just below the mark's top edge: it meets the rounded corner, rides up
    // over it and carries on along the top.
    let anchor = { x: 20, y: block.top - 46 };
    let at = { ...anchor };
    let touching = 0;
    for (let i = 1; i <= 30; i += 1) {
      const moved = dragTo(anchor, { x: i * 6, y: 0 }, at, world);
      const between = liftedGap(moved.at);
      expect(between).toBeGreaterThanOrEqual(-1e-6);
      if (between < 0.01) touching += 1;
      anchor = moved.anchor;
      at = moved.at;
    }
    expect(touching).toBeGreaterThan(5);
    expect(at.x).toBeGreaterThan(block.left);
    expect(at.y + 25 + 25 * LIFT_SCALE).toBeCloseTo(block.top, 6);
  });
});

describe("collidePair (logo on logo)", () => {
  const energy = (bodies: Body[]) => bodies.reduce((sum, b) => sum + b.vx ** 2 + b.vy ** 2, 0);
  const momentum = (bodies: Body[]) => bodies.reduce((sum, b) => ({ x: sum.x + b.vx, y: sum.y + b.vy }), { x: 0, y: 0 });

  it("leaves logos that don't touch alone, including corners whose boxes overlap but whose rounded corners don't", () => {
    expect(collidePair(body(0, 0, 10, 0), body(SIZE, 0, -10, 0), SIZE, RADIUS)).toBeNull();
    expect(collidePair(body(0, 0, 10, 0), body(100, 100, -10, 0), SIZE, RADIUS)).toBeNull();
    expect(collidePair(body(100, 100, 50, 50), body(100 + SIZE - 3, 100 + SIZE - 3, -50, -50), SIZE, RADIUS)).toBeNull();
  });

  it("swaps the speeds of a head-on hit, so the speed sum is kept", () => {
    const [a, b] = collidePair(body(100, 200, 300, 0), body(140, 200, -100, 0), SIZE, RADIUS)!;
    expect(a!.vx).toBe(-100);
    expect(b!.vx).toBe(300);
    expect(speed(a!) + speed(b!)).toBeCloseTo(400, 10);
  });

  it("keeps momentum and energy in a glancing hit, swapping only the speeds along the contact", () => {
    const before = [body(100, 200, 120, 40), body(140, 210, -60, -30)];
    const after = collidePair(before[0]!, before[1]!, SIZE, RADIUS)!;
    expect(energy(after)).toBeCloseTo(energy(before), 9);
    expect(momentum(after).x).toBeCloseTo(momentum(before).x, 9);
    expect(momentum(after).y).toBeCloseTo(momentum(before).y, 9);
    // Side to side, so only the x speeds swap.
    expect(after.map((b) => [b.vx, b.vy])).toEqual([[-60, 40], [120, -30]]);
  });

  it("resolves a corner-to-corner hit along the diagonal, leaving them just touching", () => {
    const before = [body(100, 100, 100, 100), body(142, 142, -100, -100)];
    expect(gap(before[0]!, before[1]!)).toBeLessThan(-1);
    const after = collidePair(before[0]!, before[1]!, SIZE, RADIUS)!;
    expect(gap(after[0]!, after[1]!)).toBeCloseTo(0, 9);
    expect(after[0]!.vx).toBeCloseTo(-100, 9);
    expect(after[0]!.vy).toBeCloseTo(-100, 9);
    expect(after[1]!.vx).toBeCloseTo(100, 9);
    expect(after[1]!.vy).toBeCloseTo(100, 9);
  });

  it("deflects a logo that clips another's corner, keeping momentum and energy", () => {
    const before = [body(100, 100, 200, 0), body(142, 144, 0, 0)];
    const after = collidePair(before[0]!, before[1]!, SIZE, RADIUS)!;
    expect(gap(after[0]!, after[1]!)).toBeCloseTo(0, 9);
    // The corner sends the one at rest off down and right, and turns the moving one up.
    expect(after[1]!.vx).toBeGreaterThan(0);
    expect(after[1]!.vy).toBeGreaterThan(0);
    expect(after[0]!.vy).toBeLessThan(0);
    expect(energy(after)).toBeCloseTo(energy(before), 9);
    expect(momentum(after).x).toBeCloseTo(momentum(before).x, 9);
    expect(momentum(after).y).toBeCloseTo(momentum(before).y, 9);
  });

  it("pushes overlapping logos apart until they just touch, so they never stick", () => {
    const [a, b] = collidePair(body(100, 200, 50, 0), body(130, 205, 50, 0), SIZE, RADIUS)!;
    expect(gap(a!, b!)).toBeCloseTo(0, 9);
    // Moving the same way, they aren't closing: they separate without changing speed.
    expect([a!.vx, b!.vx]).toEqual([50, 50]);
    // Even two logos in the same spot come apart.
    const [c, d] = collidePair(body(100, 200, 0, 0), body(100, 200, 0, 0), SIZE, RADIUS)!;
    expect(gap(c!, d!)).toBeCloseTo(0, 9);
  });

  it("treats a held logo as a wall at its lifted size: it doesn't move and the other bounces straight off", () => {
    const held = body(100, 200, 999, 999, { held: true });
    const [a, b] = collidePair(held, body(130, 200, -200, 15), SIZE, RADIUS)!;
    expect(a).toMatchObject({ x: 100, y: 200, vx: 999, vy: 999, held: true });
    expect(b!.x + SIZE / 2 - (held.x + SIZE / 2)).toBeCloseTo((SIZE / 2) * (1 + LIFT_SCALE), 9);
    expect(gap(a!, b!)).toBeCloseTo(0, 9);
    expect(b!.vx).toBe(200);
    expect(b!.vy).toBe(15);
    const [c, d] = collidePair(body(70, 200, 200, 0), held, SIZE, RADIUS)!;
    expect(d).toMatchObject({ x: 100, y: 200, held: true });
    expect(gap(c!, d!)).toBeCloseTo(0, 9);
    expect(c!.vx).toBe(-200);
    expect(collidePair(held, body(110, 200, 0, 0, { held: true }), SIZE, RADIUS)).toBeNull();
  });

  it("squashes both logos against each other, hard hits fully and soft ones barely", () => {
    const [a, b] = collidePair(body(100, 200, 500, 0), body(140, 200, -500, 0), SIZE, RADIUS)!;
    expect(1 + a!.sq).toBeCloseTo(SQUASH_SCALE, 10);
    expect(1 + b!.sq).toBeCloseTo(SQUASH_SCALE, 10);
    // Each squashes toward the other.
    expect(a!.sqa).toBeCloseTo(0, 10);
    expect(Math.abs(b!.sqa)).toBeCloseTo(Math.PI, 10);
    const [c] = collidePair(body(100, 200, CRUISE_SPEED, 0), body(140, 200, -CRUISE_SPEED, 0), SIZE, RADIUS)!;
    expect(1 + c!.sq).toBeGreaterThan(0.97);
    expect(c!.sq).toBeLessThan(0);
    // Not closing: no squash.
    const [e] = collidePair(body(100, 200, 50, 0), body(130, 205, 50, 0), SIZE, RADIUS)!;
    expect(e!.sq).toBe(0);
  });
});

describe("stepWorld", () => {
  it("cruises a logo in a straight line at a steady speed", () => {
    const v = CRUISE_SPEED * Math.SQRT1_2;
    const [next] = stepWorld([body(100, 100, v, -v)], 1 / 60, OPEN);
    expect(next!.x).toBeCloseTo(100 + v / 60, 9);
    expect(next!.y).toBeCloseTo(100 - v / 60, 9);
    expect(speed(next!)).toBeCloseTo(CRUISE_SPEED, 9);
    expect(next!.vy / next!.vx).toBeCloseTo(-1, 12);
  });

  it("bounces off the screen's edges at the same speed and stays on screen", () => {
    const start = body(PHONE.right - SIZE - 1, 300, CRUISE_SPEED * 0.6, CRUISE_SPEED * 0.8);
    const [next] = stepWorld([start], 1 / 30, OPEN);
    expect(next!.vx).toBeLessThan(0);
    expect(next!.vy).toBeGreaterThan(0);
    expect(speed(next!)).toBeCloseTo(CRUISE_SPEED, 6);
    run([start], 30, OPEN, ([b]) => {
      expect(onScreen(b!)).toBe(true);
      expect(speed(b!)).toBeCloseTo(CRUISE_SPEED, 6);
    });
  });

  it("bounces a logo off a screen corner from both edges in the same step, then moves straight away", () => {
    const start = body(PHONE.right - SIZE - 1, PHONE.top + 1, 400, -400);
    const [hit] = stepWorld([start], 1 / 60, OPEN);
    expect(hit!.vx).toBeLessThan(0);
    expect(hit!.vy).toBeGreaterThan(0);
    expect(Math.abs(hit!.vx)).toBeCloseTo(Math.abs(hit!.vy), 9);
    expect(onScreen(hit!)).toBe(true);
    // Lit by the hit (and fading from the step it hit in).
    expect(hit!.glow).toBeGreaterThan(0.95);
    // It squashes into the corner along the diagonal.
    expect(hit!.sqa).toBeCloseTo(-Math.PI / 4, 9);
    expect(hit!.sq).toBeLessThan(-0.05);
    // No sticking or jitter: every frame after, it's further from the corner, heading the same way.
    const corner = { x: PHONE.right - SIZE, y: PHONE.top };
    let last = Math.hypot(hit!.x - corner.x, hit!.y - corner.y);
    run([hit!], 0.5, OPEN, ([b]) => {
      const distance = Math.hypot(b!.x - corner.x, b!.y - corner.y);
      expect(distance).toBeGreaterThan(last);
      expect(b!.vx).toBeLessThan(0);
      expect(b!.vy).toBeGreaterThan(0);
      expect(onScreen(b!)).toBe(true);
      last = distance;
    });
  });

  it("bounces off the mark from every side and never overlaps it", () => {
    const starts = [
      body(MARK.left - SIZE - 2, 330, CRUISE_SPEED, 0),
      body(MARK.right + 2, 330, -CRUISE_SPEED, 0),
      body(180, MARK.top - SIZE - 2, 0, CRUISE_SPEED),
      body(180, MARK.bottom + 2, 0, -CRUISE_SPEED),
      // Straight at its corners.
      body(MARK.left - SIZE - 2, MARK.top - SIZE - 2, CRUISE_SPEED, CRUISE_SPEED),
      body(MARK.right + 2, MARK.bottom + 2, -CRUISE_SPEED, -CRUISE_SPEED),
    ];
    for (const start of starts) {
      const [after] = run([start], 0.5, WORLD, ([b]) => expect(markGap(b!)).toBeGreaterThanOrEqual(-1e-6));
      expect(after!.vx * start.vx + after!.vy * start.vy).toBeLessThan(0);
    }
  });

  it("moves at most one short frame after a stall", () => {
    const [next] = stepWorld([body(100, 100, 300, 0)], 2, OPEN);
    expect(next!.x - 100).toBeLessThanOrEqual(300 * MAX_STEP_S);
  });

  it("flings a released logo at the capped speed, then eases it back to the cruise within about a second", () => {
    const thrown = throwBody(pickUp([body(200, 100, CRUISE_SPEED, 0)], 0), 0, 6000, 8000);
    expect(thrown[0]!.held).toBe(false);
    expect(speed(thrown[0]!)).toBeCloseTo(MAX_SPEED, 6);
    const later = run(thrown, 1, WORLD)[0]!;
    expect(speed(later)).toBeLessThan(CRUISE_SPEED * 1.4);
    expect(speed(run([later], 1, WORLD)[0]!)).toBeCloseTo(CRUISE_SPEED, 0);
  });

  it("keeps eight logos apart, on screen and out of the mark, through flings and a burst", () => {
    const home = ringLayout(8, SIZE, PHONE, { left: 70, top: 280, right: 342, bottom: 620 });
    let bodies = launch(home);
    bodies = throwBody(bodies, 0, 2400, -1800);
    bodies = throwBody(bodies, 3, -2000, 2000);
    const check = (list: Body[]) => {
      for (let i = 0; i < list.length; i += 1) {
        expect(onScreen(list[i]!)).toBe(true);
        expect(markGap(list[i]!)).toBeGreaterThan(-0.5);
        for (let j = i + 1; j < list.length; j += 1) expect(gap(list[i]!, list[j]!)).toBeGreaterThan(-0.5);
      }
    };
    bodies = run(bodies, 5, WORLD, check);
    bodies = kick(bodies, { x: (MARK.left + MARK.right) / 2, y: (MARK.top + MARK.bottom) / 2 }, SIZE);
    bodies = run(bodies, 10, WORLD, check);
    // Back to cruising once it settles (each new bump swaps speeds for a moment, then eases back).
    const speeds = bodies.map(speed);
    expect(speeds.reduce((sum, value) => sum + value, 0) / speeds.length).toBeCloseTo(CRUISE_SPEED, -1);
    expect(Math.max(...speeds)).toBeLessThan(CRUISE_SPEED * 2);
  });

  it("lets every logo travel round the mark on a 360 × 780 phone, gliding under the text", () => {
    // A 360 dp phone with a 24 dp status bar and a 48 dp navigation bar: 44 pt logos and a 108 pt mark, with the
    // version and catalogue line under it (as wide as the catalogue line) and a ring round both. Only the mark is
    // solid. How long each logo takes to first get round is chance, DVD style (half of them within about 17 s on
    // phones like this); every one gets round within two minutes, and they keep crossing.
    const bounds: Box = { left: 8, top: 32, right: 352, bottom: 724 };
    const mark: Block = { left: 126, top: 243, right: 234, bottom: 351, radius: 8 };
    const text: Box = { left: 50, top: 375, right: 310, bottom: 514 };
    const world: World = { size: 44, radius: 8, bounds, block: mark, cover: text };
    const half = 390;
    let bodies = launch(ringLayout(8, 44, bounds, { left: 38, top: 231, right: 322, bottom: 526 }));
    const above = bodies.map(() => -1);
    const below = bodies.map(() => -1);
    const side = bodies.map((b) => b.y + 22 < half);
    let crossings = 0;
    let underText = 0;
    let frame = 0;
    run(bodies, 120, world, (list) => {
      frame += 1;
      list.forEach((b, index) => {
        const top = b.y + 22 < half;
        if (top && above[index]! < 0) above[index] = frame / 60;
        if (!top && below[index]! < 0) below[index] = frame / 60;
        if (top !== side[index]) crossings += 1;
        side[index] = top;
        if (coverage(b.x, b.y, 44, text) > 0.5) underText += 1;
        expect(separation(blockShape(mark), tileShape(b.x, b.y, 44, 8, 1)).gap).toBeGreaterThan(-0.5);
        expect(onScreen(b, bounds, 44)).toBe(true);
      });
      bodies = list;
    });
    const roundBy = above.map((t, index) => Math.max(t, below[index]!));
    expect(roundBy.every((t) => t > 0 && t <= 120)).toBe(true);
    expect(roundBy.filter((t) => t <= 30).length).toBeGreaterThanOrEqual(6);
    // About four crossings per logo per minute.
    expect(crossings / 8 / 2).toBeGreaterThan(3);
    expect(underText).toBeGreaterThan(0);
  });

  it("lights a logo that hits a corner exactly, and the tint fades", () => {
    const [hit] = stepWorld([body(PHONE.right - SIZE - 0.5, PHONE.top + 0.5, 60, -60)], 1 / 60, OPEN);
    expect(hit!.glow).toBe(1);
    expect(stepWorld([body(PHONE.right - SIZE - 0.5, 400, 60, -60)], 1 / 60, OPEN)[0]!.glow).toBe(0);
    const faded = run([body(200, 400, CRUISE_SPEED, 0, { glow: 1 })], 1, OPEN)[0]!;
    expect(faded.glow).toBeGreaterThan(0);
    expect(faded.glow).toBeLessThan(0.5);
  });
});

describe("stretch", () => {
  it("grows with speed, in proportion at first, and never past MAX_STRETCH", () => {
    expect(stretchFactor(0)).toBe(1);
    expect(stretchFactor(-20)).toBe(1);
    expect(stretchFactor(10)).toBeCloseTo(1 + STRETCH_PER_SPEED * 10, 6);
    const speeds = [0, 100, 300, 600, 1000, 1600, 2400, 5000, 1e9];
    const factors = speeds.map(stretchFactor);
    expect(factors.every((value, index) => index === 0 || value > factors[index - 1]!)).toBe(true);
    expect(Math.max(...factors)).toBeLessThanOrEqual(MAX_STRETCH);
    expect(stretchFactor(MAX_SPEED)).toBeGreaterThan(1.28);
  });

  it("keeps the area: along × across is 1 however stretch and squash combine", () => {
    const states: Partial<Body>[] = [
      { sa: 0.2, sb: 0 },
      { sa: 0.1, sb: -0.15, sq: -0.18, sqa: 1.1 },
      { sq: -0.1, sqa: -Math.PI / 4 },
      { sa: -0.05, sb: 0.2, sq: 0.04, sqa: 2.5 },
    ];
    for (const state of states) {
      const drawn = deformation(body(0, 0, 0, 0, state), SIZE, RADIUS);
      expect(drawn.along * drawn.across).toBeCloseTo(1, 12);
      expect(drawn.along).toBeGreaterThanOrEqual(1);
    }
  });

  it("isn't there at the cruise", () => {
    const [cruising] = run([body(100, 300, CRUISE_SPEED * 0.6, CRUISE_SPEED * 0.8)], 2, OPEN);
    expect(deformation(cruising!, SIZE, RADIUS)).toMatchObject({ along: 1, across: 1, dx: 0, dy: 0 });
  });

  it("stretches a flung logo along its motion, capped, then relaxes as it slows", () => {
    let bodies = [body(100, 400, 2000, -1000)];
    bodies = run(bodies, 0.1, OPEN);
    const fast = bodies[0]!;
    const drawn = deformation(fast, SIZE, RADIUS);
    expect(drawn.along).toBeGreaterThan(1.15);
    expect(drawn.along).toBeLessThanOrEqual(MAX_STRETCH);
    // Along its velocity (an axis, so either way along it).
    const heading = Math.atan2(fast.vy, fast.vx);
    expect(Math.abs(Math.sin(drawn.angle - heading))).toBeLessThan(0.05);
    const slow = run(bodies, 2, OPEN)[0]!;
    expect(deformation(slow, SIZE, RADIUS).along).toBeLessThan(1.01);
  });

  it("stretches a dragged logo along the drag with the finger's speed, and rounds it again when the finger stops", () => {
    let bodies = pickUp([body(60, 300, CRUISE_SPEED, 0)], 0);
    // 1,000 pt/s to the right, down a little.
    for (let frame = 1; frame <= 18; frame += 1) {
      bodies = holdAt(bodies, 0, { x: 60 + (frame * 1000) / 60, y: 300 + (frame * 200) / 60 });
      bodies = stepWorld(bodies, 1 / 60, OPEN);
    }
    const dragged = deformation(bodies[0]!, SIZE, RADIUS);
    expect(dragged.along).toBeCloseTo(stretchFactor(Math.hypot(1000, 200)), 2);
    expect(Math.abs(Math.sin(dragged.angle - Math.atan2(200, 1000)))).toBeLessThan(0.01);
    bodies = run(bodies, 0.3, OPEN);
    expect(deformation(bodies[0]!, SIZE, RADIUS).along).toBeLessThan(1.01);
  });

  it("doesn't flicker when the finger's moves arrive unevenly", () => {
    let bodies = pickUp([body(60, 300, 0, 0)], 0);
    let x = 60;
    const along: number[] = [];
    for (let frame = 0; frame < 40; frame += 1) {
      // 1,000 pt/s on average, but alternately nothing and two frames' worth.
      x += frame % 2 === 0 ? 0 : 2000 / 60;
      bodies = stepWorld(holdAt(bodies, 0, { x, y: 300 }), 1 / 60, { ...OPEN, bounds: { ...PHONE, right: 2000 } });
      along.push(deformation(bodies[0]!, SIZE, RADIUS).along);
    }
    const settled = along.slice(20);
    for (let i = 1; i < settled.length; i += 1) expect(Math.abs(settled[i]! - settled[i - 1]!)).toBeLessThan(0.05);
  });
});

describe("squash", () => {
  it("is nothing for soft touches and SQUASH_SCALE for hard hits", () => {
    expect(squashAmount(0)).toBe(0);
    expect(squashAmount(20)).toBe(0);
    expect(squashAmount(CRUISE_SPEED)).toBeLessThan(0.01);
    expect(1 - squashAmount(5000)).toBeCloseTo(SQUASH_SCALE, 10);
  });

  it("springs back to 1 with one slight wobble, settled within 0.35 s", () => {
    let state = { q: SQUASH_SCALE - 1, v: 0 };
    const values: number[] = [];
    for (let step = 0; step < 42; step += 1) {
      state = springStep(state.q, state.v, 1 / 120);
      values.push(1 + state.q);
    }
    // Back past 1 within about 70 ms, a small overshoot, then settled.
    const crossing = values.findIndex((value) => value >= 1);
    expect(crossing / 120).toBeGreaterThan(0.04);
    expect(crossing / 120).toBeLessThan(0.1);
    expect(Math.max(...values)).toBeGreaterThan(1.02);
    expect(Math.max(...values)).toBeLessThan(1.07);
    expect(Math.abs(values.at(-1)! - 1)).toBeLessThan(0.01);
  });

  it("is the same at any frame rate", () => {
    let coarse = { q: -0.18, v: 0 };
    let fine = { q: -0.18, v: 0 };
    for (let step = 0; step < 6; step += 1) coarse = springStep(coarse.q, coarse.v, 1 / 60);
    for (let step = 0; step < 24; step += 1) fine = springStep(fine.q, fine.v, 1 / 240);
    expect(coarse.q).toBeCloseTo(fine.q, 12);
    expect(coarse.v).toBeCloseTo(fine.v, 10);
  });

  it("squashes a logo flung into a wall along the wall's normal, and it settles back to its shape", () => {
    let bodies = [body(PHONE.right - SIZE - 10, 400, 1500, 0)];
    bodies = stepWorld(bodies, 1 / 60, OPEN);
    const hit = bodies[0]!;
    expect(hit.vx).toBeLessThan(0);
    expect(hit.sqa).toBeCloseTo(0, 10);
    const drawn = deformation(hit, SIZE, RADIUS);
    expect(drawn.along * drawn.across).toBeCloseTo(1, 12);
    // Squashed along x, toward the wall it hit.
    expect(Math.abs(Math.sin(drawn.angle - Math.PI / 2))).toBeLessThan(0.01);
    expect(drawn.across).toBeLessThan(0.86);
    bodies = run(bodies, 0.35, OPEN);
    expect(Math.abs(bodies[0]!.sq)).toBeLessThan(0.01);
    // Left alone, it comes to rest exactly.
    let resting = hit;
    for (let step = 0; step < 120; step += 1) resting = relax(resting, 1 / 120, 0, 0);
    expect(resting.sq).toBe(0);
    expect(resting.sqv).toBe(0);
  });

  it("keeps the squashed side where it touched, flat or at a corner", () => {
    // The farthest a sampled outline of the drawn logo reaches along a direction, from its undeformed centre.
    const reach = (state: Partial<Body>, nx: number, ny: number) => {
      const drawn = deformation(body(0, 0, 0, 0, state), SIZE, RADIUS);
      const c = Math.cos(drawn.angle);
      const s = Math.sin(drawn.angle);
      let best = -Infinity;
      for (let corner = 0; corner < 4; corner += 1) {
        const ox = (corner % 2 ? 1 : -1) * (SIZE / 2 - RADIUS);
        const oy = (corner < 2 ? 1 : -1) * (SIZE / 2 - RADIUS);
        for (let k = 0; k <= 720; k += 1) {
          const t = (k / 720) * Math.PI * 2;
          const px = ox + RADIUS * Math.cos(t);
          const py = oy + RADIUS * Math.sin(t);
          // Rotate back, scale along and across the axis, rotate forward, then shift.
          const u = px * c + py * s;
          const v = -px * s + py * c;
          const x = u * drawn.along * c - v * drawn.across * s + drawn.dx;
          const y = u * drawn.along * s + v * drawn.across * c + drawn.dy;
          best = Math.max(best, x * nx + y * ny);
        }
      }
      return best;
    };
    // Against a wall on the right, the right side stays at the wall.
    expect(reach({ sq: SQUASH_SCALE - 1, sqa: 0 }, 1, 0)).toBeCloseTo(SIZE / 2, 3);
    // Into a top-right corner, the corner stays in the corner.
    const n = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
    const undeformed = (SIZE / 2 - RADIUS) * Math.SQRT2 + RADIUS;
    expect(reach({ sq: SQUASH_SCALE - 1, sqa: -Math.PI / 4 }, n.x, n.y)).toBeCloseTo(undeformed, 3);
  });

  it("relaxes a logo's jelly without moving it", () => {
    const squashed = body(100, 200, CRUISE_SPEED, 0, { sq: -0.1, sqa: 0.5 });
    const next = relax(squashed, 1 / 60, 0, 0);
    expect(next).toMatchObject({ x: 100, y: 200, vx: CRUISE_SPEED, vy: 0, sqa: 0.5 });
    expect(next.sq).toBeGreaterThan(-0.1);
  });
});

describe("coverage (fading under the text)", () => {
  const text: Box = { left: 100, top: 100, right: 300, bottom: 200 };

  it("is how much of a logo is under the text, by area", () => {
    expect(coverage(0, 0, 50, text)).toBe(0);
    expect(coverage(150, 120, 50, text)).toBe(1);
    expect(coverage(75, 120, 50, text)).toBe(0.5);
    expect(coverage(75, 75, 50, text)).toBe(0.25);
    expect(coverage(150, 120, 50, null)).toBe(0);
  });
});

describe("holding a logo", () => {
  it("stops it under the finger, moves it with the finger, and others bounce off its lifted edge", () => {
    // The free one heads straight at the held one's centre.
    let bodies = pickUp([body(200, 100, CRUISE_SPEED, 0), body(100, 50, 160, 120)], 0);
    bodies = holdAt(bodies, 0, { x: 180, y: 110 });
    // It bounces off within a frame, so the closest it's seen at the end of one is within a point, never inside.
    let closest = Infinity;
    bodies = run(bodies, 2, OPEN, (list) => {
      const between = gap(list[0]!, list[1]!);
      expect(between).toBeGreaterThanOrEqual(-1e-9);
      closest = Math.min(closest, between);
    });
    expect(bodies[0]).toMatchObject({ x: 180, y: 110, held: true });
    expect(closest).toBeLessThan(1);
  });

  it("lets a logo carry on as it was after a tap or a hold that didn't move", () => {
    const tapped = letGo(pickUp([body(200, 100, 30, -40)], 0), 0);
    expect(tapped).toEqual([body(200, 100, 30, -40)]);
    const untouched = [body(1, 2, 3, 4)];
    expect(letGo(untouched, 0)).toBe(untouched);
    expect(pickUp(untouched, 5)).toBe(untouched);
  });
});

describe("kick (the burst)", () => {
  it("sends every free logo straight out from the middle, capped, and leaves a held one", () => {
    const centre = { x: 206, y: 450 };
    const bodies = kick([body(300 - SIZE / 2, 450 - SIZE / 2, -CRUISE_SPEED, 0), body(206 - SIZE / 2, 450 - SIZE / 2, 0, 0), body(10, 10, 2400, 0), body(50, 50, 0, 0, { held: true })], centre, SIZE);
    expect(bodies[0]!.vx).toBeCloseTo(BURST_KICK - CRUISE_SPEED, 9);
    expect(bodies[0]!.vy).toBeCloseTo(0, 9);
    // One right on the middle still goes somewhere.
    expect(speed(bodies[1]!)).toBeCloseTo(BURST_KICK, 9);
    expect(speed(bodies[2]!)).toBeLessThanOrEqual(MAX_SPEED + 1e-9);
    expect(bodies[3]).toEqual(body(50, 50, 0, 0, { held: true }));
  });
});

describe("launch", () => {
  it("starts every logo at its place in its own shape, cruising diagonally away from the middle", () => {
    const box = { left: 70, top: 280, right: 342, bottom: 620 };
    const home = ringLayout(8, SIZE, PHONE, box);
    const bodies = launch(home);
    const cx = (box.left + box.right) / 2;
    const cy = (box.top + box.bottom) / 2;
    bodies.forEach((b, index) => {
      expect(b).toMatchObject({ x: home[index]!.x, y: home[index]!.y, px: home[index]!.x, py: home[index]!.y, held: false, glow: 0, sa: 0, sb: 0, sq: 0, sqv: 0 });
      expect(speed(b)).toBeCloseTo(CRUISE_SPEED, 9);
      expect(Math.abs(b.vx)).toBeGreaterThan(CRUISE_SPEED * 0.5);
      expect(Math.abs(b.vy)).toBeGreaterThan(CRUISE_SPEED * 0.5);
      expect(Math.sign(b.vx)).toBe(home[index]!.x + SIZE / 2 < cx ? -1 : 1);
      expect(Math.sign(b.vy)).toBe(home[index]!.y + SIZE / 2 < cy ? -1 : 1);
    });
  });
});

describe("ringLayout", () => {
  const overlaps = (point: { x: number; y: number }, size: number, box: Box) => point.x + size > box.left && point.x < box.right && point.y + size > box.top && point.y < box.bottom;

  it.each([
    ["a phone", PHONE, { left: 70, top: 280, right: 342, bottom: 620 }, 48],
    ["a tablet", { left: 8, top: 32, right: 1272, bottom: 792 }, { left: 460, top: 230, right: 820, bottom: 590 }, 56],
    ["a phone on its side", { left: 48, top: 8, right: 860, bottom: 404 }, { left: 320, top: 60, right: 590, bottom: 350 }, 44],
  ])("spreads eight logos evenly round the middle of %s, on screen and clear of it", (_, bounds, box, size) => {
    const points = ringLayout(8, size, bounds, box);
    expect(points).toHaveLength(8);
    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(bounds.left);
      expect(point.x).toBeLessThanOrEqual(bounds.right - size);
      expect(point.y).toBeGreaterThanOrEqual(bounds.top);
      expect(point.y).toBeLessThanOrEqual(bounds.bottom - size);
      expect(overlaps(point, size, box)).toBe(false);
    }
    const steps = points.slice(1).map((point, index) => point.angle - points[index]!.angle);
    for (const gap of steps) expect(gap).toBeCloseTo((Math.PI * 2) / 8, 10);
    expect(new Set(points.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`)).size).toBe(8);
  });
});
