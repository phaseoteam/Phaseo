import { validRepository } from "./pullRequestView";
import { newIssueWatch, validateIssueWatch, type IssueWatchState } from "./issueWatch";

export type IssueState = "open" | "closed";
/** A linked issue as the chat remembers it: the last state Phaseo read, so lists draw without asking GitHub. */
export type IssueLinkSnapshot = { title: string; state: IssueState; labels: string[]; comments: number; updatedAt: string; /** When this state was last read from GitHub. */ syncedAt?: string };
/** Who made the link: the chat's agent, or the person. */
export type IssueLinkSource = "agent" | "user";
export type TaskIssueLink = { repository: string; number: number; url: string; linkedAt: string; source: IssueLinkSource; watching?: boolean; /** Present while watching: what the chat's agent was last told. */ watch?: IssueWatchState; snapshot?: IssueLinkSnapshot };
export const maximumIssueLinks = 50;

/** One issue comment as read_issue and the watcher see it. `authorAssociation` is GitHub's (OWNER, MEMBER, COLLABORATOR…). */
export type IssueComment = { id: string; author: string | null; authorAssociation?: string; body: string; createdAt: string; url?: string };
/** One issue read from GitHub: its text, labels, people and its latest comments (oldest first). */
export type IssueDetails = {
	repository: string; number: number; url: string; title: string; body: string; state: IssueState; stateReason?: string;
	author: string | null; labels: string[]; assignees: string[]; createdAt: string; updatedAt: string; closedAt?: string;
	comments: IssueComment[]; commentCount: number;
	/** Who gh is signed in as, so the watcher skips the agent's own comments. */
	viewer?: string;
	fetchedAt: string;
};

export function issueUrl(repository: string, number: number) { return `https://github.com/${repository}/issues/${number}`; }
const validNumber = (value: number) => Number.isSafeInteger(value) && value >= 1 && value <= 2147483647;

