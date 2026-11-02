import { Hono } from "hono";
import type { Env } from "@/env";
import { loadWorkCycle } from "@/work/cycles";
import { createGithubIssue } from "@/work/github";
import {
	MAX_PARENT_DEPTH,
	MAX_TITLE_LENGTH,
	WORK_ITEM_COLUMNS,
	bumpWorkItemActivity,
	createWorkItem,
	formatAgentRun,
	formatCustomerRequest,
	formatErrorGroup,
	formatWorkItem,
	formatWorkItemEvent,
	insertWorkItemEvent,
	isEstimate,
	isGithubRepo,
	isPriority,
	isWorkAgent,
	isWorkItemState,
	loadWorkItemById,
	loadWorkItemByNumber,
	normalizeLabels,
	updateWorkItem,
	wouldCreateParentCycle,
	type DataClient,
	type WorkItemChanges,
	type WorkItemFormatExtras,
} from "@/work/items";
import { isSubscribed, notify, notifySubscribers, resolveMentions, subscribe, subscriberIds, unsubscribe } from "@/work/notifications";
import { loadWorkProject } from "@/work/projects";
import { blockedItemIds, countOpenBlockers, loadRelations, relationExists, storedRelation } from "@/work/relations";
import { onWorkItemDone, registerReplyDraftRoutes } from "@/work/support";
import { triageWorkItem } from "@/work/triage";
import {
	AGENT_RUN_STATUSES,
	FINISHED_AGENT_RUN_STATUSES,
	WORK_ITEM_SOURCES,
	WORK_ITEM_STATES,
	type AgentRunRow,
	type AgentRunStatus,
	type WorkAgent,
	type WorkItemRow,
} from "@/work/types";
import type { AccountWorkspaceContext } from "./context";
import { accountWorkCustomersRouter } from "./work-customers";
import { accountWorkNotificationsRouter } from "./work-notifications";
import { accountWorkPlanningRouter } from "./work-planning";
import { accountWorkSettingsRouter } from "./work-settings";
import {
	accessFromQuery,
	backgroundRunner,
	badRequest,
	clampLimit,
	isWorkspaceMember,
	json,
	listWorkMembers,
	mapLimit,
	notFound,
	optionalText,
	optionalUuid,
	pathNumber,
	pathUuid,
	readBody,
	unavailable,
	UUID_PATTERN,
	workAccess,
	type Body,
	type WorkAccess,
} from "./work-shared";

// The work tracker's account API, mounted at /api/account/work: work items (with sub-items,
// relations, bulk changes and subscriptions), their timeline, triage, GitHub issues, members and
// agent runs (including runs reported by desktops). Customers and requests live in
// work-customers.ts; intake forms, error projects, errors and GitHub repos in work-settings.ts;
// projects, cycles, views, settings and insights in work-planning.ts; notifications in
// work-notifications.ts. Reply drafts are the support agent's handlers (src/work/support.ts).

const MAX_DESCRIPTION_CHARS = 100_000;
const MAX_COMMENT_CHARS = 20_000;
const MAX_BULK_ITEMS = 100;
const MAX_CHILDREN = 100;
const COUNT_CONCURRENCY = 10;
const MAX_RUN_SUMMARY = 4000;
const MAX_RUN_MODEL = 200;
const MAX_RUN_COST_NANOS = 1_000_000_000_000_000;

export const accountWorkRouter = new Hono<{ Bindings: Env }>();

/** Numbers for the items' duplicate_of and parent ids, in one query. */
async function relatedNumbers(client: DataClient, workspaceId: string, rows: WorkItemRow[]): Promise<Map<string, number>> {
	const ids = [...new Set(rows.flatMap((row) => [row.duplicate_of, row.parent_id]).filter((id): id is string => Boolean(id)))];
	if (!ids.length) return new Map();
	const { data } = await client.from("work_items").select("id,number").eq("workspace_id", workspaceId).in("id", ids);
	return new Map((data ?? []).map((row: any) => [String(row.id), Number(row.number)]));
}

async function formatItems(client: DataClient, workspaceId: string, rows: WorkItemRow[], extras: Array<WorkItemFormatExtras | undefined> = []) {
	const numbers = await relatedNumbers(client, workspaceId, rows);
	const now = new Date();
	return rows.map((row, index) => formatWorkItem(row, row.duplicate_of ? numbers.get(row.duplicate_of) ?? null : null, {
		now,
		parentNumber: row.parent_id ? numbers.get(row.parent_id) ?? null : null,
		...extras[index],
	}));
}

async function formatOne(client: DataClient, workspaceId: string, row: WorkItemRow) {
	const [formatted] = await formatItems(client, workspaceId, [row]);
	return formatted!;
}

/** Sub-items (count query). */
async function countChildren(client: DataClient, workspaceId: string, itemId: string): Promise<number> {
	const { count, error } = await client.from("work_items").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("parent_id", itemId);
	if (error) throw new Error(`work_items count failed: ${error.message}`);
	return count ?? 0;
}

