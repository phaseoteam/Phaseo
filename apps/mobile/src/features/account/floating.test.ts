import {
  BURST_KICK, CRUISE_SPEED, MAX_SPEED, MAX_STEP_S, bounceAxis, collideBox, collidePair, dragTo, fling, kick, launch, leaveBox, letGo, limitSpeed, holdAt, pickUp, ringLayout,
  stepWorld, throwBody, toCruise, type Body, type Box, type World,
} from "./floating";

const PHONE: Box = { left: 8, top: 40, right: 404, bottom: 860 };
const BLOCK: Box = { left: 70, top: 280, right: 342, bottom: 620 };
const SIZE = 48;
const WORLD: World = { size: SIZE, bounds: PHONE, box: BLOCK };
const OPEN: World = { size: SIZE, bounds: PHONE, box: null };

const body = (x: number, y: number, vx: number, vy: number, patch: Partial<Body> = {}): Body => ({ x, y, vx, vy, held: false, glow: 0, ...patch });
const speed = (b: { vx: number; vy: number }) => Math.hypot(b.vx, b.vy);
const overlap = (a: Body, b: Body) => Math.min(SIZE - Math.abs(a.x - b.x), SIZE - Math.abs(a.y - b.y));
const inBlock = (b: Body) => b.x + SIZE > BLOCK.left && b.x < BLOCK.right && b.y + SIZE > BLOCK.top && b.y < BLOCK.bottom;
const onScreen = (b: Body) => b.x >= PHONE.left - 1e-9 && b.x <= PHONE.right - SIZE + 1e-9 && b.y >= PHONE.top - 1e-9 && b.y <= PHONE.bottom - SIZE + 1e-9;
function run(bodies: Body[], seconds: number, world: World, each?: (bodies: Body[]) => void) {
  let next = bodies;
  for (let frame = 0; frame < Math.round(seconds * 60); frame += 1) {
    next = stepWorld(next, 1 / 60, world);
    each?.(next);
  }
  return next;
}

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
    let slow = { vx: 10, vy: 0 };
    let rest = { vx: 0, vy: 0 };
    for (let frame = 0; frame < 120; frame += 1) {
      slow = toCruise(slow.vx, slow.vy, 1 / 60, 0);
      rest = toCruise(rest.vx, rest.vy, 1 / 60, Math.PI / 2);
    }
    expect(slow.vx).toBeCloseTo(CRUISE_SPEED, 0);
    expect(rest.vx).toBeCloseTo(0, 6);
    expect(rest.vy).toBeCloseTo(CRUISE_SPEED, 0);
  });
});

describe("leaveBox", () => {
  const box: Box = { left: 100, top: 100, right: 200, bottom: 200 };

  it("leaves a logo clear of the box alone", () => {
    const motion = { x: 40, y: 40, vx: 5, vy: 5 };
    expect(leaveBox(motion, 50, box)).toBe(motion);
    // Touching an edge isn't overlapping.
    expect(leaveBox({ x: 50, y: 120, vx: 5, vy: 0 }, 50, box)).toEqual({ x: 50, y: 120, vx: 5, vy: 0 });
  });

  it("pushes a logo out of the nearest side, heading away", () => {
    expect(leaveBox({ x: 60, y: 130, vx: 40, vy: 3 }, 50, box)).toEqual({ x: 50, y: 130, vx: -40, vy: 3 });
    expect(leaveBox({ x: 190, y: 130, vx: -40, vy: 3 }, 50, box)).toEqual({ x: 200, y: 130, vx: 40, vy: 3 });
    expect(leaveBox({ x: 130, y: 55, vx: 2, vy: 40 }, 50, box)).toEqual({ x: 130, y: 50, vx: 2, vy: -40 });
    expect(leaveBox({ x: 130, y: 195, vx: 2, vy: -40 }, 50, box)).toEqual({ x: 130, y: 200, vx: 2, vy: 40 });
  });
});

