import { Hono } from "hono";
import type { Env } from "@/env";
import {
	CYCLE_COLUMNS,
	MAX_CYCLES_LISTED,
	describeCycle,
	insertCycle,
	loadCurrentCycle,
	loadNextCycle,
	loadWorkCycle,
	parseCycleInput,
} from "@/work/cycles";
import { insightsRange, loadWorkInsights } from "@/work/insights";
import { WORK_ITEM_COLUMNS, formatWorkItem, updateWorkItem } from "@/work/items";
import {
	MAX_PROJECTS_LISTED,
	PROJECT_COLUMNS,
	formatWorkProject,
	isWorkProjectState,
	itemCounts,
	loadWorkProject,
	parseProjectInput,
	projectRowPatch,
} from "@/work/projects";
import { loadWorkSettings, parseWorkSettingsInput, saveWorkSettings } from "@/work/settings";
import type { WorkCycleRow, WorkItemRow, WorkProjectRow, WorkViewRow } from "@/work/types";
import { MAX_VIEWS, VIEW_COLUMNS, formatWorkView, parseViewInput } from "@/work/views";
import type { AccountWorkspaceContext } from "./context";
import {
	accessFromQuery,
	badRequest,
	isWorkspaceMember,
	isWorkspaceOwnerOrAdmin,
	json,
	mapLimit,
	notFound,
	pathUuid,
	readBody,
	unavailable,
	workAccess,
} from "./work-shared";

// Planning in the work tracker (/api/account/work): projects, cycles, saved views, the
// workspace's work settings and insights. Counts are count queries, estimate sums and insights
// are aggregated by the database.

export const accountWorkPlanningRouter = new Hono<{ Bindings: Env }>();

const MAX_ITEMS_LISTED = 200;
const MAX_ROLLOVER_ITEMS = 500;

async function listItems(context: AccountWorkspaceContext, column: "project_id" | "cycle_id", id: string) {
	const { data, error } = await context.client.from("work_items").select(WORK_ITEM_COLUMNS).eq("workspace_id", context.workspaceId).eq(column, id)
		.order("updated_at", { ascending: false }).limit(MAX_ITEMS_LISTED);
	if (error) throw new Error(`work_items read failed: ${error.message}`);
	const now = new Date();
	return ((data ?? []) as unknown as WorkItemRow[]).map((row) => formatWorkItem(row, null, { now }));
}

// ---------------------------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------------------------

async function describeProject(context: AccountWorkspaceContext, row: WorkProjectRow) {
	return formatWorkProject(row, await itemCounts(context.client, context.workspaceId, "project_id", row.id));
}

accountWorkPlanningRouter.get("/projects", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	let query = context.client.from("work_projects").select(PROJECT_COLUMNS).eq("workspace_id", context.workspaceId);
	const state = c.req.query("state")?.trim();
	if (state) {
		if (!isWorkProjectState(state)) return badRequest(c, "state is not valid");
		query = query.eq("state", state);
	}
	const { data, error } = await query.order("updated_at", { ascending: false }).limit(MAX_PROJECTS_LISTED);
	if (error) return unavailable(c);
	try {
		const projects = await mapLimit((data ?? []) as WorkProjectRow[], 10, (row) => describeProject(context, row));
		return json(c, { projects });
	} catch {
		return unavailable(c);
	}
});

accountWorkPlanningRouter.post("/projects", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const parsed = parseProjectInput(body, true);
	if (parsed.ok === false) return badRequest(c, parsed.message);
	if (parsed.value.leadUserId && !await isWorkspaceMember(context, parsed.value.leadUserId)) return badRequest(c, "leadUserId must be a member of the workspace");
	const { data, error } = await context.client.from("work_projects").insert({
		workspace_id: context.workspaceId,
		...projectRowPatch(parsed.value),
		created_by: context.user.id,
	}).select(PROJECT_COLUMNS).maybeSingle();
	if (error || !data) return unavailable(c, "work_project_create_failed");
	return json(c, { project: formatWorkProject(data as WorkProjectRow) }, 201);
});

accountWorkPlanningRouter.get("/projects/:id", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A project id is required");
	try {
		const row = await loadWorkProject(context.client, context.workspaceId, id);
		if (!row) return notFound(c, "Project not found");
		const [project, items] = await Promise.all([describeProject(context, row), listItems(context, "project_id", id)]);
		return json(c, { project, items });
	} catch {
		return unavailable(c);
	}
});

