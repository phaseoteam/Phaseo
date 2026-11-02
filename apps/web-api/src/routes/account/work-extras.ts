import { Hono } from "hono";
import type { Env } from "@/env";
import {
	formatMilestone,
	formatProjectUpdate,
	formatRecurrence,
	formatTemplate,
	loadReactions,
	MAX_MILESTONES_PER_PROJECT,
	MAX_TEMPLATES,
	MILESTONE_COLUMNS,
	nextRunAfter,
	parseMilestoneInput,
	parseProjectUpdateInput,
	parseTemplateInput,
	PROJECT_UPDATE_COLUMNS,
	REACTION_EMOJI,
	RECURRENCE_CADENCES,
	RECURRENCE_COLUMNS,
	TEMPLATE_COLUMNS,
	type MilestoneRow,
	type ProjectUpdateRow,
	type ReactionEmoji,
	type RecurrenceCadence,
	type RecurrenceRow,
	type TemplateRow,
} from "@/work/extras";
import { loadWorkProject } from "@/work/projects";
import { accessFromQuery, badRequest, isWorkspaceOwnerOrAdmin, json, notFound, pathUuid, readBody, unavailable, workAccess } from "./work-shared";

// Project milestones and updates, item templates, recurring items and comment reactions
// (/api/account/work/...). Every read and write is scoped to the caller's workspace.

export const accountWorkExtrasRouter = new Hono<{ Bindings: Env }>();

async function projectFromPath(c: any, context: { client: any; workspaceId: string }): Promise<{ id: string } | { response: Response }> {
	const id = pathUuid(c, "id");
	if (!id) return { response: badRequest(c, "A project id is required") };
	try {
		const project = await loadWorkProject(context.client, context.workspaceId, id);
		return project ? { id } : { response: notFound(c, "Project not found") };
	} catch {
		return { response: unavailable(c) };
	}
}

// ---------------------------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------------------------

accountWorkExtrasRouter.get("/projects/:id/milestones", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const project = await projectFromPath(c, context);
	if ("response" in project) return project.response;
	const [list, counts] = await Promise.all([
		context.client.from("work_milestones").select(MILESTONE_COLUMNS).eq("workspace_id", context.workspaceId).eq("project_id", project.id)
			.order("position", { ascending: true }).order("created_at", { ascending: true }).limit(MAX_MILESTONES_PER_PROJECT),
		context.client.rpc("work_milestone_counts", { p_workspace_id: context.workspaceId, p_project_id: project.id }),
	]);
	if (list.error) return unavailable(c);
	const byId = new Map(((counts.error ? [] : counts.data ?? []) as Array<{ milestone_id: string; item_count: number; done_count: number }>).map((row) => [row.milestone_id, { itemCount: Number(row.item_count) || 0, doneCount: Number(row.done_count) || 0 }]));
	return json(c, { milestones: ((list.data ?? []) as MilestoneRow[]).map((row) => formatMilestone(row, byId.get(row.id))) });
});

accountWorkExtrasRouter.post("/projects/:id/milestones", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const project = await projectFromPath(c, context);
	if ("response" in project) return project.response;
	const parsed = parseMilestoneInput(body, true);
	if (parsed.ok === false) return badRequest(c, parsed.message);
	const count = await context.client.from("work_milestones").select("id", { count: "exact", head: true }).eq("project_id", project.id);
	if (count.error) return unavailable(c);
	if ((count.count ?? 0) >= MAX_MILESTONES_PER_PROJECT) return badRequest(c, `A project can have at most ${MAX_MILESTONES_PER_PROJECT} milestones`);
	const { data, error } = await context.client.from("work_milestones").insert({
		workspace_id: context.workspaceId,
		project_id: project.id,
		name: parsed.value.name,
		target_date: parsed.value.targetDate ?? null,
		position: parsed.value.position ?? (count.count ?? 0),
	}).select(MILESTONE_COLUMNS).maybeSingle();
	if (error || !data) return unavailable(c, "work_milestone_write_failed");
	return json(c, { milestone: formatMilestone(data as MilestoneRow) }, 201);
});

