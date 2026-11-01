import type { PullRequestCheck, PullRequestView } from "../../../shared/pullRequestView";

export type ChatRowAction = "resolve" | "ready" | "fix" | "merge";
/**
 * The one next step a chat's pull request row offers, ranked by what
 * unblocks the merge next: conflicts, then a draft, then failing checks, then Merge once checks pass. Running
 * checks offer nothing, since a merge mid-run would race the runs that gate it.
 */
export function chatRowAction(view: Pick<PullRequestView, "state" | "draft" | "mergeable" | "viewer" | "mergeMethods" | "checkRuns"> | undefined): ChatRowAction | null {
	if (!view || view.state !== "OPEN") return null;
	if (view.mergeable === "CONFLICTING") return "resolve";
	if (view.draft) return view.viewer.canUpdate ? "ready" : null;
	const checks = checksState(view.checkRuns);
	if (checks === "failing") return "fix";
	if (checks === "pending") return null;
	return view.viewer.canMerge && view.mergeMethods.length ? "merge" : null;
}
export function checksState(checks: readonly PullRequestCheck[]): "none" | "failing" | "pending" | "passing" {
	if (!checks.length) return "none";
	if (checks.some(check => check.status === "failure" || check.status === "cancelled")) return "failing";
	if (checks.some(check => check.status === "pending" || check.status === "action-required")) return "pending";
	return "passing";
}
/** Every live facet of the checks, "7 of 16 running · 1 failed". */
export function describeChecks(checks: readonly PullRequestCheck[]) {
	if (!checks.length) return "No checks reported";
	const count = (status: PullRequestCheck["status"]) => checks.filter(check => check.status === status).length;
	const failed = count("failure") + count("cancelled"), pending = count("pending"), action = count("action-required"), passed = count("success");
	const parts: string[] = [];
	if (pending) parts.push(`${pending} of ${checks.length} running`);
	if (action) parts.push(`${action} of ${checks.length} awaiting action`);
	if (failed) parts.push(parts.length ? `${failed} failed` : `${failed} of ${checks.length} failing`);
	if (!parts.length) return passed === checks.length ? "All checks passed" : `${passed} of ${checks.length} passing`;
	return parts.join(" · ");
}
/** The task a "Resolve" hand-off starts with. */
export function resolveConflictsPrompt(view: Pick<PullRequestView, "number" | "url" | "head" | "base">) {
	return `Resolve the merge conflicts in pull request #${view.number} (${view.url}). This worktree is checked out at ${view.head}. Merge or rebase ${view.base} into it, resolve every conflict, run the project's checks, then push the branch so the pull request can merge.`;
}
