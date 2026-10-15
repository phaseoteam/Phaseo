import type { PullRequest } from "../../../shared/pullRequests";
import type { PullRequestActor, PullRequestCheck, PullRequestComment, PullRequestCommit, PullRequestReaction, PullRequestView } from "../../../shared/pullRequestView";

/** Pure rules behind the pull request surfaces, after T3 Code's pullRequestDetail.logic. */
export type PullRequestStateKey = "open" | "draft" | "closed" | "merged";
export type ChecksRollup = "passing" | "failing" | "pending";
export type ReviewOutcome = "approved" | "changes-requested" | "dismissed";

/** Closed and merged win over a stale draft flag. */
export function pullRequestStateKey(state: "OPEN" | "CLOSED" | "MERGED" | "open" | "closed" | "merged", draft: boolean): PullRequestStateKey {
	const lower = state.toLowerCase() as "open" | "closed" | "merged";
	return lower === "open" && draft ? "draft" : lower;
}
export function isConflicting(input: { state: string; draft: boolean; mergeable?: string }) { return input.state.toLowerCase() === "open" && !input.draft && input.mergeable === "CONFLICTING"; }

/** Null for a pull request with no checks: nothing to show beats a tick nobody earned. */
export function checksRollup(checks: readonly PullRequestCheck[]): ChecksRollup | null {
	if (!checks.length) return null;
	const statuses = new Set(checks.map(check => check.status));
	if (statuses.has("failure") || statuses.has("cancelled")) return "failing";
	if (statuses.has("pending") || statuses.has("action-required")) return "pending";
	return statuses.has("success") ? "passing" : null;
}
/** The list's one-word rollup in the same three states. */
export function summaryChecksRollup(checks: PullRequest["checks"]): ChecksRollup | null {
	return checks === "passing" ? "passing" : checks === "failed" ? "failing" : checks === "pending" ? "pending" : null;
}
export function groupChecks(checks: readonly PullRequestCheck[]) {
	return {
		attention: checks.filter(check => ["failure", "cancelled", "action-required"].includes(check.status)),
		running: checks.filter(check => check.status === "pending"),
		completed: checks.filter(check => ["success", "skipped", "neutral"].includes(check.status)),
	};
}
const workflowApproval = (check: PullRequestCheck) => check.status === "action-required" && !!check.url && /\/actions\/runs\/\d+(?:\/|$)/.test(check.url);
export function summarizeChecks(checks: readonly PullRequestCheck[]): string {
	if (!checks.length) return "No checks reported";
	const action = checks.filter(check => check.status === "action-required"), approvals = action.filter(workflowApproval).length, other = action.length - approvals;
	const failed = checks.filter(check => check.status === "failure" || check.status === "cancelled").length;
	const pending = checks.filter(check => check.status === "pending").length, passed = checks.filter(check => check.status === "success").length;
	const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
	if (failed) return `${failed} of ${checks.length} failing`;
	if (approvals && other) return `${plural(approvals, "workflow", "workflows")} and ${plural(other, "check", "checks")} awaiting action`;
	if (approvals) return `${plural(approvals, "workflow", "workflows")} awaiting approval`;
	if (other) return `${plural(other, "check", "checks")} awaiting action`;
	if (pending) return `${pending} of ${checks.length} running`;
	return passed === checks.length ? "All checks passed" : `${passed} of ${checks.length} passing`;
}
export function isWorkflowApproval(check: PullRequestCheck) { return workflowApproval(check); }

export function reviewOutcome(state: string | undefined | null): ReviewOutcome | null {
	switch (state?.trim().toLowerCase().replaceAll("_", "-")) {
		case "approved": return "approved";
		case "changes-requested": return "changes-requested";
		case "dismissed": return "dismissed";
		default: return null;
	}
}
export function newestCommitAt(commits: readonly PullRequestCommit[]): string | null {
	let newest: string | null = null;
	for (const commit of commits) if (!newest || Date.parse(commit.committedAt) > Date.parse(newest)) newest = commit.committedAt;
	return newest;
}
/** A verdict given before the latest commits speaks for code the branch no longer has. */
export function isVerdictStale(at: string, newest: string | null) { return newest !== null && Date.parse(at) < Date.parse(newest); }

