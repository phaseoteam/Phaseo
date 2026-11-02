// Error ingest (POST /api/_web/work/errors/:key). Each event is cleaned, its stack normalised,
// fingerprinted and counted with record_work_error_event. A group that is new, or that comes back
// after it was resolved, gets a work item (source "error") when the project has auto-triage on:
// a new item for a new group, or the group's existing item reopened with an error event. The
// triage agent then sorts it in the background. When the RPC reports a spike, spikes.ts writes the
// spike event and notifications (or creates the group's item, priority 2, when it has none).

import type { Env } from "@/env";
import { culpritFor, fingerprintError } from "./fingerprint";
import { addWorkItemEvent, createWorkItem, isClosedState, loadWorkItemById, updateWorkItem, type DataClient } from "./items";
import { handleErrorSpike, SPIKE_ITEM_PRIORITY } from "./spikes";
import { normaliseFrames, parseStack, type StackFrame } from "./stack";
import { triageWorkItem } from "./triage";
import type { ErrorProjectRow, RecordErrorEventResult } from "./types";

export const MAX_ERROR_BYTES = 256 * 1024;
export const MAX_EVENTS_PER_REQUEST = 20;
const MAX_TYPE_CHARS = 200;
const MAX_MESSAGE_CHARS = 2_000;
const MAX_STACK_CHARS = 16_000;
const MAX_TAGS = 20;
const MAX_TAG_CHARS = 200;
const MAX_EXTRA_JSON_CHARS = 8_000;
const MAX_PAST_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 60 * 60 * 1000;

/** The error event the browser script, the docs and server callers send. */
export type ErrorEvent = {
	type: string;
	message: string;
	stack?: string;
	frames?: StackFrame[];
	release?: string;
	environment?: string;
	url?: string;
	userAgent?: string;
	timestamp?: string;
	tags?: Record<string, string>;
	extra?: Record<string, unknown>;
};

/** An event after cleaning: frames always present, timestamp always set. */
export type CleanErrorEvent = ErrorEvent & { frames: StackFrame[]; timestamp: string };

function text(value: unknown, max: number): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed ? trimmed.slice(0, max) : undefined;
}

function cleanTimestamp(value: unknown, now: number): string {
	if (typeof value === "string") {
		const time = Date.parse(value);
		if (Number.isFinite(time) && time >= now - MAX_PAST_MS && time <= now + MAX_FUTURE_MS) return new Date(time).toISOString();
	}
	return new Date(now).toISOString();
}

function cleanTags(value: unknown): Record<string, string> | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const tags: Record<string, string> = {};
	for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, MAX_TAGS)) {
		if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
			tags[key.slice(0, 100)] = String(entry).slice(0, MAX_TAG_CHARS);
		}
	}
	return Object.keys(tags).length ? tags : undefined;
}

function cleanExtra(value: unknown): Record<string, unknown> | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	try {
		const json = JSON.stringify(value);
		return json.length <= MAX_EXTRA_JSON_CHARS ? (JSON.parse(json) as Record<string, unknown>) : { truncated: true };
	} catch {
		return undefined;
	}
}

/** The page URL without its query string or hash, which often carry tokens. */
function cleanUrl(value: unknown): string | undefined {
	const url = text(value, 2_000);
	return url ? url.replace(/[?#].*$/, "") : undefined;
}

/** Cleans one untrusted event. Returns null when it isn't an object. */
export function cleanErrorEvent(value: unknown, now = Date.now()): CleanErrorEvent | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const raw = value as Record<string, unknown>;
	const stack = text(raw.stack, MAX_STACK_CHARS);
	let frames = normaliseFrames(raw.frames);
	if (!frames.length && stack) frames = parseStack(stack);
	const message = text(raw.message, MAX_MESSAGE_CHARS) ?? "";
	const type = text(raw.type, MAX_TYPE_CHARS) ?? "Error";
	if (!message && !frames.length && !stack) return null;
	const event: CleanErrorEvent = { type, message, frames, timestamp: cleanTimestamp(raw.timestamp, now) };
	if (stack) event.stack = stack;
	const release = text(raw.release, 200);
	if (release) event.release = release;
	const environment = text(raw.environment, 100);
	if (environment) event.environment = environment;
	const url = cleanUrl(raw.url);
	if (url) event.url = url;
	const userAgent = text(raw.userAgent, 500);
	if (userAgent) event.userAgent = userAgent;
	const tags = cleanTags(raw.tags);
	if (tags) event.tags = tags;
	const extra = cleanExtra(raw.extra);
	if (extra) event.extra = extra;
	return event;
}

/** Reads `ErrorEvent` or `{ events: ErrorEvent[] }` (at most 20). Null when nothing usable. */
export function parseErrorPayload(value: unknown, now = Date.now()): CleanErrorEvent[] | null {
	if (!value || typeof value !== "object") return null;
	const list = Array.isArray((value as { events?: unknown }).events)
		? ((value as { events: unknown[] }).events)
		: Array.isArray(value) ? null : [value];
	if (!list || list.length === 0 || list.length > MAX_EVENTS_PER_REQUEST) return null;
	const events = list.map((entry) => cleanErrorEvent(entry, now)).filter((entry): entry is CleanErrorEvent => entry !== null);
	return events.length ? events : null;
}

type ErrorProject = Pick<ErrorProjectRow, "id" | "workspace_id" | "name" | "enabled" | "auto_triage" | "github_repo">;

/** The enabled error project for a key hash, or null. */
export async function loadErrorProject(client: DataClient, keyHash: string): Promise<ErrorProject | null> {
	const { data, error } = await client.from("work_error_projects")
		.select("id,workspace_id,name,enabled,auto_triage,github_repo")
		.eq("key_hash", keyHash)
		.maybeSingle();
	if (error) throw new Error(`work_error_projects read failed: ${error.message}`);
	const project = data as ErrorProject | null;
	return project?.enabled ? project : null;
}

/** The work item text for a new error group. The sample's details stay on the group. */
export function errorItemText(event: CleanErrorEvent, culprit: string | null): { title: string; description: string } {
	const firstLine = event.message.split("\n")[0].trim();
	const title = (firstLine ? `${event.type}: ${firstLine}` : event.type).slice(0, 300);
	const lines = [
		`An error reported by the app: **${event.type}**.`,
		"",
		"```text",
		event.message.slice(0, 2_000).replace(/```/g, "'''"),
		"```",
	];
	if (culprit) lines.push("", `Where: \`${culprit.replace(/`/g, "'")}\``);
	if (event.release) lines.push(`Release: \`${event.release.replace(/`/g, "'")}\``);
	if (event.environment) lines.push(`Environment: \`${event.environment.replace(/`/g, "'")}\``);
	return { title, description: lines.join("\n") };
}