export function encodeCursor(row: Pick<WorkItemRow, "updated_at" | "id">): string {
	return btoa(`${row.updated_at}|${row.id}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCursor(cursor: string): { updatedAt: string; id: string } | null {
	try {
		const text = atob(cursor.replace(/-/g, "+").replace(/_/g, "/"));
		const [updatedAt, id] = text.split("|");
		if (!updatedAt || !id || !UUID_PATTERN.test(id) || Number.isNaN(Date.parse(updatedAt))) return null;
		return { updatedAt, id };
	} catch {
		return null;
	}
}

type ParsedChanges =
	| { ok: true; changes: WorkItemChanges; duplicateNumber?: number | null; parentNumber?: number | null }
	| { ok: false; message: string };

function isTimestamp(value: unknown): value is string {
	return typeof value === "string" && value.length <= 40 && /^\d{4}-\d{2}-\d{2}/.test(value) && Number.isFinite(Date.parse(value));
}

/** The fields shared by POST and PATCH /items. Validation only; ids are resolved by the caller. */
function parseItemFields(body: Body, creating: boolean): ParsedChanges {
	const changes: WorkItemChanges = {};
	const title = optionalText(body, "title", MAX_TITLE_LENGTH, { required: creating, nullable: false });
	if (title.ok === false) return title;
	if (title.value) changes.title = title.value;
	if (body.description !== undefined) {
		if (body.description !== null && typeof body.description !== "string") return { ok: false, message: "description must be a string" };
		const description = String(body.description ?? "");
		if (description.length > MAX_DESCRIPTION_CHARS) return { ok: false, message: `description must be at most ${MAX_DESCRIPTION_CHARS} characters` };
		changes.description = description;
	}
	if (body.state !== undefined) {
		if (!isWorkItemState(body.state)) return { ok: false, message: `state must be one of ${WORK_ITEM_STATES.join(", ")}` };
		changes.state = body.state;
	}
	if (body.priority !== undefined) {
		if (!isPriority(body.priority)) return { ok: false, message: "priority must be 0 to 4" };
		changes.priority = body.priority;
	}
	if (body.labels !== undefined) {
		const labels = normalizeLabels(body.labels);
		if (!labels) return { ok: false, message: "labels must be at most 20 short strings" };
		changes.labels = labels;
	}
	if (body.assigneeUserId !== undefined) {
		if (body.assigneeUserId !== null && (typeof body.assigneeUserId !== "string" || !UUID_PATTERN.test(body.assigneeUserId))) return { ok: false, message: "assigneeUserId must be a user id or null" };
		changes.assigneeUserId = body.assigneeUserId === null ? null : String(body.assigneeUserId).toLowerCase();
	}
	if (body.assigneeAgent !== undefined) {
		if (body.assigneeAgent !== null && !isWorkAgent(body.assigneeAgent)) return { ok: false, message: "assigneeAgent must be triage, engineer, support or null" };
		changes.assigneeAgent = body.assigneeAgent as WorkItemChanges["assigneeAgent"];
	}
	if (body.githubRepo !== undefined) {
		if (body.githubRepo !== null && body.githubRepo !== "" && !isGithubRepo(body.githubRepo)) return { ok: false, message: "githubRepo must look like owner/name" };
		changes.githubRepo = body.githubRepo ? String(body.githubRepo) : null;
	}
	for (const field of ["projectId", "cycleId"] as const) {
		const id = optionalUuid(body, field);
		if (id.ok === false) return id;
		if (id.value !== undefined) changes[field] = id.value;
	}
	if (body.estimate !== undefined) {
		if (body.estimate !== null && !isEstimate(body.estimate)) return { ok: false, message: "estimate must be 0 to 21 or null" };
		changes.estimate = body.estimate as number | null;
	}
	if (body.dueAt !== undefined) {
		if (body.dueAt !== null && body.dueAt !== "" && !isTimestamp(body.dueAt)) return { ok: false, message: "dueAt must be a date or timestamp, or null" };
		changes.dueAt = body.dueAt ? new Date(Date.parse(String(body.dueAt).length === 10 ? `${body.dueAt}T00:00:00Z` : String(body.dueAt))).toISOString() : null;
	}
	let parentNumber: number | null | undefined;
	if (body.parentNumber !== undefined) {
		if (body.parentNumber !== null && (typeof body.parentNumber !== "number" || !Number.isInteger(body.parentNumber) || body.parentNumber <= 0)) return { ok: false, message: "parentNumber must be an item number or null" };
		parentNumber = body.parentNumber as number | null;
	}
	let duplicateNumber: number | null | undefined;
	if (!creating && body.duplicateOf !== undefined) {
		if (body.duplicateOf !== null && (typeof body.duplicateOf !== "number" || !Number.isInteger(body.duplicateOf) || body.duplicateOf <= 0)) return { ok: false, message: "duplicateOf must be an item number or null" };
		duplicateNumber = body.duplicateOf as number | null;
	}
	return { ok: true, changes, duplicateNumber, parentNumber };
}

async function checkAssignee(context: AccountWorkspaceContext, changes: WorkItemChanges): Promise<string | null> {
	if (!changes.assigneeUserId) return null;
	return await isWorkspaceMember(context, changes.assigneeUserId) ? null : "assigneeUserId must be a member of the workspace";
}

/** Checks that a project and cycle belong to the workspace. */
async function checkPlanning(context: AccountWorkspaceContext, changes: Pick<WorkItemChanges, "projectId" | "cycleId">): Promise<string | null> {
	if (changes.projectId && !await loadWorkProject(context.client, context.workspaceId, changes.projectId)) return "projectId must be a project in this workspace";
	if (changes.cycleId && !await loadWorkCycle(context.client, context.workspaceId, changes.cycleId)) return "cycleId must be a cycle in this workspace";
	return null;
}

/**
 * Resolves parentNumber to parent_id. For an existing item, refuses a parent that would make the
 * item its own ancestor (walking up at most MAX_PARENT_DEPTH levels).
 */
async function resolveParent(context: AccountWorkspaceContext, item: WorkItemRow | null, parentNumber: number | null | undefined): Promise<{ ok: true; parentId?: string | null } | { ok: false; message: string }> {
	if (parentNumber === undefined) return { ok: true };
	if (parentNumber === null) return { ok: true, parentId: null };
	if (item && parentNumber === item.number) return { ok: false, message: "An item cannot be its own parent" };
	const parent = await loadWorkItemByNumber(context.client, context.workspaceId, parentNumber);
	if (!parent) return { ok: false, message: "parentNumber must be the number of an item in this workspace" };
	if (item && await wouldCreateParentCycle(context.client, context.workspaceId, item.id, parent.id)) {
		return { ok: false, message: `That parent would make the item its own ancestor (or nest deeper than ${MAX_PARENT_DEPTH} levels)` };
	}
	return { ok: true, parentId: parent.id };
}

/** Starts the support agent's drafts when an item has just become done (B's onWorkItemDone). */
function afterDone(c: any, access: WorkAccess, before: WorkItemRow, after: WorkItemRow): void {
	if (after.state !== "done" || before.state === "done") return;
	backgroundRunner(c)(onWorkItemDone({
		env: c.env,
		client: access.context.client,
		workspaceId: access.context.workspaceId,
		itemId: after.id,
		requestedBy: { id: access.context.user.id, appMetadata: access.context.user.appMetadata },
		waitUntil: backgroundRunner(c),
	}));
}

function userActor(access: WorkAccess) {
	return { kind: "user" as const, userId: access.context.user.id, name: access.actorName };
}

// ---------------------------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------------------------

accountWorkRouter.get("/items", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const limit = clampLimit(c.req.query("limit"), 50, 200);
	let query = context.client.from("work_items").select(WORK_ITEM_COLUMNS).eq("workspace_id", context.workspaceId);

	const state = c.req.query("state")?.trim();
	if (state === "open") query = query.not("state", "in", "(done,cancelled)");
	else if (state) {
		const states = state.split(",").map((value) => value.trim()).filter(Boolean);
		if (!states.every(isWorkItemState)) return badRequest(c, "state must be open or a list of states");
		query = query.in("state", states);
	}
	const source = c.req.query("source")?.trim();
	if (source) {
		if (!(WORK_ITEM_SOURCES as readonly string[]).includes(source)) return badRequest(c, "source is not valid");
		query = query.eq("source", source);
	}
	const assignee = c.req.query("assignee")?.trim();
	if (assignee) {
		if (assignee === "me") query = query.eq("assignee_user_id", context.user.id);
		else if (assignee === "none") query = query.is("assignee_user_id", null).is("assignee_agent", null);
		else if (assignee === "agent") query = query.not("assignee_agent", "is", null);
		else if (isWorkAgent(assignee)) query = query.eq("assignee_agent", assignee);
		else if (UUID_PATTERN.test(assignee)) query = query.eq("assignee_user_id", assignee.toLowerCase());
		else return badRequest(c, "assignee must be me, none, agent, an agent name or a user id");
	}
	const label = c.req.query("label")?.trim().toLowerCase();
	if (label) query = query.contains("labels", [label.slice(0, 40)]);
	for (const [param, column] of [["projectId", "project_id"], ["cycleId", "cycle_id"]] as const) {
		const value = c.req.query(param)?.trim().toLowerCase();
		if (!value) continue;
		if (value === "none") query = query.is(column, null);
		else if (UUID_PATTERN.test(value)) query = query.eq(column, value);
		else return badRequest(c, `${param} must be an id or none`);
	}
	const priority = c.req.query("priority")?.trim();
	if (priority) {
		const value = Number(priority);
		if (!isPriority(value)) return badRequest(c, "priority must be 0 to 4");
		query = query.eq("priority", value);
	}
	const parent = c.req.query("parent")?.trim();
	if (parent) {
		const number = Number(parent);
		if (!Number.isInteger(number) || number <= 0) return badRequest(c, "parent must be an item number");
		const parentItem = await loadWorkItemByNumber(context.client, context.workspaceId, number).catch(() => undefined);
		if (parentItem === undefined) return unavailable(c);
		if (!parentItem) return json(c, { items: [], nextCursor: null });
		query = query.eq("parent_id", parentItem.id);
	}
	if (c.req.query("blocked") === "true") {
		const ids = await blockedItemIds(context.client, context.workspaceId).catch(() => null);
		if (!ids) return unavailable(c);
		if (!ids.length) return json(c, { items: [], nextCursor: null });
		query = query.in("id", ids);
	}
	const q = c.req.query("q")?.trim().slice(0, 200);
	if (q) {
		const number = /^#?(\d{1,9})$/.exec(q)?.[1];
		query = number ? query.eq("number", Number(number)) : query.ilike("title", `%${q.replace(/[\\%_]/g, (match) => `\\${match}`)}%`);
	}
	const cursorText = c.req.query("cursor")?.trim();
	if (cursorText) {
		const cursor = decodeCursor(cursorText);
		if (!cursor) return badRequest(c, "cursor is not valid");
		query = query.or(`updated_at.lt."${cursor.updatedAt}",and(updated_at.eq."${cursor.updatedAt}",id.lt.${cursor.id})`);
	}
	const { data, error } = await query.order("updated_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
	if (error) return unavailable(c);
	const rows = (data ?? []) as unknown as WorkItemRow[];
	const page = rows.slice(0, limit);
	let extras: WorkItemFormatExtras[];
	try {
		// Count queries per item on the page (sub-items and open blockers), a few at a time.
		extras = await mapLimit(page, COUNT_CONCURRENCY, async (row) => {
			const [childCount, blockedByCount] = await Promise.all([
				countChildren(context.client, context.workspaceId, row.id),
				countOpenBlockers(context.client, context.workspaceId, row.id),
			]);
			return { childCount, blockedByCount };
		});
	} catch {
		return unavailable(c);
	}
	return json(c, {
		items: await formatItems(context.client, context.workspaceId, page, extras),
		nextCursor: rows.length > limit && page.length ? encodeCursor(page[page.length - 1]!) : null,
	});
});

accountWorkRouter.post("/items", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const parsed = parseItemFields(body, true);
	if (parsed.ok === false) return badRequest(c, parsed.message);
	const { changes } = parsed;
	try {
		const assigneeError = await checkAssignee(context, changes);
		if (assigneeError) return badRequest(c, assigneeError);
		const planningError = await checkPlanning(context, changes);
		if (planningError) return badRequest(c, planningError);
		const parent = await resolveParent(context, null, parsed.parentNumber);
		if (parent.ok === false) return badRequest(c, parent.message);
		const row = await createWorkItem(context.client, {
			workspaceId: context.workspaceId,
			title: changes.title!,
			description: changes.description,
			state: changes.state,
			priority: changes.priority,
			source: "manual",
			createdBy: context.user.id,
			authorKind: "user",
			actorName: access.actorName,
			labels: changes.labels,
			assigneeUserId: changes.assigneeUserId,
			assigneeAgent: changes.assigneeAgent,
			githubRepo: changes.githubRepo,
			projectId: changes.projectId,
			cycleId: changes.cycleId,
			parentId: parent.parentId ?? null,
			estimate: changes.estimate,
			dueAt: changes.dueAt,
		});
		return json(c, { item: await formatOne(context.client, context.workspaceId, row) }, 201);
	} catch {
		return unavailable(c, "work_item_create_failed");
	}
});

async function itemFromPath(c: any, context: AccountWorkspaceContext): Promise<{ item: WorkItemRow } | { response: Response }> {
	const number = pathNumber(c);
	if (!number) return { response: badRequest(c, "A work item number is required") };
	try {
		const item = await loadWorkItemByNumber(context.client, context.workspaceId, number);
		return item ? { item } : { response: notFound(c, "Work item not found") };
	} catch {
		return { response: unavailable(c) };
	}
}

accountWorkRouter.get("/items/:number", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const found = await itemFromPath(c, context);
	if ("response" in found) return found.response;
	const { item } = found;
	const [events, requests, runs, group, children] = await Promise.all([
		context.client.from("work_item_events").select("*").eq("workspace_id", context.workspaceId).eq("work_item_id", item.id)
			.order("created_at", { ascending: true }).limit(500),
		context.client.from("work_customer_requests").select("*,customer:work_customers(name)").eq("workspace_id", context.workspaceId).eq("work_item_id", item.id)
			.order("created_at", { ascending: false }).limit(100),
		context.client.from("work_agent_runs").select("*").eq("workspace_id", context.workspaceId).eq("work_item_id", item.id)
			.order("created_at", { ascending: false }).limit(50),
		item.error_group_id
			? context.client.from("work_error_groups").select("*,project:work_error_projects(name)").eq("workspace_id", context.workspaceId).eq("id", item.error_group_id).maybeSingle()
			: Promise.resolve({ data: null, error: null }),
		context.client.from("work_items").select(WORK_ITEM_COLUMNS).eq("workspace_id", context.workspaceId).eq("parent_id", item.id)
			.order("number", { ascending: true }).limit(MAX_CHILDREN),
	]);
	if (events.error || requests.error || runs.error || group.error || children.error) return unavailable(c);
	let relations;
	let parent: WorkItemRow | null = null;
	try {
		[relations, parent] = await Promise.all([
			loadRelations(context.client, context.workspaceId, item.id),
			item.parent_id ? loadWorkItemById(context.client, context.workspaceId, item.parent_id) : Promise.resolve(null),
		]);
	} catch {
		return unavailable(c);
	}
	const subscribed = await isSubscribed(context.client, item.id, context.user.id);
	const childRows = (children.data ?? []) as unknown as WorkItemRow[];
	const [formatted, ...formattedChildren] = await formatItems(context.client, context.workspaceId, [item, ...childRows]);
	return json(c, {
		item: formatted,
		events: (events.data ?? []).map((row: any) => formatWorkItemEvent(row)),
		requests: (requests.data ?? []).map((row: any) => formatCustomerRequest({ ...row, item: { number: item.number } })),
		runs: (runs.data ?? []).map((row: any) => formatAgentRun({ ...row, item: { number: item.number } })),
		...(group.data ? { errorGroup: formatErrorGroup({ ...(group.data as any), item: { number: item.number } }) } : {}),
		children: formattedChildren,
		parent: parent ? await formatOne(context.client, context.workspaceId, parent) : null,
		relations,
		subscribed,
	});
});

accountWorkRouter.patch("/items/:number", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const parsed = parseItemFields(body, false);
	if (parsed.ok === false) return badRequest(c, parsed.message);
	const found = await itemFromPath(c, context);
	if ("response" in found) return found.response;
	const { item } = found;
	const changes = { ...parsed.changes };
	try {
		const assigneeError = await checkAssignee(context, changes);
		if (assigneeError) return badRequest(c, assigneeError);
		const planningError = await checkPlanning(context, changes);
		if (planningError) return badRequest(c, planningError);
		const parent = await resolveParent(context, item, parsed.parentNumber);
		if (parent.ok === false) return badRequest(c, parent.message);
		if (parent.parentId !== undefined) changes.parentId = parent.parentId;
		if (parsed.duplicateNumber !== undefined) {
			if (parsed.duplicateNumber === null) changes.duplicateOf = null;
			else {
				if (parsed.duplicateNumber === item.number) return badRequest(c, "An item cannot duplicate itself");
				const original = await loadWorkItemByNumber(context.client, context.workspaceId, parsed.duplicateNumber).catch(() => null);
				if (!original) return badRequest(c, "duplicateOf must be the number of an item in this workspace");
				changes.duplicateOf = original.id;
			}
		}
	} catch {
		return unavailable(c);
	}
	try {
		const updated = await updateWorkItem(context.client, item, changes, userActor(access));
		afterDone(c, access, item, updated);
		return json(c, { item: await formatOne(context.client, context.workspaceId, updated) });
	} catch {
		return unavailable(c, "work_item_update_failed");
	}
});

// ---------------------------------------------------------------------------------------------
// Bulk changes
// ---------------------------------------------------------------------------------------------

type BulkChanges = {
	state?: WorkItemRow["state"];
	priority?: number;
	assigneeUserId?: string | null;
	assigneeAgent?: WorkAgent | null;
	labelsAdd?: string[];
	labelsRemove?: string[];
	projectId?: string | null;
	cycleId?: string | null;
};

function parseBulkChanges(input: unknown): { ok: true; value: BulkChanges } | { ok: false; message: string } {
	if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, message: "changes must be an object" };
	const raw = input as Body;
	const allowed = ["state", "priority", "assigneeUserId", "assigneeAgent", "labelsAdd", "labelsRemove", "projectId", "cycleId"];
	const unknownKey = Object.keys(raw).find((key) => !allowed.includes(key));
	if (unknownKey) return { ok: false, message: `changes.${unknownKey} cannot be changed in bulk` };
	const parsed = parseItemFields({ state: raw.state, priority: raw.priority, assigneeUserId: raw.assigneeUserId, assigneeAgent: raw.assigneeAgent, projectId: raw.projectId, cycleId: raw.cycleId }, false);
	if (parsed.ok === false) return parsed;
	const value: BulkChanges = { ...parsed.changes };
	for (const field of ["labelsAdd", "labelsRemove"] as const) {
		if (raw[field] === undefined) continue;
		const labels = normalizeLabels(raw[field]);
		if (!labels) return { ok: false, message: `changes.${field} must be at most 20 short strings` };
		value[field] = labels;
	}
	if (!Object.keys(value).length) return { ok: false, message: "changes is empty" };
	return { ok: true, value };
}

/** The per-item change for a bulk change (labels merged into the item's own). */
export function bulkItemChanges(item: Pick<WorkItemRow, "labels">, changes: BulkChanges): WorkItemChanges {
	const { labelsAdd, labelsRemove, ...rest } = changes;
	const next: WorkItemChanges = { ...rest };
	if (labelsAdd?.length || labelsRemove?.length) {
		const remove = new Set(labelsRemove ?? []);
		next.labels = [...new Set([...(item.labels ?? []), ...(labelsAdd ?? [])])].filter((label) => !remove.has(label)).slice(0, 20);
	}
	return next;
}

accountWorkRouter.post("/items/bulk", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	if (!Array.isArray(body.numbers) || !body.numbers.length) return badRequest(c, "numbers must be a list of item numbers");
	if (body.numbers.length > MAX_BULK_ITEMS) return badRequest(c, `At most ${MAX_BULK_ITEMS} items can be changed at once`);
	if (!body.numbers.every((number) => typeof number === "number" && Number.isInteger(number) && number > 0)) return badRequest(c, "numbers must be item numbers");
	const parsed = parseBulkChanges(body.changes);
	if (parsed.ok === false) return badRequest(c, parsed.message);
	const changes = parsed.value;
	try {
		const assigneeError = await checkAssignee(context, changes);
		if (assigneeError) return badRequest(c, assigneeError);
		const planningError = await checkPlanning(context, changes);
		if (planningError) return badRequest(c, planningError);
	} catch {
		return unavailable(c);
	}
	const numbers = [...new Set(body.numbers as number[])];
	const { data, error } = await context.client.from("work_items").select(WORK_ITEM_COLUMNS).eq("workspace_id", context.workspaceId).in("number", numbers).limit(MAX_BULK_ITEMS);
	if (error) return unavailable(c);
	const rows = (data ?? []) as unknown as WorkItemRow[];
	const actor = userActor(access);
	let updated = 0;
	let failed = 0;
	// One update per item (each writes its own events, notifications and SLA), a few at a time.
	await mapLimit(rows, 5, async (item) => {
		try {
			const after = await updateWorkItem(context.client, item, bulkItemChanges(item, changes), actor);
			if (after !== item) updated += 1;
			afterDone(c, access, item, after);
		} catch {
			failed += 1;
		}
	});
	return json(c, { updated, failed, notFound: numbers.length - rows.length });
});

// ---------------------------------------------------------------------------------------------
// Comments, subscriptions and relations
// ---------------------------------------------------------------------------------------------

accountWorkRouter.post("/items/:number/comments", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const text = optionalText(body, "body", MAX_COMMENT_CHARS, { required: true });
	if (text.ok === false) return badRequest(c, text.message);
	const found = await itemFromPath(c, context);
	if ("response" in found) return found.response;
	const { item } = found;
	let event;
	try {
		event = await insertWorkItemEvent(context.client, {
			workspaceId: context.workspaceId,
			workItemId: item.id,
			kind: "comment",
			authorKind: "user",
			authorUserId: context.user.id,
			authorName: access.actorName,
			body: text.value!,
		});
	} catch {
		return unavailable(c, "work_comment_failed");
	}
	// Comments are activity: the inbox's updated order and stalled-item checks.
	await bumpWorkItemActivity(context.client, context.workspaceId, item.id, event.created_at);
	await subscribe(context.client, { workspaceId: context.workspaceId, workItemId: item.id, userId: context.user.id, reason: "commenter" });
	const label = `#${item.number} ${item.title}`;
	const excerpt = text.value!.length > 280 ? `${text.value!.slice(0, 279)}…` : text.value!;
	let mentioned: string[] = [];
	if (text.value!.includes("@")) {
		const members = await listWorkMembers(context).catch(() => null);
		mentioned = resolveMentions(text.value!, members ?? []).filter((id) => id !== context.user.id);
		for (const userId of mentioned) await subscribe(context.client, { workspaceId: context.workspaceId, workItemId: item.id, userId, reason: "mention" });
		await notify(context.client, { workspaceId: context.workspaceId, userIds: mentioned, workItemId: item.id, kind: "mention", actorName: access.actorName, body: `${label}: ${excerpt}`, exceptUserId: context.user.id });
	}
	const subscribers = (await subscriberIds(context.client, item.id)).filter((id) => !mentioned.includes(id));
	await notify(context.client, { workspaceId: context.workspaceId, userIds: subscribers, workItemId: item.id, kind: "comment", actorName: access.actorName, body: `${label}: ${excerpt}`, exceptUserId: context.user.id });
	return json(c, { event: formatWorkItemEvent(event), mentioned }, 201);
});