accountWorkPlanningRouter.patch("/projects/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A project id is required");
	const parsed = parseProjectInput(body, false);
	if (parsed.ok === false) return badRequest(c, parsed.message);
	if (parsed.value.leadUserId && !await isWorkspaceMember(context, parsed.value.leadUserId)) return badRequest(c, "leadUserId must be a member of the workspace");
	const patch = projectRowPatch(parsed.value);
	try {
		if (!Object.keys(patch).length) {
			const row = await loadWorkProject(context.client, context.workspaceId, id);
			return row ? json(c, { project: await describeProject(context, row) }) : notFound(c, "Project not found");
		}
		const { data, error } = await context.client.from("work_projects").update({ ...patch, updated_at: new Date().toISOString() })
			.eq("workspace_id", context.workspaceId).eq("id", id).select(PROJECT_COLUMNS).maybeSingle();
		if (error) return unavailable(c);
		if (!data) return notFound(c, "Project not found");
		return json(c, { project: await describeProject(context, data as WorkProjectRow) });
	} catch {
		return unavailable(c);
	}
});

accountWorkPlanningRouter.delete("/projects/:id", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A project id is required");
	// Items keep existing; their project_id is cleared by the foreign key (on delete set null).
	const { data, error } = await context.client.from("work_projects").delete().eq("workspace_id", context.workspaceId).eq("id", id).select("id");
	if (error) return unavailable(c);
	if (!(data ?? []).length) return notFound(c, "Project not found");
	return json(c, { deleted: true });
});

// ---------------------------------------------------------------------------------------------
// Cycles
// ---------------------------------------------------------------------------------------------

/** Another cycle overlapping these dates (cycles must not overlap), or null. */
async function overlappingCycle(context: AccountWorkspaceContext, startsOn: string, endsOn: string, exceptId?: string): Promise<WorkCycleRow | null> {
	let query = context.client.from("work_cycles").select(CYCLE_COLUMNS).eq("workspace_id", context.workspaceId).lt("starts_on", endsOn).gt("ends_on", startsOn);
	if (exceptId) query = query.neq("id", exceptId);
	const { data, error } = await query.limit(1);
	if (error) throw new Error(`work_cycles read failed: ${error.message}`);
	return ((data ?? [])[0] as WorkCycleRow | undefined) ?? null;
}

accountWorkPlanningRouter.get("/cycles", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const { data, error } = await context.client.from("work_cycles").select(CYCLE_COLUMNS).eq("workspace_id", context.workspaceId)
		.order("starts_on", { ascending: false }).limit(MAX_CYCLES_LISTED);
	if (error) return unavailable(c);
	try {
		// One count pair and one sum pair per cycle, at most 20 cycles.
		const cycles = await mapLimit((data ?? []) as WorkCycleRow[], 5, (row) => describeCycle(context.client, row));
		return json(c, { cycles });
	} catch {
		return unavailable(c);
	}
});

accountWorkPlanningRouter.get("/cycles/current", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	try {
		const row = await loadCurrentCycle(context.client, context.workspaceId);
		return json(c, { cycle: row ? await describeCycle(context.client, row) : null });
	} catch {
		return unavailable(c);
	}
});

accountWorkPlanningRouter.post("/cycles", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const parsed = parseCycleInput(body, true);
	if (parsed.ok === false) return badRequest(c, parsed.message);
	const { startsOn, endsOn, name } = parsed.value;
	try {
		if (await overlappingCycle(context, startsOn!, endsOn!)) return json(c, { error: "cycle_overlaps", message: "These dates overlap another cycle" }, 409);
		const row = await insertCycle(context.client, context.workspaceId, { startsOn: startsOn!, endsOn: endsOn!, name });
		return json(c, { cycle: await describeCycle(context.client, row) }, 201);
	} catch {
		return unavailable(c, "work_cycle_create_failed");
	}
});

