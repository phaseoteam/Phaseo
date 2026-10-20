import {
  BURST_PEAK, DRIFT_SPEED, MAX_SPEED, MAX_STEP_S, RESTITUTION, bounceAxis, burstCurve, burstPosition, collideBox, leaveBox, limitSpeed, ringLayout, settle, step,
  type Box, type StepOptions,
} from "./floating";

const PHONE: Box = { left: 8, top: 40, right: 404, bottom: 860 };
const BLOCK: Box = { left: 70, top: 280, right: 342, bottom: 620 };

describe("bounceAxis", () => {
  it("leaves a logo between the walls alone", () => {
    expect(bounceAxis(50, -30, 0, 100)).toEqual({ position: 50, velocity: -30 });
  });

  it("reflects a logo past a wall back inside, heading away and a little slower", () => {
    expect(bounceAxis(-10, -200, 0, 100)).toEqual({ position: 10 * RESTITUTION, velocity: 200 * RESTITUTION });
    expect(bounceAxis(110, 200, 0, 100)).toEqual({ position: 100 - 10 * RESTITUTION, velocity: -200 * RESTITUTION });
  });

  it("never lands past the far wall, even from a huge overshoot", () => {
    expect(bounceAxis(-5000, -9000, 0, 100).position).toBe(100);
    expect(bounceAxis(5000, 9000, 0, 100).position).toBe(0);
  });

  it("pins a logo with no room to move", () => {
    expect(bounceAxis(30, 50, 10, 5)).toEqual({ position: 10, velocity: 0 });
  });
});

describe("settle", () => {
  it("slows a fling toward the drift without changing its direction", () => {
    let velocity = { vx: 1200, vy: -900 };
    const speeds: number[] = [];
    for (let frame = 0; frame < 600; frame += 1) {
      velocity = settle(velocity.vx, velocity.vy, 1 / 60, DRIFT_SPEED, 0);
      speeds.push(Math.hypot(velocity.vx, velocity.vy));
    }
    expect(speeds.every((speed, index) => index === 0 || speed <= speeds[index - 1]!)).toBe(true);
    expect(speeds.at(-1)).toBeGreaterThanOrEqual(DRIFT_SPEED);
    expect(speeds.at(-1)).toBeCloseTo(DRIFT_SPEED, 0);
    expect(velocity.vy / velocity.vx).toBeCloseTo(-0.75, 6);
  });

  it("sets a logo at rest off along its heading", () => {
    let velocity = { vx: 0, vy: 0 };
    for (let frame = 0; frame < 600; frame += 1) velocity = settle(velocity.vx, velocity.vy, 1 / 60, DRIFT_SPEED, Math.PI / 2);
    expect(velocity.vx).toBeCloseTo(0, 6);
    expect(velocity.vy).toBeCloseTo(DRIFT_SPEED, 0);
  });
});

describe("limitSpeed", () => {
  it("caps a fling's speed and keeps its direction", () => {
    const capped = limitSpeed(6000, 8000);
    expect(Math.hypot(capped.vx, capped.vy)).toBeCloseTo(MAX_SPEED, 6);
    expect(capped.vy / capped.vx).toBeCloseTo(8000 / 6000, 6);
    expect(limitSpeed(30, 40)).toEqual({ vx: 30, vy: 40 });
    expect(limitSpeed(Number.NaN, 4)).toEqual({ vx: 0, vy: 0 });
  });
});

