import { phoneLimits, phoneMergeMethods, type PhoneBranchPullRequest, type PhoneDiffFile, type PhonePullRequest, type PhonePullRequestAction, type PhonePullRequestCheck, type PhonePullRequestEvent, type PhonePullRequestView, type PhoneRequest, type PhoneResults } from "@phaseo/phone-protocol";
import type { BranchPullRequest, PullRequest } from "../../shared/pullRequests";
import type { PullRequestFilesPage } from "../../shared/pullRequestFiles";
import { validatePullRequestActionRequest, type PullRequestActionRequest, type PullRequestCheckStatus, type PullRequestMergeMethod, type PullRequestView } from "../../shared/pullRequestView";

/** The window's Git command for a phone's git_action; gitCommand validates it again, as it does the window's. */
export function phoneGitCommand(request: Extract<PhoneRequest, { type: "git_action" }>): Record<string, unknown> {
	const { action, filename, message, all, push, name } = request;
	return { type: action, ...filename !== undefined ? { filename } : {}, ...message !== undefined ? { message } : {}, ...all ? { all } : {}, ...push ? { push } : {}, ...name !== undefined ? { name } : {} };
}

const lower = <T extends string>(value: string) => value.toLowerCase() as T;

export function phoneBranchPullRequest(value: BranchPullRequest): PhoneBranchPullRequest | null {
	const pr = value.pullRequest;
	return pr ? { repository: pr.repository, number: pr.number, url: pr.url, title: pr.title, state: lower(pr.state), draft: pr.draft } : null;
}

export const phonePullRequest = (pr: PullRequest): PhonePullRequest => ({ number: pr.number, title: pr.title, url: pr.url, author: pr.author, draft: pr.draft, head: pr.head, base: pr.base, updatedAt: pr.updatedAt, review: pr.review, checks: pr.checks });

/** Text cut at the phone's limit, never between the halves of an emoji. */
function cut(text: string) {
	const limit = phoneLimits.pullRequestTextChars;
	if (text.length <= limit) return { text, truncated: false };
	return { text: text.slice(0, /[\uD800-\uDBFF]/.test(text[limit - 1]!) ? limit - 1 : limit), truncated: true };
}
const checkWord = (status: PullRequestCheckStatus): PhonePullRequestCheck["status"] =>
	status === "success" ? "passing" : status === "failure" || status === "cancelled" || status === "action-required" ? "failed" : status === "skipped" ? "skipped" : status === "neutral" ? "neutral" : "pending";
/** The most of a pull request's activity a phone gets: the latest, since a long one's start is history. */
const eventLimit = 100;
/** Room left in a frame for the response around a result, and encryption. */
const frameBudget = phoneLimits.frameBytes - 64 * 1024;

/**
 * The window's pull request pane slimmed for a frame: the description and every comment cut at
 * phoneLimits.pullRequestTextChars, comments and commits merged into one timeline of the latest 100 that fit, and `mergeMethod`
 * the computer's setting when the repository allows it.
 */
