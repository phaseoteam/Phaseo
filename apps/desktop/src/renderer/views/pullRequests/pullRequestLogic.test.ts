import { describe, expect, it } from "vitest";
import type { PullRequestCheck, PullRequestComment, PullRequestView } from "../../../shared/pullRequestView";
import { buildTimeline, checksRollup, fileTree, groupTimeline, ignoreWhitespacePatch, primaryAction, pullRequestStateKey, readViewed, relativeTime, reviewerEntries, setViewed, summarizeChecks, summaryChecksRollup, viewedState } from "./pullRequestLogic";

const check = (status: PullRequestCheck["status"], url?: string): PullRequestCheck => ({ name: status, status, ...(url ? { url } : {}) });
const comment = (id: string, at: string, patch: Partial<PullRequestComment> = {}): PullRequestComment => ({ id, kind: "comment", author: { login: "a" }, body: "Hi", createdAt: at, reactions: [], ...patch });

describe("pull request presentation rules", () => {
	it("lets closed and merged win over a stale draft flag", () => {
		expect(pullRequestStateKey("OPEN", true)).toBe("draft");
		expect(pullRequestStateKey("MERGED", true)).toBe("merged");
		expect(pullRequestStateKey("closed", false)).toBe("closed");
	});
	it("rolls checks up the way GitHub's header does", () => {
		expect(checksRollup([])).toBeNull();
		expect(checksRollup([check("success"), check("cancelled")])).toBe("failing");
		expect(checksRollup([check("success"), check("action-required")])).toBe("pending");
		expect(checksRollup([check("skipped"), check("neutral")])).toBeNull();
		expect(summaryChecksRollup("failed")).toBe("failing");
		expect(summaryChecksRollup("none")).toBeNull();
	});
	it("summarises checks with counts", () => {
		expect(summarizeChecks([])).toBe("No checks reported");
		expect(summarizeChecks([check("failure"), check("success")])).toBe("1 of 2 failing");
		expect(summarizeChecks([check("action-required", "https://github.com/o/r/actions/runs/12")])).toBe("1 workflow awaiting approval");
		expect(summarizeChecks([check("pending"), check("success")])).toBe("1 of 2 running");
		expect(summarizeChecks([check("success"), check("success")])).toBe("All checks passed");
		expect(summarizeChecks([check("success"), check("skipped")])).toBe("1 of 2 passing");
	});
	it("chooses one primary control by state", () => {
		const base = { state: "OPEN" as const, draft: false, mergeable: "MERGEABLE" as const, viewer: { canUpdate: true, canMerge: true, canDeleteBranch: false }, mergeMethods: ["squash" as const] };
		expect(primaryAction({ ...base, state: "MERGED" })).toBe("merged");
		expect(primaryAction({ ...base, state: "CLOSED" })).toBe("closed");
		expect(primaryAction({ ...base, mergeable: "CONFLICTING" })).toBe("resolve");
		expect(primaryAction({ ...base, draft: true, mergeable: "CONFLICTING" })).toBe("ready");
		expect(primaryAction(base)).toBe("merge");
		expect(primaryAction({ ...base, viewer: { ...base.viewer, canMerge: false } })).toBeNull();
		expect(primaryAction({ ...base, mergeMethods: [] })).toBeNull();
	});
	it("puts requested reviewers first and marks verdicts older than the newest commit", () => {
		const entries = reviewerEntries({
			reviewers: [{ login: "Pending" }, { login: "Approver" }],
			reviews: [{ actor: { login: "approver" }, state: "APPROVED", submittedAt: "2026-10-01T00:00:00Z" }, { actor: { login: "blocker" }, state: "CHANGES_REQUESTED", submittedAt: "2026-10-03T00:00:00Z" }, { actor: { login: "gone" }, state: "DISMISSED", submittedAt: "2026-10-03T00:00:00Z" }],
			commits: [{ oid: "a".repeat(40), headline: "", committedAt: "2026-10-02T00:00:00Z", authors: [] }],
		});
		expect(entries.map(entry => [entry.actor?.login, entry.outcome, entry.stale])).toEqual([["Pending", null, false], ["Approver", "approved", true], ["blocker", "changes-requested", false]]);
	});
});

