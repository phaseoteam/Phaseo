import { slackErrorKey, type SlackErrorKey } from "./slackAgentForm";

// What the Slack agent remembers, as Settings → Slack shows it: notes, pins and
// to-dos, and saved skills. Limits match the database's.

export type SlackMemoryKind = "note" | "pin" | "todo";
export type SlackMemoryFilter = "all" | SlackMemoryKind;

export const SLACK_MEMORY_FILTERS: readonly SlackMemoryFilter[] = ["all", "note", "pin", "todo"];
export const MAX_SKILL_NAME_CHARS = 60;
export const MAX_SKILL_DESCRIPTION_CHARS = 200;
export const MAX_SKILL_INSTRUCTIONS_CHARS = 4_000;

export type SlackAgentNote = {
	id: string;
	kind: SlackMemoryKind;
	/** Null: the whole Slack workspace. */
	channel_id: string | null;
	text: string;
	done_at: string | null;
	created_by: string;
	created_at: string;
	updated_at: string;
	expires_at: string | null;
};

export type SlackAgentSkill = {
	id: string;
	name: string;
	description: string;
	instructions: string;
	created_by: string;
	created_at: string;
	updated_at: string;
};

export type SlackAgentMemory = {
	notes: SlackAgentNote[];
	/** Notes of the kind shown. */
	notes_total: number;
	/** Notes of every kind, against notes_limit. */
	notes_used: number;
	notes_limit: number;
	skills: SlackAgentSkill[];
	skills_limit: number;
};

/** Where a note applies: the whole workspace, a channel, or a direct message. */
export function noteScope(channelId: string | null): "workspace" | "channel" | "directMessage" {
	if (!channelId) return "workspace";
	return channelId.startsWith("D") ? "directMessage" : "channel";
}

export type SlackSkillDraft = { name: string; description: string; instructions: string };
export type SlackSkillProblem = { field: keyof SlackSkillDraft; code: "required" | "tooLong"; max?: number };

const SKILL_LIMITS: Record<keyof SlackSkillDraft, number> = {
	name: MAX_SKILL_NAME_CHARS,
	description: MAX_SKILL_DESCRIPTION_CHARS,
	instructions: MAX_SKILL_INSTRUCTIONS_CHARS,
};

export function skillDraftFrom(skill: SlackAgentSkill): SlackSkillDraft {
	return { name: skill.name, description: skill.description, instructions: skill.instructions };
}

/** The fields that changed, as web-api will store them: names and descriptions on one line, everything trimmed. */
export function skillPatch(draft: SlackSkillDraft, saved: SlackSkillDraft): { ok: true; value: Partial<SlackSkillDraft> } | { ok: false; problem: SlackSkillProblem } {
	const value: Partial<SlackSkillDraft> = {};
	for (const field of ["name", "description", "instructions"] as const) {
		const text = field === "instructions" ? draft[field].trim() : draft[field].replace(/\s+/g, " ").trim();
		if (!text) return { ok: false, problem: { field, code: "required" } };
		if ([...text].length > SKILL_LIMITS[field]) return { ok: false, problem: { field, code: "tooLong", max: SKILL_LIMITS[field] } };
		if (text !== saved[field]) value[field] = text;
	}
	return { ok: true, value };
}

/** SettingsUI.slack.memory.errors keys, for the memory routes' own codes. */
export type SlackMemoryErrorKey = "memoryNotFound" | "skillNameTaken";

export type SlackMemoryError =
	| { scope: "memory"; key: SlackMemoryErrorKey }
	| { scope: "slack"; key: SlackErrorKey; message?: string | null };

const MEMORY_ERROR_KEYS: Record<string, SlackMemoryErrorKey> = {
	memory_not_found: "memoryNotFound",
	skill_name_taken: "skillNameTaken",
};

export function slackMemoryError(code: string | null | undefined, status: number | null | undefined, message?: string | null): SlackMemoryError {
	if (code && Object.hasOwn(MEMORY_ERROR_KEYS, code)) return { scope: "memory", key: MEMORY_ERROR_KEYS[code] };
	return { scope: "slack", key: slackErrorKey(code, status), message };
}
