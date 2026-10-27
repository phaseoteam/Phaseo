import type { AgentTool } from "@phaseo/agent-sdk";
import type { Installation } from "./installations";
import type { Db } from "./supabase";
import type { TurnRef } from "./turns";
import { ToolInputError } from "./usage-tools";

// The agent's memory and saved skills, offered on every turn.
//
// Memory is short notes, pins and to-dos the agent writes because someone asked
// it to remember something (or for a fact the team will need again), never copies
// of Slack messages: Slack's API terms forbid archiving them. A note belongs to
// one conversation (its channel or DM) or to the whole Slack workspace, and a
// conversation only ever sees its own and the workspace's. Someone from another
// organisation (Slack Connect) sees and saves only the conversation's. Admins can
// turn notes off; saved ones are kept. Skills are named instructions for tasks
// people repeat, saved only when someone asks, and work whatever the notes do.
//
// Everything goes through database functions with the service role: they cap an
// installation at 500 notes and 100 skills, keep to the same rules about whose
// notes a turn sees and the admins' switch, and uninstalling deletes both. Admins
// see, edit and delete them in Settings → Slack.

export const MAX_NOTE_CHARS = 500;
export const MAX_SKILL_NAME_CHARS = 60;
export const MAX_SKILL_DESCRIPTION_CHARS = 200;
export const MAX_SKILL_INSTRUCTIONS_CHARS = 4_000;
const MAX_QUERY_CHARS = 200;
/** Notes can be kept for a while, not forever by accident: an expiry is at most two years out. */
const MAX_EXPIRY_DAYS = 731;
const DAY_MS = 86_400_000;
const NOTE_KINDS = ["note", "pin", "todo"] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const NOTE_TOOL_IDS = ["remember", "recall", "update_todo", "forget"] as const;
export const SKILL_TOOL_IDS = ["save_skill", "list_skills", "use_skill"] as const;
export const MEMORY_TOOL_IDS = [...NOTE_TOOL_IDS, ...SKILL_TOOL_IDS] as const;

/**
 * The notes a turn works with: none while an admin has turned memory off; only
 * the conversation's for someone from another organisation; otherwise the
 * conversation's and the whole workspace's.
 */
export type NoteAccess = "off" | "conversation" | "workspace";

export function noteAccess(installation: Pick<Installation, "memory_enabled">, turn: Pick<TurnRef, "external">): NoteAccess {
	if (!installation.memory_enabled) return "off";
	return turn.external ? "conversation" : "workspace";
}

const NOTES_HOW = "Save one with remember only when someone asks you to remember, pin or track something, or for a lasting fact the team will need again, such as a decision, a convention or a deadline. Write a short note in your own words; never copy whole messages or threads.";
const NOTE_TOOLS_HOW = "Use recall before saying you don't know something you may have been told, update_todo to tick off a to-do, and forget when someone asks you to.";
const SKILLS_HOW = "Saved skills are instructions people saved for tasks they repeat. When a request matches one, call use_skill and follow what it says. Call save_skill only when someone explicitly asks you to save a skill.";
/** Skills apply to the whole workspace, so someone from another organisation can use them but not save them. */
const SKILLS_HOW_EXTERNAL = "Saved skills are instructions people saved for tasks they repeat. When a request matches one, call use_skill and follow what it says. The person asking is from another organisation, so they can't save skills; if they ask, say someone in this workspace can save it.";

/** What the agent is told about its memory and skills, for the turn's note access and whether the person is from another organisation. */
export function memoryInstructions(access: NoteAccess, external = false): string[] {
	const skills = external ? SKILLS_HOW_EXTERNAL : SKILLS_HOW;
	switch (access) {
		case "off":
			return ["This workspace's admins have turned your memory (notes, pins and to-dos) off. If someone asks you to remember, pin or track something, say an admin has turned memory off in Phaseo.", skills];
		case "conversation":
			return [`You have a memory for this conversation: notes, pins and to-dos. The person asking is from another organisation, so you can only see and save this conversation's notes; if they ask you to keep something for the whole workspace, save it for this conversation and say so. ${NOTES_HOW} ${NOTE_TOOLS_HOW}`, skills];
		case "workspace":
			return [`You have a memory for this Slack workspace: notes, pins and to-dos. ${NOTES_HOW} Keep it to this conversation unless they ask for the whole workspace. ${NOTE_TOOLS_HOW}`, skills];
	}
}

