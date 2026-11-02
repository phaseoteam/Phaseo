import type { getDataClient } from "@/data/supabase";
import { WORK_PROJECT_STATES, type WorkProject, type WorkProjectRow, type WorkProjectState } from "./types";

// Work projects: a named body of work with a lead, a target date and a state. Item counts come from
// count queries (one pair per project), never from adding up rows.

type DataClient = ReturnType<typeof getDataClient>;

export const PROJECT_COLUMNS = "id,workspace_id,name,description,state,lead_user_id,target_date,start_date,initiative_id,created_by,created_at,updated_at";
export const MAX_PROJECT_NAME = 120;
export const MAX_PROJECT_DESCRIPTION = 20_000;
export const MAX_PROJECTS_LISTED = 50;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isWorkProjectState(value: unknown): value is WorkProjectState {
	return typeof value === "string" && (WORK_PROJECT_STATES as readonly string[]).includes(value);
}

/** A calendar date (YYYY-MM-DD) that really exists. */
export function isIsoDate(value: unknown): value is string {
	if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
	const date = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export type ItemCounts = { itemCount: number; doneCount: number };

export function formatWorkProject(row: WorkProjectRow, counts: ItemCounts = { itemCount: 0, doneCount: 0 }): WorkProject {
	return {
		id: row.id,
		name: row.name,
		description: row.description ?? "",
		state: row.state,
		leadUserId: row.lead_user_id,
		targetDate: row.target_date,
		startDate: row.start_date ?? null,
		initiativeId: row.initiative_id ?? null,
		itemCount: counts.itemCount,
		doneCount: counts.doneCount,
		progress: progressShare(counts),
		createdBy: row.created_by,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/** The done share of the items (0 to 1, rounded to 4 places); 0 when there are none. */
export function progressShare(counts: ItemCounts): number {
	if (!counts.itemCount) return 0;
	return Math.round(Math.min(1, counts.doneCount / counts.itemCount) * 10_000) / 10_000;
}

async function countItems(client: DataClient, workspaceId: string, column: "project_id" | "cycle_id", id: string, doneOnly: boolean): Promise<number> {
	let query = client.from("work_items").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq(column, id);
	// Cancelled items are out of scope: they count towards neither the total nor done.
	query = doneOnly ? query.eq("state", "done") : query.neq("state", "cancelled");
	const { count, error } = await query;
	if (error) throw new Error(`work_items count failed: ${error.message}`);
	return count ?? 0;
}

/** Items (excluding cancelled) and done items in a project or cycle: two count queries. */
export async function itemCounts(client: DataClient, workspaceId: string, column: "project_id" | "cycle_id", id: string): Promise<ItemCounts> {
	const [itemCount, doneCount] = await Promise.all([
		countItems(client, workspaceId, column, id, false),
		countItems(client, workspaceId, column, id, true),
	]);
	return { itemCount, doneCount };
}

export async function loadWorkProject(client: DataClient, workspaceId: string, id: string): Promise<WorkProjectRow | null> {
	const { data, error } = await client.from("work_projects").select(PROJECT_COLUMNS).eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
	if (error) throw new Error(`work_projects read failed: ${error.message}`);
	return (data as WorkProjectRow | null) ?? null;
}

export type ProjectInput = {
	name?: string;
	description?: string;
	state?: WorkProjectState;
	leadUserId?: string | null;
	targetDate?: string | null;
	startDate?: string | null;
	initiativeId?: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Validates POST (creating: name required) and PATCH /projects bodies. */
export function parseProjectInput(body: Record<string, unknown>, creating: boolean): { ok: true; value: ProjectInput } | { ok: false; message: string } {
	const value: ProjectInput = {};
	if (body.name !== undefined || creating) {
		if (typeof body.name !== "string" || !body.name.trim()) return { ok: false, message: "name is required" };
		if (body.name.trim().length > MAX_PROJECT_NAME) return { ok: false, message: `name must be at most ${MAX_PROJECT_NAME} characters` };
		value.name = body.name.trim();
	}
	if (body.description !== undefined) {
		if (body.description !== null && typeof body.description !== "string") return { ok: false, message: "description must be a string" };
		const description = String(body.description ?? "");
		if (description.length > MAX_PROJECT_DESCRIPTION) return { ok: false, message: `description must be at most ${MAX_PROJECT_DESCRIPTION} characters` };
		value.description = description;
	}
	if (body.state !== undefined) {
		if (!isWorkProjectState(body.state)) return { ok: false, message: `state must be one of ${WORK_PROJECT_STATES.join(", ")}` };
		value.state = body.state;
	}
	if (body.leadUserId !== undefined) {
		if (body.leadUserId !== null && (typeof body.leadUserId !== "string" || !UUID.test(body.leadUserId))) return { ok: false, message: "leadUserId must be a user id or null" };
		value.leadUserId = body.leadUserId === null ? null : String(body.leadUserId).toLowerCase();
	}
	if (body.targetDate !== undefined) {
		if (body.targetDate !== null && body.targetDate !== "" && !isIsoDate(body.targetDate)) return { ok: false, message: "targetDate must be a date (YYYY-MM-DD) or null" };
		value.targetDate = body.targetDate ? String(body.targetDate) : null;
	}
	if (body.startDate !== undefined) {
		if (body.startDate !== null && body.startDate !== "" && !isIsoDate(body.startDate)) return { ok: false, message: "startDate must be a date (YYYY-MM-DD) or null" };
		value.startDate = body.startDate ? String(body.startDate) : null;
	}
	if (body.initiativeId !== undefined) {
		if (body.initiativeId !== null && (typeof body.initiativeId !== "string" || !UUID.test(body.initiativeId))) return { ok: false, message: "initiativeId must be an initiative id or null" };
		value.initiativeId = body.initiativeId === null ? null : String(body.initiativeId).toLowerCase();
	}
	return { ok: true, value };
}

export function projectRowPatch(input: ProjectInput): Record<string, unknown> {
	const patch: Record<string, unknown> = {};
	if (input.name !== undefined) patch.name = input.name;
	if (input.description !== undefined) patch.description = input.description;
	if (input.state !== undefined) patch.state = input.state;
	if (input.leadUserId !== undefined) patch.lead_user_id = input.leadUserId;
	if (input.targetDate !== undefined) patch.target_date = input.targetDate;
	if (input.startDate !== undefined) patch.start_date = input.startDate;
	if (input.initiativeId !== undefined) patch.initiative_id = input.initiativeId;
	return patch;
}