function triageInBackground(env: Env, client: DataClient, workspaceId: string, itemId: string, waitUntil: (promise: Promise<unknown>) => void) {
	waitUntil(
		triageWorkItem({ env, client, workspaceId, itemId, requestedBy: null, waitUntil })
			.then((result) => {
				if (!result.ok) console.warn("[work] error triage skipped", { itemId, code: result.code });
			})
			.catch((error) => console.error("[work] error triage failed", { itemId, message: String(error) })),
	);
}

/** Creates or reopens the work item for a group that is new or came back. Returns the item id. */
async function openItemForGroup(args: {
	env: Env;
	client: DataClient;
	project: ErrorProject;
	result: RecordErrorEventResult;
	event: CleanErrorEvent;
	culprit: string | null;
	waitUntil: (promise: Promise<unknown>) => void;
	priority?: number;
}): Promise<string> {
	const { env, client, project, result, event, culprit, waitUntil } = args;
	const workspaceId = result.workspace_id;
	if (result.work_item_id) {
		const item = await loadWorkItemById(client, workspaceId, result.work_item_id);
		if (item) {
			const reopened = isClosedState(item.state)
				? await updateWorkItem(client, item, { state: "triage" }, { kind: "system" })
				: item;
			await addWorkItemEvent(client, {
				workspaceId,
				workItemId: item.id,
				kind: "error",
				authorKind: "system",
				body: result.reopened ? "The error came back after it was resolved." : "The error was seen again.",
				data: { groupId: result.group_id, eventCount: result.event_count, release: event.release ?? null },
			});
			if (reopened.state === "triage") triageInBackground(env, client, workspaceId, item.id, waitUntil);
			return item.id;
		}
	}
	const text = errorItemText(event, culprit);
	const item = await createWorkItem(client, {
		workspaceId,
		title: text.title,
		description: text.description,
		state: "triage",
		...(args.priority ? { priority: args.priority } : {}),
		source: "error",
		authorKind: "system",
		errorGroupId: result.group_id,
		githubRepo: result.github_repo ?? project.github_repo ?? null,
	});
	// Only claim the group if no other request has given it an item in the meantime.
	const { error } = await client.from("work_error_groups")
		.update({ work_item_id: item.id })
		.eq("id", result.group_id)
		.is("work_item_id", null);
	if (error) console.error("[work] error group link failed", { groupId: result.group_id, message: error.message });
	triageInBackground(env, client, workspaceId, item.id, waitUntil);
	return item.id;
}

/** Records the events and returns the ids of the groups they went to. */
export async function ingestErrorEvents(args: {
	env: Env;
	client: DataClient;
	project: ErrorProject;
	events: CleanErrorEvent[];
	waitUntil: (promise: Promise<unknown>) => void;
}): Promise<string[]> {
	const { env, client, project, events, waitUntil } = args;
	const groups: string[] = [];
	for (const event of events) {
		const fingerprint = await fingerprintError(event);
		const culprit = culpritFor(event.frames);
		const { data, error } = await client.rpc("record_work_error_event", {
			p_project_id: project.id,
			p_fingerprint: fingerprint,
			p_exception_type: event.type,
			p_message: event.message,
			p_culprit: culprit,
			p_release: event.release ?? null,
			p_environment: event.environment ?? null,
			p_event: event,
			p_seen_at: event.timestamp,
		});
		if (error) throw new Error(`record_work_error_event failed: ${error.message}`);
		const result = data as RecordErrorEventResult | null;
		if (!result?.group_id) continue; // project disabled meanwhile
		if (!groups.includes(result.group_id)) groups.push(result.group_id);
		let itemId = result.work_item_id;
		if ((result.is_new || result.reopened) && result.auto_triage && result.status !== "ignored") {
			try {
				itemId = await openItemForGroup({ env, client, project, result, event, culprit, waitUntil });
			} catch (itemError) {
				console.error("[work] error item failed", { groupId: result.group_id, message: String(itemError) });
			}
		}
		if (result.spiking === true && result.status !== "ignored") {
			const firstLine = event.message.split("\n")[0].trim();
			await handleErrorSpike({
				client,
				result: { ...result, work_item_id: itemId },
				errorLabel: (firstLine ? `${event.type}: ${firstLine}` : event.type).slice(0, 300),
				createItem: () => openItemForGroup({ env, client, project, result: { ...result, work_item_id: null }, event, culprit, waitUntil, priority: SPIKE_ITEM_PRIORITY }),
			});
		}
	}
	return groups;
}