describe("collideBox (the middle block)", () => {
  const box: Box = { left: 100, top: 100, right: 200, bottom: 200 };

  it("lets a move that stays clear of the box through", () => {
    const next = { x: 30, y: 30, vx: 5, vy: 5 };
    expect(collideBox({ x: 20, y: 20 }, next, 50, box)).toBe(next);
  });

  it("stops a logo at the side it came in through and bounces it off at the same speed", () => {
    expect(collideBox({ x: 45, y: 130 }, { x: 70, y: 130, vx: 900, vy: 10 }, 50, box)).toEqual({ x: 50, y: 130, vx: -900, vy: 10 });
    expect(collideBox({ x: 205, y: 130 }, { x: 180, y: 130, vx: -900, vy: 10 }, 50, box)).toEqual({ x: 200, y: 130, vx: 900, vy: 10 });
    expect(collideBox({ x: 130, y: 45 }, { x: 130, y: 70, vx: 10, vy: 900 }, 50, box)).toEqual({ x: 130, y: 50, vx: 10, vy: -900 });
    expect(collideBox({ x: 130, y: 205 }, { x: 130, y: 180, vx: 10, vy: -900 }, 50, box)).toEqual({ x: 130, y: 200, vx: 10, vy: 900 });
  });

  it("resolves a corner entry on the axis that crossed last", () => {
    // From above-left: x crossed at 1/3 of the move, y at 4/5, so it hit the top.
    expect(collideBox({ x: 40, y: 10 }, { x: 70, y: 60, vx: 300, vy: 500 }, 50, box)).toEqual({ x: 70, y: 50, vx: 300, vy: -500 });
  });

  it("slides a dragged logo along the edge instead of into the box", () => {
    expect(collideBox({ x: 50, y: 120 }, { x: 90, y: 160, vx: 0, vy: 0 }, 50, box)).toMatchObject({ x: 50, y: 160 });
  });

  it("lets a logo that was already inside leave by the shortest way", () => {
    expect(collideBox({ x: 120, y: 150 }, { x: 110, y: 150, vx: 0, vy: 0 }, 50, box)).toEqual(leaveBox({ x: 110, y: 150, vx: 0, vy: 0 }, 50, box));
  });
});

describe("dragTo", () => {
  const screen: Box = { left: 0, top: 0, right: 400, bottom: 800 };
  const box: Box = { left: 100, top: 300, right: 300, bottom: 500 };

  it("follows the finger where nothing is in the way", () => {
    expect(dragTo({ x: 20, y: 40 }, { x: 30, y: -10 }, { x: 25, y: 35 }, 50, screen, box)).toEqual({ at: { x: 50, y: 30 }, anchor: { x: 20, y: 40 } });
  });

  it("stops at the screen's edge and follows again as soon as the finger turns back", () => {
    const pushed = dragTo({ x: 300, y: 40 }, { x: 200, y: 0 }, { x: 340, y: 40 }, 50, screen, null);
    expect(pushed.at).toEqual({ x: 350, y: 40 });
    const back = dragTo(pushed.anchor, { x: 190, y: 0 }, pushed.at, 50, screen, null);
    expect(back.at).toEqual({ x: 340, y: 40 });
  });

  it("never jumps across the middle, however far the finger goes", () => {
    let anchor = { x: 40, y: 380 };
    let at = { x: 40, y: 380 };
    const path: { x: number; y: number }[] = [];
    for (let i = 1; i <= 40; i += 1) path.push({ x: i * 10, y: 0 });
    for (let i = 1; i <= 30; i += 1) path.push({ x: 400, y: -i * 10 });
    for (let i = 1; i <= 30; i += 1) path.push({ x: 400 + i * 10, y: -300 });
    let previous = { x: 0, y: 0 };
    for (const travel of path) {
      const moved = dragTo(anchor, travel, at, 50, screen, box);
      expect(Math.hypot(moved.at.x - at.x, moved.at.y - at.y)).toBeLessThanOrEqual(Math.hypot(travel.x - previous.x, travel.y - previous.y) + 1e-9);
      expect(moved.at.x + 50 > box.left && moved.at.x < box.right && moved.at.y + 50 > box.top && moved.at.y < box.bottom).toBe(false);
      anchor = moved.anchor;
      at = moved.at;
      previous = travel;
    }
    expect(at.y + 50).toBeLessThanOrEqual(box.top);
    expect(at.x).toBeGreaterThan(box.left);
  });
});

