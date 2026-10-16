import type { PullRequestCheck, PullRequestComment, PullRequestView } from "./pullRequestView";

/** What a watching chat's agent was last told about a pull request, after T3 Code's thread pull request watch. */
export type PullRequestWatchState = {
	startedAt: string;
	/** The head commit the last read saw; null until the first read. */
	headSha: string | null;
	failedChecks: string[];
	passed: boolean;
	passedChecks: string[];
	/** Remarks up to this time have been told; those exactly at it are told apart by id. */
	remarksThrough: string;
	remarkIds: string[];
	conflicting: boolean;
	/** Comment-only updates in a row. */
	wakes: number;
};

/** Minutes between passes: checks take minutes, and a faster pass mostly spends the shared GitHub rate limit. */
export const pullRequestWatchIntervalMs = 2 * 60_000;
/** Reads in a row that fail for a reason other than a rate limit before a watch ends. */
export const pullRequestWatchReadFailureLimit = 8;
/** Comment-only updates in a row before watching stops, so a chatty bot cannot loop an agent replying to it. */
export const pullRequestWatchWakeLimit = 10;
const listedItems = 10, snippetLength = 200;

export type PullRequestWatchChange =
	| { kind: "checks-failed"; failed: PullRequestCheck[] }
	| { kind: "checks-passed"; count: number; required: boolean }
	| { kind: "remarks"; remarks: PullRequestComment[] }
	| { kind: "conflicting" };
export type PullRequestWatchReport = { changes: PullRequestWatchChange[]; next: PullRequestWatchState; exhausted: boolean };
export type PullRequestWatchOutcome = "failed" | "completed" | "updated";
/** The update the agent reads, and the one-line notice the person sees. */
export type PullRequestWatchMessage = { text: string; summary: string; outcome: PullRequestWatchOutcome };

export function newPullRequestWatch(now: string): PullRequestWatchState {
	return { startedAt: now, headSha: null, failedChecks: [], passed: false, passedChecks: [], remarksThrough: now, remarkIds: [], conflicting: false, wakes: 0 };
}

const strings = (value: unknown, limit: number) => Array.isArray(value) && value.length <= limit && value.every(item => typeof item === "string" && item.length <= 1000) ? value as string[] : undefined;
const time = (value: unknown) => typeof value === "string" && value.length <= 100 && Number.isFinite(Date.parse(value)) ? value : undefined;
/** Stored watches come back through the store; a malformed one restarts rather than being trusted. */
export function validatePullRequestWatch(value: unknown): PullRequestWatchState | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return;
	const watch = value as Record<string, unknown>;
	const startedAt = time(watch.startedAt), remarksThrough = time(watch.remarksThrough), failedChecks = strings(watch.failedChecks, 500), passedChecks = strings(watch.passedChecks, 500), remarkIds = strings(watch.remarkIds, 500);
	if (!startedAt || !remarksThrough || !failedChecks || !passedChecks || !remarkIds || typeof watch.passed !== "boolean" || typeof watch.conflicting !== "boolean" || !Number.isSafeInteger(watch.wakes) || Number(watch.wakes) < 0) return;
	if (watch.headSha !== null && (typeof watch.headSha !== "string" || !/^[a-f0-9]{40}$/i.test(watch.headSha))) return;
	return { startedAt, headSha: watch.headSha as string | null, failedChecks, passed: watch.passed, passedChecks, remarksThrough, remarkIds, conflicting: watch.conflicting, wakes: Number(watch.wakes) };
}

// "action-required" is a finished check that needs someone, so the agent hears about it.
const isFailedCheck = (check: PullRequestCheck) => check.status === "failure" || check.status === "cancelled" || check.status === "action-required";
const activeAt = (remark: PullRequestComment) => remark.editedAt ?? remark.createdAt;

/**
 * Compares a watched pull request with what its agent was last told (T3's evaluatePullRequestWatch). Each check is reported
 * as soon as it fails; "passed" once the required checks all passed, or every check where none is required. Remarks count
 * when someone other than the viewer wrote them, so the agent's own replies never wake it. `remarks` is null when the
 * conversation could not be read; remarks then wait for a later pass.
 */