/** Reads an issue reference: a GitHub issue URL, `owner/repo#12`, `#12` or `12`. A bare number belongs to the chat's project. */
export function parseIssueReference(input: string): { repository?: string; number: number } | undefined {
	const value = input.trim();
	const url = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/issues\/(\d{1,10})(?:[/?#].*)?$/i.exec(value);
	const short = /^(?:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+))?#?(\d{1,10})$/.exec(value);
	const match = url ?? short;
	if (!match) return;
	const number = Number(match[2]);
	if (!validNumber(number)) return;
	if (match[1] !== undefined && !validRepository(match[1])) return;
	return match[1] === undefined ? { number } : { repository: match[1], number };
}
/** Thrown when an issue number belongs to a pull request, so the caller can point at the pull request tools. */
export class IssueIsPullRequestError extends Error {
	constructor(repository: string, number: number) { super(`${repository}#${number} is a pull request, not an issue. Use the pull request tools (link_pull_request, watch_pull_request) for it.`); }
}
/** A pull request URL handed to the issue tools, so they can point at the pull request tools instead. */
export const isPullRequestUrl = (input: string) => /^(?:https?:\/\/)?(?:www\.)?github\.com\/[^/]+\/[^/]+\/pull\/\d+/i.test(input.trim());

export function sameIssue(left: { repository: string; number: number }, right: { repository: string; number: number }) { return left.number === right.number && left.repository.toLowerCase() === right.repository.toLowerCase(); }
export function issueLinkSnapshot(details: IssueDetails): IssueLinkSnapshot {
	return { title: details.title, state: details.state, labels: details.labels.slice(0, 20), comments: details.commentCount, updatedAt: details.updatedAt, syncedAt: details.fetchedAt };
}
/** Whether two snapshots say the same thing, ignoring when each was read. */
export function sameIssueSnapshot(left: IssueLinkSnapshot | undefined, right: IssueLinkSnapshot) {
	if (!left) return false;
	const strip = (snapshot: IssueLinkSnapshot) => { const copy = { ...snapshot }; delete copy.syncedAt; return copy; };
	return JSON.stringify(strip(left)) === JSON.stringify(strip(right));
}
/** The link without its watch. */
export function unwatchedIssue(link: TaskIssueLink): TaskIssueLink { const copy = { ...link }; delete copy.watch; delete copy.watching; return copy; }

function validSnapshot(value: unknown): IssueLinkSnapshot | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return;
	const snapshot = value as Record<string, unknown>;
	if (typeof snapshot.title !== "string" || (snapshot.state !== "open" && snapshot.state !== "closed") || typeof snapshot.updatedAt !== "string" || !Number.isSafeInteger(snapshot.comments)) return;
	const labels = Array.isArray(snapshot.labels) ? snapshot.labels.filter((label): label is string => typeof label === "string").slice(0, 20) : [];
	return { title: snapshot.title.slice(0, 500), state: snapshot.state, labels, comments: Number(snapshot.comments), updatedAt: snapshot.updatedAt, ...(typeof snapshot.syncedAt === "string" ? { syncedAt: snapshot.syncedAt } : {}) };
}
/** Stored links come back through the store; anything malformed is dropped rather than trusted. */
export function validateIssueLinks(value: unknown): TaskIssueLink[] | undefined {
	if (!Array.isArray(value)) return;
	const links: TaskIssueLink[] = [];
	for (const entry of value.slice(0, maximumIssueLinks)) {
		const link = entry as Partial<TaskIssueLink> | null;
		if (!link || !validRepository(link.repository) || !Number.isSafeInteger(link.number) || Number(link.number) < 1 || typeof link.linkedAt !== "string") continue;
		if (links.some(other => sameIssue(other, link as TaskIssueLink))) continue;
		const snapshot = validSnapshot(link.snapshot);
		links.push({ repository: link.repository, number: Number(link.number), url: issueUrl(link.repository, Number(link.number)), linkedAt: link.linkedAt, source: link.source === "agent" ? "agent" : "user", ...(link.watching ? { watching: true, watch: validateIssueWatch(link.watch) ?? newIssueWatch(new Date().toISOString()) } : {}), ...(snapshot ? { snapshot } : {}) });
	}
	return links;
}
/** What finds a chat by its linked issues in the command palette: #N, owner/repo#N, the URL and the title. */
export function issueSearchTerms(links: readonly TaskIssueLink[] | undefined) {
	return (links ?? []).flatMap(link => [`#${link.number}`, `${link.repository}#${link.number}`, link.url, link.snapshot?.title ?? ""]).filter(Boolean).join(" ");
}

/** An issue or pull request a message references with a `#` chip, by its GitHub URL. */
export type GithubReference = { kind: "issue" | "pull-request"; repository: string; number: number; url: string };
export const maximumGithubReferences = 10;
export function parseGithubReferenceUrl(value: string): GithubReference | undefined {
	const match = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/(issues|pull)\/(\d{1,10})$/.exec(value);
	if (!match || !validRepository(match[1]) || !validNumber(Number(match[3]))) return;
	const kind = match[2] === "issues" ? "issue" as const : "pull-request" as const, number = Number(match[3]);
	return { kind, repository: match[1], number, url: kind === "issue" ? issueUrl(match[1], number) : `https://github.com/${match[1]}/pull/${number}` };
}
/** A send command's `githubReferences`: up to ten distinct issue or pull request URLs. */
export function validGithubReferences(value: unknown): value is string[] {
	return Array.isArray(value) && value.length <= maximumGithubReferences && value.every(url => typeof url === "string" && url.length <= 300 && parseGithubReferenceUrl(url) !== undefined) && new Set(value).size === value.length;
}

/** What the `#` composer menu offers: one of the project's issues or pull requests. */
export type GithubReferenceCandidate = GithubReference & { title: string; state: "open" | "closed" | "merged"; draft?: boolean; updatedAt: string };
export type GithubReferenceSearch = { repository: string; results: GithubReferenceCandidate[] };
export function validateGithubReferenceQuery(value: unknown) {
	if (value !== undefined && (typeof value !== "string" || value.length > 200 || [...value].some(character => character.charCodeAt(0) < 32))) throw new Error("Invalid issue search.");
	return (value ?? "").trim();
}
