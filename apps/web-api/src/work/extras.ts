// Project milestones, project updates (health), item templates, recurring items and comment
// reactions: their rows, formatting and validation. Routes are in routes/account/work-extras.ts and
// the recurring job in runRecurrences (on web-api's cron).

import { createWorkItem, type DataClient } from "./items";
import { isIsoDate } from "./projects";
import { WORK_AGENTS, type WorkAgent } from "./types";

// ---------------------------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------------------------

export const MILESTONE_COLUMNS = "id,workspace_id,project_id,name,target_date,position,created_at";
export const MAX_MILESTONES_PER_PROJECT = 50;
export type MilestoneRow = { id: string; workspace_id: string; project_id: string; name: string; target_date: string | null; position: number; created_at: string };
export type Milestone = { id: string; projectId: string; name: string; targetDate: string | null; position: number; itemCount: number; doneCount: number };

export function formatMilestone(row: MilestoneRow, counts: { itemCount: number; doneCount: number } = { itemCount: 0, doneCount: 0 }): Milestone {
	return { id: row.id, projectId: row.project_id, name: row.name, targetDate: row.target_date, position: row.position, ...counts };
}

export function parseMilestoneInput(body: Record<string, unknown>, creating: boolean): { ok: true; value: { name?: string; targetDate?: string | null; position?: number } } | { ok: false; message: string } {
	const value: { name?: string; targetDate?: string | null; position?: number } = {};
	if (body.name !== undefined || creating) {
		const name = typeof body.name === "string" ? body.name.trim() : "";
		if (!name || name.length > 120) return { ok: false, message: "name must be 1 to 120 characters" };
		value.name = name;
	}
	if (body.targetDate !== undefined) {
		if (body.targetDate !== null && body.targetDate !== "" && !isIsoDate(body.targetDate)) return { ok: false, message: "targetDate must be a date (YYYY-MM-DD) or null" };
		value.targetDate = body.targetDate ? String(body.targetDate) : null;
	}
	if (body.position !== undefined) {
		if (typeof body.position !== "number" || !Number.isInteger(body.position) || body.position < 0 || body.position > 1000) return { ok: false, message: "position must be 0 to 1000" };
		value.position = body.position;
	}
	return { ok: true, value };
}

// ---------------------------------------------------------------------------------------------
// Project updates
// ---------------------------------------------------------------------------------------------

export const PROJECT_HEALTHS = ["on_track", "at_risk", "off_track"] as const;
export type ProjectHealth = (typeof PROJECT_HEALTHS)[number];
export const PROJECT_UPDATE_COLUMNS = "id,workspace_id,project_id,health,body,author_user_id,created_at";
export type ProjectUpdateRow = { id: string; workspace_id: string; project_id: string; health: ProjectHealth; body: string; author_user_id: string | null; created_at: string };
export type ProjectUpdate = { id: string; projectId: string; health: ProjectHealth; body: string; authorUserId: string | null; createdAt: string };

export function formatProjectUpdate(row: ProjectUpdateRow): ProjectUpdate {
	return { id: row.id, projectId: row.project_id, health: row.health, body: row.body, authorUserId: row.author_user_id, createdAt: row.created_at };
}

export function parseProjectUpdateInput(body: Record<string, unknown>): { ok: true; value: { health: ProjectHealth; body: string } } | { ok: false; message: string } {
	if (!PROJECT_HEALTHS.includes(body.health as ProjectHealth)) return { ok: false, message: "health must be on_track, at_risk or off_track" };
	const text = typeof body.body === "string" ? body.body.trim() : "";
	if (!text || text.length > 10_000) return { ok: false, message: "body must be 1 to 10,000 characters" };
	return { ok: true, value: { health: body.health as ProjectHealth, body: text } };
}

// ---------------------------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------------------------

export const TEMPLATE_COLUMNS = "id,workspace_id,name,title,description,priority,labels,estimate,project_id,assignee_agent,created_by,created_at";
export const MAX_TEMPLATES = 100;
export type TemplateRow = { id: string; workspace_id: string; name: string; title: string; description: string; priority: number; labels: string[] | null; estimate: number | null; project_id: string | null; assignee_agent: WorkAgent | null; created_by: string | null; created_at: string };
export type WorkTemplate = { id: string; name: string; title: string; description: string; priority: number; labels: string[]; estimate: number | null; projectId: string | null; assigneeAgent: WorkAgent | null; createdAt: string };