export function evaluatePullRequestWatch(watch: PullRequestWatchState, view: Pick<PullRequestView, "headOid" | "checkRuns" | "mergeable" | "viewer" | "authorActor">, remarks: PullRequestComment[] | null): PullRequestWatchReport {
	const changes: PullRequestWatchChange[] = [];
	const headSha = view.headOid || null, headMoved = headSha !== watch.headSha;
	// An empty list keeps the last state: GitHub can answer with one when its check read fails.
	let failedChecks = headMoved ? [] : watch.failedChecks, passed = headMoved ? false : watch.passed, passedChecks = headMoved ? [] : watch.passedChecks;
	if (view.checkRuns.length) {
		const failed = view.checkRuns.filter(isFailedCheck), newlyFailed = failed.filter(check => !failedChecks.includes(check.name));
		if (newlyFailed.length) changes.push({ kind: "checks-failed", failed: newlyFailed });
		// A check that runs again leaves the list, so a rerun that fails again is reported.
		failedChecks = failed.map(check => check.name);
		const required = view.checkRuns.filter(check => check.required === true), gate = required.length ? required : view.checkRuns;
		const passedNow = gate.every(check => check.status !== "pending" && !isFailedCheck(check)), gateNames = gate.map(check => check.name);
		const told = passed && !passedChecks.length ? gateNames : passedChecks;
		// A required job created and finished between two passes is never seen pending; advisory bots adding passed checks do not wake.
		const gateGrew = required.length > 0 && gateNames.some(name => !told.includes(name));
		if (passedNow && (!passed || gateGrew)) changes.push({ kind: "checks-passed", count: gate.length, required: required.length > 0 });
		passed = passedNow; passedChecks = passedNow ? gateNames : [];
	}
	const own = (view.viewer.login ?? view.authorActor?.login)?.toLowerCase(), through = Date.parse(watch.remarksThrough);
	// GitHub times are per second, so remarks at the boundary are told apart by id. An edit counts as new activity.
	const fresh = (remarks ?? []).filter(remark => { const at = Date.parse(activeAt(remark)); return (at > through || (at === through && !watch.remarkIds.includes(remark.id))) && remark.author?.login.toLowerCase() !== own; });
	if (fresh.length) changes.push({ kind: "remarks", remarks: fresh });
	const latest = Math.max(through, ...fresh.map(remark => Date.parse(activeAt(remark))));
	const atLatest = fresh.filter(remark => Date.parse(activeAt(remark)) === latest);
	const remarksThrough = latest === through ? watch.remarksThrough : activeAt(atLatest[0]);
	const remarkIds = [...(latest === through ? watch.remarkIds : []), ...atLatest.map(remark => remark.id)].slice(-500);
	if (view.mergeable === "CONFLICTING" && !watch.conflicting) changes.push({ kind: "conflicting" });
	// "Unknown" is GitHub still computing after a push; only a clean answer clears a conflict.
	const conflicting = view.mergeable === "UNKNOWN" ? watch.conflicting : view.mergeable === "CONFLICTING";
	const commentsOnly = changes.length > 0 && changes.every(change => change.kind === "remarks");
	const progress = headMoved || (changes.length > 0 && !commentsOnly);
	const wakes = (progress ? 0 : watch.wakes) + (commentsOnly ? 1 : 0);
	return { changes, next: { startedAt: watch.startedAt, headSha, failedChecks, passed, passedChecks, remarksThrough, remarkIds, conflicting, wakes }, exhausted: commentsOnly && wakes >= pullRequestWatchWakeLimit };
}

export function sameWatch(left: PullRequestWatchState, right: PullRequestWatchState) {
	return left.startedAt === right.startedAt && left.headSha === right.headSha && left.failedChecks.join("\n") === right.failedChecks.join("\n") && left.passed === right.passed && left.passedChecks.join("\n") === right.passedChecks.join("\n") && left.remarksThrough === right.remarksThrough && left.remarkIds.join("\n") === right.remarkIds.join("\n") && left.conflicting === right.conflicting && left.wakes === right.wakes;
}

