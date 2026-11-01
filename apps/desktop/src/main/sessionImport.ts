import { open } from "node:fs/promises";
import { transcriptFiles, type TranscriptFolder } from "./usageTranscripts";
import type { NativeSession } from "../shared/sessionImport";

export const IMPORT_DAYS = 30, MAX_IMPORTED_MESSAGES = 200, MAX_SESSIONS = 200;
const SUMMARY_BYTES = 1024 * 1024, SESSION_BYTES = 32 * 1024 * 1024;

export type ParsedSession = { sessionId: string; cwd?: string; title: string; model?: string; createdAt: string; messages: { role: "user" | "assistant"; text: string; createdAt: string }[] };
type Line = Record<string, unknown>;
const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Line : undefined;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

/** Text blocks of a message's content (Claude's text, Codex's input_text and output_text); tool calls and results are left out. */
export function contentText(content: unknown): string {
	if (typeof content === "string") return content.trim();
	if (!Array.isArray(content)) return "";
	return content.flatMap(block => { const item = record(block); return item && ["text", "input_text", "output_text"].includes(item.type as string) && typeof item.text === "string" ? [item.text] : []; }).join("\n").trim();
}

// Codex sends setup context as user text ahead of the request; it is left out of titles and of the fallback messages.
const codexPreamble = /^(?:\s*(?:<(recommended_plugins|environment_context|user_instructions|INSTRUCTIONS|in-app-browser-context)(?:\s[^>]*)?>[\s\S]*?<\/\1>|# AGENTS\.md instructions\b[^\n]*|## My request for Codex:))+/;

/**
 * A Claude Code or Codex transcript as a conversation: the person's messages and the agent's replies, newest 200 kept
 * (and the first request, which names it). Side chains, meta records and tool traffic are left out. Undefined when the
 * file has no session id or no request.
 */
export function parseSession(harness: "claude" | "codex", contents: string, fallback: string): ParsedSession | undefined {
	let sessionId = "", cwd: string | undefined, model: string | undefined, title: string | undefined, customTitle: string | undefined;
	const messages: ParsedSession["messages"] = [], fallbackUsers: ParsedSession["messages"] = [];
	let first: ParsedSession["messages"][number] | undefined;
	const keep = (message: ParsedSession["messages"][number]) => { first ??= message.role === "user" ? message : undefined; messages.push(message); if (messages.length > MAX_IMPORTED_MESSAGES) messages.shift(); };
	for (const raw of contents.split(/\r?\n/)) {
		if (!raw.trim()) continue;
		let line: Line | undefined;
		try { line = record(JSON.parse(raw)); } catch { continue; }
		if (!line) continue;
		const at = text(line.timestamp) || fallback;
		if (harness === "claude") {
			if (line.isSidechain === true || line.isMeta === true || line.isCompactSummary === true) continue;
			sessionId ||= text(line.sessionId); cwd ||= text(line.cwd) || undefined;
			if (typeof line.customTitle === "string") customTitle = line.customTitle.trim() || undefined;
			title = text(line.aiTitle) || title;
			if (line.type !== "user" && line.type !== "assistant") continue;
			const message = record(line.message), body = contentText(message?.content);
			const used = text(message?.model);
			if (used && used !== "<synthetic>") model = used;
			if (body) keep({ role: line.type, text: body, createdAt: at });
			continue;
		}
		const payload = record(line.payload);
		if (line.type === "session_meta") { sessionId ||= text(payload?.id) || text(payload?.session_id); cwd ||= text(payload?.cwd) || undefined; continue; }
		if (line.type === "turn_context") { model = text(payload?.model) || model; cwd ||= text(payload?.cwd) || undefined; continue; }
		// The event copy of a request is the person's own text; the response copy carries Codex's setup context.
		if (line.type === "event_msg" && payload?.type === "user_message") { const body = text(payload.message); if (body) keep({ role: "user", text: body, createdAt: at }); continue; }
		if (line.type === "response_item" && payload?.type === "message") {
			const body = contentText(payload.content);
			if (payload.role === "assistant" && body) keep({ role: "assistant", text: body, createdAt: at });
			else if (payload.role === "user") { const request = body.replace(codexPreamble, "").trim(); if (request) fallbackUsers.push({ role: "user", text: request, createdAt: at }); }
		}
	}
	// Older Codex versions wrote no user_message events; their requests are the response copies without the setup context.
	if (harness === "codex" && !messages.some(message => message.role === "user") && fallbackUsers.length) {
		const merged = [...messages, ...fallbackUsers].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
		messages.length = 0; first = undefined;
		for (const message of merged) keep(message);
	}
	first ??= messages.find(message => message.role === "user");
	if (!sessionId || !first) return undefined;
	const kept = messages.includes(first) ? messages : [first, ...messages.slice(-(MAX_IMPORTED_MESSAGES - 1))];
	const derived = (harness === "codex" ? first.text.replace(codexPreamble, "") : first.text).trim().split("\n")[0].slice(0, 100).trim();
	return { sessionId, ...cwd ? { cwd } : {}, title: customTitle ?? title ?? (derived || "Imported conversation"), ...model ? { model } : {}, createdAt: kept[0]?.createdAt ?? fallback, messages: kept };
}

/** Up to `limit` bytes from the start of a file; a summary needs the session id, folder and first request only. */
async function head(file: string, limit: number) {
	const handle = await open(file, "r");
	try { const buffer = Buffer.alloc(limit); const { bytesRead } = await handle.read(buffer, 0, limit, 0); return buffer.subarray(0, bytesRead).toString("utf8"); }
	finally { await handle.close(); }
}

export type SessionFolder = TranscriptFolder & { accountId?: string };

/**
 * Conversations Claude Code and Codex ran on this computer in the last 30 days, newest first. Codex's compressed
 * sessions (.jsonl.zst) are left out. `owned` holds `harness:sessionId` keys a chat already has.
 */
export async function listNativeSessions(folders: readonly SessionFolder[], owned: ReadonlySet<string>, now = Date.now()): Promise<(NativeSession & { path: string })[]> {
	const files = (await Promise.all(folders.map(async folder => (await transcriptFiles(folder, IMPORT_DAYS, now)).filter(file => file.path.endsWith(".jsonl")).map(file => ({ ...file, folder })))))
		.flat().sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, MAX_SESSIONS * 2);
	const sessions: (NativeSession & { path: string })[] = [], seen = new Set<string>();
	for (const file of files) {
		if (sessions.length >= MAX_SESSIONS) break;
		const updatedAt = new Date(file.mtimeMs).toISOString();
		const parsed = parseSession(file.folder.harness, await head(file.path, SUMMARY_BYTES).catch(() => ""), updatedAt);
		const key = parsed ? `${file.folder.harness}:${parsed.sessionId}` : "";
		if (!parsed || seen.has(key)) continue;
		seen.add(key);
		sessions.push({ harness: file.folder.harness, sessionId: parsed.sessionId, title: parsed.title, updatedAt, path: file.path, imported: owned.has(key), ...parsed.cwd ? { cwd: parsed.cwd } : {}, ...file.folder.accountId ? { accountId: file.folder.accountId } : {} });
	}
	return sessions;
}

/** The whole transcript, up to 32 MB, for importing. */
export async function readNativeSession(file: string, harness: "claude" | "codex", updatedAt: string) {
	const parsed = parseSession(harness, await head(file, SESSION_BYTES), updatedAt);
	if (!parsed) throw new Error("This conversation has no messages to import.");
	return parsed;
}
