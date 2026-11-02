import type { getDataClient } from "@/data/supabase";
import { CLOSED_WORK_ITEM_STATES, type WorkCycle, type WorkCycleRow, type WorkItemRow } from "./types";
import { itemCounts, isIsoDate, type ItemCounts } from "./projects";

// Work cycles: numbered, time-boxed periods (starts_on and ends_on both inclusive). Counts are
// count queries and estimate sums are summed by the database (one query per sum), never by adding
// up rows here.

type DataClient = ReturnType<typeof getDataClient>;

export const CYCLE_COLUMNS = "id,workspace_id,number,name,starts_on,ends_on,created_at";
export const MAX_CYCLES_LISTED = 20;
export const MAX_CYCLE_NAME = 80;
const MAX_CYCLE_DAYS = 366;

export type CycleEstimates = { scope: number | null; completed: number | null };

export function formatWorkCycle(row: WorkCycleRow, counts: ItemCounts = { itemCount: 0, doneCount: 0 }, estimates: CycleEstimates = { scope: null, completed: null }): WorkCycle {
	return {
		id: row.id,
		number: row.number,
		name: row.name,
		startsOn: row.starts_on,
		endsOn: row.ends_on,
		itemCount: counts.itemCount,
		doneCount: counts.doneCount,
		scope: estimates.scope,
		completed: estimates.completed,
		createdAt: row.created_at,
	};
}

/**
 * A cycle's estimate totals from public.work_cycle_estimates: scope (every item but cancelled) and
 * completed (done items). Both null when the database call fails, so callers show the counts alone.
 */
export async function cycleEstimates(client: DataClient, workspaceId: string, cycleId: string): Promise<{ scope: number | null; completed: number | null }> {
	try {
		const { data, error } = await client.rpc("work_cycle_estimates", { p_workspace_id: workspaceId, p_cycle_id: cycleId });
		if (error || !data || typeof data !== "object") return { scope: null, completed: null };
		const totals = data as { scope?: unknown; completed?: unknown };
		const scope = Number(totals.scope);
		const completed = Number(totals.completed);
		return { scope: Number.isFinite(scope) ? scope : null, completed: Number.isFinite(completed) ? completed : null };
	} catch {
		return { scope: null, completed: null };
	}
}

/** One day of a cycle's burn-up: its totals as last recorded that UTC day. */
export type WorkCycleDay = { day: string; scope: number; completed: number; itemCount: number; doneCount: number };

/**
 * Records the day's totals for running cycles (public.snapshot_work_cycle_days): every workspace's,
 * one workspace's, or one cycle's. A second call the same day replaces the first. Returns how many
 * cycles were recorded, or null when the database call failed.
 */
export async function snapshotCycleDays(client: DataClient, day: string, scope: { workspaceId?: string; cycleId?: string } = {}): Promise<number | null> {
	try {
		const { data, error } = await client.rpc("snapshot_work_cycle_days", { p_day: day, p_workspace_id: scope.workspaceId ?? null, p_cycle_id: scope.cycleId ?? null });
		if (error) return null;
		const count = Number(data);
		return Number.isFinite(count) ? count : null;
	} catch {
		return null;
	}
}

/** A cycle's recorded days, oldest first (a cycle is at most 367 days, so one read holds them all). Empty when the read fails. */
export async function cycleHistory(client: DataClient, workspaceId: string, cycleId: string): Promise<WorkCycleDay[]> {
	try {
		const { data, error } = await client.from("work_cycle_days").select("day,scope,completed,item_count,done_count")
			.eq("workspace_id", workspaceId).eq("cycle_id", cycleId).order("day", { ascending: true }).limit(MAX_CYCLE_DAYS + 1);
		if (error) return [];
		return ((data ?? []) as Array<Record<string, unknown>>).flatMap((row) => {
			const day = typeof row.day === "string" ? row.day.slice(0, 10) : "";
			if (!isIsoDate(day)) return [];
			const number = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
			return [{ day, scope: number(row.scope), completed: number(row.completed), itemCount: number(row.item_count), doneCount: number(row.done_count) }];
		});
	} catch {
		return [];
	}
}

/**
 * A cycle as its own page shows it: counts, estimate totals and its day-by-day history. While the
 * cycle is running, today's point is recorded first, so the chart reaches today even between the
 * hourly snapshots.
 */
export async function describeCycleWithHistory(client: DataClient, row: WorkCycleRow, today: string = utcDate()): Promise<WorkCycle & { history: WorkCycleDay[] }> {
	if (row.starts_on <= today && today <= row.ends_on) await snapshotCycleDays(client, today, { workspaceId: row.workspace_id, cycleId: row.id });
	const [cycle, history] = await Promise.all([describeCycle(client, row), cycleHistory(client, row.workspace_id, row.id)]);
	return { ...cycle, history };
}

/** A cycle with its counts and estimate totals (two count queries and one database function). */
export async function describeCycle(client: DataClient, row: WorkCycleRow): Promise<WorkCycle> {
	const [counts, estimates] = await Promise.all([
		itemCounts(client, row.workspace_id, "cycle_id", row.id),
		cycleEstimates(client, row.workspace_id, row.id),
	]);
	return formatWorkCycle(row, counts, estimates);
}