describe("leaveBox", () => {
  const box: Box = { left: 100, top: 100, right: 200, bottom: 200 };

  it("leaves a logo clear of the box alone", () => {
    const body = { x: 40, y: 40, vx: 5, vy: 5 };
    expect(leaveBox(body, 50, box)).toBe(body);
    // Touching an edge isn't overlapping.
    expect(leaveBox({ x: 50, y: 120, vx: 5, vy: 0 }, 50, box)).toEqual({ x: 50, y: 120, vx: 5, vy: 0 });
  });

  it("pushes a logo out of the nearest side, heading away", () => {
    expect(leaveBox({ x: 60, y: 130, vx: 40, vy: 3 }, 50, box)).toEqual({ x: 50, y: 130, vx: -40 * RESTITUTION, vy: 3 });
    expect(leaveBox({ x: 190, y: 130, vx: -40, vy: 3 }, 50, box)).toEqual({ x: 200, y: 130, vx: 40 * RESTITUTION, vy: 3 });
    expect(leaveBox({ x: 130, y: 55, vx: 2, vy: 40 }, 50, box)).toEqual({ x: 130, y: 50, vx: 2, vy: -40 * RESTITUTION });
    expect(leaveBox({ x: 130, y: 195, vx: 2, vy: -40 }, 50, box)).toEqual({ x: 130, y: 200, vx: 2, vy: 40 * RESTITUTION });
  });
});

describe("collideBox", () => {
  const box: Box = { left: 100, top: 100, right: 200, bottom: 200 };

  it("lets a move that stays clear of the box through", () => {
    const next = { x: 30, y: 30, vx: 5, vy: 5 };
    expect(collideBox({ x: 20, y: 20 }, next, 50, box)).toBe(next);
  });

  it("stops a logo at the side it came in through and bounces it off", () => {
    expect(collideBox({ x: 45, y: 130 }, { x: 70, y: 130, vx: 900, vy: 10 }, 50, box)).toEqual({ x: 50, y: 130, vx: -900 * RESTITUTION, vy: 10 });
    expect(collideBox({ x: 205, y: 130 }, { x: 180, y: 130, vx: -900, vy: 10 }, 50, box)).toEqual({ x: 200, y: 130, vx: 900 * RESTITUTION, vy: 10 });
    expect(collideBox({ x: 130, y: 45 }, { x: 130, y: 70, vx: 10, vy: 900 }, 50, box)).toEqual({ x: 130, y: 50, vx: 10, vy: -900 * RESTITUTION });
    expect(collideBox({ x: 130, y: 205 }, { x: 130, y: 180, vx: 10, vy: -900 }, 50, box)).toEqual({ x: 130, y: 200, vx: 10, vy: 900 * RESTITUTION });
  });

  it("resolves a corner entry on the axis that crossed last", () => {
    // From above-left: x crossed at 1/3 of the move, y at 4/5, so it hit the top.
    const hit = collideBox({ x: 40, y: 10 }, { x: 70, y: 60, vx: 300, vy: 500 }, 50, box);
    expect(hit).toEqual({ x: 70, y: 50, vx: 300, vy: -500 * RESTITUTION });
  });

  it("slides a dragged logo along the edge instead of into the box", () => {
    // Held against the left side and dragged right and down: it stays on the left, following the finger down.
    expect(collideBox({ x: 50, y: 120 }, { x: 90, y: 160, vx: 0, vy: 0 }, 50, box)).toMatchObject({ x: 50, y: 160 });
  });

  it("lets a logo that was already inside leave by the shortest way", () => {
    expect(collideBox({ x: 120, y: 150 }, { x: 110, y: 150, vx: 0, vy: 0 }, 50, box)).toEqual(leaveBox({ x: 110, y: 150, vx: 0, vy: 0 }, 50, box));
  });
});

describe("step", () => {
  const options: StepOptions = { size: 48, bounds: PHONE, box: BLOCK, drift: DRIFT_SPEED, heading: 0, turn: 0 };

  it("moves a drifting logo by its speed", () => {
    const next = step({ x: 20, y: 60, vx: DRIFT_SPEED, vy: 0 }, 1 / 60, options);
    expect(next.x).toBeCloseTo(20 + DRIFT_SPEED / 60, 6);
    expect(next.y).toBe(60);
  });

  it("moves at most one short step after a stall", () => {
    const next = step({ x: 20, y: 60, vx: 300, vy: 0 }, 2, options);
    expect(next.x - 20).toBeLessThanOrEqual(300 * MAX_STEP_S);
  });

  it("keeps a flung logo on screen and out of the middle, then settles it to the drift", () => {
    let body = { x: 20, y: 60, vx: 2200, vy: 1700 };
    for (let frame = 0; frame < 60 * 8; frame += 1) {
      body = step(body, 1 / 60, { ...options, turn: 0.3 * Math.sin(frame / 40) });
      expect(body.x).toBeGreaterThanOrEqual(PHONE.left);
      expect(body.x).toBeLessThanOrEqual(PHONE.right - 48);
      expect(body.y).toBeGreaterThanOrEqual(PHONE.top);
      expect(body.y).toBeLessThanOrEqual(PHONE.bottom - 48);
      const inside = body.x + 48 > BLOCK.left && body.x < BLOCK.right && body.y + 48 > BLOCK.top && body.y < BLOCK.bottom;
      expect(inside).toBe(false);
    }
    expect(Math.hypot(body.vx, body.vy)).toBeLessThan(DRIFT_SPEED * 1.6);
  });
});

