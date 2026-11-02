import { WORK_AGENTS, WORK_ITEM_SOURCES, WORK_ITEM_STATES, WORK_VIEW_LAYOUTS, type WorkItemSource, type WorkView, type WorkViewFilters, type WorkViewLayout, type WorkViewRow } from "./types";

// Saved views of work items. The filters are the same as GET /items' query parameters and are
// validated with the same rules, so a saved view can be passed straight to the list.

export const VIEW_COLUMNS = "id,workspace_id,owner_user_id,name,filters,layout,position,created_at,updated_at";
export const MAX_VIEW_NAME = 80;
export const MAX_VIEWS = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILTER_KEYS = ["q", "state", "source", "assignee", "label", "projectId", "cycleId", "priority", "parent", "blocked"] as const;

type Result<T> = { ok: true; value: T } | { ok: false; message: string };

/** `state`: "open" or a comma-separated list of states. */
export function isStateFilter(value: unknown): value is string {
	if (typeof value !== "string" || !value.trim()) return false;
	if (value.trim() === "open") return true;
	return value.split(",").map((part) => part.trim()).filter(Boolean).every((part) => (WORK_ITEM_STATES as readonly string[]).includes(part));
}

/** `assignee`: me, none, agent, an agent name or a user id. */
export function isAssigneeFilter(value: unknown): value is string {
	if (typeof value !== "string") return false;
	return value === "me" || value === "none" || value === "agent" || (WORK_AGENTS as readonly string[]).includes(value) || UUID.test(value);
}

/** Validates a view's filters: only the item list's filter names, each with a valid value. */
export function parseViewFilters(input: unknown): Result<WorkViewFilters> {
	if (input === undefined || input === null) return { ok: true, value: {} };
	if (typeof input !== "object" || Array.isArray(input)) return { ok: false, message: "filters must be an object" };
	const raw = input as Record<string, unknown>;
	const unknownKey = Object.keys(raw).find((key) => !(FILTER_KEYS as readonly string[]).includes(key));
	if (unknownKey) return { ok: false, message: `filters.${unknownKey} is not a filter` };
	const filters: WorkViewFilters = {};
	for (const key of FILTER_KEYS) {
		const value = raw[key];
		if (value === undefined || value === null || value === "") continue;
		switch (key) {
			case "q":
				if (typeof value !== "string" || value.length > 200) return { ok: false, message: "filters.q must be text of at most 200 characters" };
				filters.q = value.trim();
				break;
			case "state":
				if (!isStateFilter(value)) return { ok: false, message: "filters.state must be open or a list of states" };
				filters.state = value.trim();
				break;
			case "source":
				if (!(WORK_ITEM_SOURCES as readonly string[]).includes(value as string)) return { ok: false, message: "filters.source is not valid" };
				filters.source = value as WorkItemSource;
				break;
			case "assignee":
				if (!isAssigneeFilter(value)) return { ok: false, message: "filters.assignee must be me, none, agent, an agent name or a user id" };
				filters.assignee = (value as string).toLowerCase();
				break;
			case "label":
				if (typeof value !== "string" || value.length > 40) return { ok: false, message: "filters.label must be a label" };
				filters.label = value.trim().toLowerCase();
				break;
			case "projectId":
			case "cycleId":
				if (typeof value !== "string" || !UUID.test(value)) return { ok: false, message: `filters.${key} must be an id` };
				filters[key] = value.toLowerCase();
				break;
			case "priority":
				if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 4) return { ok: false, message: "filters.priority must be 0 to 4" };
				filters.priority = value;
				break;
			case "parent":
				if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return { ok: false, message: "filters.parent must be an item number" };
				filters.parent = value;
				break;
			case "blocked":
				if (typeof value !== "boolean") return { ok: false, message: "filters.blocked must be true or false" };
				if (value) filters.blocked = true;
				break;
		}
	}
	return { ok: true, value: filters };
}

export type ViewInput = { name?: string; filters?: WorkViewFilters; layout?: WorkViewLayout; position?: number; shared?: boolean };

export function parseViewInput(body: Record<string, unknown>, creating: boolean): Result<ViewInput> {
	const value: ViewInput = {};
	if (body.name !== undefined || creating) {
		if (typeof body.name !== "string" || !body.name.trim()) return { ok: false, message: "name is required" };
		if (body.name.trim().length > MAX_VIEW_NAME) return { ok: false, message: `name must be at most ${MAX_VIEW_NAME} characters` };
		value.name = body.name.trim();
	}
	if (body.filters !== undefined) {
		const filters = parseViewFilters(body.filters);
		if (filters.ok === false) return filters;
		value.filters = filters.value;
	}
	if (body.layout !== undefined) {
		if (!(WORK_VIEW_LAYOUTS as readonly string[]).includes(body.layout as string)) return { ok: false, message: "layout must be list or board" };
		value.layout = body.layout as WorkViewLayout;
	}
	if (body.position !== undefined) {
		if (typeof body.position !== "number" || !Number.isInteger(body.position) || body.position < 0 || body.position > 10_000) return { ok: false, message: "position must be a whole number from 0 to 10000" };
		value.position = body.position;
	}
	if (body.shared !== undefined) {
		if (typeof body.shared !== "boolean") return { ok: false, message: "shared must be true or false" };
		value.shared = body.shared;
	}
	return { ok: true, value };
}

export function formatWorkView(row: WorkViewRow): WorkView {
	const filters = parseViewFilters(row.filters);
	return {
		id: row.id,
		name: row.name,
		shared: row.owner_user_id === null,
		ownerUserId: row.owner_user_id,
		filters: filters.ok ? filters.value : {},
		layout: row.layout,
		position: row.position,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}