type NoteKind = (typeof NOTE_KINDS)[number];

type NoteRow = {
	id: string;
	kind: NoteKind;
	channel_id: string | null;
	text: string;
	done_at: string | null;
	created_by: string;
	created_at: string;
	expires_at: string | null;
};

type SkillRow = { id: string; name: string; description: string; instructions: string; created_by: string; updated_at: string };

export type TurnMemory = {
	pins: Array<{ id: string; scope: "channel" | "workspace"; text: string; created_at: string }>;
	skills: Array<{ name: string; description: string }>;
	skillsTotal: number;
};

/**
 * The pins and skill list a turn is shown: no pins while memory is off, and only
 * the conversation's for someone from another organisation (the database keeps to
 * the same rules). Null when the database can't say: the turn goes on without them.
 */
export async function loadTurnMemory(db: Db, installationId: string, channel: string, access: NoteAccess): Promise<TurnMemory | null> {
	try {
		const memory = await db.rpc<{ pins?: TurnMemory["pins"]; skills?: TurnMemory["skills"]; skills_total?: number | string } | null>(
			"load_slack_agent_turn_memory",
			{ p_installation_id: installationId, p_channel_id: channel, p_workspace_notes: access === "workspace" },
		);
		if (!memory) return null;
		const pins = access === "off" ? [] : (memory.pins ?? []).filter((pin) => pin.scope === "channel" || access === "workspace");
		return { pins, skills: memory.skills ?? [], skillsTotal: Number(memory.skills_total) || 0 };
	} catch {
		console.error("[slack-agent] memory not loaded", { installationId });
		return null;
	}
}

