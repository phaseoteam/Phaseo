// The public work API, for scripts, integrations and other tools: /api/_web/work/v1/..., with a
// workspace API key (pwk_..., made in Work settings) as a bearer token. read keys list and read
// items and projects; write keys also create and change items and comment. Customer requests and
// contacts are never served, and an item's description is only returned for items people wrote
// themselves (asks and errors get their triage summary instead), as for GitHub issues.

import { Hono, type Context } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { workItemUrl } from "./github";
import { addWorkItemEvent, bumpWorkItemActivity, createWorkItem, isWorkAgent, isWorkItemState, loadWorkItemByNumber, MAX_LABELS, updateWorkItem, WORK_ITEM_COLUMNS, type DataClient, type WorkItemChanges } from "./items";
import { hashWorkToken, isWorkToken } from "./tokens";
import type { WorkItemRow } from "./types";

export const publicWorkApiRouter = new Hono<{ Bindings: Env }>();

const NO_STORE = { "Cache-Control": "no-store" } as const;
const MAX_LIST = 100;
const MAX_BODY_BYTES = 64 * 1024;
const LABEL = /^[a-z0-9][a-z0-9 ._-]{0,39}$/;

type ApiKey = { id: string; workspace_id: string; access: "read" | "write" };
type ApiContext = Context<{ Bindings: Env }>;

/** The item as the API shows it. */
export function apiItem(row: WorkItemRow, origin?: string) {
	return {
		number: row.number,
		title: row.title,
		description: row.source === "manual" ? row.description : null,
		triageSummary: row.triage_summary,
		state: row.state,
		priority: row.priority,
		source: row.source,
		labels: row.labels ?? [],
		assigneeAgent: row.assignee_agent,
		projectId: row.project_id ?? null,
		cycleId: row.cycle_id ?? null,
		milestoneId: row.milestone_id ?? null,
		estimate: row.estimate ?? null,
		githubIssueUrl: row.github_issue_url,
		githubPrUrl: row.github_pr_url,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		closedAt: row.closed_at,
		url: workItemUrl(row.number, origin),
	};
}

function problem(c: ApiContext, status: 400 | 401 | 403 | 404 | 413 | 429 | 503, code: string, message: string) {
	return c.json({ error: code, message }, status, NO_STORE);
}