function snippet(body: string) {
	const text = body.replace(/<!--[\s\S]*?-->/g, " ").replace(/\s+/g, " ").trim();
	return text.length <= snippetLength ? text : `${text.slice(0, snippetLength - 3)}...`;
}
function listed<T>(items: T[], line: (item: T) => string) {
	const lines = items.slice(0, listedItems).map(line);
	if (items.length > listedItems) lines.push(`  - and ${items.length - listedItems} more`);
	return lines;
}
function changeLines(change: PullRequestWatchChange, base: string, commit: string): string[] {
	switch (change.kind) {
		case "checks-failed": return [`- Checks failed${commit}:`, ...listed(change.failed, check => `  - ${check.name}${check.status === "failure" ? "" : ` (${check.status})`}${check.url ? ` ${check.url}` : ""}`)];
		case "checks-passed": return [`- All ${change.count} ${change.required ? "required " : ""}${change.count === 1 ? "check" : "checks"} passed${commit}.`];
		case "remarks": return [`- ${change.remarks.length} new ${change.remarks.length === 1 ? "comment" : "comments"}:`, ...listed(change.remarks, remark => {
			const body = snippet(remark.body), said = body ? `"${body}"` : remark.reviewState ? remark.reviewState.toLowerCase().replaceAll("_", " ") : "reviewed";
			return `  - ${remark.author?.login ?? "someone"}${remark.path ? ` on ${remark.path}` : ""}: ${said}${remark.url ? ` ${remark.url}` : ""}`;
		})];
		case "conflicting": return [`- The branch now conflicts with ${base}.`];
	}
}
const summaries: Record<PullRequestWatchChange["kind"], string> = { "checks-failed": "checks failed", "checks-passed": "checks passed", remarks: "new comments", conflicting: "merge conflict" };

/** The update the agent reads and the notice the person sees (T3's pullRequestWatchMessage). */
export function pullRequestWatchMessage(input: { number: number; url: string; base: string; headSha: string | null; report: PullRequestWatchReport }): PullRequestWatchMessage {
	const { changes, exhausted } = input.report, commit = input.headSha ? ` on ${input.headSha.slice(0, 7)}` : "";
	const text = [
		`Update on pull request #${input.number} (${input.url}), which Phaseo is watching for you:`,
		...changes.flatMap(change => changeLines(change, input.base, commit)),
		"",
		exhausted
			? `Phaseo stopped watching after ${pullRequestWatchWakeLimit} comment-only updates in a row. Call watch_pull_request to watch it again.`
			: "Look into each item and act on it as your task requires. Phaseo keeps watching and wakes you on the next change, so end your turn when you are done. When you hand the work back to the user, call unwatch_pull_request first.",
	].join("\n");
	const summary = changes.map(change => summaries[change.kind]);
	if (exhausted) summary.push("stopped watching");
	const outcome: PullRequestWatchOutcome = changes.some(change => change.kind === "checks-failed" || change.kind === "conflicting") ? "failed" : changes.every(change => change.kind === "checks-passed") ? "completed" : "updated";
	return { text, summary: `#${input.number}: ${summary.join(", ")}`, outcome };
}
export function pullRequestWatchClosedMessage(number: number, url: string): PullRequestWatchMessage {
	return { text: `Pull request #${number} (${url}) was closed, so Phaseo stopped watching it. Call watch_pull_request if it reopens.`, summary: `#${number}: closed, stopped watching`, outcome: "updated" };
}
export function pullRequestWatchUnreadableMessage(number: number, url: string): PullRequestWatchMessage {
	return { text: `Phaseo stopped watching pull request #${number} (${url}) because it failed to read it from GitHub ${pullRequestWatchReadFailureLimit} times in a row. Check it yourself, and call watch_pull_request to watch it again.`, summary: `#${number}: stopped watching, could not read it`, outcome: "failed" };
}

/** gh's stderr for GitHub's primary or secondary rate limit: a request to wait, not a failure to read. */
export function isRateLimited(stderr: string) {
	return /rate limit|HTTP 429|abuse detection/i.test(stderr);
}
/** Waits doubling from one pass to 30 minutes while GitHub keeps refusing. */
export function rateLimitBackoffMs(consecutive: number) {
	return Math.min(30 * 60_000, pullRequestWatchIntervalMs * 2 ** Math.max(0, consecutive - 1));
}
