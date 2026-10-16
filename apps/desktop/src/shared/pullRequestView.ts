import type { PullRequest, PullRequestDetails } from "./pullRequests";
import { reviewNodeId } from "./pullRequestThreads";
import { newPullRequestWatch, validatePullRequestWatch, type PullRequestWatchState } from "./pullRequestWatch";
import { validateSavedStack, type PullRequestStackState } from "./pullRequestStacks";

/** Everything one pull request pane shows, read in one GitHub request (after T3 Code's detail view). */
export type PullRequestActor = { login: string; avatarUrl?: string; bot?: boolean };
export type PullRequestCheckStatus = "pending" | "action-required" | "success" | "failure" | "cancelled" | "skipped" | "neutral";
/** `required` is the base branch's protection asking for this check. */
export type PullRequestCheck = { name: string; status: PullRequestCheckStatus; url?: string; description?: string; required?: boolean };
export const pullRequestReactionContents = ["THUMBS_UP", "THUMBS_DOWN", "LAUGH", "HOORAY", "CONFUSED", "HEART", "ROCKET", "EYES"] as const;
export type PullRequestReactionContent = typeof pullRequestReactionContents[number];
/** `actors` names up to three people besides the viewer, for the hover text. */
export type PullRequestReaction = { content: string; count: number; viewerHasReacted?: boolean; actors?: string[] };
export type PullRequestComment = { id: string; kind: "comment" | "review" | "review-comment"; author: PullRequestActor | null; body: string; createdAt: string; editedAt?: string; url?: string; reviewState?: string; path?: string; threadId?: string; reactions: PullRequestReaction[]; canReact?: boolean };
export type PullRequestCommit = { oid: string; headline: string; committedAt: string; additions?: number; deletions?: number; authors: PullRequestActor[] };
export type PullRequestReviewThreadView = { id: string; path: string; line?: number; originalLine?: number; side: "LEFT" | "RIGHT"; resolved: boolean; outdated: boolean; canReply: boolean; canResolve: boolean; canUnresolve: boolean; comments: PullRequestComment[]; totalComments: number };
export type PullRequestReviewState = "APPROVED" | "CHANGES_REQUESTED" | "DISMISSED" | "COMMENTED";
export type PullRequestMergeMethod = "merge" | "squash" | "rebase";
export const pullRequestMergeMethods: PullRequestMergeMethod[] = ["merge", "squash", "rebase"];
export type PullRequestView = PullRequestDetails & {
	id: string; createdAt: string; mergedAt?: string; closedAt?: string;
	authorActor: PullRequestActor | null;
	labels: { name: string; color?: string }[];
	/** Requested reviewers who have not answered yet. */
	reviewers: PullRequestActor[];
	/** Each reviewer's latest verdict. */
	reviews: { actor: PullRequestActor | null; state: PullRequestReviewState; submittedAt: string }[];
	/** Every check run on the head commit; `checks` is the rollup. */
	checkRuns: PullRequestCheck[];
	comments: PullRequestComment[]; commentCount: number; commentsTruncated: boolean;
	commits: PullRequestCommit[]; commitCount: number;
	threads: PullRequestReviewThreadView[];
	mergeMethods: PullRequestMergeMethod[];
	viewer: { login?: string; canUpdate: boolean; canMerge: boolean; canDeleteBranch: boolean; canEnableAutoMerge: boolean; canDisableAutoMerge: boolean };
	/** The repository lets pull requests merge themselves once their requirements are met. */
	autoMergeAllowed: boolean;
	/** Armed auto-merge: GitHub merges with this method once the requirements are met. */
	autoMerge?: { method: PullRequestMergeMethod; enabledBy?: string };
	headRepository?: string; headRefExists: boolean;
	/** GitHub's merge state says the branch is behind its base. */
	behind: boolean;
};

export type PullRequestAction =
	| { type: "merge" | "enable-auto-merge"; method: PullRequestMergeMethod }
	| { type: "disable-auto-merge" }
	| { type: "close" | "reopen" | "ready" | "draft" | "update-branch" | "delete-branch" }
	| { type: "title"; title: string }
	| { type: "comment"; body: string }
	| { type: "reply"; threadId: string; body: string }
	| { type: "resolve"; threadId: string; resolved: boolean }
	| { type: "review"; event: "approve" | "request-changes" | "comment"; body: string }
	| { type: "react"; subjectId: string; content: PullRequestReactionContent; reacted: boolean }
	| { type: "label"; name: string; applied: boolean }
	| { type: "reviewer"; login: string; requested: boolean };
export type PullRequestActionRequest = { number: number; headOid: string; action: PullRequestAction };