accountWorkRouter.post("/items/:number/subscription", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	if (typeof body.subscribed !== "boolean") return badRequest(c, "subscribed must be true or false");
	const found = await itemFromPath(c, context);
	if ("response" in found) return found.response;
	try {
		if (body.subscribed) await subscribe(context.client, { workspaceId: context.workspaceId, workItemId: found.item.id, userId: context.user.id, reason: "manual" });
		else await unsubscribe(context.client, { workspaceId: context.workspaceId, workItemId: found.item.id, userId: context.user.id });
	} catch {
		return unavailable(c);
	}
	return json(c, { subscribed: await isSubscribed(context.client, found.item.id, context.user.id) });
});

accountWorkRouter.post("/items/:number/relations", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const kind = body.kind;
	if (kind !== "blocks" && kind !== "blocked_by" && kind !== "related") return badRequest(c, "kind must be blocks, blocked_by or related");
	if (typeof body.otherNumber !== "number" || !Number.isInteger(body.otherNumber) || body.otherNumber <= 0) return badRequest(c, "otherNumber must be an item number");
	const found = await itemFromPath(c, context);
	if ("response" in found) return found.response;
	const { item } = found;
	if (body.otherNumber === item.number) return badRequest(c, "An item cannot be related to itself");
	try {
		const other = await loadWorkItemByNumber(context.client, context.workspaceId, body.otherNumber);
		if (!other) return badRequest(c, "otherNumber must be the number of an item in this workspace");
		if (await relationExists(context.client, context.workspaceId, item.id, other.id)) return json(c, { error: "relation_exists", message: "These items are already linked" }, 409);
		const stored = storedRelation(item.id, other.id, kind);
		const { data, error } = await context.client.from("work_item_relations").insert({
			workspace_id: context.workspaceId,
			...stored,
			created_by: context.user.id,
		}).select("id").maybeSingle();
		if (error?.code === "23505") return json(c, { error: "relation_exists", message: "These items are already linked" }, 409);
		if (error || !data) return unavailable(c, "work_relation_failed");
		const relationId = String((data as { id: string }).id);
		const actor = { authorKind: "user" as const, authorUserId: context.user.id, authorName: access.actorName };
		const events = [
			{ item, other, direction: kind },
			{ item: other, other: item, direction: kind === "related" ? "related" : kind === "blocks" ? "blocked_by" : "blocks" },
		];
		const { error: eventError } = await context.client.from("work_item_events").insert(events.map((entry) => ({
			workspace_id: context.workspaceId,
			work_item_id: entry.item.id,
			kind: "relation",
			author_kind: actor.authorKind,
			author_user_id: actor.authorUserId,
			author_name: actor.authorName,
			body: "",
			data: { action: "added", relationId, direction: entry.direction, otherItemId: entry.other.id, otherNumber: entry.other.number },
		})));
		if (eventError) console.error("[work] relation events not written", { message: eventError.message });
		await Promise.all([item, other].map((row) => bumpWorkItemActivity(context.client, context.workspaceId, row.id)));
		return json(c, { relations: await loadRelations(context.client, context.workspaceId, item.id) }, 201);
	} catch {
		return unavailable(c);
	}
});