accountWorkExtrasRouter.patch("/milestones/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A milestone id is required");
	const parsed = parseMilestoneInput(body, false);
	if (parsed.ok === false) return badRequest(c, parsed.message);
	const patch: Record<string, unknown> = {};
	if (parsed.value.name !== undefined) patch.name = parsed.value.name;
	if (parsed.value.targetDate !== undefined) patch.target_date = parsed.value.targetDate;
	if (parsed.value.position !== undefined) patch.position = parsed.value.position;
	if (!Object.keys(patch).length) return badRequest(c, "Provide at least one field to update");
	const { data, error } = await context.client.from("work_milestones").update(patch).eq("workspace_id", context.workspaceId).eq("id", id).select(MILESTONE_COLUMNS).maybeSingle();
	if (error) return unavailable(c, "work_milestone_write_failed");
	if (!data) return notFound(c, "Milestone not found");
	return json(c, { milestone: formatMilestone(data as MilestoneRow) });
});

/** Removes a milestone; its items stay in the project, out of any milestone. */
accountWorkExtrasRouter.delete("/milestones/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId ?? c.req.query("workspaceId"));
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A milestone id is required");
	const { data, error } = await context.client.from("work_milestones").delete().eq("workspace_id", context.workspaceId).eq("id", id).select("id").maybeSingle();
	if (error) return unavailable(c, "work_milestone_write_failed");
	if (!data) return notFound(c, "Milestone not found");
	return json(c, { id, deleted: true });
});

// ---------------------------------------------------------------------------------------------
// Project updates
// ---------------------------------------------------------------------------------------------

accountWorkExtrasRouter.get("/projects/:id/updates", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const project = await projectFromPath(c, context);
	if ("response" in project) return project.response;
	const { data, error } = await context.client.from("work_project_updates").select(PROJECT_UPDATE_COLUMNS)
		.eq("workspace_id", context.workspaceId).eq("project_id", project.id).order("created_at", { ascending: false }).limit(20);
	if (error) return unavailable(c);
	return json(c, { updates: ((data ?? []) as ProjectUpdateRow[]).map(formatProjectUpdate) });
});

accountWorkExtrasRouter.post("/projects/:id/updates", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const project = await projectFromPath(c, context);
	if ("response" in project) return project.response;
	const parsed = parseProjectUpdateInput(body);
	if (parsed.ok === false) return badRequest(c, parsed.message);
	const { data, error } = await context.client.from("work_project_updates").insert({
		workspace_id: context.workspaceId,
		project_id: project.id,
		health: parsed.value.health,
		body: parsed.value.body,
		author_user_id: context.user.id,
	}).select(PROJECT_UPDATE_COLUMNS).maybeSingle();
	if (error || !data) return unavailable(c, "work_project_update_write_failed");
	return json(c, { update: formatProjectUpdate(data as ProjectUpdateRow) }, 201);
});

accountWorkExtrasRouter.delete("/project-updates/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId ?? c.req.query("workspaceId"));
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "An update id is required");
	const found = await context.client.from("work_project_updates").select("id,author_user_id").eq("workspace_id", context.workspaceId).eq("id", id).maybeSingle();
	if (found.error) return unavailable(c);
	if (!found.data) return notFound(c, "Update not found");
	if (found.data.author_user_id !== context.user.id && !isWorkspaceOwnerOrAdmin(context)) return json(c, { error: "forbidden", message: "Only the author or a workspace admin can remove an update" }, 403);
	const { error } = await context.client.from("work_project_updates").delete().eq("workspace_id", context.workspaceId).eq("id", id);
	if (error) return unavailable(c, "work_project_update_write_failed");
	return json(c, { id, deleted: true });
});

/** Each project's current health (its newest update's). */
accountWorkExtrasRouter.get("/project-health", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const { data, error } = await context.client.rpc("work_project_health", { p_workspace_id: context.workspaceId });
	if (error) return unavailable(c);
	const health: Record<string, { health: string; updatedAt: string }> = {};
	for (const row of (data ?? []) as Array<{ project_id: string; health: string; updated_at: string }>) health[row.project_id] = { health: row.health, updatedAt: row.updated_at };
	return json(c, { health });
});

// ---------------------------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------------------------

async function checkTemplateProject(context: { client: any; workspaceId: string }, value: Record<string, unknown>): Promise<string | null> {
	if (!value.project_id) return null;
	return await loadWorkProject(context.client, context.workspaceId, String(value.project_id)) ? null : "projectId must be a project in this workspace";
}

