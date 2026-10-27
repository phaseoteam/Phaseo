import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Env } from "@/env";
import { auditSlack, badRequest, json, liveInstallation, managerContext, readBody } from "./settings-slack";

// What the Slack agent remembers, for the live installation's owners and admins:
// its notes, pins and to-dos, and its saved skills. The agent writes them (only
// through database functions, which cap them at 500 notes and 100 skills);
// admins can read them here, delete them, and edit a skill. Uninstalling deletes
// them all in the database. Audit events record ids and kinds, never their text.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NOTE_KINDS = ["note", "pin", "todo"] as const;
/** The most an installation keeps (save_slack_agent_note and save_slack_agent_skill), so one page holds them all. */
export const MAX_NOTES = 500;
export const MAX_SKILLS = 100;
export const MAX_SKILL_NAME_CHARS = 60;
export const MAX_SKILL_DESCRIPTION_CHARS = 200;
export const MAX_SKILL_INSTRUCTIONS_CHARS = 4_000;
const NOTE_COLUMNS = "id,kind,channel_id,text,done_at,created_by,created_at,updated_at,expires_at";
const SKILL_COLUMNS = "id,name,description,instructions,created_by,created_at,updated_at";
const SKILL_FIELDS = new Set(["workspaceId", "name", "description", "instructions"]);

type NoteRow = {
	id: string;
	kind: string;
	channel_id: string | null;
	text: string;
	done_at: string | null;
	created_by: string;
	created_at: string;
	updated_at: string;
	expires_at: string | null;
};

type SkillRow = { id: string; name: string; description: string; instructions: string; created_by: string; created_at: string; updated_at: string };

function noteView(row: NoteRow) {
	return {
		id: row.id,
		kind: row.kind,
		channel_id: row.channel_id,
		text: row.text,
		done_at: row.done_at,
		created_by: row.created_by,
		created_at: row.created_at,
		updated_at: row.updated_at,
		expires_at: row.expires_at,
	};
}

function skillView(row: SkillRow) {
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		instructions: row.instructions,
		created_by: row.created_by,
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}

/** Characters as the database counts them (code points). */
function length(text: string): number {
	return [...text].length;
}

type SkillEdit = { name?: string; description?: string; instructions?: string };

/** A skill edit, as the database will accept it: names and descriptions on one line, everything trimmed. */
export function parseSkillEdit(body: Record<string, unknown>): { ok: true; value: SkillEdit } | { ok: false; message: string } {
	const unknown = Object.keys(body).find((field) => !SKILL_FIELDS.has(field));
	if (unknown) return { ok: false, message: `Unknown field: ${unknown}` };
	const value: SkillEdit = {};
	const field = (name: keyof SkillEdit, max: number, oneLine: boolean): string | null => {
		const raw = body[name];
		if (raw === undefined) return null;
		if (typeof raw !== "string") return `${name} must be text`;
		const text = oneLine ? raw.replace(/\s+/g, " ").trim() : raw.trim();
		if (!text) return `${name} can't be empty`;
		if (length(text) > max) return `${name} must be at most ${max.toLocaleString("en-US")} characters`;
		value[name] = text;
		return null;
	};
	const problem = field("name", MAX_SKILL_NAME_CHARS, true)
		?? field("description", MAX_SKILL_DESCRIPTION_CHARS, true)
		?? field("instructions", MAX_SKILL_INSTRUCTIONS_CHARS, false);
	if (problem) return { ok: false, message: problem };
	if (!Object.keys(value).length) return { ok: false, message: "Nothing to change" };
	return { ok: true, value };
}

function notFound(c: any) {
	return json(c, { error: "memory_not_found", message: "It was deleted meanwhile. Reload to see what is left" }, 404);
}

/** The manager's context and the live installation, or the response that ends the request. */
async function managedInstallation(c: any, workspaceId: unknown) {
	const access = await managerContext(c, workspaceId);
	if (access.response) return { response: access.response } as const;
	const live = await liveInstallation(access.context.client, access.context.workspaceId, "id,team_name");
	if (live.error) return { response: json(c, { error: "settings_unavailable" }, 503) } as const;
	if (!live.row) return { response: json(c, { error: "not_installed", message: "The Slack agent is not installed in this workspace" }, 404) } as const;
	return { context: access.context, installation: live.row };
}

export const accountSettingsSlackMemoryRouter = new Hono<{ Bindings: Env }>();

