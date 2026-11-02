import { Hono } from "hono";
import type { Env } from "@/env";
import { createGithubIssue } from "@/work/github";
import {
	MAX_TITLE_LENGTH,
	WORK_ITEM_COLUMNS,
	createWorkItem,
	formatAgentRun,
	formatCustomerRequest,
	formatErrorGroup,
	formatWorkItem,
	formatWorkItemEvent,
	insertWorkItemEvent,
	isGithubRepo,
	isPriority,
	isWorkAgent,
	isWorkItemState,
	loadWorkItemByNumber,
	normalizeLabels,
	updateWorkItem,
	type DataClient,
	type WorkItemChanges,
} from "@/work/items";
import { triageWorkItem } from "@/work/triage";
import { WORK_ITEM_SOURCES, WORK_ITEM_STATES, type AgentRunRow, type WorkItemRow } from "@/work/types";
import type { AccountWorkspaceContext } from "./context";
import { accountWorkCustomersRouter } from "./work-customers";
import { accountWorkSettingsRouter } from "./work-settings";
import {
	accessFromQuery,
	backgroundRunner,
	badRequest,
	clampLimit,
	isWorkspaceMember,
	json,
	notFound,
	optionalText,
	pathNumber,
	readBody,
	unavailable,
	UUID_PATTERN,
	workAccess,
	type Body,
} from "./work-shared";

// The work tracker's account API, mounted at /api/account/work: work items, their timeline,
// triage, GitHub issues, members and agent runs. Customers and requests live in
// work-customers.ts; intake forms, error projects, errors and GitHub repos in work-settings.ts.

const MAX_DESCRIPTION_CHARS = 100_000;
const MAX_COMMENT_CHARS = 20_000;
const MAX_MEMBERS = 200;

export const accountWorkRouter = new Hono<{ Bindings: Env }>();

/** Numbers for the items' duplicate_of ids, in one query. */
async function duplicateNumbers(client: DataClient, workspaceId: string, rows: WorkItemRow[]): Promise<Map<string, number>> {
	const ids = [...new Set(rows.map((row) => row.duplicate_of).filter((id): id is string => Boolean(id)))];
	if (!ids.length) return new Map();
	const { data } = await client.from("work_items").select("id,number").eq("workspace_id", workspaceId).in("id", ids);
	return new Map((data ?? []).map((row: any) => [String(row.id), Number(row.number)]));
}

async function formatItems(client: DataClient, workspaceId: string, rows: WorkItemRow[]) {
	const numbers = await duplicateNumbers(client, workspaceId, rows);
	return rows.map((row) => formatWorkItem(row, row.duplicate_of ? numbers.get(row.duplicate_of) ?? null : null));
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

type ParsedChanges = { ok: true; changes: WorkItemChanges; duplicateNumber?: number | null } | { ok: false; message: string };

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
	let duplicateNumber: number | null | undefined;
	if (!creating && body.duplicateOf !== undefined) {
		if (body.duplicateOf !== null && (typeof body.duplicateOf !== "number" || !Number.isInteger(body.duplicateOf) || body.duplicateOf <= 0)) return { ok: false, message: "duplicateOf must be an item number or null" };
		duplicateNumber = body.duplicateOf as number | null;
	}
	return { ok: true, changes, duplicateNumber };
}