accountWorkExtrasRouter.get("/templates", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const { data, error } = await context.client.from("work_templates").select(TEMPLATE_COLUMNS).eq("workspace_id", context.workspaceId).order("name", { ascending: true }).limit(MAX_TEMPLATES);
	if (error) return unavailable(c);
	return json(c, { templates: ((data ?? []) as TemplateRow[]).map(formatTemplate) });
});

accountWorkExtrasRouter.post("/templates", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const parsed = parseTemplateInput(body, true);
	if (parsed.ok === false) return badRequest(c, parsed.message);
	try {
		const projectError = await checkTemplateProject(context, parsed.value);
		if (projectError) return badRequest(c, projectError);
	} catch {
		return unavailable(c);
	}
	const count = await context.client.from("work_templates").select("id", { count: "exact", head: true }).eq("workspace_id", context.workspaceId);
	if (count.error) return unavailable(c);
	if ((count.count ?? 0) >= MAX_TEMPLATES) return badRequest(c, `A workspace can have at most ${MAX_TEMPLATES} templates`);
	const { data, error } = await context.client.from("work_templates").insert({ ...parsed.value, workspace_id: context.workspaceId, created_by: context.user.id }).select(TEMPLATE_COLUMNS).maybeSingle();
	if (error || !data) return unavailable(c, "work_template_write_failed");
	return json(c, { template: formatTemplate(data as TemplateRow) }, 201);
});

accountWorkExtrasRouter.patch("/templates/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A template id is required");
	const parsed = parseTemplateInput(body, false);
	if (parsed.ok === false) return badRequest(c, parsed.message);
	if (!Object.keys(parsed.value).length) return badRequest(c, "Provide at least one field to update");
	try {
		const projectError = await checkTemplateProject(context, parsed.value);
		if (projectError) return badRequest(c, projectError);
	} catch {
		return unavailable(c);
	}
	const { data, error } = await context.client.from("work_templates").update(parsed.value).eq("workspace_id", context.workspaceId).eq("id", id).select(TEMPLATE_COLUMNS).maybeSingle();
	if (error) return unavailable(c, "work_template_write_failed");
	if (!data) return notFound(c, "Template not found");
	return json(c, { template: formatTemplate(data as TemplateRow) });
});

/** Removes a template and the recurring items made from it. */
accountWorkExtrasRouter.delete("/templates/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId ?? c.req.query("workspaceId"));
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A template id is required");
	const { data, error } = await context.client.from("work_templates").delete().eq("workspace_id", context.workspaceId).eq("id", id).select("id").maybeSingle();
	if (error) return unavailable(c, "work_template_write_failed");
	if (!data) return notFound(c, "Template not found");
	return json(c, { id, deleted: true });
});

// ---------------------------------------------------------------------------------------------
// Recurring items
// ---------------------------------------------------------------------------------------------

accountWorkExtrasRouter.get("/recurrences", async (c) => {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const { data, error } = await context.client.from("work_recurrences").select(RECURRENCE_COLUMNS).eq("workspace_id", context.workspaceId).order("next_run_at", { ascending: true }).limit(100);
	if (error) return unavailable(c);
	return json(c, { recurrences: ((data ?? []) as RecurrenceRow[]).map(formatRecurrence) });
});

/** POST /recurrences {templateId, cadence, startAt}: the first item is made at startAt (now when left out). */
accountWorkExtrasRouter.post("/recurrences", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const templateId = typeof body.templateId === "string" && /^[0-9a-f-]{36}$/i.test(body.templateId) ? body.templateId.toLowerCase() : null;
	if (!templateId) return badRequest(c, "templateId is required");
	if (!RECURRENCE_CADENCES.includes(body.cadence as RecurrenceCadence)) return badRequest(c, "cadence must be daily, weekly or monthly");
	const now = Date.now();
	const start = body.startAt === undefined || body.startAt === null ? now : Date.parse(String(body.startAt));
	if (!Number.isFinite(start) || start < now - 60_000 || start > now + 366 * 86_400_000) return badRequest(c, "startAt must be a time within the next year");
	const template = await context.client.from("work_templates").select("id").eq("workspace_id", context.workspaceId).eq("id", templateId).maybeSingle();
	if (template.error) return unavailable(c);
	if (!template.data) return badRequest(c, "templateId must be a template in this workspace");
	const { data, error } = await context.client.from("work_recurrences").insert({
		workspace_id: context.workspaceId,
		template_id: templateId,
		cadence: body.cadence,
		next_run_at: new Date(Math.max(start, now)).toISOString(),
		created_by: context.user.id,
	}).select(RECURRENCE_COLUMNS).maybeSingle();
	if (error || !data) return unavailable(c, "work_recurrence_write_failed");
	return json(c, { recurrence: formatRecurrence(data as RecurrenceRow) }, 201);
});

