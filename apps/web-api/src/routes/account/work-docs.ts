import { Hono } from "hono";
import type { Env } from "@/env";
import { formatWorkProject, isIsoDate, loadWorkProject, PROJECT_COLUMNS } from "@/work/projects";
import type { WorkProjectRow } from "@/work/types";
import { accessFromQuery, badRequest, json, notFound, pathUuid, readBody, unavailable, workAccess } from "./work-shared";

// Documents (/documents) and initiatives (/initiatives), and the roadmap (/roadmap): initiatives
// with their projects' dates. Scoped to the caller's workspace.

export const accountWorkDocsRouter = new Hono<{ Bindings: Env }>();

const DOC_COLUMNS = "id,workspace_id,project_id,title,body,created_by,updated_by,created_at,updated_at";
const DOC_LIST_COLUMNS = "id,workspace_id,project_id,title,created_by,updated_by,created_at,updated_at";
const INITIATIVE_COLUMNS = "id,workspace_id,name,description,state,target_date,created_by,created_at,updated_at";
const INITIATIVE_STATES = ["planned", "active", "completed", "cancelled"] as const;
const MAX_DOC_BODY = 200_000;

function formatDocument(row: any, withBody: boolean) {
	return { id: row.id, projectId: row.project_id, title: row.title, ...(withBody ? { body: row.body ?? "" } : {}), createdBy: row.created_by, updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at };
}

function formatInitiative(row: any) {
	return { id: row.id, name: row.name, description: row.description ?? "", state: row.state, targetDate: row.target_date, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at };
}

async function checkProject(context: { client: any; workspaceId: string }, projectId: unknown): Promise<{ ok: true; value: string | null | undefined } | { ok: false; message: string }> {
	if (projectId === undefined) return { ok: true, value: undefined };
	if (projectId === null || projectId === "") return { ok: true, value: null };
	if (typeof projectId !== "string" || !/^[0-9a-f-]{36}$/i.test(projectId)) return { ok: false, message: "projectId must be a project id or null" };
	return await loadWorkProject(context.client, context.workspaceId, projectId.toLowerCase()) ? { ok: true, value: projectId.toLowerCase() } : { ok: false, message: "projectId must be a project in this workspace" };
}

// ---------------------------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------------------------

accountWorkDocsRouter.get("/documents", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	let query = context.client.from("work_documents").select(DOC_LIST_COLUMNS).eq("workspace_id", context.workspaceId);
	const projectId = c.req.query("projectId")?.trim().toLowerCase();
	if (projectId) {
		if (!/^[0-9a-f-]{36}$/.test(projectId)) return badRequest(c, "projectId is not valid");
		query = query.eq("project_id", projectId);
	}
	const q = c.req.query("q")?.trim();
	if (q) query = query.ilike("title", `%${q.slice(0, 100).replace(/[%_\\]/g, (char) => `\\${char}`)}%`);
	const { data, error } = await query.order("updated_at", { ascending: false }).limit(200);
	if (error) return unavailable(c);
	return json(c, { documents: (data ?? []).map((row: any) => formatDocument(row, false)) });
});

accountWorkDocsRouter.get("/documents/:id", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A document id is required");
	const { data, error } = await context.client.from("work_documents").select(DOC_COLUMNS).eq("workspace_id", context.workspaceId).eq("id", id).maybeSingle();
	if (error) return unavailable(c);
	if (!data) return notFound(c, "Document not found");
	return json(c, { document: formatDocument(data, true) });
});

