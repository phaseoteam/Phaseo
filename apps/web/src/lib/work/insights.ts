// Shapes the work_insights answer (already aggregated in SQL) into chart rows. Nothing here
// counts database rows: it only lays the daily buckets out on a continuous axis.

import { WORK_ITEM_SOURCES, type WorkCycle, type WorkInsights, type WorkItemSource } from "./types";

const DAY = 86_400_000;

function dayKey(value: string): string | null {
	const time = Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value);
	return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
}

/** Every day from from to to (inclusive, UTC), at most 400. */
export function daysBetween(from: string, to: string): string[] {
	const start = dayKey(from);
	const end = dayKey(to);
	if (!start || !end) return [];
	const days: string[] = [];
	for (let time = Date.parse(`${start}T00:00:00Z`); time <= Date.parse(`${end}T00:00:00Z`) && days.length < 400; time += DAY) {
		days.push(new Date(time).toISOString().slice(0, 10));
	}
	return days;
}

export type CreatedClosedRow = { day: string; created: number; closed: number };

/** Created and closed per day, with empty days filled with zeros. */
export function createdClosedRows(insights: Pick<WorkInsights, "from" | "to" | "created" | "closed">): CreatedClosedRow[] {
	const rows = new Map(daysBetween(insights.from, insights.to).map((day) => [day, { day, created: 0, closed: 0 }]));
	for (const bucket of insights.created ?? []) {
		const row = rows.get(dayKey(bucket.day) ?? "");
		if (row) row.created += Number(bucket.items) || 0;
	}
	for (const bucket of insights.closed ?? []) {
		const row = rows.get(dayKey(bucket.day) ?? "");
		if (row) row.closed += Number(bucket.items) || 0;
	}
	return [...rows.values()];
}

export type SourceRow = { day: string } & Partial<Record<WorkItemSource, number>>;

/** Created per day split by source, for a stacked chart, plus the sources that appear (in fixed order). */
export function createdBySourceRows(insights: Pick<WorkInsights, "from" | "to" | "created">): { rows: SourceRow[]; sources: WorkItemSource[] } {
	const rows = new Map<string, SourceRow>(daysBetween(insights.from, insights.to).map((day) => [day, { day }]));
	const seen = new Set<WorkItemSource>();
	for (const bucket of insights.created ?? []) {
		const row = rows.get(dayKey(bucket.day) ?? "");
		if (!row || !(WORK_ITEM_SOURCES as readonly string[]).includes(bucket.source)) continue;
		const items = Number(bucket.items) || 0;
		if (!items) continue;
		row[bucket.source] = (row[bucket.source] ?? 0) + items;
		seen.add(bucket.source);
	}
	// Fixed order, so a source keeps its colour whichever others appear.
	const sources = WORK_ITEM_SOURCES.filter((source) => seen.has(source));
	for (const row of rows.values()) for (const source of sources) row[source] ??= 0;
	return { rows: [...rows.values()], sources };
}

/** A count per key, from either the object form ({ todo: 3 }) or the list form ([{ state: "todo", items: 3 }]). */
export function countFor(source: unknown, key: string | number, field: "state" | "priority"): number {
	if (Array.isArray(source)) {
		const entry = source.find((row) => row && String((row as Record<string, unknown>)[field]) === String(key)) as { items?: unknown } | undefined;
		return Number(entry?.items ?? 0) || 0;
	}
	if (source && typeof source === "object") return Number((source as Record<string, unknown>)[String(key)] ?? 0) || 0;
	return 0;
}

/** Run cost in US dollars, whichever unit the API sent. */
export function runCostUsd(run: { costUsd?: number; costNanos?: number }): number {
	if (typeof run.costUsd === "number" && Number.isFinite(run.costUsd)) return run.costUsd;
	const nanos = Number(run.costNanos ?? 0);
	return Number.isFinite(nanos) ? nanos / 1_000_000_000 : 0;
}

/** "18 h" style durations: hours under two days, days above. */
export function closeTimeParts(hours: number | null | undefined): { value: number; unit: "hours" | "days" } | null {
	if (typeof hours !== "number" || !Number.isFinite(hours) || hours < 0) return null;
	if (hours < 48) return { value: Math.round(hours * 10) / 10, unit: "hours" };
	return { value: Math.round((hours / 24) * 10) / 10, unit: "days" };
}

export type BurnUpRow = { day: string; scope: number; ideal: number; completed: number | null };

/**
 * A burn-up for a cycle from what the API knows: today's scope and completed estimate. Scope is drawn
 * flat, the ideal line rises from 0 to scope across the cycle, and completed runs from 0 at the start
 * to today's value (the API has no daily history, so the days between are not plotted).
 */
export function cycleBurnUp(cycle: Pick<WorkCycle, "startsOn" | "endsOn" | "scope" | "completed">, today: string = new Date().toISOString().slice(0, 10)): BurnUpRow[] {
	const days = daysBetween(cycle.startsOn, cycle.endsOn);
	if (!days.length) return [];
	const scope = Math.max(0, Number(cycle.scope) || 0);
	const completed = Math.max(0, Number(cycle.completed) || 0);
	const last = Math.max(1, days.length - 1);
	const todayIndex = today < days[0]! ? -1 : today > days.at(-1)! ? days.length - 1 : days.indexOf(today);
	return days.map((day, index) => ({
		day,
		scope,
		ideal: Math.round((scope * index * 100) / last) / 100,
		completed: index === 0 ? 0 : index === todayIndex ? completed : null,
	}));
}

/** Whether a yyyy-mm-dd range covers today. */
export function cycleIsCurrent(cycle: Pick<WorkCycle, "startsOn" | "endsOn">, today: string = new Date().toISOString().slice(0, 10)): boolean {
	return cycle.startsOn <= today && today <= cycle.endsOn;
}

/** Default dates for the next cycle: the day after the latest one ends, for the same length (two weeks when there's none). */
export function nextCycleDates(cycles: Array<Pick<WorkCycle, "startsOn" | "endsOn">>, today: string = new Date().toISOString().slice(0, 10)): { startsOn: string; endsOn: string } {
	const latest = [...cycles].sort((a, b) => b.endsOn.localeCompare(a.endsOn))[0];
	const length = latest ? Math.max(1, Math.round((Date.parse(`${latest.endsOn}T00:00:00Z`) - Date.parse(`${latest.startsOn}T00:00:00Z`)) / DAY)) : 13;
	const startTime = latest ? Math.max(Date.parse(`${latest.endsOn}T00:00:00Z`) + DAY, 0) : Date.parse(`${today}T00:00:00Z`);
	const start = new Date(startTime).toISOString().slice(0, 10);
	const end = new Date(startTime + length * DAY).toISOString().slice(0, 10);
	return { startsOn: start, endsOn: end };
}