accountWorkRouter.delete("/items/:number/relations/:id", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A relation id is required");
	const found = await itemFromPath(c, context);
	if ("response" in found) return found.response;
	const { item } = found;
	try {
		const { data: relation, error } = await context.client.from("work_item_relations").select("id,item_id,related_item_id,kind")
			.eq("workspace_id", context.workspaceId).eq("id", id).maybeSingle();
		if (error) return unavailable(c);
		const row = relation as { id: string; item_id: string; related_item_id: string; kind: string } | null;
		if (!row || (row.item_id !== item.id && row.related_item_id !== item.id)) return notFound(c, "Relation not found");
		const removed = await context.client.from("work_item_relations").delete().eq("workspace_id", context.workspaceId).eq("id", id);
		if (removed.error) return unavailable(c);
		const otherId = row.item_id === item.id ? row.related_item_id : row.item_id;
		const { error: eventError } = await context.client.from("work_item_events").insert([item.id, otherId].map((workItemId) => ({
			workspace_id: context.workspaceId,
			work_item_id: workItemId,
			kind: "relation",
			author_kind: "user",
			author_user_id: context.user.id,
			author_name: access.actorName,
			body: "",
			data: { action: "removed", relationId: id, kind: row.kind, otherItemId: workItemId === item.id ? otherId : item.id },
		})));
		if (eventError) console.error("[work] relation events not written", { message: eventError.message });
		return json(c, { relations: await loadRelations(context.client, context.workspaceId, item.id) });
	} catch {
		return unavailable(c);
	}
});

