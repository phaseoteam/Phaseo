import type { AgentActivity, Message } from "./workspace";

// A single larger entry remains readable; all surrounding entries stay paged.
export const conversationPageBytes = 2 * 1024 * 1024;
export function conversationWindow<T extends Message | AgentActivity>(entries: T[], direction: "start" | "end"): T[] {
	const encoder = new TextEncoder(); let bytes = 2, count = 0;
	for (let index = direction === "start" ? 0 : entries.length - 1; index >= 0 && index < entries.length && count < 100; index += direction === "start" ? 1 : -1) {
		const size = encoder.encode(JSON.stringify(entries[index])).byteLength + (count ? 1 : 0);
		if (count && bytes + size > conversationPageBytes) break;
		bytes += size; count++;
	}
	return direction === "start" ? entries.slice(0, count) : entries.slice(entries.length - count);
}

export type ConversationPageQuery = { taskId: string; kind: "messages" | "activities"; limit: number; beforeId?: string; afterId?: string; fromId?: string };
export type ConversationPage = { kind: "messages" | "activities"; entries: (Message | AgentActivity)[]; earlier: number; later: number; revision: number };

export function validateConversationPageQuery(value: unknown): ConversationPageQuery {
	if (!value || typeof value !== "object") throw new Error("Invalid conversation page request.");
	const input = value as Record<string, unknown>;
	const validId = (id: unknown) => typeof id === "string" && id.length > 0 && id.length <= 200;
	const cursors = [input.beforeId, input.afterId, input.fromId].filter(id => id !== undefined);
	if (!validId(input.taskId) || (input.kind !== "messages" && input.kind !== "activities") || !Number.isSafeInteger(input.limit) || (input.limit as number) < 1 || (input.limit as number) > 100 || cursors.some(id => !validId(id)) || cursors.length > 1) throw new Error("Invalid conversation page request.");
	return { taskId: input.taskId as string, kind: input.kind, limit: input.limit as number, beforeId: input.beforeId as string | undefined, afterId: input.afterId as string | undefined, fromId: input.fromId as string | undefined };
}

/**
 * One page of a chat's messages or activities: the latest `limit` entries, or those beside a cursor, trimmed to
 * conversationPageBytes from the cursor side (an entry larger than that still comes alone).
 */
export function conversationPageOf(entries: readonly (Message | AgentActivity)[], query: ConversationPageQuery, revision: number): ConversationPage {
	const total = entries.length, cursor = query.beforeId ?? query.afterId ?? query.fromId;
	const anchor = cursor === undefined ? -1 : entries.findIndex(entry => entry.id === cursor);
	if (cursor !== undefined && anchor < 0) throw new Error("Conversation position no longer exists. Reload the latest history.");
	const end = query.beforeId ? anchor : query.afterId ? Math.min(total, anchor + 1 + query.limit) : query.fromId ? Math.min(total, anchor + query.limit) : total;
	const start = query.afterId ? anchor + 1 : query.fromId ? anchor : Math.max(0, end - query.limit);
	// Keep the cursor-adjacent contiguous window, including one oversized entry.
	const forward = Boolean(query.afterId || query.fromId), encoder = new TextEncoder();
	let kept = 0, bytes = 0;
	for (let index = forward ? start : end - 1; forward ? index < end : index >= start; index += forward ? 1 : -1) {
		bytes += encoder.encode(JSON.stringify(entries[index])).byteLength + 1;
		if (kept && bytes > conversationPageBytes - 1) break;
		kept++;
	}
	const from = forward ? start : end - kept, to = forward ? start + kept : end;
	return { kind: query.kind, entries: entries.slice(from, to), earlier: kept ? from : start, later: total - (kept ? to : end), revision };
}