accountWorkExtrasRouter.patch("/recurrences/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A recurrence id is required");
	const patch: Record<string, unknown> = {};
	if (body.enabled !== undefined) {
		if (typeof body.enabled !== "boolean") return badRequest(c, "enabled must be true or false");
		patch.enabled = body.enabled;
	}
	if (body.cadence !== undefined) {
		if (!RECURRENCE_CADENCES.includes(body.cadence as RecurrenceCadence)) return badRequest(c, "cadence must be daily, weekly or monthly");
		patch.cadence = body.cadence;
	}
	if (!Object.keys(patch).length) return badRequest(c, "Send enabled or cadence");
	// Turning one back on after a pause starts from its next run after now, never a backlog.
	if (patch.enabled === true || patch.cadence) {
		const current = await context.client.from("work_recurrences").select("next_run_at,cadence").eq("workspace_id", context.workspaceId).eq("id", id).maybeSingle();
		if (current.error) return unavailable(c);
		if (!current.data) return notFound(c, "Recurring item not found");
		const due = new Date(String(current.data.next_run_at));
		if (due.getTime() < Date.now()) patch.next_run_at = nextRunAfter(due, (patch.cadence ?? current.data.cadence) as RecurrenceCadence).toISOString();
	}
	const { data, error } = await context.client.from("work_recurrences").update(patch).eq("workspace_id", context.workspaceId).eq("id", id).select(RECURRENCE_COLUMNS).maybeSingle();
	if (error) return unavailable(c, "work_recurrence_write_failed");
	if (!data) return notFound(c, "Recurring item not found");
	return json(c, { recurrence: formatRecurrence(data as RecurrenceRow) });
});

accountWorkExtrasRouter.delete("/recurrences/:id", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId ?? c.req.query("workspaceId"));
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "A recurrence id is required");
	const { data, error } = await context.client.from("work_recurrences").delete().eq("workspace_id", context.workspaceId).eq("id", id).select("id").maybeSingle();
	if (error) return unavailable(c, "work_recurrence_write_failed");
	if (!data) return notFound(c, "Recurring item not found");
	return json(c, { id, deleted: true });
});

// ---------------------------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------------------------

/** POST /events/:id/reactions {emoji}: adds the person's reaction, or takes it back when they had it. */
accountWorkExtrasRouter.post("/events/:id/reactions", async (c) => {
	const body = await readBody(c);
	const access = await workAccess(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context } = access;
	const id = pathUuid(c, "id");
	if (!id) return badRequest(c, "An event id is required");
	if (!REACTION_EMOJI.includes(body.emoji as ReactionEmoji)) return badRequest(c, `emoji must be one of ${REACTION_EMOJI.join(", ")}`);
	const event = await context.client.from("work_item_events").select("id,kind").eq("workspace_id", context.workspaceId).eq("id", id).maybeSingle();
	if (event.error) return unavailable(c);
	if (!event.data) return notFound(c, "Comment not found");
	if (event.data.kind !== "comment") return badRequest(c, "Only comments take reactions");
	const removed = await context.client.from("work_reactions").delete()
		.eq("event_id", id).eq("user_id", context.user.id).eq("emoji", body.emoji).select("event_id");
	if (removed.error) return unavailable(c);
	if (!(removed.data ?? []).length) {
		const added = await context.client.from("work_reactions").insert({ event_id: id, workspace_id: context.workspaceId, user_id: context.user.id, emoji: body.emoji });
		if (added.error && added.error.code !== "23505") return unavailable(c);
	}
	const reactions = await loadReactions(context.client, context.workspaceId, [id], context.user.id);
	return json(c, { eventId: id, reactions: reactions[id] ?? [] });
});