accountWorkDocsRouter.post("/documents", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const title = typeof body.title === "string" ? body.title.trim() : "";
	if (!title || title.length > 200) return badRequest(c, "title must be 1 to 200 characters");
	if (body.body !== undefined && (typeof body.body !== "string" || body.body.length > MAX_DOC_BODY)) return badRequest(c, "body must be text of at most 200,000 characters");
	const project = await checkProject(context, body.projectId).catch(() => null);
	if (!project) return unavailable(c);
	if (project.ok === false) return badRequest(c, project.message);
	const { data, error } = await context.client.from("work_documents").insert({
		workspace_id: context.workspaceId, project_id: project.value ?? null, title, body: typeof body.body === "string" ? body.body : "", created_by: context.user.id, updated_by: context.user.id,
	}).select(DOC_COLUMNS).maybeSingle();
	if (error || !data) return unavailable(c, "work_document_write_failed");
	return json(c, { document: formatDocument(data, true) }, 201);
});

/**
 * PATCH /documents/:id {title?, body?, projectId?, baseUpdatedAt?}: with baseUpdatedAt, the save
 * only goes through when nobody saved since that version (409 document_changed otherwise).
 */
accountWorkDocsRouter.patch("/documents/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A document id is required");
	const patch: Record<string, unknown> = {};
	if (body.title !== undefined) {
		const title = typeof body.title === "string" ? body.title.trim() : "";
		if (!title || title.length > 200) return badRequest(c, "title must be 1 to 200 characters");
		patch.title = title;
	}
	if (body.body !== undefined) {
		if (typeof body.body !== "string" || body.body.length > MAX_DOC_BODY) return badRequest(c, "body must be text of at most 200,000 characters");
		patch.body = body.body;
	}
	const project = await checkProject(context, body.projectId).catch(() => null);
	if (!project) return unavailable(c);
	if (project.ok === false) return badRequest(c, project.message);
	if (project.value !== undefined) patch.project_id = project.value;
	if (!Object.keys(patch).length) return badRequest(c, "Provide at least one field to update");
	patch.updated_by = context.user.id;
	patch.updated_at = new Date().toISOString();
	let query = context.client.from("work_documents").update(patch).eq("workspace_id", context.workspaceId).eq("id", id);
	if (typeof body.baseUpdatedAt === "string" && !Number.isNaN(Date.parse(body.baseUpdatedAt))) query = query.eq("updated_at", body.baseUpdatedAt);
	const { data, error } = await query.select(DOC_COLUMNS).maybeSingle();
	if (error) return unavailable(c, "work_document_write_failed");
	if (!data) {
		const exists = await context.client.from("work_documents").select("id").eq("workspace_id", context.workspaceId).eq("id", id).maybeSingle();
		if (exists.data) return json(c, { error: "document_changed", message: "Someone else saved this document. Reload it before saving again." }, 409);
		return notFound(c, "Document not found");
	}
	return json(c, { document: formatDocument(data, true) });
});

accountWorkDocsRouter.delete("/documents/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId ?? c.req.query("workspaceId"));
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A document id is required");
	const { data, error } = await context.client.from("work_documents").delete().eq("workspace_id", context.workspaceId).eq("id", id).select("id").maybeSingle();
	if (error) return unavailable(c, "work_document_write_failed");
	if (!data) return notFound(c, "Document not found");
	return json(c, { id, deleted: true });
});

// ---------------------------------------------------------------------------------------------
// Initiatives and the roadmap
// ---------------------------------------------------------------------------------------------

function parseInitiative(body: Record<string, unknown>, creating: boolean): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
	const value: Record<string, unknown> = {};
	if (body.name !== undefined || creating) {
		const name = typeof body.name === "string" ? body.name.trim() : "";
		if (!name || name.length > 120) return { ok: false, message: "name must be 1 to 120 characters" };
		value.name = name;
	}
	if (body.description !== undefined) {
		if (typeof body.description !== "string" || body.description.length > 20_000) return { ok: false, message: "description must be text of at most 20,000 characters" };
		value.description = body.description;
	}
	if (body.state !== undefined) {
		if (!INITIATIVE_STATES.includes(body.state as (typeof INITIATIVE_STATES)[number])) return { ok: false, message: "state must be planned, active, completed or cancelled" };
		value.state = body.state;
	}
	if (body.targetDate !== undefined) {
		if (body.targetDate !== null && body.targetDate !== "" && !isIsoDate(body.targetDate)) return { ok: false, message: "targetDate must be a date (YYYY-MM-DD) or null" };
		value.target_date = body.targetDate ? body.targetDate : null;
	}
	return { ok: true, value };
}