describe("collidePair (logo on logo)", () => {
  const energy = (bodies: Body[]) => bodies.reduce((sum, b) => sum + b.vx ** 2 + b.vy ** 2, 0);
  const momentum = (bodies: Body[]) => bodies.reduce((sum, b) => ({ x: sum.x + b.vx, y: sum.y + b.vy }), { x: 0, y: 0 });

  it("leaves logos that don't touch alone", () => {
    expect(collidePair(body(0, 0, 10, 0), body(SIZE, 0, -10, 0), SIZE)).toBeNull();
    expect(collidePair(body(0, 0, 10, 0), body(100, 100, -10, 0), SIZE)).toBeNull();
  });

  it("swaps the speeds of a head-on hit, so the speed sum is kept", () => {
    const [a, b] = collidePair(body(100, 200, 300, 0), body(140, 200, -100, 0), SIZE)!;
    expect(a!.vx).toBe(-100);
    expect(b!.vx).toBe(300);
    expect(speed(a!) + speed(b!)).toBeCloseTo(400, 10);
  });

  it("keeps momentum and energy in a glancing hit, swapping only the speeds along the contact", () => {
    const before = [body(100, 200, 120, 40), body(140, 210, -60, -30)];
    const after = collidePair(before[0]!, before[1]!, SIZE)!;
    expect(energy(after)).toBeCloseTo(energy(before), 9);
    expect(momentum(after).x).toBeCloseTo(momentum(before).x, 9);
    expect(momentum(after).y).toBeCloseTo(momentum(before).y, 9);
    // They overlap least along x, so only the x speeds swap.
    expect(after.map((b) => [b.vx, b.vy])).toEqual([[-60, 40], [120, -30]]);
  });

  it("pushes overlapping logos apart, so they never stick", () => {
    const [a, b] = collidePair(body(100, 200, 50, 0), body(130, 205, 50, 0), SIZE)!;
    expect(overlap(a!, b!)).toBeLessThanOrEqual(1e-9);
    // Moving the same way, they aren't closing: they separate without changing speed.
    expect([a!.vx, b!.vx]).toEqual([50, 50]);
    // Even two logos in the same spot come apart.
    const [c, d] = collidePair(body(100, 200, 0, 0), body(100, 200, 0, 0), SIZE)!;
    expect(overlap(c!, d!)).toBeLessThanOrEqual(1e-9);
  });

  it("treats a held logo as a wall: it doesn't move and the other bounces straight off", () => {
    const held = body(100, 200, 999, 999, { held: true });
    const [a, b] = collidePair(held, body(130, 200, -200, 15), SIZE)!;
    expect(a).toEqual(held);
    expect(b!.x).toBe(100 + SIZE);
    expect(b!.vx).toBe(200);
    expect(b!.vy).toBe(15);
    const [c, d] = collidePair(body(70, 200, 200, 0), held, SIZE)!;
    expect(d).toEqual(held);
    expect(c!.x).toBe(100 - SIZE);
    expect(c!.vx).toBe(-200);
    expect(collidePair(held, body(110, 200, 0, 0, { held: true }), SIZE)).toBeNull();
  });
});