accountSettingsSlackMemoryRouter.get("/slack/memory", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) return badRequest(c, "workspaceId is required");
	const kind = c.req.query("kind")?.trim() || null;
	if (kind !== null && !(NOTE_KINDS as readonly string[]).includes(kind)) return badRequest(c, `kind must be one of ${NOTE_KINDS.join(", ")}`);
	const access = await managedInstallation(c, workspaceId);
	if ("response" in access) return access.response;
	const { context, installation } = access;
	// Expired notes are hidden at once; the agent's next turn deletes them.
	const unexpired = `expires_at.is.null,expires_at.gt.${new Date().toISOString()}`;
	const listed = context.client.from("slack_agent_notes").select(NOTE_COLUMNS, { count: "exact" })
		.eq("installation_id", installation.id).or(unexpired);
	const [notes, used, skills] = await Promise.all([
		(kind ? listed.eq("kind", kind) : listed).order("created_at", { ascending: false }).order("id").limit(MAX_NOTES),
		// Counted in the database, never by adding up rows here.
		context.client.from("slack_agent_notes").select("id", { count: "exact", head: true }).eq("installation_id", installation.id).or(unexpired),
		context.client.from("slack_agent_skills").select(SKILL_COLUMNS).eq("installation_id", installation.id).order("name").limit(MAX_SKILLS),
	]);
	if (notes.error || used.error || skills.error) return json(c, { error: "settings_unavailable" }, 503);
	return json(c, {
		notes: ((notes.data ?? []) as unknown as NoteRow[]).map(noteView),
		notes_total: notes.count ?? 0,
		notes_used: used.count ?? 0,
		notes_limit: MAX_NOTES,
		skills: ((skills.data ?? []) as unknown as SkillRow[]).map(skillView),
		skills_limit: MAX_SKILLS,
	});
});

accountSettingsSlackMemoryRouter.delete("/slack/memory/notes/:id", async (c) => {
	const id = c.req.param("id");
	if (!UUID_PATTERN.test(id)) return badRequest(c, "id must be a note id");
	const body = await readBody(c);
	const access = await managedInstallation(c, body.workspaceId ?? c.req.query("workspaceId"));
	if ("response" in access) return access.response;
	const { context, installation } = access;
	const removed = await context.client.from("slack_agent_notes").delete()
		.eq("id", id).eq("installation_id", installation.id).select("id,kind").maybeSingle();
	if (removed.error) return json(c, { error: "settings_write_failed" }, 503);
	if (!removed.data) return notFound(c);
	await auditSlack(c, context, "memory_note_deleted", { id, type: "slack_agent_note" }, { installation_id: installation.id, kind: removed.data.kind });
	return json(c, { id, deleted: true });
});

accountSettingsSlackMemoryRouter.patch("/slack/memory/skills/:id", bodyLimit({ maxSize: 32 * 1024 }), async (c) => {
	const id = c.req.param("id");
	if (!UUID_PATTERN.test(id)) return badRequest(c, "id must be a skill id");
	const body = await readBody(c);
	const parsed = parseSkillEdit(body);
	if (parsed.ok === false) return badRequest(c, parsed.message);
	const access = await managedInstallation(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context, installation } = access;
	const updated = await context.client.from("slack_agent_skills").update(parsed.value)
		.eq("id", id).eq("installation_id", installation.id).select(SKILL_COLUMNS).maybeSingle();
	if (updated.error) {
		if (updated.error.code === "23505") return json(c, { error: "skill_name_taken", message: "Another saved skill has this name" }, 409);
		if (updated.error.code === "23514") return badRequest(c, "The skill is not valid");
		return json(c, { error: "settings_write_failed" }, 503);
	}
	if (!updated.data) return notFound(c);
	await auditSlack(c, context, "skill_updated", { id, type: "slack_agent_skill" }, { installation_id: installation.id, changed_fields: Object.keys(parsed.value) });
	return json(c, { skill: skillView(updated.data as unknown as SkillRow) });
});

accountSettingsSlackMemoryRouter.delete("/slack/memory/skills/:id", async (c) => {
	const id = c.req.param("id");
	if (!UUID_PATTERN.test(id)) return badRequest(c, "id must be a skill id");
	const body = await readBody(c);
	const access = await managedInstallation(c, body.workspaceId ?? c.req.query("workspaceId"));
	if ("response" in access) return access.response;
	const { context, installation } = access;
	const removed = await context.client.from("slack_agent_skills").delete()
		.eq("id", id).eq("installation_id", installation.id).select("id").maybeSingle();
	if (removed.error) return json(c, { error: "settings_write_failed" }, 503);
	if (!removed.data) return notFound(c);
	await auditSlack(c, context, "skill_deleted", { id, type: "slack_agent_skill" }, { installation_id: installation.id });
	return json(c, { id, deleted: true });
});