describe("timeline", () => {
	const view = { createdAt: "2026-10-01T00:00:00Z", authorActor: { login: "author" }, mergedAt: "2026-10-05T00:00:00Z", closedAt: "2026-10-05T00:00:00Z", commits: [{ oid: "b".repeat(40), headline: "Fix", committedAt: "2026-10-02T00:00:00Z", authors: [] }], comments: [comment("c1", "2026-10-03T00:00:00Z"), comment("c2", "2026-10-03T01:00:00Z", { kind: "review", reviewState: "COMMENTED" }), comment("r1", "2026-10-04T00:00:00Z", { kind: "review", reviewState: "APPROVED", body: "<!-- bot -->" })] } satisfies Pick<PullRequestView, "createdAt" | "authorActor" | "commits" | "comments" | "mergedAt" | "closedAt">;
	it("orders newest first, prefers merged over closed and hides marker-only bodies", () => {
		const events = buildTimeline(view);
		expect(events.map(event => event.kind)).toEqual(["merged", "review", "review", "comment", "commit", "opened"]);
		expect(events[1].body).toBeNull();
	});
	it("folds runs of plain comments and leaves verdicts standing", () => {
		expect(groupTimeline(buildTimeline(view)).map(row => row.kind === "comments" ? `comments:${row.events.length}` : row.event.kind)).toEqual(["merged", "review", "comments:2", "commit", "opened"]);
	});
});

describe("code tab helpers", () => {
	const patch = ["diff --git a/x b/x", "--- a/x", "+++ b/x", "@@ -1,3 +1,3 @@", " keep", "-  indented", "+indented", "-old", "+new", "@@ -10,2 +10,2 @@", "-a  b", "+a b"].join("\n");
	it("turns whitespace-only edits into context and drops hunks left with none", () => {
		const result = ignoreWhitespacePatch(patch);
		expect(result.hidden).toBe(true);
		expect(result.patch.split("\n")).toEqual(["diff --git a/x b/x", "--- a/x", "+++ b/x", "@@ -1,3 +1,3 @@", " keep", " indented", "-old", "+new"]);
		expect(ignoreWhitespacePatch("@@ -1 +1 @@\n-a\n+b").hidden).toBe(false);
	});
	it("builds a folders-first tree with single-child chains joined", () => {
		expect(fileTree(["src/app/main.ts", "src/app/view.ts", "README.md", "docs/a/b/c.md"]).map(node => [node.name, node.file, node.children.map(child => child.name)])).toEqual([["docs/a/b", false, ["c.md"]], ["src/app", false, ["main.ts", "view.ts"]], ["README.md", true, []]]);
	});
	it("keeps viewed ticks against the blob that was read", () => {
		let files = setViewed({}, "a.ts", "blob1", true);
		expect(viewedState(files, "a.ts", "blob1")).toBe("viewed");
		expect(viewedState(files, "a.ts", "blob2")).toBe("changed");
		files = setViewed(files, "a.ts", "blob1", false);
		expect(viewedState(files, "a.ts", "blob1")).toBe("unviewed");
		expect(readViewed({ getItem: () => "{not json" }, "k")).toEqual({});
		expect(readViewed({ getItem: () => JSON.stringify({ "a.ts": "b", bad: 3 }) }, "k")).toEqual({ "a.ts": "b" });
	});
	it("writes short relative times", () => {
		const now = Date.parse("2026-10-16T12:00:00Z");
		expect(relativeTime("2026-10-16T11:59:50Z", now)).toBe("just now");
		expect(relativeTime("2026-10-16T11:00:00Z", now)).toBe("1h ago");
		expect(relativeTime("2026-10-13T12:00:00Z", now)).toBe("3d ago");
	});
});