describe("stepWorld", () => {
  it("cruises a logo in a straight line at a steady speed", () => {
    const [next] = stepWorld([body(100, 100, CRUISE_SPEED, 0)], 1 / 60, OPEN);
    expect(next!.x).toBeCloseTo(100 + CRUISE_SPEED / 60, 9);
    expect(next!.y).toBe(100);
    expect(speed(next!)).toBeCloseTo(CRUISE_SPEED, 9);
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

  it("bounces off the side of the middle block it hits", () => {
    const fromLeft = run([body(BLOCK.left - SIZE - 2, 400, CRUISE_SPEED, 0)], 0.5, WORLD)[0]!;
    expect(fromLeft.vx).toBeLessThan(0);
    expect(fromLeft.x + SIZE).toBeLessThanOrEqual(BLOCK.left);
    const fromAbove = run([body(150, BLOCK.top - SIZE - 2, 0, CRUISE_SPEED)], 0.5, WORLD)[0]!;
    expect(fromAbove.vy).toBeLessThan(0);
    expect(fromAbove.y + SIZE).toBeLessThanOrEqual(BLOCK.top);
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

  it("keeps eight logos apart, on screen and out of the middle, through flings and a burst", () => {
    const home = ringLayout(8, SIZE, PHONE, BLOCK);
    let bodies = launch(home);
    bodies = throwBody(bodies, 0, 2400, -1800);
    bodies = throwBody(bodies, 3, -2000, 2000);
    const check = (list: Body[]) => {
      for (let i = 0; i < list.length; i += 1) {
        expect(onScreen(list[i]!)).toBe(true);
        expect(inBlock(list[i]!)).toBe(false);
        for (let j = i + 1; j < list.length; j += 1) expect(overlap(list[i]!, list[j]!)).toBeLessThan(1);
      }
    };
    bodies = run(bodies, 5, WORLD, check);
    bodies = kick(bodies, { x: (BLOCK.left + BLOCK.right) / 2, y: (BLOCK.top + BLOCK.bottom) / 2 }, SIZE);
    bodies = run(bodies, 10, WORLD, check);
    // Back to cruising once it settles (each new bump swaps speeds for a moment, then eases back).
    const speeds = bodies.map(speed);
    expect(speeds.reduce((sum, value) => sum + value, 0) / speeds.length).toBeCloseTo(CRUISE_SPEED, -1);
    expect(Math.max(...speeds)).toBeLessThan(CRUISE_SPEED * 2);
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

describe("holding a logo", () => {
  it("stops it under the finger, moves it with the finger, and others bounce off it", () => {
    let bodies = pickUp([body(200, 100, CRUISE_SPEED, 0), body(100, 100, CRUISE_SPEED * 2, 0)], 0);
    bodies = holdAt(bodies, 0, { x: 180, y: 110 });
    bodies = run(bodies, 2, OPEN);
    expect(bodies[0]).toMatchObject({ x: 180, y: 110, held: true });
    expect(bodies[1]!.x + SIZE).toBeLessThanOrEqual(180 + 1e-9);
    expect(overlap(bodies[0]!, bodies[1]!)).toBeLessThanOrEqual(1e-9);
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
  it("starts every logo at its place, cruising diagonally away from the middle", () => {
    const home = ringLayout(8, SIZE, PHONE, BLOCK);
    const bodies = launch(home);
    const cx = (BLOCK.left + BLOCK.right) / 2;
    const cy = (BLOCK.top + BLOCK.bottom) / 2;
    bodies.forEach((b, index) => {
      expect(b).toMatchObject({ x: home[index]!.x, y: home[index]!.y, held: false, glow: 0 });
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
    ["a phone", PHONE, BLOCK, 48],
    ["a tablet", { left: 8, top: 32, right: 1272, bottom: 792 }, { left: 460, top: 230, right: 820, bottom: 590 }, 56],
    ["a phone on its side", { left: 48, top: 8, right: 860, bottom: 404 }, { left: 320, top: 60, right: 590, bottom: 350 }, 44],
  ])("spreads eight logos evenly round the middle of %s, on screen and clear of the block", (_, bounds, box, size) => {
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