const control = (value: string) => [...value].some(character => { const code = character.charCodeAt(0); return code === 0 || code === 127; });
function body(value: unknown, required: boolean) {
	if (typeof value !== "string" || value.length > 65536 || control(value) || (required && !value.trim())) throw new Error(required ? "Write something first." : "Invalid pull request text.");
	return value;
}
const githubLogin = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
/** Who or what the Summary pickers offer, read when a picker opens. `applied` is a label it wears or a reviewer already asked. */
export type PullRequestCandidate = { key: string; label: string; detail?: string; color?: string; avatarUrl?: string; applied: boolean };
export type PullRequestCandidates = { kind: "labels" | "reviewers"; candidates: PullRequestCandidate[]; truncated: boolean };
export function validatePullRequestCandidatesQuery(value: unknown): { number: number; kind: "labels" | "reviewers" } {
	const query = value && typeof value === "object" ? value as Record<string, unknown> : {};
	if (!Number.isSafeInteger(query.number) || Number(query.number) < 1 || Number(query.number) > 2147483647 || (query.kind !== "labels" && query.kind !== "reviewers")) throw new Error("Invalid pull request picker request.");
	return { number: Number(query.number), kind: query.kind };
}
export function validatePullRequestActionRequest(value: unknown): PullRequestActionRequest {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid pull request action.");
	const request = value as Record<string, unknown>, action = request.action as Record<string, unknown> | undefined;
	if (!Number.isSafeInteger(request.number) || Number(request.number) < 1 || Number(request.number) > 2147483647 || typeof request.headOid !== "string" || !/^[a-f0-9]{40}$/i.test(request.headOid) || !action || typeof action !== "object" || Array.isArray(action)) throw new Error("Invalid pull request action.");
	const common = { number: Number(request.number), headOid: request.headOid.toLowerCase() };
	switch (action.type) {
		case "merge": case "enable-auto-merge":
			if (!pullRequestMergeMethods.includes(action.method as PullRequestMergeMethod)) throw new Error("Choose a merge method.");
			return { ...common, action: { type: action.type, method: action.method as PullRequestMergeMethod } };
		case "close": case "disable-auto-merge": case "reopen": case "ready": case "draft": case "update-branch": case "delete-branch":
			return { ...common, action: { type: action.type } };
		case "title": {
			const title = typeof action.title === "string" ? action.title.trim() : "";
			if (!title || title.length > 256 || [...title].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error("Write a title of up to 256 characters on one line.");
			return { ...common, action: { type: "title", title } };
		}
		case "comment": return { ...common, action: { type: "comment", body: body(action.body, true) } };
		case "reply":
			if (!reviewNodeId(action.threadId)) throw new Error("Invalid review thread.");
			return { ...common, action: { type: "reply", threadId: action.threadId, body: body(action.body, true) } };
		case "resolve":
			if (!reviewNodeId(action.threadId) || typeof action.resolved !== "boolean") throw new Error("Invalid review thread.");
			return { ...common, action: { type: "resolve", threadId: action.threadId, resolved: action.resolved } };
		case "review": {
			if (!["approve", "request-changes", "comment"].includes(action.event as string)) throw new Error("Choose a review verdict.");
			const event = action.event as "approve" | "request-changes" | "comment";
			return { ...common, action: { type: "review", event, body: body(action.body ?? "", event !== "approve") } };
		}
		case "react":
			if (!reviewNodeId(action.subjectId) || !pullRequestReactionContents.includes(action.content as PullRequestReactionContent) || typeof action.reacted !== "boolean") throw new Error("Invalid reaction.");
			return { ...common, action: { type: "react", subjectId: action.subjectId, content: action.content as PullRequestReactionContent, reacted: action.reacted } };
		case "label": {
			const name = typeof action.name === "string" ? action.name : "";
			if (!name.trim() || name.length > 200 || control(name) || typeof action.applied !== "boolean") throw new Error("Invalid label.");
			return { ...common, action: { type: "label", name, applied: action.applied } };
		}
		case "reviewer":
			if (typeof action.login !== "string" || !githubLogin.test(action.login) || typeof action.requested !== "boolean") throw new Error("Invalid reviewer.");
			return { ...common, action: { type: "reviewer", login: action.login, requested: action.requested } };
		default: throw new Error("Unknown pull request action.");
	}
}

/** A linked pull request as the chat remembers it: the last state any pane read, so lists draw without asking GitHub. */
export type PullRequestLinkSnapshot = { title: string; state: "open" | "closed" | "merged"; draft: boolean; mergeable: PullRequestDetails["mergeable"]; checks: PullRequest["checks"]; review: PullRequest["review"]; additions: number; deletions: number; author: string; head: string; base: string; updatedAt: string; authorAvatarUrl?: string; changedFiles?: number; /** When this state was last read from GitHub. */ syncedAt?: string };
/**
 * Who made the link, after T3: the person, the agent, a pull request this chat created, or a layer found in a native
 * stack. "stack-dismissed" is a layer the person removed, kept so the next stack read does not add it back.
 */
export type PullRequestLinkSource = "manual" | "created" | "agent" | "stack" | "stack-dismissed";
export const pullRequestLinkSources: PullRequestLinkSource[] = ["manual", "created", "agent", "stack", "stack-dismissed"];
/** The native stack a linked pull request was last seen in, so lists group it without asking GitHub. */
export type SavedPullRequestStack = { id: string; number: number; url: string; base: string; layers: { number: number; headBranch: string; state: PullRequestStackState }[] };
export type TaskPullRequestLink = { repository: string; number: number; url: string; linkedAt: string; source: PullRequestLinkSource; watching?: boolean; /** Present while watching: what the chat's agent was last told. */ watch?: PullRequestWatchState; snapshot?: PullRequestLinkSnapshot; stack?: SavedPullRequestStack };
export const maximumPullRequestLinks = 50;
const repositoryPattern = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
export function validRepository(value: unknown): value is string { return typeof value === "string" && repositoryPattern.test(value) && !value.split("/").some(part => part === "." || part === ".."); }
export function pullRequestUrl(repository: string, number: number) { return `https://github.com/${repository}/pull/${number}`; }

/** Reads what a person types into the link dialog: a GitHub URL, `owner/repo#42`, `#42` or `42`. A bare number belongs to the chat's project. */
export function parsePullRequestReference(input: string): { repository?: string; number: number } | undefined {
	const value = input.trim();
	const url = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/pull\/(\d{1,10})(?:[/?#].*)?$/i.exec(value);
	const short = /^(?:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+))?#?(\d{1,10})$/.exec(value);
	const match = url ?? short;
	if (!match) return;
	const number = Number(match[2]);
	if (!Number.isSafeInteger(number) || number < 1 || number > 2147483647) return;
	if (match[1] !== undefined && !validRepository(match[1])) return;
	return match[1] === undefined ? { number } : { repository: match[1], number };
}

export function pullRequestLinkSnapshot(details: PullRequestDetails): PullRequestLinkSnapshot {
	return { title: details.title, state: details.state === "MERGED" ? "merged" : details.state === "CLOSED" ? "closed" : "open", draft: details.draft, mergeable: details.mergeable, checks: details.checks, review: details.review, additions: details.additions, deletions: details.deletions, author: details.author, head: details.head, base: details.base, updatedAt: details.updatedAt, changedFiles: details.changedFiles, ...(details.authorAvatarUrl ? { authorAvatarUrl: details.authorAvatarUrl } : {}), syncedAt: details.fetchedAt };
}
/** Whether two snapshots say the same thing, ignoring when each was read. */
export function sameSnapshot(left: PullRequestLinkSnapshot | undefined, right: PullRequestLinkSnapshot) {
	if (!left) return false;
	const strip = (snapshot: PullRequestLinkSnapshot) => { const copy = { ...snapshot }; delete copy.syncedAt; return copy; };
	return JSON.stringify(strip(left)) === JSON.stringify(strip(right));
}
/** The link without its watch. */
export function unwatched(link: TaskPullRequestLink): TaskPullRequestLink { const copy = { ...link }; delete copy.watch; delete copy.watching; return copy; }
export function samePullRequest(left: { repository: string; number: number }, right: { repository: string; number: number }) { return left.number === right.number && left.repository.toLowerCase() === right.repository.toLowerCase(); }

/** Stored links come back through the store; anything malformed is dropped rather than trusted. */
export function validatePullRequestLinks(value: unknown): TaskPullRequestLink[] | undefined {
	if (!Array.isArray(value)) return;
	const links: TaskPullRequestLink[] = [];
	for (const entry of value.slice(0, maximumPullRequestLinks)) {
		const link = entry as Partial<TaskPullRequestLink> | null;
		if (!link || !validRepository(link.repository) || !Number.isSafeInteger(link.number) || Number(link.number) < 1 || typeof link.linkedAt !== "string") continue;
		if (links.some(other => samePullRequest(other, link as TaskPullRequestLink))) continue;
		links.push({ repository: link.repository, number: Number(link.number), url: pullRequestUrl(link.repository, Number(link.number)), linkedAt: link.linkedAt, source: pullRequestLinkSources.includes(link.source as PullRequestLinkSource) ? link.source as PullRequestLinkSource : "manual", ...(link.watching ? { watching: true, watch: validatePullRequestWatch(link.watch) ?? newPullRequestWatch(new Date().toISOString()) } : {}), ...(link.snapshot && typeof link.snapshot === "object" ? { snapshot: link.snapshot } : {}), ...(validateSavedStack(link.stack) ? { stack: validateSavedStack(link.stack) } : {}) });
	}
	return links;
}