// ---------------------------------------------------------------------------------------------
// Triage and GitHub
// ---------------------------------------------------------------------------------------------

const TRIAGE_ERROR_STATUS: Record<string, number> = {
	not_found: 404,
	chat_privacy_review_required: 403,
	work_agent_key_inactive: 403,
	work_agent_key_missing: 409,
	triage_failed: 502,
	triage_unparseable: 502,
	gateway_unavailable: 503,
};

accountWorkRouter.post("/items/:number/triage", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const found = await itemFromPath(c, context);
	if ("response" in found) return found.response;
	const result = await triageWorkItem({
		env: c.env,
		client: context.client,
		workspaceId: context.workspaceId,
		itemId: found.item.id,
		requestedBy: { id: context.user.id, appMetadata: context.user.appMetadata },
		waitUntil: backgroundRunner(c),
	});
	if (result.ok === false) return json(c, { error: result.code, message: result.message }, TRIAGE_ERROR_STATUS[result.code] ?? 503);
	return json(c, {
		run: formatAgentRun({ ...result.run, item: { number: result.item.number } }),
		item: await formatOne(context.client, context.workspaceId, result.item),
	});
});

accountWorkRouter.post("/items/:number/github", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	if (body.repo !== undefined && body.repo !== null && !isGithubRepo(body.repo)) return badRequest(c, "repo must look like owner/name");
	const found = await itemFromPath(c, context);
	if ("response" in found) return found.response;
	const { item } = found;
	if (item.github_issue_url) return json(c, { error: "github_issue_exists", message: "This item already has a GitHub issue" }, 409);
	const repoName = (body.repo as string | undefined) ?? item.github_repo;
	if (!repoName) return badRequest(c, "Choose a GitHub repository");
	const repo = await context.client.from("work_github_repos").select("repo,github_token_ciphertext")
		.eq("workspace_id", context.workspaceId).eq("repo", repoName).maybeSingle();
	if (repo.error) return unavailable(c);
	if (!repo.data) return json(c, { error: "github_repo_not_linked", message: "Link this repository in work settings first" }, 404);
	const created = await createGithubIssue(c.env, repo.data as any, item);
	if (created.ok === false) return json(c, { error: created.code, message: created.message }, created.status);
	try {
		const updated = await updateWorkItem(context.client, item, {
			githubRepo: repoName,
			githubIssueNumber: created.number,
			githubIssueUrl: created.url,
		}, userActor(access));
		return json(c, { item: await formatOne(context.client, context.workspaceId, updated) });
	} catch {
		// The issue exists on GitHub; report it so it can be linked by hand.
		return json(c, { error: "work_item_update_failed", message: `The issue was created (${created.url}) but could not be linked`, issueUrl: created.url }, 503);
	}
});

