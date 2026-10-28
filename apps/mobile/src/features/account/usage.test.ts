import type { UsageCell } from "@/lib/api/account";
import { bucketStarts, usageBuckets, usageRange, weekSpendNanos } from "./usage";

const cell = (bucket: Date, costNanos: number, requests = 1, tokens = 100): UsageCell => ({ bucket: bucket.toISOString(), modelId: "m/one", provider: null, keyId: null, appId: null, requests, successfulRequests: requests, costNanos, tokens, inputTokens: tokens, outputTokens: 0 });

describe("usage buckets", () => {
  // 19 Oct 2026 14:37 on the phone's clock (tests use local dates, so any time zone works).
  const now = new Date(2026, 9, 19, 14, 37);

  test("7 days touch 8 calendar days, each starting at local midnight", () => {
    const starts = bucketStarts(usageRange("7d", now));
    expect(starts).toHaveLength(8);
    expect(new Date(starts[0]!)).toEqual(new Date(2026, 9, 12));
    expect(new Date(starts.at(-1)!)).toEqual(new Date(2026, 9, 19));
  });

  test("24 hours are hourly buckets from the hour holding the start", () => {
    const starts = bucketStarts(usageRange("24h", now));
    expect(starts).toHaveLength(25);
    expect(new Date(starts[0]!)).toEqual(new Date(2026, 9, 18, 14));
  });

  test("each day's cells land on that day, the first partial day included", () => {
    const range = usageRange("7d", now);
    const buckets = usageBuckets([
      cell(new Date(2026, 9, 12), 1_000_000_000, 2, 300),
      cell(new Date(2026, 9, 13), 500_000_000),
      cell(new Date(2026, 9, 13), 250_000_000),
      cell(new Date(2026, 9, 19), 3_000_000_000, 4, 900),
      { ...cell(new Date(2026, 9, 15), 1), bucket: null },
    ], range);
    expect(buckets.map((bucket) => bucket.costNanos)).toEqual([1_000_000_000, 750_000_000, 0, 0, 0, 0, 0, 3_000_000_000]);
    expect(buckets[0]).toMatchObject({ requests: 2, tokens: 300 });
    expect(buckets[7]).toMatchObject({ requests: 4, tokens: 900 });
  });

  test("the week's spend comes from the overview's last-7-days window when it has one", () => {
    const current = { cells: [cell(now, 5)] };
    expect(weekSpendNanos({ current, recent: { cells: [cell(now, 7), cell(now, 8)] } })).toBe(15);
    expect(weekSpendNanos({ current })).toBe(5);
    expect(weekSpendNanos(null)).toBeNull();
  });
});
