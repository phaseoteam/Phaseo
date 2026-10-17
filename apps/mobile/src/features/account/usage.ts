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

/** Spend per bucket across the whole range, including empty buckets so the chart keeps its shape. */
export function series(cells: UsageCell[], range: UsageRange): number[] {
  const step = range.bucket === "hour" ? HOUR : DAY;
  const count = Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / step));
  const values = new Array<number>(count).fill(0);
  for (const cell of cells) {
    if (!cell.bucket) continue;
    const index = Math.floor((Date.parse(cell.bucket) - range.from.getTime()) / step);
    const slot = Math.min(count - 1, Math.max(0, index));
    values[slot] = (values[slot] ?? 0) + cell.costNanos;
  }
  return values;
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

export function change(current: number, previous: number): string | null {
  if (!previous) return current ? "New" : null;
  const delta = ((current - previous) / previous) * 100;
  if (Math.abs(delta) < 0.5) return "No change";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(0)}% vs previous`;
}
