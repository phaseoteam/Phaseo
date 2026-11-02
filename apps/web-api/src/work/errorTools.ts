// Error tracking beyond grouping: people affected (hashed), rules that ignore or assign errors,
// source maps per release, and releases.

import type { DataClient } from "./items";
import { mapFrames, r2MapLoader, sourcemapFileName, type MapLoader, type MappedFrame } from "./sourcemap";
import { normaliseFrames, type StackFrame } from "./stack";

// ---------------------------------------------------------------------------------------------
// People affected
// ---------------------------------------------------------------------------------------------

const MAX_USER_CHARS = 200;

/** The app's user id or email as given, trimmed, or null. Never stored: only its hash is. */
export function cleanUserId(value: unknown): string | null {
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed && trimmed.length <= MAX_USER_CHARS ? trimmed : null;
}

/** 32 hex characters of SHA-256 over the project id and the user id, so ids can't be matched across projects. */
export async function hashErrorUser(projectId: string, userId: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${projectId}:${userId.toLowerCase()}`));
	return Array.from(new Uint8Array(digest).slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------------

export const ERROR_RULE_ACTIONS = ["ignore", "assign"] as const;
export const ERROR_RULE_FIELDS = ["message", "type", "file", "environment"] as const;
export type ErrorRuleAction = (typeof ERROR_RULE_ACTIONS)[number];
export type ErrorRuleField = (typeof ERROR_RULE_FIELDS)[number];
export const MAX_RULES_PER_PROJECT = 50;

export type ErrorRuleRow = {
	id: string;
	workspace_id: string;
	project_id: string;
	action: ErrorRuleAction;
	field: ErrorRuleField;
	pattern: string;
	assignee_user_id: string | null;
	enabled: boolean;
	created_by: string | null;
	created_at: string;
};

export type ErrorRule = { id: string; action: ErrorRuleAction; field: ErrorRuleField; pattern: string; assigneeUserId: string | null; enabled: boolean; createdAt: string };

export const ERROR_RULE_COLUMNS = "id,workspace_id,project_id,action,field,pattern,assignee_user_id,enabled,created_by,created_at";

export function formatErrorRule(row: ErrorRuleRow): ErrorRule {
	return { id: row.id, action: row.action, field: row.field, pattern: row.pattern, assigneeUserId: row.assignee_user_id, enabled: row.enabled, createdAt: row.created_at };
}

export type RuleInput = { action: ErrorRuleAction; field: ErrorRuleField; pattern: string; assigneeUserId: string | null };

export function parseRuleInput(body: Record<string, unknown>): { ok: true; value: RuleInput } | { ok: false; message: string } {
	if (!ERROR_RULE_ACTIONS.includes(body.action as ErrorRuleAction)) return { ok: false, message: "action must be ignore or assign" };
	if (!ERROR_RULE_FIELDS.includes(body.field as ErrorRuleField)) return { ok: false, message: "field must be message, type, file or environment" };
	const pattern = typeof body.pattern === "string" ? body.pattern.trim() : "";
	if (!pattern || pattern.length > 200) return { ok: false, message: "pattern must be 1 to 200 characters" };
	const action = body.action as ErrorRuleAction;
	const assignee = typeof body.assigneeUserId === "string" && /^[0-9a-f-]{36}$/i.test(body.assigneeUserId) ? body.assigneeUserId.toLowerCase() : null;
	if (action === "assign" && !assignee) return { ok: false, message: "An assign rule needs assigneeUserId" };
	return { ok: true, value: { action, field: body.field as ErrorRuleField, pattern, assigneeUserId: action === "assign" ? assignee : null } };
}

export type RuleSubject = { type: string; message: string; environment?: string; frames: StackFrame[] };

/** Case-insensitive "contains". For file, any frame's file matches. */
export function ruleMatches(rule: Pick<ErrorRuleRow, "field" | "pattern" | "enabled">, event: RuleSubject): boolean {
	if (!rule.enabled) return false;
	const needle = rule.pattern.toLowerCase();
	const has = (value: string | undefined) => Boolean(value && value.toLowerCase().includes(needle));
	if (rule.field === "message") return has(event.message);
	if (rule.field === "type") return has(event.type);
	if (rule.field === "environment") return has(event.environment);
	return event.frames.some((frame) => has(frame.file));
}

/** What the rules say about an event: drop it, and who a new item for it goes to. The first matching assign rule wins. */
export function applyRules(rules: Array<Pick<ErrorRuleRow, "action" | "field" | "pattern" | "enabled" | "assignee_user_id">>, event: RuleSubject): { ignore: boolean; assigneeUserId: string | null } {
	let assigneeUserId: string | null = null;
	for (const rule of rules) {
		if (!ruleMatches(rule, event)) continue;
		if (rule.action === "ignore") return { ignore: true, assigneeUserId: null };
		if (rule.action === "assign" && !assigneeUserId) assigneeUserId = rule.assignee_user_id;
	}
	return { ignore: false, assigneeUserId };
}

/** The project's enabled rules (empty when the read fails, so a rules outage never drops events). */
export async function loadErrorRules(client: DataClient, projectId: string): Promise<ErrorRuleRow[]> {
	try {
		const { data, error } = await client.from("work_error_rules").select(ERROR_RULE_COLUMNS)
			.eq("project_id", projectId).eq("enabled", true).order("created_at", { ascending: true }).limit(MAX_RULES_PER_PROJECT);
		if (error) return [];
		return (data ?? []) as ErrorRuleRow[];
	} catch {
		return [];
	}
}

// ---------------------------------------------------------------------------------------------
// Source maps
// ---------------------------------------------------------------------------------------------

export type SourcemapRow = { id: string; workspace_id: string; project_id: string; release: string; file: string; object_key: string; size_bytes: number; created_at: string };
export type Sourcemap = { id: string; release: string; file: string; sizeBytes: number; createdAt: string };
export const SOURCEMAP_COLUMNS = "id,workspace_id,project_id,release,file,object_key,size_bytes,created_at";

export function formatSourcemap(row: SourcemapRow): Sourcemap {
	return { id: row.id, release: row.release, file: row.file, sizeBytes: Number(row.size_bytes) || 0, createdAt: row.created_at };
}

/** Validates the upload's release and file: release 1–200 characters, file a plain name ending in .js/.mjs/.cjs. */
export function parseSourcemapTarget(release: unknown, file: unknown): { ok: true; release: string; file: string } | { ok: false; message: string } {
	const cleanRelease = typeof release === "string" ? release.trim() : "";
	if (!cleanRelease || cleanRelease.length > 200) return { ok: false, message: "release must be 1 to 200 characters" };
	const name = typeof file === "string" ? sourcemapFileName(file.trim()) : null;
	if (!name || !/\.(m|c)?js$/i.test(name)) return { ok: false, message: "file must be the minified file's name, such as app.3f9a.js" };
	return { ok: true, release: cleanRelease, file: name };
}

/** The R2 key: per project and release, hashed so nothing in it comes from the uploader. */
export async function sourcemapObjectKey(projectId: string, release: string, file: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${release}\n${file}`));
	const hex = Array.from(new Uint8Array(digest).slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
	return `work-sourcemaps/${projectId}/${hex}.map`;
}

