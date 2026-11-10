import { acquireSwipeLock, releaseSwipeLock, SWIPE_LOCK_TIMEOUT, swipeLocked } from "./swipeLock";

describe("swipe lock", () => {
  it("starts free", () => {
    expect(swipeLocked({ value: 0 }, 1_000)).toBe(false);
  });

  it("holds from a touch on a row until it's released", () => {
    const lock = { value: 0 };
    acquireSwipeLock(lock, 1_000);
    expect(swipeLocked(lock, 1_000)).toBe(true);
    expect(swipeLocked(lock, 1_000 + SWIPE_LOCK_TIMEOUT - 1)).toBe(true);
    releaseSwipeLock(lock);
    expect(swipeLocked(lock, 1_001)).toBe(false);
  });

  it("lapses after the timeout if it's never released", () => {
    const lock = { value: 0 };
    acquireSwipeLock(lock, 1_000);
    expect(swipeLocked(lock, 1_000 + SWIPE_LOCK_TIMEOUT)).toBe(false);
  });

  it("restarts the timeout when a new touch takes it", () => {
    const lock = { value: 0 };
    acquireSwipeLock(lock, 1_000);
    acquireSwipeLock(lock, 4_000);
    expect(swipeLocked(lock, 1_000 + SWIPE_LOCK_TIMEOUT)).toBe(true);
  });
});
