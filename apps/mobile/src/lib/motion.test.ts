import { pickReleaseVelocity, project, rubberband, useReleaseVelocity } from "./motion";

// Reanimated's own mock pulls in FlatList, which this preset can't resolve; motion.ts only needs these two. Shared
// values are plain boxes, so the hook can be called outside a component and driven directly.
jest.mock("react-native-reanimated", () => ({
  Easing: { bezier: () => (value: number) => value },
  useSharedValue: (initial: unknown) => {
    let value = initial;
    return { get: () => value, set: (next: unknown) => { value = next; } };
  },
}));

describe("useReleaseVelocity", () => {
  let now = 1_000;
  beforeEach(() => { now = 1_000; jest.spyOn(Date, "now").mockImplementation(() => now); });
  afterEach(() => jest.restoreAllMocks());

  test("measures a flick from its updates when the reported velocity is lost", () => {
    const speed = useReleaseVelocity();
    speed.start(6);
    now += 16; speed.track(26);
    now += 16; speed.track(46);
    now += 8;
    expect(speed.release(0)).toBeCloseTo(1250, 0);
  });

  test("keeps the reported velocity when updates came but none moved", () => {
    const speed = useReleaseVelocity();
    speed.start(6);
    now += 16; speed.track(6);
    now += 16; speed.track(6);
    expect(speed.release(900)).toBe(900);
  });

  test("a finger that rested in place before letting go isn't a flick, even with updates while resting", () => {
    const speed = useReleaseVelocity();
    speed.start(6);
    now += 16; speed.track(40);
    now += 60; speed.track(40);
    now += 60; speed.track(40);
    expect(speed.release(700)).toBe(0);
  });
});

describe("pickReleaseVelocity", () => {
  test("a finger that stopped before letting go isn't a flick", () => {
    expect(pickReleaseVelocity({ reported: 900, measured: 800, sinceMoveMs: 150 })).toBe(0);
  });

  test("uses the measured speed when the reported one is lost (0) or too low", () => {
    expect(pickReleaseVelocity({ reported: 0, measured: 600, sinceMoveMs: 16 })).toBe(600);
    expect(pickReleaseVelocity({ reported: 80, measured: 600, sinceMoveMs: 16 })).toBe(600);
  });

  test("keeps the reported speed when it is faster in the same direction", () => {
    expect(pickReleaseVelocity({ reported: 1200, measured: 600, sinceMoveMs: 16 })).toBe(1200);
    expect(pickReleaseVelocity({ reported: -1200, measured: -600, sinceMoveMs: 16 })).toBe(-1200);
  });

  test("trusts the measurement when the reported speed points the other way", () => {
    expect(pickReleaseVelocity({ reported: -1200, measured: 600, sinceMoveMs: 16 })).toBe(600);
  });

  test("a flick let go before any update moved it keeps the reported speed", () => {
    expect(pickReleaseVelocity({ reported: 900, measured: null, sinceMoveMs: 30 })).toBe(900);
    expect(pickReleaseVelocity({ reported: 900, measured: null, sinceMoveMs: 150 })).toBe(0);
  });
});

describe("project and rubberband", () => {
  test("project carries a flick on in its direction", () => {
    expect(project(1000)).toBeCloseTo(499, 0);
    expect(project(-1000)).toBeCloseTo(-499, 0);
    expect(project(0)).toBe(0);
  });

  test("rubberband follows less the further past the edge, and never past it for nothing", () => {
    expect(rubberband(0, 500)).toBe(0);
    expect(Math.abs(rubberband(100, 500))).toBeLessThan(100);
    expect(Math.abs(rubberband(400, 500)) - Math.abs(rubberband(200, 500))).toBeLessThan(Math.abs(rubberband(200, 500)));
    expect(rubberband(50, 0)).toBe(0);
  });
});
