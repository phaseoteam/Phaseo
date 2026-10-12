export type PullRequestThreadsQuery = { number: number; headOid: string; baseOid: string; cursor?: string } & ({ type: "threads" } | { type: "comments"; threadId: string });
export type ReviewThread = { id: string; path: string; line?: number; originalLine?: number; side: "LEFT" | "RIGHT"; resolved: boolean; outdated: boolean; comments: number };
export type ReviewComment = { id: string; author: string; body: string; createdAt: string };
type Page = { repository: string; number: number; headOid: string; baseOid: string; total: number; nextCursor?: string };
export type PullRequestThreadsPage = Page & ({ type: "threads"; threads: ReviewThread[] } | { type: "comments"; threadId: string; comments: ReviewComment[] });
export function reviewCursor(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 2048 && Array.from(value).every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) < 127); }
export function reviewNodeId(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_+=/-]{1,200}$/.test(value); }
export function validatePullRequestThreadsQuery(value: unknown): PullRequestThreadsQuery {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid review-thread request.");
	const query = value as PullRequestThreadsQuery;
	if (!Number.isSafeInteger(query.number) || query.number < 1 || query.number > 2147483647 || [query.headOid, query.baseOid].some(value => typeof value !== "string" || !/^[a-f0-9]{40}$/i.test(value)) || (query.cursor !== undefined && !reviewCursor(query.cursor)) || !["threads", "comments"].includes(query.type) || (query.type === "comments" && !reviewNodeId(query.threadId))) throw Error("Invalid review-thread request.");
	return { number: query.number, headOid: query.headOid.toLowerCase(), baseOid: query.baseOid.toLowerCase(), cursor: query.cursor, ...(query.type === "threads" ? { type: "threads" } : { type: "comments", threadId: query.threadId }) };
}