export function formatTemplate(row: TemplateRow): WorkTemplate {
	return { id: row.id, name: row.name, title: row.title, description: row.description, priority: row.priority, labels: row.labels ?? [], estimate: row.estimate, projectId: row.project_id, assigneeAgent: row.assignee_agent, createdAt: row.created_at };
}

const LABEL = /^[a-z0-9][a-z0-9 ._-]{0,39}$/;

/** Validates a template body into database columns. */
export function parseTemplateInput(body: Record<string, unknown>, creating: boolean): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
	const value: Record<string, unknown> = {};
	if (body.name !== undefined || creating) {
		const name = typeof body.name === "string" ? body.name.trim() : "";
		if (!name || name.length > 80) return { ok: false, message: "name must be 1 to 80 characters" };
		value.name = name;
	}
	for (const [field, max] of [["title", 300], ["description", 20_000]] as const) {
		if (body[field] === undefined) continue;
		if (typeof body[field] !== "string" || (body[field] as string).length > max) return { ok: false, message: `${field} must be text of at most ${max} characters` };
		value[field] = (body[field] as string).trim();
	}
	if (body.priority !== undefined) {
		if (typeof body.priority !== "number" || !Number.isInteger(body.priority) || body.priority < 0 || body.priority > 4) return { ok: false, message: "priority must be 0 to 4" };
		value.priority = body.priority;
	}
	if (body.labels !== undefined) {
		if (!Array.isArray(body.labels) || body.labels.length > 10) return { ok: false, message: "labels must be at most 10 labels" };
		const labels = [...new Set(body.labels.map((label) => String(label).trim().toLowerCase()))];
		if (!labels.every((label) => LABEL.test(label))) return { ok: false, message: "labels must be short lowercase words" };
		value.labels = labels;
	}
	if (body.estimate !== undefined) {
		if (body.estimate !== null && (typeof body.estimate !== "number" || !Number.isInteger(body.estimate) || body.estimate < 0 || body.estimate > 21)) return { ok: false, message: "estimate must be 0 to 21 or null" };
		value.estimate = body.estimate;
	}
	if (body.projectId !== undefined) {
		if (body.projectId !== null && (typeof body.projectId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.projectId))) return { ok: false, message: "projectId must be a project id or null" };
		value.project_id = body.projectId ? String(body.projectId).toLowerCase() : null;
	}
	if (body.assigneeAgent !== undefined) {
		if (body.assigneeAgent !== null && !WORK_AGENTS.includes(body.assigneeAgent as WorkAgent)) return { ok: false, message: "assigneeAgent must be triage, engineer, support or null" };
		value.assignee_agent = body.assigneeAgent;
	}
	return { ok: true, value };
}

// ---------------------------------------------------------------------------------------------
// Recurring items
// ---------------------------------------------------------------------------------------------

export const RECURRENCE_CADENCES = ["daily", "weekly", "monthly"] as const;
export type RecurrenceCadence = (typeof RECURRENCE_CADENCES)[number];
export const RECURRENCE_COLUMNS = "id,workspace_id,template_id,cadence,next_run_at,enabled,last_item_id,last_run_at,created_by,created_at";
export const RECURRENCES_PER_RUN = 50;
export type RecurrenceRow = { id: string; workspace_id: string; template_id: string; cadence: RecurrenceCadence; next_run_at: string; enabled: boolean; last_item_id: string | null; last_run_at: string | null; created_by: string | null; created_at: string };
export type Recurrence = { id: string; templateId: string; cadence: RecurrenceCadence; nextRunAt: string; enabled: boolean; lastRunAt: string | null; createdAt: string };

export function formatRecurrence(row: RecurrenceRow): Recurrence {
	return { id: row.id, templateId: row.template_id, cadence: row.cadence, nextRunAt: row.next_run_at, enabled: row.enabled, lastRunAt: row.last_run_at, createdAt: row.created_at };
}

/**
 * The next run after `from` for the cadence, at the same UTC time of day. A monthly run on the
 * 29th to 31st lands on the month's last day when the month is shorter. Runs that were missed (the
 * job was down) are not made up: the result is always after `now`.
 */