function oneLine(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

/** The memory part of the model's input, before the conversation. Empty without pins or skills. */
export function memoryPromptLines(memory: TurnMemory | null): string[] {
	if (!memory) return [];
	const lines: string[] = [];
	const pins = (scope: "channel" | "workspace") => memory.pins.filter((pin) => pin.scope === scope).map((pin) => `- ${oneLine(pin.text)} (id ${pin.id})`);
	const section = (heading: string, body: string[]) => {
		if (body.length) lines.push(heading, ...body, "");
	};
	section("Pinned in this conversation, newest first:", pins("channel"));
	section("Pinned for the whole Slack workspace, newest first:", pins("workspace"));
	const more = memory.skillsTotal - memory.skills.length;
	section("Saved skills (call use_skill to load one):", [
		...memory.skills.map((skill) => `- ${oneLine(skill.name)}: ${oneLine(skill.description)}`),
		...(more > 0 ? [`(and ${more} more: call list_skills to see them all)`] : []),
	]);
	return lines;
}

function text(value: unknown, field: string, max: number): string {
	if (typeof value !== "string" || !value.trim()) throw new ToolInputError(`${field} is required`);
	const trimmed = value.trim();
	// Counted as the database counts characters (code points).
	if ([...trimmed].length > max) throw new ToolInputError(`${field} must be at most ${max} characters`);
	return trimmed;
}

function noteId(value: unknown): string {
	if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new ToolInputError("id must be a note id from recall, remember or the pinned list");
	return value.toLowerCase();
}

function kind(value: unknown, fallback: NoteKind | null): NoteKind | null {
	if (value === undefined || value === null) return fallback;
	if (typeof value === "string" && (NOTE_KINDS as readonly string[]).includes(value)) return value as NoteKind;
	throw new ToolInputError(`kind must be one of ${NOTE_KINDS.join(", ")}`);
}

/** The end of a UTC date, YYYY-MM-DD, as an expiry: after today and at most two years out. */
export function expiryFrom(value: unknown, now: number): string | null {
	if (value === undefined || value === null || value === "") return null;
	const start = typeof value === "string" && DATE_PATTERN.test(value) ? Date.parse(`${value}T00:00:00Z`) : Number.NaN;
	if (Number.isNaN(start) || new Date(start).toISOString().slice(0, 10) !== value) throw new ToolInputError("expires_on must be a date like 2026-12-31");
	const end = start + DAY_MS;
	if (end <= now) throw new ToolInputError("expires_on must be today or later");
	if (end - now > MAX_EXPIRY_DAYS * DAY_MS) throw new ToolInputError("expires_on must be within two years");
	return new Date(end).toISOString();
}

function noteView(row: NoteRow) {
	return {
		id: row.id,
		kind: row.kind,
		scope: row.channel_id ? "this conversation" : "whole workspace",
		text: row.text,
		...(row.kind === "todo" ? { done: row.done_at !== null } : {}),
		saved_by: `<@${row.created_by}>`,
		saved_on: row.created_at.slice(0, 10),
		// expires_at is the end of the last UTC day it is kept.
		...(row.expires_at ? { kept_until: new Date(Date.parse(row.expires_at) - 1).toISOString().slice(0, 10) } : {}),
	};
}

export type MemoryToolContext = {
	db: Db;
	installationId: string;
	/** The conversation (channel or DM) the turn answers in. */
	channel: string;
	slackUserId: string;
	now: () => number;
	/** Short notes of what each tool did, kept as the thread's working memory. */
	notes: string[];
	/** Which notes the turn can see and save (noteAccess). Off: only the skill tools. */
	access: NoteAccess;
	/** The person is from another organisation: they can use skills but not save them. */
	external?: boolean;
};

/** The note tools the turn's access allows, then the skill tools, which every turn gets (without save_skill for someone from another organisation). */
export function memoryTools(context: MemoryToolContext): AgentTool<any, any>[] {
	return [...(context.access === "off" ? [] : noteTools(context, context.access === "workspace")), ...skillTools(context)];
}

/** workspace: the turn sees and saves the whole workspace's notes, not only the conversation's. */
function noteTools(context: MemoryToolContext, workspace: boolean): AgentTool<any, any>[] {
	const { db, installationId, channel, slackUserId, notes } = context;
	const visible = workspace ? "this conversation or the workspace" : "this conversation";
	return [
		{
			id: "remember",
			description: `Save a short note, pin or to-do in your memory, in your own words (at most ${MAX_NOTE_CHARS} characters). Pins are shown to you on every turn in their conversation; notes and to-dos are found with recall. Only when someone asks you to remember, pin or track something, or for a lasting fact the team needs.`,
			parameters: {
				type: "object",
				properties: {
					text: { type: "string", description: `The note, short and in your own words; never a copied message. At most ${MAX_NOTE_CHARS} characters.` },
					kind: { type: "string", enum: [...NOTE_KINDS], description: "note (default), pin (shown on every turn) or todo." },
					scope: workspace
						? { type: "string", enum: ["conversation", "workspace"], description: "conversation (default): only this channel or DM. workspace: everywhere in this Slack workspace, only when they ask for that." }
						: { type: "string", enum: ["conversation"], description: "conversation: only this channel or DM. The person asking is from another organisation, so notes for the whole workspace aren't available." },
					expires_on: { type: "string", description: "Optional last UTC date to keep it, YYYY-MM-DD, for something temporary." },
				},
				required: ["text"],
				additionalProperties: false,
			},
			onError: "return-to-model",
			execute: async (input: Record<string, unknown>) => {
				const body = text(input.text, "text", MAX_NOTE_CHARS);
				const noteKind = kind(input.kind, "note")!;
				const scope = input.scope ?? "conversation";
				if (scope !== "conversation" && scope !== "workspace") throw new ToolInputError("scope must be conversation or workspace");
				if (scope === "workspace" && !workspace) throw new ToolInputError("scope must be conversation: the person asking is from another organisation, so only this conversation's notes are available");
				const result = await db.rpc<{ status: string; note?: NoteRow; limit?: number }>("save_slack_agent_note", {
					p_installation_id: installationId,
					p_kind: noteKind,
					p_channel_id: scope === "workspace" ? null : channel,
					p_text: body,
					p_created_by: slackUserId,
					p_expires_at: expiryFrom(input.expires_on, context.now()),
				});
				notes.push(`remember ${noteKind} (${scope})`);
				if (result?.status === "full") return { saved: false, note: `Your memory is full (${result.limit ?? 500} notes). Ask which notes to forget, or an admin can delete some in Phaseo settings.` };
				if (result?.status === "memory_off") return { saved: false, note: "An admin has turned your memory off in Phaseo, so nothing was saved." };
				if (!result?.note) return { saved: false, note: "The Phaseo agent is no longer installed here." };
				return { saved: true, already_saved: result.status === "exists", ...noteView(result.note) };
			},
		},
		{
			id: "recall",
			description: `Search your memory: the notes, pins and to-dos for this conversation${workspace ? " and for the whole workspace" : ""}. Matches any of the words given, best matches then newest first; without words, the newest. Done to-dos only when asked for.`,
			parameters: {
				type: "object",
				properties: {
					query: { type: "string", description: "Words to look for. Leave out to list the newest." },
					kind: { type: "string", enum: [...NOTE_KINDS], description: "Only notes, pins or to-dos." },
					include_done: { type: "boolean", description: "Include to-dos that are done. Default false." },
					limit: { type: "integer", minimum: 1, maximum: 20, description: "Default 10." },
				},
				additionalProperties: false,
			},
			onError: "return-to-model",
			execute: async (input: Record<string, unknown>) => {
				const query = input.query === undefined || input.query === null ? null : text(input.query, "query", MAX_QUERY_CHARS);
				const limit = input.limit === undefined || input.limit === null ? 10 : Number(input.limit);
				if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new ToolInputError("limit must be a whole number from 1 to 20");
				if (input.include_done !== undefined && input.include_done !== null && typeof input.include_done !== "boolean") throw new ToolInputError("include_done must be true or false");
				const rows = await db.rpc<NoteRow[]>("search_slack_agent_notes", {
					p_installation_id: installationId,
					p_channel_id: channel,
					p_workspace_notes: workspace,
					p_query: query,
					p_kind: kind(input.kind, null),
					p_include_done: input.include_done === true,
					p_limit: limit,
				});
				notes.push(query ? `recall ${oneLine(query).slice(0, 60)}` : "recall");
				return { notes: (rows ?? []).map(noteView) };
			},
		},
		{
			id: "update_todo",
			description: "Mark a to-do in your memory done, or not done.",
			parameters: {
				type: "object",
				properties: {
					id: { type: "string", description: "The to-do's id, from recall or remember." },
					done: { type: "boolean", description: "true for done, false to reopen it." },
				},
				required: ["id", "done"],
				additionalProperties: false,
			},
			onError: "return-to-model",
			execute: async (input: Record<string, unknown>) => {
				const id = noteId(input.id);
				if (typeof input.done !== "boolean") throw new ToolInputError("done must be true or false");
				const rows = await db.rpc<NoteRow[]>("set_slack_agent_todo_done", { p_installation_id: installationId, p_channel_id: channel, p_workspace_notes: workspace, p_note_id: id, p_done: input.done });
				notes.push(`update_todo ${input.done ? "done" : "reopened"}`);
				const row = rows?.[0];
				return row ? { updated: true, ...noteView(row) } : { updated: false, note: `No to-do with that id in ${visible}.` };
			},
		},
		{
			id: "forget",
			description: "Delete a note, pin or to-do from your memory, when someone asks you to.",
			parameters: {
				type: "object",
				properties: { id: { type: "string", description: "The note's id, from recall, remember or the pinned list." } },
				required: ["id"],
				additionalProperties: false,
			},
			onError: "return-to-model",
			execute: async (input: Record<string, unknown>) => {
				const removed = await db.rpc<boolean>("forget_slack_agent_note", { p_installation_id: installationId, p_channel_id: channel, p_workspace_notes: workspace, p_note_id: noteId(input.id) });
				notes.push("forget");
				return removed ? { deleted: true } : { deleted: false, note: `No note with that id in ${visible}.` };
			},
		},
	];
}

function skillTools(context: MemoryToolContext): AgentTool<any, any>[] {
	const { db, installationId, slackUserId, notes } = context;
	const tools: AgentTool<any, any>[] = [
		{
			id: "save_skill",
			description: "Save a skill: named instructions for a task people repeat, which anyone can then ask you to use. Only when someone explicitly asks you to save a skill.",
			parameters: {
				type: "object",
				properties: {
					name: { type: "string", description: `A short name, at most ${MAX_SKILL_NAME_CHARS} characters, e.g. Weekly report.` },
					description: { type: "string", description: `One line on when to use it, at most ${MAX_SKILL_DESCRIPTION_CHARS} characters.` },
					instructions: { type: "string", description: `What to do, step by step, at most ${MAX_SKILL_INSTRUCTIONS_CHARS.toLocaleString("en-US")} characters.` },
					replace: { type: "boolean", description: "Overwrite the skill with this name. Only when they ask to change it." },
				},
				required: ["name", "description", "instructions"],
				additionalProperties: false,
			},
			onError: "return-to-model",
			execute: async (input: Record<string, unknown>) => {
				const name = oneLine(text(input.name, "name", MAX_SKILL_NAME_CHARS));
				const result = await db.rpc<{ status: string; skill?: { name: string; description: string }; limit?: number }>("save_slack_agent_skill", {
					p_installation_id: installationId,
					p_name: name,
					p_description: oneLine(text(input.description, "description", MAX_SKILL_DESCRIPTION_CHARS)),
					p_instructions: text(input.instructions, "instructions", MAX_SKILL_INSTRUCTIONS_CHARS),
					p_created_by: slackUserId,
					p_replace: input.replace === true,
				});
				notes.push(`save_skill ${name}`);
				switch (result?.status) {
					case "saved":
					case "replaced":
						return { saved: true, replaced: result.status === "replaced", name: result.skill?.name ?? name };
					case "name_taken":
						return { saved: false, note: `A skill called ${result.skill?.name ?? name} already exists. Ask whether to replace it or pick another name.` };
					case "full":
						return { saved: false, note: `This workspace has ${result.limit ?? 100} saved skills, the most it can keep. An admin can delete some in Phaseo settings.` };
					default:
						return { saved: false, note: "The Phaseo agent is no longer installed here." };
				}
			},
		},
		{
			id: "list_skills",
			description: "List every saved skill's name and description.",
			parameters: { type: "object", properties: {}, additionalProperties: false },
			onError: "return-to-model",
			execute: async () => {
				const rows = await db.select<Pick<SkillRow, "name" | "description">>("slack_agent_skills", {
					select: "name,description",
					installation_id: `eq.${installationId}`,
					order: "name.asc",
					limit: "100",
				});
				notes.push("list_skills");
				return { skills: rows.map((row) => ({ name: row.name, description: row.description })) };
			},
		},
		{
			id: "use_skill",
			description: "Load a saved skill's instructions, then follow them for this request.",
			parameters: {
				type: "object",
				properties: { name: { type: "string", description: "The skill's name." } },
				required: ["name"],
				additionalProperties: false,
			},
			onError: "return-to-model",
			execute: async (input: Record<string, unknown>) => {
				const name = oneLine(text(input.name, "name", MAX_SKILL_NAME_CHARS));
				const rows = await db.rpc<SkillRow[]>("get_slack_agent_skill", { p_installation_id: installationId, p_name: name });
				const skill = rows?.[0];
				notes.push(`use_skill ${skill?.name ?? name}`);
				if (!skill) return { found: false, note: "No saved skill has that name. Call list_skills to see them." };
				return { found: true, name: skill.name, description: skill.description, instructions: skill.instructions };
			},
		},
	];
	return context.external ? tools.filter((tool) => tool.id !== "save_skill") : tools;
}
