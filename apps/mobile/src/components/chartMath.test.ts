import { barLayout, linePath, nearestIndex, niceTicks, placeTooltip, slotIndex, stepIndex } from "./chartMath";

describe("nearestIndex", () => {
  const positions = [10, 20, 40, 80];

  test("picks the nearest point, the earlier one on a tie", () => {
    expect([0, 10, 14, 15, 16, 29, 30, 31, 59, 61, 500].map((x) => nearestIndex(positions, x))).toEqual([0, 0, 0, 0, 1, 1, 1, 2, 2, 3, 3]);
  });

  test("handles no points and one point", () => {
    expect(nearestIndex([], 5)).toBe(-1);
    expect(nearestIndex([42], -100)).toBe(0);
  });
});

describe("slotIndex", () => {
  test("maps x to the bar slot it falls in, clamped to the bars", () => {
    // 4 bars of 25 px from x = 30.
    expect([0, 30, 54.9, 55, 99, 129.9, 400].map((x) => slotIndex(x, 30, 25, 4))).toEqual([0, 0, 0, 1, 2, 3, 3]);
  });

  test("returns -1 when there is nothing to pick", () => {
    expect(slotIndex(10, 0, 25, 0)).toBe(-1);
    expect(slotIndex(10, 0, 0, 4)).toBe(-1);
  });

  test("agrees with where barLayout draws the bars", () => {
    const layout = barLayout(30, 40, 300);
    for (const index of [0, 7, 29]) expect(slotIndex(layout.centre(index), 40, layout.slot, 30)).toBe(index);
    expect(layout.barWidth).toBe(6);
  });
});

describe("placeTooltip", () => {
  const chart = { width: 300, height: 200, bubbleWidth: 100, bubbleHeight: 50 };

  test("centres the bubble over the point, above the finger", () => {
    expect(placeTooltip({ ...chart, anchorX: 150, fingerY: 150 })).toEqual({ left: 100, top: 68 });
  });

  test("keeps the bubble inside the chart at either edge", () => {
    expect(placeTooltip({ ...chart, anchorX: 10, fingerY: 150 }).left).toBe(0);
    expect(placeTooltip({ ...chart, anchorX: 295, fingerY: 150 }).left).toBe(200);
  });

  test("moves beside the finger when there's no room above, on the roomier side", () => {
    expect(placeTooltip({ ...chart, anchorX: 60, fingerY: 40 })).toEqual({ left: 92, top: 15 });
    expect(placeTooltip({ ...chart, anchorX: 250, fingerY: 40 })).toEqual({ left: 118, top: 15 });
    expect(placeTooltip({ ...chart, anchorX: 250, fingerY: 5 }).top).toBe(0);
  });
});

describe("stepIndex", () => {
  test("starts at an end and stays within the points", () => {
    expect(stepIndex(null, 5, 1)).toBe(0);
    expect(stepIndex(null, 5, -1)).toBe(4);
    expect(stepIndex(4, 5, 1)).toBe(4);
    expect(stepIndex(0, 5, -1)).toBe(0);
    expect(stepIndex(2, 5, 1)).toBe(3);
    expect(stepIndex(null, 0, 1)).toBeNull();
  });
});

describe("niceTicks", () => {
  test("rounds the axis up to a few even steps", () => {
    expect(niceTicks(4.2)).toEqual([0, 2, 4, 6]);
    expect(niceTicks(0.0031)).toEqual([0, 0.001, 0.002, 0.003, 0.004]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});

describe("linePath", () => {
  test("joins points and breaks at missing values", () => {
    expect(linePath([{ x: 0, y: 10 }, { x: 5, y: 20 }, { x: 10, y: null }, { x: 15, y: 30 }, { x: 20, y: 40 }])).toEqual({ d: "M0.0,10.0L5.0,20.0M15.0,30.0L20.0,40.0", dots: [] });
    expect(linePath([{ x: 0, y: 10 }, { x: 5, y: 20 }], true).d).toBe("M0.0,10.0H5.0V20.0");
  });

  test("a single point, or one with gaps on both sides, comes back as a dot", () => {
    expect(linePath([{ x: 50, y: 30 }])).toEqual({ d: "M50.0,30.0", dots: [{ x: 50, y: 30 }] });
    expect(linePath([{ x: 0, y: 1 }, { x: 5, y: 2 }, { x: 10, y: null }, { x: 15, y: 3 }, { x: 20, y: Number.NaN }, { x: 25, y: 4 }]).dots).toEqual([{ x: 15, y: 3 }, { x: 25, y: 4 }]);
    expect(linePath([{ x: 0, y: null }]).dots).toEqual([]);
  });
});