export type ReviewerEntry = { key: string; actor: PullRequestActor | null; outcome: ReviewOutcome | null; stale: boolean };
/** Requested reviewers first, then everyone else who gave a verdict, each wearing their latest one. */
export function reviewerEntries(view: Pick<PullRequestView, "reviewers" | "reviews" | "commits">): ReviewerEntry[] {
	const newest = newestCommitAt(view.commits), key = (login: string) => login.toLowerCase();
	const verdicts = new Map(view.reviews.flatMap(review => { const outcome = reviewOutcome(review.state); return review.actor && outcome && outcome !== "dismissed" ? [[key(review.actor.login), { outcome, stale: isVerdictStale(review.submittedAt, newest), actor: review.actor }] as const] : []; }));
	const requested = view.reviewers.map(actor => ({ key: actor.login, actor, outcome: verdicts.get(key(actor.login))?.outcome ?? null, stale: verdicts.get(key(actor.login))?.stale ?? false }));
	const others = [...verdicts.entries()].filter(([login]) => !view.reviewers.some(actor => key(actor.login) === login)).map(([login, verdict]) => ({ key: login, actor: verdict.actor, outcome: verdict.outcome, stale: verdict.stale }));
	return [...requested, ...others];
}
export function approvalCount(view: Pick<PullRequestView, "reviews">) { return view.reviews.filter(review => review.state === "APPROVED").length; }

export type PrimaryAction = "merged" | "closed" | "resolve" | "ready" | "merge" | null;
/** The one control the header leads with, chosen by state the way T3 Code does. */
export function primaryAction(view: Pick<PullRequestView, "state" | "draft" | "mergeable" | "viewer" | "mergeMethods">): PrimaryAction {
	if (view.state === "MERGED") return "merged";
	if (view.state === "CLOSED") return "closed";
	if (view.mergeable === "CONFLICTING" && !view.draft) return "resolve";
	if (view.draft) return view.viewer.canUpdate ? "ready" : null;
	return view.viewer.canMerge && view.mergeMethods.length ? "merge" : null;
}
export const mergeMethodLabels = { merge: "Merge", squash: "Squash and merge", rebase: "Rebase and merge" } as const;

export type TimelineEvent = { id: string; at: string; kind: "opened" | "commit" | "comment" | "review" | "merged" | "closed"; title: string; body: string | null; url?: string; actor: PullRequestActor | null; commitAuthors: PullRequestActor[]; additions?: number; deletions?: number; path?: string; reviewState?: string; reactions: PullRequestReaction[] };
export type TimelineRow = { kind: "event"; event: TimelineEvent } | { kind: "comments"; events: TimelineEvent[] };
/** Bots keep bookkeeping in HTML comments; a body that is only those reads as no body. */
export function visibleBody(body: string): string | null { return body.replace(/<!--[\s\S]*?-->/g, "").trim() ? body.trim() : null; }
/** Newest first: what happened last is what a reader opening the tab is asking about. Merged wins over closed. */
export function buildTimeline(view: Pick<PullRequestView, "createdAt" | "authorActor" | "commits" | "comments" | "mergedAt" | "closedAt">): TimelineEvent[] {
	const events: TimelineEvent[] = [
		{ id: "created", at: view.createdAt, kind: "opened", title: "opened this pull request", body: null, actor: view.authorActor, commitAuthors: [], reactions: [] },
		...view.commits.map(commit => ({ id: commit.oid, at: commit.committedAt, kind: "commit" as const, title: `Commit ${commit.oid.slice(0, 7)}`, body: commit.headline || null, actor: commit.authors[0] ?? null, commitAuthors: commit.authors, additions: commit.additions, deletions: commit.deletions, reactions: [] })),
		...view.comments.map((comment: PullRequestComment) => ({ id: comment.id, at: comment.createdAt, kind: comment.kind === "review" ? "review" as const : "comment" as const, title: comment.kind === "review" ? "reviewed" : "commented", body: visibleBody(comment.body), url: comment.url, actor: comment.author, commitAuthors: [], path: comment.path, reviewState: comment.reviewState, reactions: comment.reactions })),
		...(view.mergedAt ? [{ id: "merged", at: view.mergedAt, kind: "merged" as const, title: "merged this pull request", body: null, actor: null, commitAuthors: [], reactions: [] }] : view.closedAt ? [{ id: "closed", at: view.closedAt, kind: "closed" as const, title: "closed this pull request", body: null, actor: null, commitAuthors: [], reactions: [] }] : []),
	];
	return events.sort((left, right) => Date.parse(right.at) - Date.parse(left.at) || (left.id < right.id ? -1 : 1));
}
/** Runs of plain comments fold into one row; verdicts, commits and lifecycle events stand alone. */
export function groupTimeline(events: readonly TimelineEvent[]): TimelineRow[] {
	const rows: TimelineRow[] = [];
	for (const event of events) {
		const plain = (event.kind === "comment" || event.kind === "review") && reviewOutcome(event.reviewState) === null;
		const last = rows.at(-1);
		if (plain && last?.kind === "comments") last.events = [...last.events, event];
		else rows.push(plain ? { kind: "comments", events: [event] } : { kind: "event", event });
	}
	return rows;
}

export function isBot(comment: Pick<PullRequestComment, "author">) { return comment.author?.bot === true || comment.author?.login.endsWith("[bot]") === true; }
export function isFinished(comment: PullRequestComment, threads: PullRequestView["threads"]) {
	return (comment.threadId !== undefined && threads.find(thread => thread.id === comment.threadId)?.resolved === true) || reviewOutcome(comment.reviewState) === "dismissed";
}