async function checkAssignee(context: AccountWorkspaceContext, changes: WorkItemChanges): Promise<string | null> {
	if (!changes.assigneeUserId) return null;
	return await isWorkspaceMember(context, changes.assigneeUserId) ? null : "assigneeUserId must be a member of the workspace";
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
	return json(c, {
		items: await formatItems(context.client, context.workspaceId, page),
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
	const assigneeError = await checkAssignee(context, parsed.changes);
	if (assigneeError) return badRequest(c, assigneeError);
	const { changes } = parsed;
	try {
		const row = await createWorkItem(context.client, {
			workspaceId: context.workspaceId,
			title: changes.title!,
			description: changes.description,
			state: changes.state,
			priority: changes.priority,
			source: "manual",
			createdBy: context.user.id,
			authorKind: "user",
			labels: changes.labels,
			assigneeUserId: changes.assigneeUserId,
			assigneeAgent: changes.assigneeAgent,
			githubRepo: changes.githubRepo,
		});
		return json(c, { item: formatWorkItem(row) }, 201);
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
	const [events, requests, runs, group] = await Promise.all([
		context.client.from("work_item_events").select("*").eq("workspace_id", context.workspaceId).eq("work_item_id", item.id)
			.order("created_at", { ascending: true }).limit(500),
		context.client.from("work_customer_requests").select("*,customer:work_customers(name)").eq("workspace_id", context.workspaceId).eq("work_item_id", item.id)
			.order("created_at", { ascending: false }).limit(100),
		context.client.from("work_agent_runs").select("*").eq("workspace_id", context.workspaceId).eq("work_item_id", item.id)
			.order("created_at", { ascending: false }).limit(50),
		item.error_group_id
			? context.client.from("work_error_groups").select("*,project:work_error_projects(name)").eq("workspace_id", context.workspaceId).eq("id", item.error_group_id).maybeSingle()
			: Promise.resolve({ data: null, error: null }),
	]);
	if (events.error || requests.error || runs.error || group.error) return unavailable(c);
	const [formatted] = await formatItems(context.client, context.workspaceId, [item]);
	return json(c, {
		item: formatted,
		events: (events.data ?? []).map((row: any) => formatWorkItemEvent(row)),
		requests: (requests.data ?? []).map((row: any) => formatCustomerRequest({ ...row, item: { number: item.number } })),
		runs: (runs.data ?? []).map((row: any) => formatAgentRun({ ...row, item: { number: item.number } })),
		...(group.data ? { errorGroup: formatErrorGroup({ ...(group.data as any), item: { number: item.number } }) } : {}),
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
	const assigneeError = await checkAssignee(context, parsed.changes);
	if (assigneeError) return badRequest(c, assigneeError);
	const changes = { ...parsed.changes };
	if (parsed.duplicateNumber !== undefined) {
		if (parsed.duplicateNumber === null) changes.duplicateOf = null;
		else {
			if (parsed.duplicateNumber === item.number) return badRequest(c, "An item cannot duplicate itself");
			const original = await loadWorkItemByNumber(context.client, context.workspaceId, parsed.duplicateNumber).catch(() => null);
			if (!original) return badRequest(c, "duplicateOf must be the number of an item in this workspace");
			changes.duplicateOf = original.id;
		}
	}
	try {
		const updated = await updateWorkItem(context.client, item, changes, { kind: "user", userId: context.user.id });
		const [formatted] = await formatItems(context.client, context.workspaceId, [updated]);
		return json(c, { item: formatted });
	} catch {
		return unavailable(c, "work_item_update_failed");
	}
});

accountWorkRouter.post("/items/:number/comments", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const text = optionalText(body, "body", MAX_COMMENT_CHARS, { required: true });
	if (text.ok === false) return badRequest(c, text.message);
	const found = await itemFromPath(c, context);
	if ("response" in found) return found.response;
	try {
		const event = await insertWorkItemEvent(context.client, {
			workspaceId: context.workspaceId,
			workItemId: found.item.id,
			kind: "comment",
			authorKind: "user",
			authorUserId: context.user.id,
			body: text.value!,
		});
		// Comments count as activity for the inbox's updated order.
		await context.client.from("work_items").update({ updated_at: event.created_at }).eq("workspace_id", context.workspaceId).eq("id", found.item.id);
		return json(c, { event: formatWorkItemEvent(event) }, 201);
	} catch {
		return unavailable(c, "work_comment_failed");
	}
});

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
	const [item] = await formatItems(context.client, context.workspaceId, [result.item]);
	return json(c, { run: formatAgentRun({ ...result.run, item: { number: result.item.number } }), item });
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
		}, { kind: "user", userId: context.user.id });
		const [formatted] = await formatItems(context.client, context.workspaceId, [updated]);
		return json(c, { item: formatted });
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
	const { context } = access;
	const [members, workspace] = await Promise.all([
		context.client.from("workspace_members").select("user_id").eq("workspace_id", context.workspaceId).limit(MAX_MEMBERS),
		context.client.from("workspaces").select("owner_user_id").eq("id", context.workspaceId).maybeSingle(),
	]);
	if (members.error || workspace.error) return unavailable(c);
	const ids = [...new Set([
		...(members.data ?? []).map((row: any) => String(row.user_id ?? "")),
		String(workspace.data?.owner_user_id ?? ""),
	].filter(Boolean))].slice(0, MAX_MEMBERS);
	if (!ids.length) return json(c, { members: [] });
	const profiles = await context.client.from("users").select("user_id,display_name").in("user_id", ids);
	if (profiles.error) return unavailable(c);
	const names = new Map((profiles.data ?? []).map((row: any) => [String(row.user_id), typeof row.display_name === "string" ? row.display_name.trim() || null : null]));
	// Emails live in auth; one admin lookup per member, as the workspace user pages do.
	const emails = await Promise.all(ids.map((id) => context.client.auth.admin.getUserById(id)
		.then((result) => result.data?.user?.email ?? null)
		.catch(() => null)));
	const list = ids.map((userId, index) => ({ userId, name: names.get(userId) ?? null, email: emails[index] ?? null }));
	list.sort((left, right) => (left.name ?? left.email ?? "").localeCompare(right.name ?? right.email ?? ""));
	return json(c, { members: list });
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

accountWorkRouter.route("/", accountWorkCustomersRouter);
accountWorkRouter.route("/", accountWorkSettingsRouter);