async function authenticate(c: ApiContext, client: DataClient): Promise<ApiKey | Response> {
	const token = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
	if (!isWorkToken("api", token)) return problem(c, 401, "unauthorized", "Send a work API key (pwk_...) as a bearer token");
	const hash = await hashWorkToken(token);
	const limiter = c.env.WORK_PUBLIC_RATE_LIMITER;
	if (limiter) {
		try {
			const { success } = await limiter.limit({ key: `api:${hash.slice(0, 16)}` });
			if (!success) return c.json({ error: "rate_limited" }, 429, { ...NO_STORE, "Retry-After": "60" });
		} catch {
			// A limiter outage doesn't block the API.
		}
	}
	const { data, error } = await client.from("work_api_keys").select("id,workspace_id,access,revoked_at").eq("key_hash", hash).maybeSingle();
	if (error) return problem(c, 503, "unavailable", "Try again in a moment");
	if (!data || data.revoked_at) return problem(c, 401, "unauthorized", "This key isn't valid");
	const touched = await client.from("work_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
	if (touched.error) console.error("[work] api key use not recorded", { message: touched.error.message });
	return { id: data.id, workspace_id: data.workspace_id, access: data.access === "write" ? "write" : "read" };
}

async function readJson(c: ApiContext): Promise<Record<string, unknown> | Response> {
	const declared = Number(c.req.header("content-length") ?? "");
	if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return problem(c, 413, "payload_too_large", "The body can be at most 64 KB");
	const text = await c.req.text();
	if (text.length > MAX_BODY_BYTES) return problem(c, 413, "payload_too_large", "The body can be at most 64 KB");
	try {
		const body = text ? JSON.parse(text) : {};
		return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : problem(c, 400, "invalid_body", "Send a JSON object");
	} catch {
		return problem(c, 400, "invalid_json", "The body isn't valid JSON");
	}
}

/** The fields an API caller may set on an item. */
export function parseApiItemFields(body: Record<string, unknown>, creating: boolean): { ok: true; changes: WorkItemChanges } | { ok: false; message: string } {
	const changes: WorkItemChanges = {};
	if (body.title !== undefined || creating) {
		const title = typeof body.title === "string" ? body.title.trim() : "";
		if (!title || title.length > 300) return { ok: false, message: "title must be 1 to 300 characters" };
		changes.title = title;
	}
	if (body.description !== undefined) {
		if (typeof body.description !== "string" || body.description.length > 20_000) return { ok: false, message: "description must be text of at most 20,000 characters" };
		changes.description = body.description;
	}
	if (body.state !== undefined) {
		if (!isWorkItemState(body.state)) return { ok: false, message: "state must be triage, backlog, todo, in_progress, in_review, done or cancelled" };
		changes.state = body.state;
	}
	if (body.priority !== undefined) {
		if (typeof body.priority !== "number" || !Number.isInteger(body.priority) || body.priority < 0 || body.priority > 4) return { ok: false, message: "priority must be 0 to 4" };
		changes.priority = body.priority;
	}
	if (body.labels !== undefined) {
		if (!Array.isArray(body.labels) || body.labels.length > MAX_LABELS) return { ok: false, message: `labels must be at most ${MAX_LABELS} labels` };
		const labels = [...new Set(body.labels.map((label) => String(label).trim().toLowerCase()))];
		if (!labels.every((label) => LABEL.test(label))) return { ok: false, message: "labels must be short lowercase words" };
		changes.labels = labels;
	}
	if (body.assigneeAgent !== undefined) {
		if (body.assigneeAgent !== null && !isWorkAgent(body.assigneeAgent)) return { ok: false, message: "assigneeAgent must be triage, engineer, support or null" };
		changes.assigneeAgent = body.assigneeAgent as WorkItemChanges["assigneeAgent"];
	}
	return { ok: true, changes };
}

function origin(c: ApiContext): string | undefined {
	return c.env.PHASEO_WEB_ORIGIN?.trim() || undefined;
}

function itemNumber(c: ApiContext): number | null {
	const number = Number(c.req.param("number"));
	return Number.isInteger(number) && number > 0 ? number : null;
}

publicWorkApiRouter.get("/items", async (c) => {
	const client = getDataClient(c.env);
	const key = await authenticate(c, client);
	if (key instanceof Response) return key;
	const limit = Math.min(MAX_LIST, Math.max(1, Number.parseInt(c.req.query("limit") ?? "50", 10) || 50));
	const offset = Math.max(0, Math.min(10_000, Number.parseInt(c.req.query("offset") ?? "0", 10) || 0));
	let query = client.from("work_items").select(WORK_ITEM_COLUMNS).eq("workspace_id", key.workspace_id);
	const state = c.req.query("state");
	if (state === "open") query = query.not("state", "in", "(done,cancelled)");
	else if (state) {
		if (!isWorkItemState(state)) return problem(c, 400, "invalid_state", "state must be open or an item state");
		query = query.eq("state", state);
	}
	const updatedSince = c.req.query("updatedSince");
	if (updatedSince) {
		if (Number.isNaN(Date.parse(updatedSince))) return problem(c, 400, "invalid_time", "updatedSince must be a timestamp");
		query = query.gte("updated_at", new Date(updatedSince).toISOString());
	}
	const { data, error } = await query.order("updated_at", { ascending: false }).range(offset, offset + limit - 1);
	if (error) return problem(c, 503, "unavailable", "Try again in a moment");
	const rows = (data ?? []) as unknown as WorkItemRow[];
	return c.json({ items: rows.map((row) => apiItem(row, origin(c))), nextOffset: rows.length === limit ? offset + limit : null }, 200, NO_STORE);
});

publicWorkApiRouter.get("/items/:number", async (c) => {
	const client = getDataClient(c.env);
	const key = await authenticate(c, client);
	if (key instanceof Response) return key;
	const number = itemNumber(c);
	if (!number) return problem(c, 400, "invalid_number", "Use the item's number");
	const item = await loadWorkItemByNumber(client, key.workspace_id, number).catch(() => null);
	if (!item) return problem(c, 404, "not_found", "No item with that number");
	return c.json({ item: apiItem(item, origin(c)) }, 200, NO_STORE);
});

publicWorkApiRouter.post("/items", async (c) => {
	const client = getDataClient(c.env);
	const key = await authenticate(c, client);
	if (key instanceof Response) return key;
	if (key.access !== "write") return problem(c, 403, "read_only_key", "This key can only read");
	const body = await readJson(c);
	if (body instanceof Response) return body;
	const parsed = parseApiItemFields(body, true);
	if (parsed.ok === false) return problem(c, 400, "invalid_fields", parsed.message);
	try {
		const item = await createWorkItem(client, {
			workspaceId: key.workspace_id,
			title: parsed.changes.title!,
			description: parsed.changes.description,
			state: parsed.changes.state ?? "triage",
			priority: parsed.changes.priority,
			labels: parsed.changes.labels,
			assigneeAgent: parsed.changes.assigneeAgent,
			source: "manual",
			authorKind: "system",
			actorName: "API",
		});
		return c.json({ item: apiItem(item, origin(c)) }, 201, NO_STORE);
	} catch {
		return problem(c, 503, "create_failed", "The item couldn't be created; try again");
	}
});

publicWorkApiRouter.patch("/items/:number", async (c) => {
	const client = getDataClient(c.env);
	const key = await authenticate(c, client);
	if (key instanceof Response) return key;
	if (key.access !== "write") return problem(c, 403, "read_only_key", "This key can only read");
	const number = itemNumber(c);
	if (!number) return problem(c, 400, "invalid_number", "Use the item's number");
	const body = await readJson(c);
	if (body instanceof Response) return body;
	const parsed = parseApiItemFields(body, false);
	if (parsed.ok === false) return problem(c, 400, "invalid_fields", parsed.message);
	if (!Object.keys(parsed.changes).length) return problem(c, 400, "no_changes", "Send at least one field to change");
	const item = await loadWorkItemByNumber(client, key.workspace_id, number).catch(() => null);
	if (!item) return problem(c, 404, "not_found", "No item with that number");
	// Only a hand-written description can be replaced, so an API caller never learns or overwrites an ask's.
	if (parsed.changes.description !== undefined && item.source !== "manual") return problem(c, 400, "description_locked", "Only items people wrote have an editable description");
	try {
		const updated = await updateWorkItem(client, item, parsed.changes, { kind: "system", name: "API" });
		return c.json({ item: apiItem(updated, origin(c)) }, 200, NO_STORE);
	} catch {
		return problem(c, 503, "update_failed", "The item couldn't be changed; try again");
	}
});

publicWorkApiRouter.post("/items/:number/comments", async (c) => {
	const client = getDataClient(c.env);
	const key = await authenticate(c, client);
	if (key instanceof Response) return key;
	if (key.access !== "write") return problem(c, 403, "read_only_key", "This key can only read");
	const number = itemNumber(c);
	if (!number) return problem(c, 400, "invalid_number", "Use the item's number");
	const body = await readJson(c);
	if (body instanceof Response) return body;
	const text = typeof body.body === "string" ? body.body.trim() : "";
	if (!text || text.length > 20_000) return problem(c, 400, "invalid_body", "body must be 1 to 20,000 characters");
	const item = await loadWorkItemByNumber(client, key.workspace_id, number).catch(() => null);
	if (!item) return problem(c, 404, "not_found", "No item with that number");
	try {
		await addWorkItemEvent(client, { workspaceId: key.workspace_id, workItemId: item.id, kind: "comment", authorKind: "system", authorName: "API", body: text });
		await bumpWorkItemActivity(client, key.workspace_id, item.id).catch(() => undefined);
		return c.json({ ok: true }, 201, NO_STORE);
	} catch {
		return problem(c, 503, "comment_failed", "The comment couldn't be added; try again");
	}
});

publicWorkApiRouter.get("/projects", async (c) => {
	const client = getDataClient(c.env);
	const key = await authenticate(c, client);
	if (key instanceof Response) return key;
	const { data, error } = await client.from("work_projects").select("id,name,state,target_date,created_at,updated_at").eq("workspace_id", key.workspace_id).order("name", { ascending: true }).limit(200);
	if (error) return problem(c, 503, "unavailable", "Try again in a moment");
	return c.json({ projects: (data ?? []).map((row: any) => ({ id: row.id, name: row.name, state: row.state, targetDate: row.target_date, createdAt: row.created_at, updatedAt: row.updated_at })) }, 200, NO_STORE);
});
