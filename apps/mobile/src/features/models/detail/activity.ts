import type { ModelActivityRow } from "@/lib/api/models";

const DAY_MS = 86_400_000;

export type ActivityMode = "tokens" | "requests";

/** The website's series colours (ModelActivityChart), as hex for SVG. */
export const ACTIVITY_SERIES = {
  prompt: { label: "Prompt", colour: "#0ea5e9", description: "Prompt tokens measure input size." },
  reasoning: { label: "Reasoning", colour: "#f59e0b", description: "Reasoning tokens show internal thinking before a response." },
  completion: { label: "Completion", colour: "#22a878", description: "Completion tokens reflect total output length." },
  requests: { label: "Requests", colour: "#c42b48", description: "Requests measure successful gateway calls for this model." },
} as const;

export type ActivityDay = { day: string; prompt: number; reasoning: number; completion: number; requests: number; projected: number; isToday: boolean };

/** The last `days` UTC days, oldest first, keyed "YYYY-MM-DD". */
export function lastUtcDays(days: number, now = new Date()) {
  const anchor = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: days }, (_, index) => new Date(anchor - (days - 1 - index) * DAY_MS).toISOString().slice(0, 10));
}

/**
 * Daily totals across providers. Completion excludes reasoning tokens (they are counted in output), and
 * today's bar gets a projected pace from how much of the UTC day has passed.
 */
export function activityDays(rows: ModelActivityRow[], mode: ActivityMode, now = new Date(), days = 30): ActivityDay[] {
  const today = now.toISOString().slice(0, 10);
  const byDay = new Map(lastUtcDays(days, now).map((day): [string, ActivityDay] => [day, { day, prompt: 0, reasoning: 0, completion: 0, requests: 0, projected: 0, isToday: day === today }]));
  for (const row of rows) {
    const bucket = byDay.get(row.dayBucket);
    if (!bucket) continue;
    const reasoning = Math.max(0, row.reasoningTokens);
    bucket.prompt += row.inputTokens;
    bucket.reasoning += reasoning;
    bucket.completion += Math.max(0, row.outputTokens - reasoning);
    bucket.requests += row.successRequests;
  }
  const todayBucket = byDay.get(today);
  if (todayBucket) {
    const elapsed = Math.min(1, Math.max(1 / DAY_MS, (now.getTime() - Date.parse(`${today}T00:00:00.000Z`)) / DAY_MS));
    const actual = mode === "tokens" ? todayBucket.prompt + todayBucket.reasoning + todayBucket.completion : todayBucket.requests;
    if (actual > 0 && elapsed < 1) todayBucket.projected = Math.max(0, Math.max(actual, actual / elapsed) - actual);
  }
  return [...byDay.values()];
}

export const activityTotal = (day: ActivityDay, mode: ActivityMode) => (mode === "tokens" ? day.prompt + day.reasoning + day.completion : day.requests);