accountWorkPlanningRouter.get("/cycles/:id", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A cycle id is required");
	try {
		const row = await loadWorkCycle(context.client, context.workspaceId, id);
		if (!row) return notFound(c, "Cycle not found");
		const [cycle, items] = await Promise.all([describeCycle(context.client, row), listItems(context, "cycle_id", id)]);
		return json(c, { cycle, items });
	} catch {
		return unavailable(c);
	}
});

accountWorkPlanningRouter.patch("/cycles/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A cycle id is required");
	try {
		const current = await loadWorkCycle(context.client, context.workspaceId, id);
		if (!current) return notFound(c, "Cycle not found");
		const parsed = parseCycleInput(body, false, current);
		if (parsed.ok === false) return badRequest(c, parsed.message);
		const patch: Record<string, unknown> = {};
		if (parsed.value.name !== undefined) patch.name = parsed.value.name;
		if (parsed.value.startsOn !== undefined) patch.starts_on = parsed.value.startsOn;
		if (parsed.value.endsOn !== undefined) patch.ends_on = parsed.value.endsOn;
		if (!Object.keys(patch).length) return json(c, { cycle: await describeCycle(context.client, current) });
		if ((patch.starts_on || patch.ends_on) && await overlappingCycle(context, parsed.value.startsOn ?? current.starts_on, parsed.value.endsOn ?? current.ends_on, id)) {
			return json(c, { error: "cycle_overlaps", message: "These dates overlap another cycle" }, 409);
		}
		const { data, error } = await context.client.from("work_cycles").update(patch).eq("workspace_id", context.workspaceId).eq("id", id).select(CYCLE_COLUMNS).maybeSingle();
		if (error || !data) return unavailable(c);
		return json(c, { cycle: await describeCycle(context.client, data as WorkCycleRow) });
	} catch {
		return unavailable(c);
	}
});

accountWorkPlanningRouter.delete("/cycles/:id", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A cycle id is required");
	// Items keep existing; their cycle_id is cleared by the foreign key (on delete set null).
	const { data, error } = await context.client.from("work_cycles").delete().eq("workspace_id", context.workspaceId).eq("id", id).select("id");
	if (error) return unavailable(c);
	if (!(data ?? []).length) return notFound(c, "Cycle not found");
	return json(c, { deleted: true });
});

accountWorkPlanningRouter.post("/cycles/:id/rollover", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A cycle id is required");
	try {
		const cycle = await loadWorkCycle(context.client, context.workspaceId, id);
		if (!cycle) return notFound(c, "Cycle not found");
		const next = await loadNextCycle(context.client, cycle);
		if (!next) return json(c, { error: "no_next_cycle", message: "Create the next cycle first" }, 409);
		const { data, error } = await context.client.from("work_items").select(WORK_ITEM_COLUMNS).eq("workspace_id", context.workspaceId).eq("cycle_id", id)
			.not("state", "in", "(done,cancelled)").order("number", { ascending: true }).limit(MAX_ROLLOVER_ITEMS);
		if (error) return unavailable(c);
		const rows = (data ?? []) as unknown as WorkItemRow[];
		const actor = { kind: "user" as const, userId: context.user.id, name: access.actorName };
		let moved = 0;
		let failed = 0;
		// Each item gets its cycle event; rollover is not worth a notification per item.
		await mapLimit(rows, 5, async (item) => {
			try {
				await updateWorkItem(context.client, item, { cycleId: next.id }, actor, { quiet: true });
				moved += 1;
			} catch {
				failed += 1;
			}
		});
		return json(c, { moved, failed, more: rows.length === MAX_ROLLOVER_ITEMS, nextCycle: await describeCycle(context.client, next) });
	} catch {
		return unavailable(c);
	}
});

// ---------------------------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------------------------

/** A view the person may change: shared views, or their own. */
async function editableView(context: AccountWorkspaceContext, id: string): Promise<WorkViewRow | null | "forbidden"> {
	const { data, error } = await context.client.from("work_views").select(VIEW_COLUMNS).eq("workspace_id", context.workspaceId).eq("id", id).maybeSingle();
	if (error) throw new Error(`work_views read failed: ${error.message}`);
	const row = data as WorkViewRow | null;
	if (!row) return null;
	return row.owner_user_id === null || row.owner_user_id === context.user.id ? row : "forbidden";
}