accountWorkDocsRouter.get("/initiatives", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const { data, error } = await context.client.from("work_initiatives").select(INITIATIVE_COLUMNS).eq("workspace_id", context.workspaceId).order("name", { ascending: true }).limit(200);
	if (error) return unavailable(c);
	return json(c, { initiatives: (data ?? []).map(formatInitiative) });
});

accountWorkDocsRouter.post("/initiatives", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const parsed = parseInitiative(body, true);
	if (parsed.ok === false) return badRequest(c, parsed.message);
	const { data, error } = await context.client.from("work_initiatives").insert({ ...parsed.value, workspace_id: context.workspaceId, created_by: context.user.id }).select(INITIATIVE_COLUMNS).maybeSingle();
	if (error || !data) return unavailable(c, "work_initiative_write_failed");
	return json(c, { initiative: formatInitiative(data) }, 201);
});

accountWorkDocsRouter.patch("/initiatives/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "An initiative id is required");
	const parsed = parseInitiative(body, false);
	if (parsed.ok === false) return badRequest(c, parsed.message);
	if (!Object.keys(parsed.value).length) return badRequest(c, "Provide at least one field to update");
	const { data, error } = await context.client.from("work_initiatives").update({ ...parsed.value, updated_at: new Date().toISOString() })
		.eq("workspace_id", context.workspaceId).eq("id", id).select(INITIATIVE_COLUMNS).maybeSingle();
	if (error) return unavailable(c, "work_initiative_write_failed");
	if (!data) return notFound(c, "Initiative not found");
	return json(c, { initiative: formatInitiative(data) });
});

/** Removes an initiative; its projects stay, outside any initiative. */
accountWorkDocsRouter.delete("/initiatives/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId ?? c.req.query("workspaceId"));
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "An initiative id is required");
	const { data, error } = await context.client.from("work_initiatives").delete().eq("workspace_id", context.workspaceId).eq("id", id).select("id").maybeSingle();
	if (error) return unavailable(c, "work_initiative_write_failed");
	if (!data) return notFound(c, "Initiative not found");
	return json(c, { id, deleted: true });
});

/**
 * GET /roadmap: initiatives and every project that isn't cancelled, with their dates. Progress
 * comes from the projects list (work_projects plus count queries there); here only dates and
 * grouping, so the roadmap stays one read per table.
 */
accountWorkDocsRouter.get("/roadmap", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const [initiatives, projects, health] = await Promise.all([
		context.client.from("work_initiatives").select(INITIATIVE_COLUMNS).eq("workspace_id", context.workspaceId).neq("state", "cancelled").order("target_date", { ascending: true, nullsFirst: false }).limit(100),
		context.client.from("work_projects").select(PROJECT_COLUMNS).eq("workspace_id", context.workspaceId).neq("state", "cancelled").order("target_date", { ascending: true, nullsFirst: false }).limit(300),
		context.client.rpc("work_project_health", { p_workspace_id: context.workspaceId }),
	]);
	if (initiatives.error || projects.error) return unavailable(c);
	const healthByProject: Record<string, string> = {};
	for (const row of (health.error ? [] : health.data ?? []) as Array<{ project_id: string; health: string }>) healthByProject[row.project_id] = row.health;
	return json(c, {
		initiatives: (initiatives.data ?? []).map(formatInitiative),
		projects: ((projects.data ?? []) as WorkProjectRow[]).map((row) => ({ ...formatWorkProject(row), health: healthByProject[row.id] ?? null })),
	});
});
