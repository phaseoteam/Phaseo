import { formatUsageDeltaPercent, usageDeltaPercent } from "@phaseo/app-kit/format";
import type { UsageCell, UsageRange } from "@/lib/api/account";

export type UsagePeriod = "24h" | "7d" | "30d";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function usageRange(period: UsagePeriod, now = new Date()): UsageRange {
  const span = period === "24h" ? DAY : period === "7d" ? 7 * DAY : 30 * DAY;
  const to = new Date(now);
  const from = new Date(to.getTime() - span);
  return { from, to, previousFrom: new Date(from.getTime() - span), previousTo: from, bucket: period === "24h" ? "hour" : "day" };
}

export type UsageTotals = { requests: number; successfulRequests: number; costNanos: number; tokens: number };

/** Cells are already summed per bucket/model/key by the database; this folds the groups for display. */
export function totals(cells: UsageCell[]): UsageTotals {
  return cells.reduce<UsageTotals>((sum, cell) => ({
    requests: sum.requests + cell.requests,
    successfulRequests: sum.successfulRequests + cell.successfulRequests,
    costNanos: sum.costNanos + cell.costNanos,
    tokens: sum.tokens + cell.tokens,
  }), { requests: 0, successfulRequests: 0, costNanos: 0, tokens: 0 });
}

export type UsageBucket = { start: number; costNanos: number; requests: number; tokens: number };

/**
 * Where the API's buckets start: local hours, or local midnights (in the time zone the request names, which is the
 * phone's), from the one holding `from` up to `to`. A 7-day range touches 8 calendar days, so it has 8 buckets.
 */
export function bucketStarts(range: UsageRange): number[] {
  const starts: number[] = [];
  const cursor = new Date(range.from);
  if (range.bucket === "hour") cursor.setMinutes(0, 0, 0);
  else cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() < range.to.getTime() && starts.length < 1000) {
    starts.push(cursor.getTime());
    if (range.bucket === "hour") cursor.setTime(cursor.getTime() + HOUR);
    else cursor.setDate(cursor.getDate() + 1);
  }
  return starts;
}

/** Spend, requests and tokens per bucket across the whole range, including empty buckets so the chart keeps its shape. */
export function usageBuckets(cells: UsageCell[], range: UsageRange): UsageBucket[] {
  const starts = bucketStarts(range);
  const buckets = starts.map((start) => ({ start, costNanos: 0, requests: 0, tokens: 0 }));
  if (!buckets.length) return buckets;
  for (const cell of cells) {
    const at = cell.bucket ? Date.parse(cell.bucket) : NaN;
    if (!Number.isFinite(at)) continue;
    // The bucket that starts at or before the cell (an exact match unless the time zone changed meanwhile).
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (starts[middle]! <= at) low = middle;
      else high = middle - 1;
    }
    const bucket = buckets[low]!;
    bucket.costNanos += cell.costNanos;
    bucket.requests += cell.requests;
    bucket.tokens += cell.tokens;
  }
  return buckets;
}

/** Spend over the last 7 days: the overview's `recent` window (always the last 7 days), else its current one. */
export function weekSpendNanos(overview: { current: { cells: UsageCell[] }; recent?: { cells: UsageCell[] } | null } | null | undefined): number | null {
  if (!overview) return null;
  return totals((overview.recent ?? overview.current).cells).costNanos;
}

export function byModel(cells: UsageCell[]) {
  const map = new Map<string, UsageTotals>();
  for (const cell of cells) {
    const key = cell.modelId ?? "Unknown";
    const current = map.get(key) ?? { requests: 0, successfulRequests: 0, costNanos: 0, tokens: 0 };
    map.set(key, { requests: current.requests + cell.requests, successfulRequests: current.successfulRequests + cell.successfulRequests, costNanos: current.costNanos + cell.costNanos, tokens: current.tokens + cell.tokens });
  }
  return [...map.entries()].map(([modelId, value]) => ({ modelId, ...value })).sort((a, b) => b.costNanos - a.costNanos || b.requests - a.requests);
}

/**
 * The change from the previous period, as the website's usage dashboard words it: "+12.3% vs. previous period", or
 * "No prior" when both periods are empty. The sign stands in for the website's arrow.
 */
export function change(current: number, previous: number): string {
  const delta = usageDeltaPercent(current, previous);
  if (delta === null) return "No prior";
  return `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${formatUsageDeltaPercent(delta)}% vs. previous period`;
}
