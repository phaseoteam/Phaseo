import type { SuccessPoint } from "@/lib/api/models";
import {
  attemptFailureShares, failureShareText, formatFailureShare, hasProviderAttemptHealth, providerHealthHours, requestFailureText, summarizeProviderHealth, summaryFailureShares,
  uptimeTone, utcDayLabel, utcDayOffset, UPTIME_COPY,
} from "./uptime";

const point = (bucket: string, values: Partial<SuccessPoint> = {}): SuccessPoint => ({ bucket, overallSuccessPct: 100, worstProviderSuccessPct: null, worstProviderRequests: 0, providerCount: 1, requests: 0, ...values });

describe("failure shares", () => {
  test("one decimal, and tiny shares read <0.1% rather than none", () => {
    expect(formatFailureShare(0.6)).toBe("0.6%");
    expect(formatFailureShare(12.345)).toBe("12.3%");
    expect(formatFailureShare(0.04)).toBe("<0.1%");
    // web-api caps a rate with any failure at 99.99, so one failure in 25,000 still shows.
    expect(formatFailureShare(100 - 99.99)).toBe("<0.1%");
  });

  test("each step is a share of the attempts that reached it", () => {
    expect(attemptFailureShares({ reachabilityPct: 99.4, capacityPct: 100, callErrorPct: 98.5 })).toEqual({
      reachability: { kind: "failed", pct: expect.closeTo(0.6) },
      capacity: { kind: "none" },
      callErrors: { kind: "failed", pct: expect.closeTo(1.5) },
    });
  });

  test("no eligible attempts means no failures; attempts that never reached a step leave it unmeasured", () => {
    expect(attemptFailureShares({ reachabilityPct: null, capacityPct: null, callErrorPct: null })).toEqual({ reachability: { kind: "none" }, capacity: { kind: "none" }, callErrors: { kind: "none" } });
    const unreachable = attemptFailureShares({ reachabilityPct: 0, capacityPct: null, callErrorPct: null });
    expect(unreachable.capacity).toEqual({ kind: "unmeasured" });
    expect(failureShareText("reachability", unreachable.reachability)).toBe("100.0% of attempts couldn't reach the provider");
    expect(failureShareText("capacity", unreachable.capacity)).toBe("No attempts reached the provider");
    expect(failureShareText("callErrors", unreachable.callErrors)).toBe("No attempts were accepted");
  });

  test("the website's wording, percentages only", () => {
    expect(failureShareText("capacity", { kind: "failed", pct: 1.5 })).toBe("1.5% of attempts that reached the provider were turned away because it was at capacity");
    expect(failureShareText("callErrors", { kind: "failed", pct: 0.01 })).toBe("<0.1% of accepted attempts failed after the provider accepted them");
    expect(failureShareText("reachability", { kind: "none" })).toBe("No failures");
    expect(failureShareText("reachability", { kind: "none" }, UPTIME_COPY.noFailuresThisHour)).toBe("No failures this hour");
  });

  test("the request-level hour says what share failed, never how many", () => {
    expect(requestFailureText(99.4)).toBe("0.6% of requests failed");
    expect(requestFailureText(100)).toBe("No failures this hour");
    expect(requestFailureText(null)).toBeNull();
  });
});

describe("provider health chart", () => {
  const now = new Date("2026-11-05T06:30:00Z");

  test("only series with attempt rates switch to the three-line chart", () => {
    expect(hasProviderAttemptHealth([point("2026-11-05T05:00:00Z")])).toBe(false);
    expect(hasProviderAttemptHealth([point("2026-11-05T05:00:00Z", { reachabilityPct: null, capacityPct: null, callErrorPct: null })])).toBe(true);
  });

  test("24 UTC hours; empty hours show 100% and a step nothing reached stays empty", () => {
    const hours = providerHealthHours([
      point("2026-11-05T05:00:00Z", { reachabilityPct: 90, capacityPct: 50, callErrorPct: 100 }),
      point("2026-11-05T04:00:00Z", { reachabilityPct: 0, capacityPct: null, callErrorPct: null }),
      point("2026-11-05T03:00:00Z", { reachabilityPct: null, capacityPct: null, callErrorPct: null }),
    ], now);
    expect(hours).toHaveLength(24);
    expect(hours.at(-1)!.bucket).toBe("2026-11-05T06:00:00.000Z");
    expect(hours.at(-2)).toMatchObject({ reachability: 90, capacity: 50, callErrors: 100 });
    expect(hours.at(-3)).toMatchObject({ reachability: 0, capacity: null, callErrors: null, rates: { reachabilityPct: 0, capacityPct: null, callErrorPct: null } });
    expect(hours.at(-4)).toMatchObject({ reachability: 100, capacity: 100, callErrors: 100 });
    const summary = summarizeProviderHealth(hours);
    expect(summary.reachability).toBeCloseTo((22 * 100 + 90 + 0) / 24);
    expect(summary.capacity).toBeCloseTo((22 * 100 + 50) / 23);
  });

  test("the 24-hour failure shares use web-api's totals when sent, else the hourly averages", () => {
    const summary = { reachability: 99.9, capacity: 100, callErrors: 100 };
    expect(summaryFailureShares(summary).reachability).toEqual({ kind: "failed", pct: expect.closeTo(0.1) });
    // An average of hourly rates understates failures when traffic is uneven; the totals don't.
    expect(summaryFailureShares(summary, { reachabilityPct: 97, capacityPct: 100, callErrorPct: 99.5, uptimePct: 96.5 })).toEqual({
      reachability: { kind: "failed", pct: expect.closeTo(3) },
      capacity: { kind: "none" },
      callErrors: { kind: "failed", pct: expect.closeTo(0.5) },
    });
  });
});

test("uptime colour bands and day labels match the website's provider card", () => {
  expect([uptimeTone(99.5), uptimeTone(99), uptimeTone(95), uptimeTone(94.9), uptimeTone(null)]).toEqual(["success", "warning", "warning", "destructive", null]);
  const now = new Date("2026-11-05T06:30:00Z");
  expect(utcDayOffset("2026-11-05T00:00:00.000Z", now)).toBe(0);
  expect(utcDayOffset("2026-11-03T00:00:00.000Z", now)).toBe(2);
  expect([0, 1, 2].map(utcDayLabel)).toEqual(["Today", "1 day ago", "2 days ago"]);
});