export function nextRunAfter(from: Date, cadence: RecurrenceCadence, now: Date = new Date()): Date {
	let next = new Date(from.getTime());
	const step = () => {
		if (cadence === "daily") next = new Date(next.getTime() + 86_400_000);
		else if (cadence === "weekly") next = new Date(next.getTime() + 7 * 86_400_000);
		else {
			const day = from.getUTCDate();
			const year = next.getUTCFullYear();
			const month = next.getUTCMonth() + 1;
			const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
			next = new Date(Date.UTC(year, month, Math.min(day, last), from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds()));
		}
	};
	step();
	for (let guard = 0; next.getTime() <= now.getTime() && guard < 1000; guard += 1) step();
	return next;
}

export type RecurrenceSummary = { due: number; created: number; failed: number };

/**
 * Makes the items that are due: each enabled recurrence with next_run_at in the past gets one new
 * item from its template, then moves on to its next run. A recurrence is claimed by moving its
 * next_run_at first (only if it still has the value read), so two runs of the job never both make
 * an item.
 */
export async function runRecurrences(client: DataClient, now: Date): Promise<RecurrenceSummary> {
	const summary: RecurrenceSummary = { due: 0, created: 0, failed: 0 };
	const { data, error } = await client.from("work_recurrences").select(`${RECURRENCE_COLUMNS},template:work_templates(${TEMPLATE_COLUMNS})`)
		.eq("enabled", true).lte("next_run_at", now.toISOString()).order("next_run_at", { ascending: true }).limit(RECURRENCES_PER_RUN);
	if (error) throw new Error(`work_recurrences read failed: ${error.message}`);
	for (const row of (data ?? []) as unknown as Array<RecurrenceRow & { template: TemplateRow | null }>) {
		summary.due += 1;
		const next = nextRunAfter(new Date(row.next_run_at), row.cadence, now).toISOString();
		const claimed = await client.from("work_recurrences").update({ next_run_at: next, last_run_at: now.toISOString() })
			.eq("id", row.id).eq("next_run_at", row.next_run_at).select("id").maybeSingle();
		if (claimed.error || !claimed.data) continue;
		const template = row.template;
		if (!template) continue;
		try {
			const item = await createWorkItem(client, {
				workspaceId: row.workspace_id,
				title: (template.title || template.name).slice(0, 300),
				description: template.description,
				state: "todo",
				priority: template.priority,
				source: "manual",
				createdBy: row.created_by,
				authorKind: "system",
				labels: template.labels ?? [],
				assigneeAgent: template.assignee_agent,
				projectId: template.project_id,
				estimate: template.estimate,
			});
			await client.from("work_recurrences").update({ last_item_id: item.id }).eq("id", row.id);
			summary.created += 1;
		} catch (createError) {
			summary.failed += 1;
			console.error("[work] recurring item not created", { recurrenceId: row.id, message: createError instanceof Error ? createError.message : String(createError) });
		}
	}
	return summary;
}

// ---------------------------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------------------------

export const REACTION_EMOJI = ["+1", "-1", "heart", "tada", "eyes", "rocket"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJI)[number];
export type ReactionCount = { emoji: ReactionEmoji; count: number; mine: boolean };

/** Reaction counts per event id, from public.work_event_reactions (summed in the database). Empty on failure. */
export async function loadReactions(client: DataClient, workspaceId: string, eventIds: string[], userId: string): Promise<Record<string, ReactionCount[]>> {
	if (!eventIds.length) return {};
	try {
		const { data, error } = await client.rpc("work_event_reactions", { p_workspace_id: workspaceId, p_event_ids: eventIds.slice(0, 500), p_user_id: userId });
		if (error) return {};
		const byEvent: Record<string, ReactionCount[]> = {};
		for (const row of (data ?? []) as Array<{ event_id: string; emoji: ReactionEmoji; count: number; mine: boolean }>) {
			(byEvent[row.event_id] ??= []).push({ emoji: row.emoji, count: Number(row.count) || 0, mine: row.mine === true });
		}
		for (const list of Object.values(byEvent)) list.sort((a, b) => REACTION_EMOJI.indexOf(a.emoji) - REACTION_EMOJI.indexOf(b.emoji));
		return byEvent;
	} catch {
		return {};
	}
}