export function phonePullRequestView(view: PullRequestView, preferred?: PullRequestMergeMethod | null): PhonePullRequestView {
	const body = cut(view.body);
	const events: PhonePullRequestEvent[] = [
		...view.comments.map((comment): PhonePullRequestEvent => {
			const text = cut(comment.body);
			return { id: comment.id, kind: comment.kind, ...comment.author ? { author: comment.author.login } : {}, body: text.text, createdAt: comment.createdAt, ...comment.reviewState ? { reviewState: comment.reviewState } : {}, ...comment.path ? { path: comment.path } : {}, ...text.truncated ? { truncated: true as const } : {} };
		}),
		...view.commits.map((commit): PhonePullRequestEvent => ({ id: commit.oid, kind: "commit", ...commit.authors[0] ? { author: commit.authors[0].login } : {}, body: commit.headline, createdAt: commit.committedAt })),
	].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	const methods = phoneMergeMethods.filter(method => view.mergeMethods.includes(method));
	const result: PhonePullRequestView = {
		...phonePullRequest(view), repository: view.repository, state: lower(view.state), body: body.text, ...body.truncated ? { bodyTruncated: true as const } : {},
		headOid: view.headOid, baseOid: view.baseOid, additions: view.additions, deletions: view.deletions, changedFiles: view.changedFiles, mergeable: lower(view.mergeable),
		checkRuns: view.checkRuns.slice(0, 100).map(check => ({ name: check.name, status: checkWord(check.status), ...check.url ? { url: check.url } : {} })),
		reviews: view.reviews.map(review => ({ ...review.actor ? { author: review.actor.login } : {}, state: review.state, submittedAt: review.submittedAt })),
		reviewers: view.reviewers.map(actor => actor.login),
		events: [], eventsTruncated: true,
		mergeMethods: methods, ...preferred && methods.includes(preferred) ? { mergeMethod: preferred } : {},
		viewer: { canMerge: view.viewer.canMerge, canUpdate: view.viewer.canUpdate },
	};
	// 100 comments at the text limit are several MiB, so the latest go in until the frame is full.
	let used = Buffer.byteLength(JSON.stringify(result));
	const kept: PhonePullRequestEvent[] = [];
	for (let index = events.length - 1; index >= 0 && kept.length < eventLimit; index--) {
		const size = Buffer.byteLength(JSON.stringify(events[index])) + 1;
		if (used + size > frameBudget) break;
		used += size;
		kept.push(events[index]!);
	}
	result.events = kept.reverse();
	result.eventsTruncated = kept.length < events.length || view.commentsTruncated || view.commitCount > view.commits.length;
	return result;
}
const statusOf = (status: string): PhoneDiffFile["status"] => status === "added" ? "added" : status === "removed" ? "deleted" : status === "renamed" || status === "copied" ? "renamed" : "modified";

/** A page of a pull request's files as read_diff has them; patches stop going in once the frame is full. */
export function phonePullRequestFiles(page: PullRequestFilesPage): PhoneResults["pull_request_files"] {
	let used = 256;
	const files = page.files.map((file): PhoneDiffFile => {
		const entry: PhoneDiffFile = { path: file.filename, ...file.previousFilename ? { oldPath: file.previousFilename } : {}, status: statusOf(file.status), additions: file.additions, deletions: file.deletions };
		used += Buffer.byteLength(JSON.stringify(entry));
		if (!file.patch) return file.preview === "too-large" ? { ...entry, truncated: true } : entry;
		const size = Buffer.byteLength(JSON.stringify(file.patch));
		if (used + size > frameBudget) return { ...entry, truncated: true };
		used += size;
		return { ...entry, patch: file.patch };
	});
	return { files, total: page.total, hasNext: page.hasNext };
}

/** A phone's pull request action as the window's, through the window's own validator. */
export function phonePullRequestAction(number: number, headOid: string, action: PhonePullRequestAction): PullRequestActionRequest {
	return validatePullRequestActionRequest({ number, headOid, action: action.type === "review" ? { type: "review", event: action.event, body: action.body } : action });
}

/** What the window says happened, for the note it shows ("Committed from Daniel's Pixel"). */
export function phoneGitSummary(request: Extract<PhoneRequest, { type: "git_action" }>) {
	switch (request.action) {
		case "commit": return request.push ? "Committed and pushed" : "Committed";
		case "push": return "Pushed";
		case "pull": return "Pulled";
		case "stage": return `Staged ${request.filename}`;
		case "unstage": return `Unstaged ${request.filename}`;
		case "create-branch": return `Created branch ${request.name}`;
		case "switch-branch": return `Switched to ${request.name}`;
	}
}
const actionWords: Record<PhonePullRequestAction["type"], string> = { merge: "Merged", close: "Closed", reopen: "Reopened", comment: "Commented on", review: "Reviewed" };
export function phonePullRequestSummary(number: number, action: PhonePullRequestAction) {
	if (action.type === "review") return `${action.event === "approve" ? "Approved" : action.event === "request-changes" ? "Requested changes on" : "Reviewed"} #${number}`;
	return `${actionWords[action.type]} #${number}`;
}
