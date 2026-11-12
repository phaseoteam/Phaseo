import type { CodeHostRemote } from "../../shared/codeHosts";
import type { BranchPullRequest, ProjectPullRequests, PullRequest } from "../../shared/pullRequests";
import type { PullRequestAction, PullRequestActor, PullRequestCheck, PullRequestComment, PullRequestCommit, PullRequestMergeMethod, PullRequestView } from "../../shared/pullRequestView";
import { CodeHostError } from "./transport";

export type BranchRequest = NonNullable<BranchPullRequest["pullRequest"]>;
export type NewRequest = { head: string; base: string; title: string; body: string };
/**
 * One code host's pull or merge requests in the shapes the GitHub path already uses, so every pane draws them the same.
 * `actions` lists the writes it can make; anything else is refused with a plain message rather than half-done.
 */
export type CodeHostProvider = {
	remote: CodeHostRemote;
	actions: readonly PullRequestAction["type"][];
	list: (cursor?: string) => Promise<ProjectPullRequests>;
	view: (number: number) => Promise<PullRequestView>;
	act: (view: PullRequestView, action: PullRequestAction) => Promise<void>;
	forBranch: (branch: string) => Promise<BranchRequest | null>;
	create: (input: NewRequest) => Promise<{ number: number; url: string }>;
};

export type Item = Record<string, unknown>;
export const item = (value: unknown): Item => value && typeof value === "object" && !Array.isArray(value) ? value as Item : {};
export const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export const text = (value: unknown, limit = 2000) => typeof value === "string" && value.length <= limit ? value : undefined;
export const date = (value: unknown) => typeof value === "string" && value.length <= 100 && Number.isFinite(Date.parse(value)) ? value : undefined;
export const count = (value: unknown) => { const number = typeof value === "string" ? Number.parseInt(value, 10) : value; return Number.isSafeInteger(number) && Number(number) >= 0 ? Number(number) : 0; };
export const sha = (value: unknown) => typeof value === "string" && /^[a-f0-9]{40}$/i.test(value) ? value.toLowerCase() : undefined;
export const avatar = (value: unknown) => { const url = text(value); return url?.startsWith("https://") ? url : undefined; };
export const actor = (login: unknown, avatarUrl?: unknown, bot = false): PullRequestActor | null => { const name = text(login, 256); if (!name) return null; const image = avatar(avatarUrl); return { login: name, ...(image ? { avatarUrl: image } : {}), ...(bot ? { bot } : {}) }; };
export const enc = encodeURIComponent;
export const invalid = (host: string, what: string) => new CodeHostError(`${host} returned ${what} that could not be read.`);

/** The rollup a list row shows, from every check: one failure fails it, one still running keeps it pending. */
export function rollup(checks: readonly PullRequestCheck[]): PullRequest["checks"] {
	if (!checks.length) return "none";
	if (checks.some(check => check.status === "failure" || check.status === "cancelled" || check.status === "action-required")) return "failed";
	if (checks.some(check => check.status === "pending")) return "pending";
	return "passing";
}

/** Each person's latest verdict decides: any request for changes wins, then any approval. */
export function reviewDecision(reviews: readonly { state: string }[], required = false): PullRequest["review"] {
	if (reviews.some(review => review.state === "CHANGES_REQUESTED")) return "changes-requested";
	if (reviews.some(review => review.state === "APPROVED")) return "approved";
	return required ? "required" : "none";
}

export const commit = (oid: unknown, message: unknown, at: unknown, author: PullRequestActor | null): PullRequestCommit | undefined => {
	const id = sha(oid), committedAt = date(at), headline = text(message, 200000)?.split(/\r?\n/)[0]?.slice(0, 500);
	return id && committedAt && headline !== undefined ? { oid: id, headline, committedAt, authors: author ? [author] : [] } : undefined;
};
export const comment = (value: Omit<PullRequestComment, "reactions">): PullRequestComment => ({ ...value, reactions: [], canReact: false });

/** Fills what only GitHub reports (stacks, threads, reactions, auto-merge rules) with honest empties. */
export function view(base: Omit<PullRequestView, "threads" | "fetchedAt" | "readAt" | "stack" | "commentsTruncated" | "commentCount" | "commitCount" | "authorAvatarUrl" | "author"> & { commentsTruncated?: boolean; commitCount?: number }): PullRequestView {
	return {
		...base, author: base.authorActor?.login ?? "Unknown author", ...(base.authorActor?.avatarUrl ? { authorAvatarUrl: base.authorActor.avatarUrl } : {}),
		threads: [], commentCount: base.comments.length, commentsTruncated: base.commentsTruncated ?? false, commitCount: base.commitCount ?? base.commits.length,
		fetchedAt: new Date().toISOString(), readAt: new Date().toISOString(),
	};
}

export const unsupported = (name: string, noun: string) => new CodeHostError(`${name} ${noun}s can't do that from Phaseo yet. Open it on ${name} instead.`);
export const mergeNotReady = (noun: string) => new CodeHostError(`Only an open ${noun} that is ready for review can be merged.`);
/** Draft markers in titles, for hosts that keep the draft state there. */
export const draftTitle = /^\s*(?:\[?(?:draft|wip)\]?:?)\s*/i;
export const chooseMethod = (methods: readonly PullRequestMergeMethod[], method: PullRequestMergeMethod, name: string) => { if (!methods.includes(method)) throw new CodeHostError(`This ${name} repository does not allow that merge method.`); return method; };