accountWorkPlanningRouter.get("/views", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const { data, error } = await context.client.from("work_views").select(VIEW_COLUMNS).eq("workspace_id", context.workspaceId)
		.or(`owner_user_id.is.null,owner_user_id.eq.${context.user.id}`)
		.order("position", { ascending: true }).order("created_at", { ascending: true }).limit(MAX_VIEWS);
	if (error) return unavailable(c);
	return json(c, { views: ((data ?? []) as WorkViewRow[]).map(formatWorkView) });
});

accountWorkPlanningRouter.post("/views", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const parsed = parseViewInput(body, true);
	if (parsed.ok === false) return badRequest(c, parsed.message);
	const { data, error } = await context.client.from("work_views").insert({
		workspace_id: context.workspaceId,
		owner_user_id: parsed.value.shared ? null : context.user.id,
		name: parsed.value.name,
		filters: parsed.value.filters ?? {},
		layout: parsed.value.layout ?? "list",
		position: parsed.value.position ?? 0,
	}).select(VIEW_COLUMNS).maybeSingle();
	if (error || !data) return unavailable(c, "work_view_create_failed");
	return json(c, { view: formatWorkView(data as WorkViewRow) }, 201);
});

accountWorkPlanningRouter.patch("/views/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A view id is required");
	const parsed = parseViewInput(body, false);
	if (parsed.ok === false) return badRequest(c, parsed.message);
	try {
		const view = await editableView(context, id);
		if (!view) return notFound(c, "View not found");
		if (view === "forbidden") return json(c, { error: "forbidden", message: "Only the owner can change a personal view" }, 403);
		const patch: Record<string, unknown> = {};
		if (parsed.value.name !== undefined) patch.name = parsed.value.name;
		if (parsed.value.filters !== undefined) patch.filters = parsed.value.filters;
		if (parsed.value.layout !== undefined) patch.layout = parsed.value.layout;
		if (parsed.value.position !== undefined) patch.position = parsed.value.position;
		if (parsed.value.shared !== undefined) patch.owner_user_id = parsed.value.shared ? null : context.user.id;
		if (!Object.keys(patch).length) return json(c, { view: formatWorkView(view) });
		const { data, error } = await context.client.from("work_views").update({ ...patch, updated_at: new Date().toISOString() })
			.eq("workspace_id", context.workspaceId).eq("id", id).select(VIEW_COLUMNS).maybeSingle();
		if (error || !data) return unavailable(c);
		return json(c, { view: formatWorkView(data as WorkViewRow) });
	} catch {
		return unavailable(c);
	}
});

accountWorkPlanningRouter.delete("/views/:id", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A view id is required");
	try {
		const view = await editableView(context, id);
		if (!view) return notFound(c, "View not found");
		if (view === "forbidden") return json(c, { error: "forbidden", message: "Only the owner can delete a personal view" }, 403);
		const { error } = await context.client.from("work_views").delete().eq("workspace_id", context.workspaceId).eq("id", id);
		if (error) return unavailable(c);
		return json(c, { deleted: true });
	} catch {
		return unavailable(c);
	}
});

// ---------------------------------------------------------------------------------------------
// Settings and insights
// ---------------------------------------------------------------------------------------------

accountWorkPlanningRouter.get("/settings", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	try {
		return json(c, { settings: await loadWorkSettings(access.context.client, access.context.workspaceId), canEdit: isWorkspaceOwnerOrAdmin(access.context) });
	} catch {
		return unavailable(c);
	}
});

accountWorkPlanningRouter.put("/settings", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	if (!isWorkspaceOwnerOrAdmin(context)) return json(c, { error: "forbidden", message: "Only workspace owners and admins can change work settings" }, 403);
	const parsed = parseWorkSettingsInput(body);
	if (parsed.ok === false) return badRequest(c, parsed.message);
	try {
		return json(c, { settings: await saveWorkSettings(context.client, context.workspaceId, parsed.value, context.user.id) });
	} catch {
		return unavailable(c, "work_settings_save_failed");
	}
});

accountWorkPlanningRouter.get("/insights", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const range = insightsRange(c.req.query("from"), c.req.query("to"));
	if (range.ok === false) return badRequest(c, range.message);
	try {
		return json(c, { insights: await loadWorkInsights(access.context.client, access.context.workspaceId, range) });
	} catch {
		return unavailable(c);
	}
});