export async function loadWorkCycle(client: DataClient, workspaceId: string, id: string): Promise<WorkCycleRow | null> {
	const { data, error } = await client.from("work_cycles").select(CYCLE_COLUMNS).eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
	if (error) throw new Error(`work_cycles read failed: ${error.message}`);
	return (data as WorkCycleRow | null) ?? null;
}

/** Today's date in UTC (YYYY-MM-DD). */
export function utcDate(now: Date = new Date()): string {
	return now.toISOString().slice(0, 10);
}

/** The cycle covering `today` (starts_on <= today <= ends_on), or null. */
export async function loadCurrentCycle(client: DataClient, workspaceId: string, today: string = utcDate()): Promise<WorkCycleRow | null> {
	const { data, error } = await client.from("work_cycles").select(CYCLE_COLUMNS).eq("workspace_id", workspaceId)
		.lte("starts_on", today).gte("ends_on", today).order("starts_on", { ascending: false }).limit(1);
	if (error) throw new Error(`work_cycles read failed: ${error.message}`);
	return ((data ?? [])[0] as WorkCycleRow | undefined) ?? null;
}

/** The cycle after this one: the next by start date. */
export async function loadNextCycle(client: DataClient, cycle: WorkCycleRow): Promise<WorkCycleRow | null> {
	const { data, error } = await client.from("work_cycles").select(CYCLE_COLUMNS).eq("workspace_id", cycle.workspace_id)
		.gt("starts_on", cycle.starts_on).order("starts_on", { ascending: true }).limit(1);
	if (error) throw new Error(`work_cycles read failed: ${error.message}`);
	return ((data ?? [])[0] as WorkCycleRow | undefined) ?? null;
}

export type CycleInput = { name?: string | null; startsOn?: string; endsOn?: string };

/** Validates POST (creating: dates required) and PATCH /cycles bodies. ends_on must be after starts_on. */
export function parseCycleInput(body: Record<string, unknown>, creating: boolean, current?: Pick<WorkCycleRow, "starts_on" | "ends_on">): { ok: true; value: CycleInput } | { ok: false; message: string } {
	const value: CycleInput = {};
	if (body.name !== undefined) {
		if (body.name !== null && typeof body.name !== "string") return { ok: false, message: "name must be a string or null" };
		const name = typeof body.name === "string" ? body.name.trim() : "";
		if (name.length > MAX_CYCLE_NAME) return { ok: false, message: `name must be at most ${MAX_CYCLE_NAME} characters` };
		value.name = name || null;
	}
	for (const field of ["startsOn", "endsOn"] as const) {
		if (body[field] === undefined) {
			if (creating) return { ok: false, message: `${field} is required` };
			continue;
		}
		if (!isIsoDate(body[field])) return { ok: false, message: `${field} must be a date (YYYY-MM-DD)` };
		value[field] = body[field] as string;
	}
	const startsOn = value.startsOn ?? current?.starts_on;
	const endsOn = value.endsOn ?? current?.ends_on;
	if (startsOn && endsOn) {
		if (endsOn <= startsOn) return { ok: false, message: "endsOn must be after startsOn" };
		const days = (Date.parse(`${endsOn}T00:00:00Z`) - Date.parse(`${startsOn}T00:00:00Z`)) / 86_400_000;
		if (days > MAX_CYCLE_DAYS) return { ok: false, message: `A cycle can be at most ${MAX_CYCLE_DAYS} days long` };
	}
	return { ok: true, value };
}

/**
 * Inserts a cycle numbered max + 1 for the workspace, retrying once when another insert took the
 * number first (unique violation 23505).
 */
export async function insertCycle(client: DataClient, workspaceId: string, input: Required<Pick<CycleInput, "startsOn" | "endsOn">> & Pick<CycleInput, "name">): Promise<WorkCycleRow> {
	for (let attempt = 0; attempt < 2; attempt += 1) {
		const latest = await client.from("work_cycles").select("number").eq("workspace_id", workspaceId).order("number", { ascending: false }).limit(1);
		if (latest.error) throw new Error(`work_cycles read failed: ${latest.error.message}`);
		const number = Number(((latest.data ?? [])[0] as { number?: unknown } | undefined)?.number ?? 0) + 1;
		const { data, error } = await client.from("work_cycles").insert({
			workspace_id: workspaceId,
			number,
			name: input.name ?? null,
			starts_on: input.startsOn,
			ends_on: input.endsOn,
		}).select(CYCLE_COLUMNS).maybeSingle();
		if (!error && data) return data as WorkCycleRow;
		if (error?.code !== "23505" || attempt === 1) throw new Error(`work_cycles insert failed: ${error?.message ?? "no row returned"}`);
	}
	throw new Error("work_cycles insert failed");
}

/** Unfinished: not done and not cancelled. */
export function isUnfinished(item: Pick<WorkItemRow, "state">): boolean {
	return !CLOSED_WORK_ITEM_STATES.includes(item.state);
}
