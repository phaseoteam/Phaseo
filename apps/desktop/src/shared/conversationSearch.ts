/** Find in chat: every message of one chat that contains `query`, whichever page it is on. */
export type ConversationFindQuery = { taskId: string; query: string };
/** In conversation order. `turnId` is the user message that opens the hit's turn, the page to load to show it. */
export type ConversationFindHit = { id: string; turnId?: string; count: number };
export type ConversationFindResult = { hits: ConversationFindHit[]; total: number; truncated: boolean };
/** The most messages a find lists; past this the count reads "1,000+". */
export const conversationFindLimit = 1000;

/** Search from the command palette: messages across every chat. */
export type MessageSearchQuery = { query: string; limit: number };
/** The chat's latest matching message, with the text around the match. */
export type MessageSearchHit = { taskId: string; title: string; projectId?: string; messageId: string; role: "user" | "assistant"; snippet: string; createdAt?: string; matches: number };

const validQuery = (value: unknown, maximum = 200) => typeof value === "string" && value.trim().length > 0 && value.length <= maximum;

export function validateConversationFindQuery(value: unknown): ConversationFindQuery {
	const input = value as Record<string, unknown> | null;
	if (!input || typeof input !== "object" || typeof input.taskId !== "string" || !input.taskId || input.taskId.length > 200 || !validQuery(input.query)) throw new Error("Invalid find request.");
	return { taskId: input.taskId, query: input.query as string };
}

export function validateMessageSearchQuery(value: unknown): MessageSearchQuery {
	const input = value as Record<string, unknown> | null;
	if (!input || typeof input !== "object" || !validQuery(input.query) || !Number.isSafeInteger(input.limit) || (input.limit as number) < 1 || (input.limit as number) > 50) throw new Error("Invalid message search.");
	return { query: input.query as string, limit: input.limit as number };
}

/**
 * Where `query` occurs in text split across nodes, case-insensitively, as [start, end] positions in the joined text,
 * each mapped to a segment and an offset in it. Matches may span segments (a word half in bold).
 */
export function segmentMatches(segments: readonly string[], query: string) {
	const needle = query.toLowerCase(), joined = segments.join("").toLowerCase(), starts: number[] = [];
	let total = 0;
	for (const segment of segments) { starts.push(total); total += segment.length; }
	const locate = (position: number, end: boolean) => {
		// An end at a segment boundary belongs to the segment before it.
		let index = starts.length - 1;
		while (index > 0 && (end ? starts[index] >= position : starts[index] > position)) index--;
		return { segment: index, offset: position - starts[index] };
	};
	const matches: { start: { segment: number; offset: number }; end: { segment: number; offset: number } }[] = [];
	if (!needle) return matches;
	for (let at = joined.indexOf(needle); at >= 0; at = joined.indexOf(needle, at + needle.length)) matches.push({ start: locate(at, false), end: locate(at + needle.length, true) });
	return matches;
}
