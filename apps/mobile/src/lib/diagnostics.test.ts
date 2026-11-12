import { createSlowLog, measure } from "./diagnostics";

describe("slow operation log", () => {
  test("keeps only work at or over the threshold, newest first", () => {
    const log = createSlowLog(5, 50);
    expect(log.record("fast", 49.9)).toBe(false);
    expect(log.record("open", 50, "12 messages", 1)).toBe(true);
    log.record("page", 120.04, undefined, 2);
    expect(log.list()).toEqual([{ name: "page", ms: 120, at: 2, detail: undefined }, { name: "open", ms: 50, at: 1, detail: "12 messages" }]);
  });

  test("overwrites the oldest entries once full and counts every slow one", () => {
    const log = createSlowLog(3, 0);
    for (let index = 0; index < 7; index += 1) log.record(`op${index}`, 1, undefined, index);
    expect(log.list().map((entry) => entry.name)).toEqual(["op6", "op5", "op4"]);
    expect(log.total).toBe(7);
    log.clear();
    expect(log.list()).toEqual([]);
    expect(log.total).toBe(0);
  });

  test("works out details only for slow work", () => {
    const log = createSlowLog(3, 50);
    const detail = jest.fn(() => "details");
    log.record("fast", 10, detail);
    expect(detail).not.toHaveBeenCalled();
    log.record("slow", 60, detail);
    expect(detail).toHaveBeenCalledTimes(1);
    expect(log.list()[0]!.detail).toBe("details");
  });

  test("tells listeners when the list changes", () => {
    const log = createSlowLog(3, 50);
    const listener = jest.fn();
    const stop = log.subscribe(listener);
    log.record("fast", 1);
    log.record("slow", 70);
    stop();
    log.record("slow", 70);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("measure returns the work's result", () => {
    expect(measure("sum", () => 1 + 2)).toBe(3);
  });
});
