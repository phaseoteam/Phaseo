import { describe, expect, it } from "vitest";
import type { PullRequestCheck, PullRequestComment } from "./pullRequestView";
import { evaluatePullRequestWatch, isRateLimited, newPullRequestWatch, pullRequestWatchMessage, pullRequestWatchWakeLimit, rateLimitBackoffMs, validatePullRequestWatch } from "./pullRequestWatch";

const head = "a".repeat(40), other = "b".repeat(40);
const view = (checkRuns: PullRequestCheck[], mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN" = "MERGEABLE", headOid = head) => ({ headOid, checkRuns, mergeable, viewer: { login: "agent", canUpdate: true, canMerge: true, canDeleteBranch: false }, authorActor: { login: "agent" } });
const remark = (id: string, login: string, createdAt: string, extra: Partial<PullRequestComment> = {}): PullRequestComment => ({ id, kind: "comment", author: { login }, body: `said ${id}`, createdAt, reactions: [], ...extra });
const start = newPullRequestWatch("2026-10-16T10:00:00Z");

describe("evaluatePullRequestWatch", () => {
	it("reports each failed check once, and again when a rerun fails", () => {
		const first = evaluatePullRequestWatch(start, view([{ name: "lint", status: "failure" }, { name: "test", status: "pending" }]), []);
		expect(first.changes).toEqual([{ kind: "checks-failed", failed: [{ name: "lint", status: "failure" }] }]);
		expect(evaluatePullRequestWatch(first.next, view([{ name: "lint", status: "failure" }, { name: "test", status: "pending" }]), []).changes).toEqual([]);
		const rerun = evaluatePullRequestWatch(first.next, view([{ name: "lint", status: "pending" }]), []);
		expect(evaluatePullRequestWatch(rerun.next, view([{ name: "lint", status: "failure" }]), []).changes[0]).toMatchObject({ kind: "checks-failed" });
	});
	it("reports passing once the required checks pass, ignoring advisory ones", () => {
		const report = evaluatePullRequestWatch(start, view([{ name: "build", status: "success", required: true }, { name: "bot", status: "pending" }]), []);
		expect(report.changes).toEqual([{ kind: "checks-passed", count: 1, required: true }]);
		expect(evaluatePullRequestWatch(report.next, view([{ name: "build", status: "success", required: true }, { name: "bot", status: "success" }]), []).changes).toEqual([]);
		// A required check that appeared and finished between passes is news.
		expect(evaluatePullRequestWatch(report.next, view([{ name: "build", status: "success", required: true }, { name: "e2e", status: "success", required: true }]), []).changes).toEqual([{ kind: "checks-passed", count: 2, required: true }]);
	});
	it("starts over when the head moves", () => {
		const failed = evaluatePullRequestWatch(start, view([{ name: "lint", status: "failure" }]), []).next;
		expect(evaluatePullRequestWatch(failed, view([{ name: "lint", status: "failure" }], "MERGEABLE", other), []).changes).toEqual([{ kind: "checks-failed", failed: [{ name: "lint", status: "failure" }] }]);
	});
	it("counts other people's new or edited remarks once, never the agent's own", () => {
		const remarks = [remark("old", "person", "2026-10-16T09:00:00Z"), remark("own", "agent", "2026-10-16T10:05:00Z"), remark("new", "person", "2026-10-16T10:05:00Z")];
		const first = evaluatePullRequestWatch(start, view([]), remarks);
		expect(first.changes).toEqual([{ kind: "remarks", remarks: [remarks[2]] }]);
		expect(first.next).toMatchObject({ remarksThrough: "2026-10-16T10:05:00Z", remarkIds: ["new"] });
		const sameSecond = remark("tie", "person", "2026-10-16T10:05:00Z");
		expect(evaluatePullRequestWatch(first.next, view([]), [...remarks, sameSecond]).changes).toEqual([{ kind: "remarks", remarks: [sameSecond] }]);
		expect(evaluatePullRequestWatch(first.next, view([]), [remark("old", "bot", "2026-10-16T09:00:00Z", { editedAt: "2026-10-16T10:06:00Z" })]).changes[0]).toMatchObject({ kind: "remarks" });
		expect(evaluatePullRequestWatch(first.next, view([]), null).changes).toEqual([]);
	});
	it("reports a new conflict once and keeps it while GitHub is still computing", () => {
		const conflict = evaluatePullRequestWatch(start, view([], "CONFLICTING"), []);
		expect(conflict.changes).toEqual([{ kind: "conflicting" }]);
		expect(evaluatePullRequestWatch(conflict.next, view([], "UNKNOWN"), []).next.conflicting).toBe(true);
		expect(evaluatePullRequestWatch(conflict.next, view([], "MERGEABLE"), []).next.conflicting).toBe(false);
	});
	it("stops after ten comment-only updates in a row", () => {
		let watch = evaluatePullRequestWatch(start, view([]), []).next, exhausted = false;
		for (let index = 1; index <= pullRequestWatchWakeLimit; index++) {
			const report = evaluatePullRequestWatch(watch, view([]), [remark(`r${index}`, "bot", new Date(Date.parse("2026-10-16T11:00:00Z") + index * 1000).toISOString())]);
			watch = report.next; exhausted = report.exhausted;
			if (index < pullRequestWatchWakeLimit) expect(exhausted).toBe(false);
		}
		expect(exhausted).toBe(true);
	});
});

describe("watch messages", () => {
	it("tells the agent what changed and summarises it for the person", () => {
		const report = evaluatePullRequestWatch(start, view([{ name: "lint", status: "failure", url: "https://github.com/o/r/runs/1" }], "CONFLICTING"), []);
		const message = pullRequestWatchMessage({ number: 42, url: "https://github.com/o/r/pull/42", base: "main", headSha: head, report });
		expect(message.summary).toBe("#42: checks failed, merge conflict");
		expect(message.outcome).toBe("failed");
		expect(message.text).toContain("- Checks failed on aaaaaaa:\n  - lint https://github.com/o/r/runs/1");
		expect(message.text).toContain("- The branch now conflicts with main.");
		expect(message.text).toContain("unwatch_pull_request");
	});
	it("validates stored watches and detects rate limits", () => {
		expect(validatePullRequestWatch(start)).toEqual(start);
		expect(validatePullRequestWatch({ ...start, headSha: "nope" })).toBeUndefined();
		expect(validatePullRequestWatch({ ...start, wakes: -1 })).toBeUndefined();
		expect(isRateLimited("gh: API rate limit exceeded for user ID 1. (HTTP 403)")).toBe(true);
		expect(isRateLimited("gh: Not Found (HTTP 404)")).toBe(false);
		expect(rateLimitBackoffMs(1)).toBe(120_000); expect(rateLimitBackoffMs(2)).toBe(240_000); expect(rateLimitBackoffMs(10)).toBe(30 * 60_000);
	});
});
