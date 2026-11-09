import type { SuccessPoint } from "@/lib/api/models";
import {
  attemptFailureShares, attemptHeadline, failureShareText, formatFailureShare, providerHealthHours,
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
    expect(failureShareText("capacity", { kind: "failed", pct: 1.5 })).toBe("1.5% were turned away because the provider was at capacity");
    expect(failureShareText("callErrors", { kind: "failed", pct: 66.7 })).toBe("66.7% failed after the provider accepted them");
    expect(failureShareText("callErrors", { kind: "failed", pct: 0.01 })).toBe("<0.1% failed after the provider accepted them");
    expect(UPTIME_COPY.attemptShare24h).toBe("Last 24 hours · share of all provider attempts. Errors caused by the request or by Phaseo are not counted.");
    expect(UPTIME_COPY.help.reachability).toContain("gateway errors (502, 504, 520–527) and 503s without an overload signal");
    expect(UPTIME_COPY.help.capacity).toContain("Rate limits (429) on Phaseo's own key, 529s and responses saying the provider is overloaded");
    expect(failureShareText("reachability", { kind: "none" })).toBe("No failures");
    expect(failureShareText("reachability", { kind: "none" }, UPTIME_COPY.noFailuresThisHour)).toBe("No failures this hour");
  });
});

describe("provider health chart", () => {
  const now = new Date("2026-11-05T06:30:00Z");

  const allAt100 = (hours: ReturnType<typeof providerHealthHours>) => hours.every((hour) => hour.reachability === 100 && hour.capacity === 100 && hour.callErrors === 100);
  const noFailures = { reachability: { kind: "none" }, capacity: { kind: "none" }, callErrors: { kind: "none" } };

  test("an empty series (no traffic in 24 hours) shows all three metrics at 100% with no failures", () => {
    const hours = providerHealthHours([], now);
    expect(hours).toHaveLength(24);
    expect(hours[0]!.bucket).toBe("2026-11-04T07:00:00.000Z");
    expect(hours.at(-1)!.bucket).toBe("2026-11-05T06:00:00.000Z");
    expect(allAt100(hours)).toBe(true);
  });

  test("a series without attempt rates (none published) shows 100%, not the request-level uptime", () => {
    const hours = providerHealthHours([
      point("2026-11-05T05:00:00Z", { overallSuccessPct: 50, worstProviderSuccessPct: 25, worstProviderRequests: 4, providerCount: 2, requests: 8 }),
      point("2026-11-05T04:00:00Z", { overallSuccessPct: null, requests: 0 }),
    ], now);
    expect(hours).toHaveLength(24);
    expect(allAt100(hours)).toBe(true);
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
  });

  test("the headline is web-api's true 24-hour share, with failure shares from the same rates", () => {
    // An average of hourly rates would read about 97% with 23 idle hours; the share of all attempts is 33.3%.
    const headline = attemptHeadline({ reachabilityPct: 100, capacityPct: 100, callErrorPct: 33.3, uptimePct: 33.3 });
    expect(headline.rates).toEqual({ reachability: 100, capacity: 100, callErrors: 33.3 });
    expect(failureShareText("callErrors", headline.shares.callErrors)).toBe("66.7% failed after the provider accepted them");
    expect(headline.shares.reachability).toEqual({ kind: "none" });
  });

  test("no attempts in 24 hours reads 100% and no failures", () => {
    for (const totals of [undefined, null, { reachabilityPct: null, capacityPct: null, callErrorPct: null, uptimePct: null }]) {
      const headline = attemptHeadline(totals);
      expect(headline).toEqual({ rates: { reachability: 100, capacity: 100, callErrors: 100 }, shares: noFailures });
      expect(failureShareText("reachability", headline.shares.reachability)).toBe("No failures");
    }
  });

  test("a step no attempt reached has no headline figure", () => {
    const headline = attemptHeadline({ reachabilityPct: 0, capacityPct: null, callErrorPct: null, uptimePct: 0 });
    expect(headline.rates).toEqual({ reachability: 0, capacity: null, callErrors: null });
    expect(headline.shares.capacity).toEqual({ kind: "unmeasured" });
  });
});

test("uptime colour bands and day labels match the website's provider card", () => {
  expect([uptimeTone(99.5), uptimeTone(99), uptimeTone(95), uptimeTone(94.9), uptimeTone(null)]).toEqual(["success", "warning", "warning", "destructive", null]);
  const now = new Date("2026-11-05T06:30:00Z");
  expect(utcDayOffset("2026-11-05T00:00:00.000Z", now)).toBe(0);
  expect(utcDayOffset("2026-11-03T00:00:00.000Z", now)).toBe(2);
  expect([0, 1, 2].map(utcDayLabel)).toEqual(["Today", "1 day ago", "2 days ago"]);
});
