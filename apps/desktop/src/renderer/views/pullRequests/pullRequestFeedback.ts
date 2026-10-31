import type { PullRequestAction } from "../../../shared/pullRequestView";

type ActionType = PullRequestAction["type"];

/** Said as the thing that happened (T3's ACTION_SUCCESS_LABELS). Silent ones are acknowledged by what changes on screen. */
const SUCCESS: Partial<Record<ActionType, string>> = {
	merge: "Merge requested", ready: "Marked ready for review", draft: "Converted to draft", close: "Pull request closed", reopen: "Pull request reopened",
	"update-branch": "Branch updated with the base branch", "enable-auto-merge": "Auto-merge enabled", "disable-auto-merge": "Auto-merge disabled",
	revert: "Revert pull request opened", "delete-branch": "Branch deleted", "approve-workflows": "Workflows approved", title: "Title saved", body: "Description saved",
	comment: "Comment posted", "update-comment": "Comment saved",
};
/** Said as the thing that did not happen, rather than as the operation that returned an error. */
const FAILURE: Record<ActionType, string> = {
	merge: "Could not merge this pull request", ready: "Could not mark this ready for review", draft: "Could not convert this to a draft",
	close: "Could not close this pull request", reopen: "Could not reopen this pull request", "update-branch": "Could not update this branch",
	"enable-auto-merge": "Could not enable auto-merge", "disable-auto-merge": "Could not disable auto-merge", revert: "Could not open a revert pull request",
	"delete-branch": "Could not delete this branch", "approve-workflows": "Could not approve workflows", title: "Could not save the title", body: "Could not save the description",
	comment: "Could not post the comment", "update-comment": "The comment could not be saved", reply: "Reply could not be posted", resolve: "The conversation could not be updated",
	review: "The review could not be submitted", react: "The reaction could not be saved", label: "Could not change the labels", reviewer: "Could not change the reviewers",
};
/** What to try, for the times GitHub says only that it refused. */
const HINT: Partial<Record<ActionType, string>> = {
	merge: "GitHub refused the merge. Check that you have write access, that the checks it requires have passed, and that the branch is not conflicting.",
	ready: "GitHub refused it. Check that you have write access to this repository.", draft: "GitHub refused it. Check that you have write access to this repository.",
	close: "GitHub refused it. Check that you have write access, or that you opened it.", reopen: "GitHub refused it. Check that you have write access, and that the branch still exists.",
	"update-branch": "GitHub refused it. Check that you have write access, and that the base branch has not diverged in a way GitHub cannot merge.",
	"enable-auto-merge": "GitHub refused it. Check that auto-merge is enabled for this repository and that you have write access.",
	"disable-auto-merge": "GitHub refused it. Check that you have write access to this repository.",
	revert: "GitHub refused it. Check that you have write access and that this pull request was merged on GitHub.",
	"delete-branch": "GitHub refused it. Check that you have write access to the source repository and that the branch has not moved since this page loaded.",
	"approve-workflows": "GitHub refused it. Check that you have Actions write access and that these workflow runs are still awaiting approval.",
	label: "Changing labels needs triage access on this repository.", reviewer: "Asking for a review needs write access on this repository.",
};

export function actionSuccessLabel(action: PullRequestAction): string | undefined {
	if (action.type === "comment" && action.then) return action.then === "close" ? "Commented and closed" : "Commented and reopened";
	if (action.type === "review") return action.event === "approve" ? "Pull request approved" : action.event === "request-changes" ? "Changes requested" : "Review submitted";
	if (action.type === "update-branch" && action.method === "rebase") return "Branch rebased onto the base branch";
	return SUCCESS[action.type];
}
export function actionFailureLabel(action: PullRequestAction) {
	if (action.type === "comment" && action.then) return action.then === "close" ? "Could not close this pull request" : "Could not reopen this pull request";
	return FAILURE[action.type];
}

const NOISE = [/^(github|gh)?\s*(cli|api)?\s*(command\s*)?failed\.?$/iu, /^exited? with (code|status) \d+\.?$/iu, /^unknown error\.?$/iu];
const LIMIT = 320;
/**
 * What goes under a failed action. GitHub's own sentence when it said something, since it knows why; otherwise our own
 * message unless it only restates the title, and then what to go and check.
 */
export function readableFailure(message: string, action: PullRequestAction): string {
	const hint = HINT[action.type] ?? "";
	const said = /GitHub said: (.+)$/s.exec(message)?.[1]?.trim();
	const detail = said ?? message.trim();
	// Main's fallbacks are one sentence starting "Could not"; with nothing from GitHub after them the hint says more.
	if (!detail || NOISE.some(pattern => pattern.test(detail)) || (!said && /^(?:Could not|The .+ could not)[^.]*\.$/.test(detail) && hint)) return hint || detail;
	return detail.length <= LIMIT ? detail : `${detail.slice(0, LIMIT - 1)}…`;
}