// ---------------------------------------------------------------------------------------------
// Members and runs
// ---------------------------------------------------------------------------------------------

accountWorkRouter.get("/members", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const members = await listWorkMembers(access.context);
	if (!members) return unavailable(c);
	return json(c, { members });
});

accountWorkRouter.get("/runs", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const limit = clampLimit(c.req.query("limit"), 50, 100);
	const { data, error } = await context.client.from("work_agent_runs").select("*,item:work_items(number)")
		.eq("workspace_id", context.workspaceId).order("created_at", { ascending: false }).limit(limit);
	if (error) return unavailable(c);
	return json(c, { runs: (data ?? []).map((row: any) => formatAgentRun(row as AgentRunRow & { item: { number: number } | null })) });
});

type RunFields = { status?: AgentRunStatus; model?: string | null; summary?: string | null; externalUrl?: string | null; costNanos?: number };

function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "https:" || url.protocol === "http:";
	} catch {
		return false;
	}
}

/** The optional fields shared by POST /items/:number/runs and PATCH /runs/:id. */
function parseRunFields(body: Body): { ok: true; value: RunFields } | { ok: false; message: string } {
	const value: RunFields = {};
	if (body.status !== undefined) {
		if (!(AGENT_RUN_STATUSES as readonly string[]).includes(body.status as string)) return { ok: false, message: `status must be one of ${AGENT_RUN_STATUSES.join(", ")}` };
		value.status = body.status as AgentRunStatus;
	}
	const model = optionalText(body, "model", MAX_RUN_MODEL);
	if (model.ok === false) return model;
	if (model.value !== undefined) value.model = model.value;
	const summary = optionalText(body, "summary", MAX_RUN_SUMMARY);
	if (summary.ok === false) return summary;
	if (summary.value !== undefined) value.summary = summary.value;
	if (body.externalUrl !== undefined) {
		if (body.externalUrl !== null && body.externalUrl !== "" && (typeof body.externalUrl !== "string" || body.externalUrl.length > 2000 || !isHttpUrl(body.externalUrl))) {
			return { ok: false, message: "externalUrl must be an http(s) URL or null" };
		}
		value.externalUrl = body.externalUrl ? String(body.externalUrl) : null;
	}
	if (body.costNanos !== undefined) {
		if (typeof body.costNanos !== "number" || !Number.isInteger(body.costNanos) || body.costNanos < 0 || body.costNanos > MAX_RUN_COST_NANOS) return { ok: false, message: "costNanos must be a whole number of nanodollars" };
		value.costNanos = body.costNanos;
	}
	return { ok: true, value };
}