/** The project's maps for a release: file name → object key. */
export async function releaseMaps(client: DataClient, projectId: string, release: string | null): Promise<Map<string, string>> {
	if (!release) return new Map();
	const { data, error } = await client.from("work_error_sourcemaps").select("file,object_key").eq("project_id", projectId).eq("release", release).limit(500);
	if (error) return new Map();
	return new Map(((data ?? []) as Array<{ file: string; object_key: string }>).map((row) => [row.file, row.object_key]));
}

/** The group's last event frames with original positions where its release has maps. */
export async function mapGroupFrames(args: { client: DataClient; bucket: Pick<R2Bucket, "get"> | undefined; projectId: string; release: string | null; lastEvent: Record<string, unknown>; load?: MapLoader }): Promise<MappedFrame[] | null> {
	const frames = normaliseFrames(args.lastEvent?.frames);
	if (!frames.length) return null;
	const maps = await releaseMaps(args.client, args.projectId, args.release);
	if (!maps.size) return null;
	const mapped = await mapFrames(frames, maps, args.load ?? r2MapLoader(args.bucket));
	return mapped.some((frame) => frame.original) ? mapped : null;
}

// ---------------------------------------------------------------------------------------------
// Releases
// ---------------------------------------------------------------------------------------------

export type ErrorRelease = { version: string; firstSeenAt: string; lastSeenAt: string; eventCount: number; newGroups: number };

export function formatErrorRelease(row: { version: string; first_seen_at: string; last_seen_at: string; event_count: number | string; new_groups: number }): ErrorRelease {
	return { version: row.version, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at, eventCount: Number(row.event_count) || 0, newGroups: row.new_groups };
}