export const reactionEmoji: Record<string, string> = { THUMBS_UP: "👍", THUMBS_DOWN: "👎", LAUGH: "😄", HOORAY: "🎉", CONFUSED: "😕", HEART: "❤️", ROCKET: "🚀", EYES: "👀" };

/**
 * Hides whitespace-only edits in a unified patch: a run of removals followed by the same number of
 * additions that match once whitespace is ignored becomes context. Hunk headers stay valid because a
 * pair of removed and added lines counts once on each side, exactly as a context line does.
 */
export function ignoreWhitespacePatch(patch: string): { patch: string; hidden: boolean } {
	const lines = patch.split("\n"), output: string[] = [];
	const squash = (line: string) => line.slice(1).replace(/\s+/g, "");
	let index = 0, hidden = false;
	while (index < lines.length) {
		if (!lines[index].startsWith("-") || lines[index].startsWith("---")) { output.push(lines[index++]); continue; }
		const removed: string[] = [];
		while (index < lines.length && lines[index].startsWith("-") && !lines[index].startsWith("---")) removed.push(lines[index++]);
		const added: string[] = [];
		while (index < lines.length && lines[index].startsWith("+") && !lines[index].startsWith("+++")) added.push(lines[index++]);
		if (removed.length === added.length && removed.every((line, position) => squash(line) === squash(added[position]))) { output.push(...added.map(line => " " + line.slice(1))); hidden = true; }
		else output.push(...removed, ...added);
	}
	// Drop hunks with no change left in them.
	const result: string[] = [];
	for (let start = 0; start < output.length;) {
		if (!output[start].startsWith("@@")) { result.push(output[start++]); continue; }
		let end = start + 1;
		while (end < output.length && !output[end].startsWith("@@") && !output[end].startsWith("diff --git")) end++;
		const hunk = output.slice(start, end);
		if (hunk.slice(1).some(line => (line.startsWith("+") || line.startsWith("-")))) result.push(...hunk);
		start = end;
	}
	return { patch: result.join("\n"), hidden };
}

export type FileTreeNode = { name: string; path: string; children: FileTreeNode[]; file: boolean };
/** Folders before files, single-child folder chains joined the way GitHub's tree joins them. */
export function fileTree(paths: readonly string[]): FileTreeNode[] {
	const root: FileTreeNode = { name: "", path: "", children: [], file: false };
	for (const path of paths) {
		const parts = path.split("/");
		let node = root;
		parts.forEach((part, index) => {
			const file = index === parts.length - 1, at = parts.slice(0, index + 1).join("/");
			let child = node.children.find(value => value.name === part && value.file === file);
			if (!child) { child = { name: part, path: at, children: [], file }; node.children.push(child); }
			node = child;
		});
	}
	const compact = (node: FileTreeNode): FileTreeNode => {
		let current = node;
		while (!current.file && current.children.length === 1 && !current.children[0].file) current = { ...current.children[0], name: `${current.name}/${current.children[0].name}` };
		return { ...current, children: current.children.map(compact).sort((left, right) => Number(left.file) - Number(right.file) || left.name.localeCompare(right.name)) };
	};
	return compact(root).children;
}

/** Ticks kept on this machine, keyed by the blob the person read so a later push shows "Changed". */
export type ViewedFiles = Record<string, string>;
export const viewedStorageKey = (repository: string, number: number) => `phaseo.desktop.pullRequestViewed.${repository.toLowerCase()}#${number}`;
export function readViewed(storage: Pick<Storage, "getItem">, key: string): ViewedFiles {
	try { const value = JSON.parse(storage.getItem(key) ?? "{}"); return value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(([path, blob]) => typeof path === "string" && typeof blob === "string").slice(0, 3000)) as ViewedFiles : {}; }
	catch { return {}; }
}
export function setViewed(files: ViewedFiles, path: string, blob: string, viewed: boolean): ViewedFiles {
	const next = { ...files };
	if (viewed) next[path] = blob; else delete next[path];
	return next;
}
export function viewedState(files: ViewedFiles, path: string, blob: string): "viewed" | "changed" | "unviewed" { return files[path] === undefined ? "unviewed" : files[path] === blob ? "viewed" : "changed"; }

export function relativeTime(iso: string, now = Date.now()): string {
	const seconds = Math.round((now - Date.parse(iso)) / 1000);
	if (!Number.isFinite(seconds)) return "";
	if (seconds < 45) return "just now";
	const minutes = Math.round(seconds / 60); if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60); if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24); if (days < 30) return `${days}d ago`;
	const months = Math.round(days / 30); if (months < 12) return `${months}mo ago`;
	return `${Math.round(months / 12)}y ago`;
}
export function compactCount(value: number) { return value >= 10_000 ? `${Math.round(value / 1000)}k` : value >= 1000 ? `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(value); }
