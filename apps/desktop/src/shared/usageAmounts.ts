import type { UsageTotals } from "./workspace";

/** Token counts and cost read from one usage report; a field is absent when the report does not give it. */
export type UsageAmounts = { input?: number; output?: number; total?: number; costNanos?: number };

const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
const first = (record: Record<string, unknown>, keys: string[]) => keys.map(key => count(record[key])).find(value => value !== undefined);

/**
 * Reads a usage activity's text. Phaseo steps report the gateway's usage, priced in `pricing` (Chat Completions) or
 * `pricing_breakdown` (Responses); a `cost` in dollars is read when there is no price. Cumulative reports (Codex) keep
 * their latest step in `last`.
 */
export function usageAmounts(text: string): UsageAmounts {
	let reported: Record<string, unknown>;
	try { const parsed = JSON.parse(text) as unknown; if (!parsed || typeof parsed !== "object") return {}; reported = parsed as Record<string, unknown>; }
	catch { return {}; } // Some providers report human-readable usage.
	const value = reported.last && typeof reported.last === "object" ? reported.last as Record<string, unknown> : reported;
	const input = first(value, ["input_tokens", "inputTokens", "prompt_tokens"]), output = first(value, ["output_tokens", "outputTokens", "completion_tokens"]);
	const total = first(value, ["total_tokens", "totalTokens"]) ?? (input !== undefined && output !== undefined ? input + output : undefined);
	const pricing = [value.pricing_breakdown, value.pricing].find(item => item && typeof item === "object") as Record<string, unknown> | undefined;
	const nanos = count(pricing?.total_nanos), dollars = count(value.cost);
	const costNanos = nanos ?? (dollars === undefined ? undefined : Math.round(dollars * 1e9));
	return { ...input !== undefined ? { input } : {}, ...output !== undefined ? { output } : {}, ...total !== undefined ? { total } : {}, ...costNanos !== undefined ? { costNanos } : {} };
}

/**
 * The Phaseo harness's usage reports: one per step (`usage:<step>`) and one per compaction (`compaction:<time>:usage`),
 * after the turn's message id once stored. Other harnesses report cumulative context usage under other ids.
 */
export const isPhaseoUsageId = (id: string) => /(?:^|:)usage:\d+$/.test(id) || /(?:^|:)compaction:\d+:usage$/.test(id);

/** Adds one usage report to a chat's totals; a report that replaces an earlier one counts only the difference. */
export function addUsage(totals: UsageTotals, text: string, replaced?: string) {
	const next = usageAmounts(text), previous = replaced === undefined ? {} : usageAmounts(replaced);
	totals.tokens = Math.max(0, totals.tokens + (next.total ?? 0) - (previous.total ?? 0));
	totals.costNanos = Math.max(0, totals.costNanos + (next.costNanos ?? 0) - (previous.costNanos ?? 0));
}

/** A chat's totals from its stored usage reports. */
export function usageTotalsOf(reports: readonly string[]): UsageTotals {
	const totals: UsageTotals = { tokens: 0, costNanos: 0 };
	for (const report of reports) addUsage(totals, report);
	return totals;
}

/** Dollars in US format: cents from a dollar up, finer below it so small turns do not all read $0.00. */
export function formatCost(nanos: number) {
	const dollars = nanos / 1e9;
	if (dollars > 0 && dollars < 0.0001) return "<$0.0001";
	return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: dollars >= 1 ? 2 : 4 }).format(dollars);
}
