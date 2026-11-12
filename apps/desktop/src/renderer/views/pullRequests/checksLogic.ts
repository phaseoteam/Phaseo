import type { PullRequestCheck } from "../../../shared/pullRequestView";

/** The count a checks button shows (its "count" form): running out of all while any run, else how many failed. */
export function checksCountLabel(checks: readonly PullRequestCheck[]) {
	const running = checks.filter(check => check.status === "pending").length, failed = checks.filter(check => check.status === "failure" || check.status === "cancelled").length;
	return running > 0 ? `${running}/${checks.length}` : failed > 0 ? `${failed} failed` : null;
}