const AGENT_NAMES: Record<WorkAgent, string> = { triage: "Triage agent", engineer: "Engineer agent", support: "Support agent" };

function runEventBody(agent: WorkAgent, status: AgentRunStatus, runner: string): string {
	const where = runner === "desktop" ? " on a desktop" : "";
	switch (status) {
		case "queued": return `The ${agent} agent run is queued${where}.`;
		case "running": return `The ${agent} agent started${where}.`;
		case "succeeded": return `The ${agent} agent finished${where}.`;
		case "failed": return `The ${agent} agent run failed${where}.`;
		case "cancelled": return `The ${agent} agent run was cancelled${where}.`;
	}
}

/** The agent_run event, last activity and (when finished) the subscribers' notification. */
async function recordRunActivity(context: AccountWorkspaceContext, actorName: string | null, item: WorkItemRow, run: AgentRunRow, previous: AgentRunStatus | null): Promise<void> {
	const now = new Date().toISOString();
	try {
		await context.client.from("work_item_events").insert({
			workspace_id: context.workspaceId,
			work_item_id: item.id,
			kind: "agent_run",
			author_kind: "agent",
			author_user_id: context.user.id,
			author_name: AGENT_NAMES[run.agent],
			body: runEventBody(run.agent, run.status, run.runner),
			data: { runId: run.id, agent: run.agent, runner: run.runner, status: run.status, model: run.model, externalUrl: run.external_url, startedBy: actorName },
		});
	} catch (error) {
		console.error("[work] run event not written", { runId: run.id, message: error instanceof Error ? error.message : String(error) });
	}
	await bumpWorkItemActivity(context.client, context.workspaceId, item.id, now);
	const finished = FINISHED_AGENT_RUN_STATUSES.includes(run.status) && (previous === null || !FINISHED_AGENT_RUN_STATUSES.includes(previous));
	if (finished) {
		const summary = run.summary ? `: ${run.summary.slice(0, 300)}` : "";
		await notifySubscribers(context.client, {
			workspaceId: context.workspaceId,
			workItemId: item.id,
			kind: "agent",
			actorName: AGENT_NAMES[run.agent],
			body: `#${item.number} ${item.title}: ${run.agent} agent run ${run.status}${summary}`,
			exceptUserId: context.user.id,
		});
	}
}

