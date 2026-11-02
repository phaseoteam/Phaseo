import type { getDataClient } from "@/data/supabase";
import type { WorkInsights, WorkInsightsRow } from "./types";

// Work insights: public.work_insights aggregates everything in SQL; this only picks the period
// and renames the result for the API (camelCase, cost in US dollars).

type DataClient = ReturnType<typeof getDataClient>;

export const DEFAULT_INSIGHTS_DAYS = 30;
export const MAX_INSIGHTS_DAYS = 180;
const DAY_MS = 86_400_000;
const NANOS_PER_USD = 1_000_000_000;

function parseInstant(value: string | undefined): number | null {
	if (!value?.trim()) return null;
	const text = value.trim();
	const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z` : text);
	return Number.isFinite(ms) ? ms : null;
}

/**
 * The insights period: `to` defaults to now, `from` to 30 days before `to`. A period over 180
 * days, or `from` not before `to`, is refused.
 */
export function insightsRange(fromText: string | undefined, toText: string | undefined, now: Date = new Date()): { ok: true; from: string; to: string } | { ok: false; message: string } {
	const fromMs = parseInstant(fromText);
	const toMs = parseInstant(toText);
	if (fromText?.trim() && fromMs == null) return { ok: false, message: "from must be a date or timestamp" };
	if (toText?.trim() && toMs == null) return { ok: false, message: "to must be a date or timestamp" };
	const to = toMs ?? now.getTime();
	const from = fromMs ?? to - DEFAULT_INSIGHTS_DAYS * DAY_MS;
	if (from >= to) return { ok: false, message: "from must be before to" };
	if (to - from > MAX_INSIGHTS_DAYS * DAY_MS) return { ok: false, message: `The period can be at most ${MAX_INSIGHTS_DAYS} days` };
	return { ok: true, from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}

function num(value: unknown): number {
	const number = Number(value ?? 0);
	return Number.isFinite(number) ? number : 0;
}

function numOrNull(value: unknown): number | null {
	if (value === null || value === undefined) return null;
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

function nanosToUsd(nanos: number): number {
	return Math.round((nanos / NANOS_PER_USD) * 1_000_000) / 1_000_000;
}

export function formatWorkInsights(row: Partial<WorkInsightsRow> | null, range: { from: string; to: string }): WorkInsights {
	const runs = (row?.runs ?? []).map((run) => {
		const costNanos = num(run.cost_nanos);
		return { agent: run.agent, runs: num(run.runs), succeeded: num(run.succeeded), costNanos, costUsd: nanosToUsd(costNanos) };
	});
	return {
		from: range.from,
		to: range.to,
		created: (row?.created ?? []).map((entry) => ({ day: String(entry.day), source: entry.source, items: num(entry.items) })),
		closed: (row?.closed ?? []).map((entry) => ({ day: String(entry.day), items: num(entry.items), done: num(entry.done) })),
		openByState: row?.open_by_state ?? {},
		openByPriority: row?.open_by_priority ?? {},
		openPastSla: num(row?.open_past_sla),
		openStalled: num(row?.open_stalled),
		closeHoursP50: numOrNull(row?.close_hours_p50),
		closeHoursP90: numOrNull(row?.close_hours_p90),
		runs,
		totalCostUsd: nanosToUsd(runs.reduce((sum, run) => sum + run.costNanos, 0)),
	};
}

/** Calls work_insights for the period. Throws when the RPC fails. */
export async function loadWorkInsights(client: DataClient, workspaceId: string, range: { from: string; to: string }): Promise<WorkInsights> {
	const { data, error } = await client.rpc("work_insights", { p_workspace_id: workspaceId, p_from: range.from, p_to: range.to });
	if (error) throw new Error(`work_insights failed: ${error.message}`);
	return formatWorkInsights((data ?? null) as Partial<WorkInsightsRow> | null, range);
}
