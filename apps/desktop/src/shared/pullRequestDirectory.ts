import type { PullRequest } from "./pullRequests";
import type { PullRequestActor } from "./pullRequestView";

/**
 * The Pull requests page (T3 Code's `/pull-requests`): every project's pull requests in one list, read with one
 * GitHub search per handful of repositories. The narrowings a row's own fields can answer run again in the
 * renderer, so switching between them never waits on GitHub.
 */
export type PullRequestListState = "open" | "closed" | "merged" | "all";
export type PullRequestInvolvement = "all" | "reviewing" | "authored";
export type PullRequestReviewFilter = "approved" | "changes-requested" | "review-required" | "none";
export type PullRequestChecksFilter = "passing" | "failing";
/** T3's PullRequestListFilters: `labels` is a list of OR-groups that must all match; `author` may be "me". */
export type PullRequestListFilters = { labels?: string[][]; excludedLabels?: string[]; author?: string; draft?: "only" | "hide"; review?: PullRequestReviewFilter; checks?: PullRequestChecksFilter };
export type PullRequestDirectoryQuery = { state: PullRequestListState; text: string; filters: PullRequestListFilters; projectId?: string; limit: number };
export type PullRequestLabel = { name: string; color?: string };
export type PullRequestDirectoryEntry = {
	projectId: string; repository: string; number: number; title: string; url: string;
	state: "open" | "closed" | "merged"; draft: boolean; author: PullRequestActor | null;
	head: string; base: string; headOid: string; createdAt: string; updatedAt: string;
	additions: number; deletions: number; labels: PullRequestLabel[];
	review: PullRequest["review"]; checks: PullRequest["checks"]; mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
	/** The signed-in person is one of the reviewers GitHub is waiting on. */
	viewerReviewRequested: boolean;
};
/** `errors` names each project that could not be read, so the Project filter can say which. */
export type PullRequestDirectoryResult = { viewer?: string; entries: PullRequestDirectoryEntry[]; errors: { projectId: string; message: string }[]; truncated: boolean; fetchedAt: string };

export const pullRequestPageSize = 100;
export const maximumPullRequestPageSize = 500;
export const maximumQualifierValues = 10;
export const maximumQualifierLength = 200;

const states: PullRequestListState[] = ["open", "closed", "merged", "all"];
const reviews: PullRequestReviewFilter[] = ["approved", "changes-requested", "review-required", "none"];
const plainText = (value: unknown, limit: number) => typeof value === "string" && value.length <= limit && ![...value].some(character => { const code = character.charCodeAt(0); return code < 32 || code === 127; });
const names = (value: unknown) => {
	if (!Array.isArray(value) || value.length > maximumQualifierValues || !value.every(name => plainText(name, maximumQualifierLength) && (name as string).trim())) throw new Error("Invalid pull request filter.");
	return (value as string[]).map(name => name.trim());
};

export function validatePullRequestListFilters(value: unknown): PullRequestListFilters {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid pull request filter.");
	const input = value as Record<string, unknown>, filters: PullRequestListFilters = {};
	if (input.labels !== undefined) { if (!Array.isArray(input.labels) || input.labels.length > maximumQualifierValues) throw new Error("Invalid pull request filter."); filters.labels = input.labels.map(names).filter(group => group.length); if (!filters.labels.length) delete filters.labels; }
	if (input.excludedLabels !== undefined) { filters.excludedLabels = names(input.excludedLabels); if (!filters.excludedLabels.length) delete filters.excludedLabels; }
	if (input.author !== undefined) { if (!plainText(input.author, maximumQualifierLength) || !/^@?[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\[bot\])?$/.test(input.author as string)) throw new Error("Invalid pull request author."); filters.author = (input.author as string).replace(/^@/, ""); }
	if (input.draft !== undefined) { if (input.draft !== "only" && input.draft !== "hide") throw new Error("Invalid pull request filter."); filters.draft = input.draft; }
	if (input.review !== undefined) { if (!reviews.includes(input.review as PullRequestReviewFilter)) throw new Error("Invalid pull request filter."); filters.review = input.review as PullRequestReviewFilter; }
	if (input.checks !== undefined) { if (input.checks !== "passing" && input.checks !== "failing") throw new Error("Invalid pull request filter."); filters.checks = input.checks; }
	return filters;
}

export function validatePullRequestDirectoryQuery(value: unknown): PullRequestDirectoryQuery {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid pull request list request.");
	const input = value as Record<string, unknown>;
	if (!states.includes(input.state as PullRequestListState)) throw new Error("Invalid pull request state.");
	if (input.text !== undefined && !plainText(input.text, 256)) throw new Error("Search for up to 256 characters on one line.");
	if (input.projectId !== undefined && (typeof input.projectId !== "string" || !input.projectId || input.projectId.length > 200)) throw new Error("Invalid project.");
	const limit = input.limit === undefined ? pullRequestPageSize : input.limit;
	if (!Number.isSafeInteger(limit) || Number(limit) < 1 || Number(limit) > maximumPullRequestPageSize) throw new Error("Invalid pull request page size.");
	return { state: input.state as PullRequestListState, text: typeof input.text === "string" ? input.text.trim() : "", filters: validatePullRequestListFilters(input.filters ?? {}), ...(typeof input.projectId === "string" ? { projectId: input.projectId } : {}), limit: Number(limit) };
}

/** A label or search word as GitHub's search reads it: quoted when it holds a space, a comma or a colon. */
const quoted = (value: string) => { const clean = value.replaceAll("\"", "").trim(); return /[\s,:]/.test(clean) ? `"${clean}"` : clean; };
const reviewQualifier: Record<PullRequestReviewFilter, string> = { approved: "review:approved", "changes-requested": "review:changes_requested", "review-required": "review:required", none: "review:none" };

/** GitHub's search query for these repositories: `is:pr` plus the state, the qualifiers the hosts can apply, and the text. */
export function pullRequestSearchQuery(repositories: readonly string[], query: Pick<PullRequestDirectoryQuery, "state" | "text" | "filters">) {
	const { filters } = query;
	const words = query.text.split(/\s+/).filter(Boolean).map(word => word.includes(":") ? quoted(word) : word.replaceAll("\"", ""));
	return [
		"is:pr", "archived:false", ...repositories.map(repository => `repo:${repository}`),
		...(query.state === "open" ? ["is:open"] : query.state === "closed" ? ["is:closed", "is:unmerged"] : query.state === "merged" ? ["is:merged"] : []),
		...(filters.labels ?? []).map(group => `label:${group.map(quoted).join(",")}`),
		...(filters.excludedLabels ?? []).map(name => `-label:${quoted(name)}`),
		...(filters.author ? [`author:${filters.author.toLowerCase() === "me" ? "@me" : filters.author}`] : []),
		...(filters.draft ? [`draft:${filters.draft === "only"}`] : []),
		...(filters.review ? [reviewQualifier[filters.review]] : []),
		...(filters.checks ? [`status:${filters.checks === "passing" ? "success" : "failure"}`] : []),
		...words, "sort:updated-desc",
	].join(" ");
}