accountWorkRouter.post("/items/:number/runs", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	if (!isWorkAgent(body.agent)) return badRequest(c, "agent must be triage, engineer or support");
	if (body.runner !== "desktop") return badRequest(c, "runner must be desktop");
	if (body.status === undefined) return badRequest(c, "status is required");
	const fields = parseRunFields(body);
	if (fields.ok === false) return badRequest(c, fields.message);
	const found = await itemFromPath(c, context);
	if ("response" in found) return found.response;
	const { item } = found;
	const status = fields.value.status!;
	const now = new Date().toISOString();
	const finished = FINISHED_AGENT_RUN_STATUSES.includes(status);
	const { data, error } = await context.client.from("work_agent_runs").insert({
		workspace_id: context.workspaceId,
		work_item_id: item.id,
		agent: body.agent,
		runner: "desktop",
		status,
		model: fields.value.model ?? null,
		summary: fields.value.summary ?? null,
		external_url: fields.value.externalUrl ?? null,
		cost_nanos: fields.value.costNanos ?? 0,
		requested_by: context.user.id,
		started_at: status === "queued" ? null : now,
		finished_at: finished ? now : null,
	}).select("*").maybeSingle();
	if (error || !data) return unavailable(c, "work_agent_run_failed");
	const run = data as AgentRunRow;
	await recordRunActivity(context, access.actorName, item, run, null);
	return json(c, { run: formatAgentRun({ ...run, item: { number: item.number } }) }, 201);
});

accountWorkRouter.patch("/runs/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A run id is required");
	const fields = parseRunFields(body);
	if (fields.ok === false) return badRequest(c, fields.message);
	const existing = await context.client.from("work_agent_runs").select("*").eq("workspace_id", context.workspaceId).eq("id", id).maybeSingle();
	if (existing.error) return unavailable(c);
	if (!existing.data) return notFound(c, "Run not found");
	const before = existing.data as AgentRunRow;
	const patch: Record<string, unknown> = {};
	const now = new Date().toISOString();
	if (fields.value.status !== undefined && fields.value.status !== before.status) {
		patch.status = fields.value.status;
		if (fields.value.status !== "queued" && !before.started_at) patch.started_at = now;
		if (FINISHED_AGENT_RUN_STATUSES.includes(fields.value.status) && !before.finished_at) patch.finished_at = now;
	}
	if (fields.value.model !== undefined) patch.model = fields.value.model;
	if (fields.value.summary !== undefined) patch.summary = fields.value.summary;
	if (fields.value.externalUrl !== undefined) patch.external_url = fields.value.externalUrl;
	if (fields.value.costNanos !== undefined) patch.cost_nanos = fields.value.costNanos;
	const item = await loadWorkItemById(context.client, context.workspaceId, before.work_item_id).catch(() => null);
	if (!Object.keys(patch).length) return json(c, { run: formatAgentRun({ ...before, item: { number: item?.number ?? null } }) });
	const { data, error } = await context.client.from("work_agent_runs").update(patch).eq("workspace_id", context.workspaceId).eq("id", id).select("*").maybeSingle();
	if (error || !data) return unavailable(c, "work_agent_run_failed");
	const run = data as AgentRunRow;
	if (item && patch.status !== undefined) await recordRunActivity(context, access.actorName, item, run, before.status);
	else if (item) await bumpWorkItemActivity(context.client, context.workspaceId, item.id, now);
	return json(c, { run: formatAgentRun({ ...run, item: { number: item?.number ?? null } }) });
});

// Reply drafts: the support agent's handlers (src/work/support.ts), mounted here.
registerReplyDraftRoutes(accountWorkRouter);

accountWorkRouter.route("/", accountWorkCustomersRouter);
accountWorkRouter.route("/", accountWorkSettingsRouter);
accountWorkRouter.route("/", accountWorkPlanningRouter);
accountWorkRouter.route("/", accountWorkNotificationsRouter);