describe("burstCurve", () => {
  it("goes out fast to full reach, then eases back to nothing", () => {
    expect(burstCurve(0)).toBe(0);
    expect(burstCurve(BURST_PEAK)).toBe(1);
    expect(burstCurve(1)).toBeCloseTo(0, 10);
    expect(burstCurve(-1)).toBe(0);
    expect(burstCurve(2)).toBeCloseTo(0, 10);
    const samples = Array.from({ length: 101 }, (_, index) => burstCurve(index / 100));
    const peak = Math.round(BURST_PEAK * 100);
    expect(samples.slice(0, peak + 1).every((value, index, list) => index === 0 || value >= list[index - 1]!)).toBe(true);
    expect(samples.slice(peak).every((value, index, list) => index === 0 || value <= list[index - 1]!)).toBe(true);
  });
});

describe("burstPosition", () => {
  const centre = { x: 206, y: 450 };

  it("pushes a logo straight away from the middle", () => {
    const at = burstPosition({ x: 206 - 24 + 100, y: 450 - 24 }, 48, centre, 50, BURST_PEAK, 0, PHONE);
    expect(at).toEqual({ x: 206 - 24 + 150, y: 450 - 24 });
  });

  it("uses the logo's angle when it sits on the middle, and keeps it on screen", () => {
    const up = burstPosition({ x: 206 - 24, y: 450 - 24 }, 48, centre, 60, BURST_PEAK, -Math.PI / 2, PHONE);
    expect(up.x).toBeCloseTo(206 - 24, 6);
    expect(up.y).toBeCloseTo(450 - 24 - 60, 6);
    const edge = burstPosition({ x: 350, y: 450 - 24 }, 48, centre, 400, BURST_PEAK, 0, PHONE);
    expect(edge.x).toBe(PHONE.right - 48);
  });
});

describe("ringLayout", () => {
  const overlaps = (point: { x: number; y: number }, size: number, box: Box) => point.x + size > box.left && point.x < box.right && point.y + size > box.top && point.y < box.bottom;

  it.each([
    ["a phone", PHONE, BLOCK, 48],
    ["a tablet", { left: 8, top: 32, right: 1272, bottom: 792 }, { left: 460, top: 230, right: 820, bottom: 590 }, 56],
    ["a phone on its side", { left: 48, top: 8, right: 860, bottom: 404 }, { left: 320, top: 60, right: 590, bottom: 350 }, 44],
  ])("spreads twelve logos evenly round the middle of %s, on screen and clear of the block", (_, bounds, box, size) => {
    const points = ringLayout(12, size, bounds, box);
    expect(points).toHaveLength(12);
    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(bounds.left);
      expect(point.x).toBeLessThanOrEqual(bounds.right - size);
      expect(point.y).toBeGreaterThanOrEqual(bounds.top);
      expect(point.y).toBeLessThanOrEqual(bounds.bottom - size);
      expect(overlaps(point, size, box)).toBe(false);
    }
    const steps = points.slice(1).map((point, index) => point.angle - points[index]!.angle);
    for (const gap of steps) expect(gap).toBeCloseTo((Math.PI * 2) / 12, 10);
    expect(new Set(points.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`)).size).toBe(12);
  });
});
