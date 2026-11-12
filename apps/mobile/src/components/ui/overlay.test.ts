import { dialogFrame, placeDropdown } from "./overlay";

// The phaseo-tablet emulator in landscape: 1280 × 900 dp.
const tablet = { width: 1280, height: 900 };

describe("dropdown placement", () => {
  test("opens under its trigger, left-aligned and at least 224 dp wide", () => {
    expect(placeDropdown({ x: 1000, y: 140, width: 160, height: 40 }, tablet)).toEqual({ left: 1000, width: 224, top: 184, maxHeight: 420 });
  });

  test("keeps the width of a wide trigger, up to 360 dp", () => {
    expect(placeDropdown({ x: 500, y: 100, width: 300, height: 40 }, tablet).width).toBe(300);
    expect(placeDropdown({ x: 300, y: 100, width: 900, height: 40 }, tablet).width).toBe(360);
  });

  test("stays on screen at the right edge", () => {
    const place = placeDropdown({ x: 1200, y: 100, width: 60, height: 40 }, tablet);
    expect(place.left + place.width).toBe(tablet.width - 8);
  });

  test("opens upwards when there is clearly more room above", () => {
    const place = placeDropdown({ x: 400, y: 760, width: 200, height: 40 }, tablet, { top: 24, bottom: 24 });
    expect(place.top).toBeUndefined();
    expect(place.bottom).toBe(900 - 760 + 4);
    expect(place.maxHeight).toBe(420);
  });

  test("prefers below while it has a comfortable amount of room", () => {
    const place = placeDropdown({ x: 400, y: 560, width: 200, height: 40 }, tablet);
    expect(place.top).toBe(604);
    expect(place.maxHeight).toBe(900 - 8 - 604);
  });
});

describe("dialog frame", () => {
  test("is at most 560 dp wide and 85% high; tall dialogs take that height", () => {
    expect(dialogFrame(tablet, "fit")).toEqual({ width: 560, maxHeight: 765, height: undefined });
    expect(dialogFrame(tablet, "tall")).toEqual({ width: 560, maxHeight: 765, height: 760 });
    expect(dialogFrame({ width: 600, height: 1000 }, "tall")).toEqual({ width: 552, maxHeight: 850, height: 760 });
  });
});
