import { describe, expect, it } from "vitest";
import { parsePullRequestReference, validatePullRequestActionRequest, validatePullRequestLinks } from "./pullRequestView";
import { validateCommand } from "./workspace";

const head = "A".repeat(40);
describe("pull request actions", () => {
	it("accepts each write with its arguments", () => {
		expect(validatePullRequestActionRequest({ number: 4, headOid: head, action: { type: "merge", method: "squash" } })).toEqual({ number: 4, headOid: "a".repeat(40), action: { type: "merge", method: "squash" } });
		expect(validatePullRequestActionRequest({ number: 4, headOid: head, action: { type: "title", title: "  New  " } }).action).toEqual({ type: "title", title: "New" });
		expect(validatePullRequestActionRequest({ number: 4, headOid: head, action: { type: "review", event: "approve" } }).action).toEqual({ type: "review", event: "approve", body: "" });
		expect(validatePullRequestActionRequest({ number: 4, headOid: head, action: { type: "resolve", threadId: "PRRT_x", resolved: false } }).action).toEqual({ type: "resolve", threadId: "PRRT_x", resolved: false });
		expect(validatePullRequestActionRequest({ number: 4, headOid: head, action: { type: "comment", body: "Bye", then: "close" } }).action).toEqual({ type: "comment", body: "Bye", then: "close" });
		expect(validatePullRequestActionRequest({ number: 4, headOid: head, action: { type: "body", body: "" } }).action).toEqual({ type: "body", body: "" });
		expect(validatePullRequestActionRequest({ number: 4, headOid: head, action: { type: "update-comment", commentId: "IC_1", kind: "comment", body: "Edited" } }).action).toEqual({ type: "update-comment", commentId: "IC_1", kind: "comment", body: "Edited" });
		expect(validatePullRequestActionRequest({ number: 4, headOid: head, action: { type: "update-branch", method: "rebase" } }).action).toEqual({ type: "update-branch", method: "rebase" });
		expect(validatePullRequestActionRequest({ number: 4, headOid: head, action: { type: "update-branch" } }).action).toEqual({ type: "update-branch" });
		expect(validatePullRequestActionRequest({ number: 4, headOid: head, action: { type: "revert" } }).action).toEqual({ type: "revert" });
	});
	it("carries line comments on a review, which may then go without a summary", () => {
		const comments = [{ path: "src/a.ts", line: 9, side: "RIGHT", startLine: 7, startSide: "RIGHT", body: "Range" }, { path: "src/a.ts", line: 3, side: "LEFT", startLine: 3, startSide: "LEFT", body: "One line" }];
		expect(validatePullRequestActionRequest({ number: 4, headOid: head, action: { type: "review", event: "comment", body: "", comments } }).action).toEqual({ type: "review", event: "comment", body: "", comments: [comments[0], { path: "src/a.ts", line: 3, side: "LEFT", body: "One line" }] });
		expect(() => validatePullRequestActionRequest({ number: 4, headOid: head, action: { type: "review", event: "request-changes", body: "", comments } })).toThrow();
		expect(() => validatePullRequestActionRequest({ number: 4, headOid: head, action: { type: "review", event: "comment", body: "", comments: [{ path: "a", line: 2, side: "RIGHT", startLine: 5, startSide: "RIGHT", body: "Backwards" }] } })).toThrow("range");
		expect(() => validatePullRequestActionRequest({ number: 4, headOid: head, action: { type: "review", event: "comment", body: "", comments: [{ path: "a", line: 0, side: "RIGHT", body: "x" }] } })).toThrow();
	});
	it.each([
		{ number: 0, headOid: head, action: { type: "close" } },
		{ number: 4, headOid: "short", action: { type: "close" } },
		{ number: 4, headOid: head, action: { type: "merge", method: "fast-forward" } },
		{ number: 4, headOid: head, action: { type: "title", title: "two\nlines" } },
		{ number: 4, headOid: head, action: { type: "comment", body: "   " } },
		{ number: 4, headOid: head, action: { type: "review", event: "request-changes", body: "" } },
		{ number: 4, headOid: head, action: { type: "reply", threadId: "../x", body: "Hi" } },
		{ number: 4, headOid: head, action: { type: "shell" } },
		{ number: 4, headOid: head, action: { type: "comment", body: "Hi", then: "merge" } },
		{ number: 4, headOid: head, action: { type: "update-comment", commentId: "IC_1", kind: "issue", body: "x" } },
		{ number: 4, headOid: head, action: { type: "update-comment", commentId: "IC_1", kind: "comment", body: " " } },
		{ number: 4, headOid: head, action: { type: "update-branch", method: "squash" } },
	])("rejects %j", value => { expect(() => validatePullRequestActionRequest(value)).toThrow(); });
});

describe("pull request references", () => {
	it.each([
		["https://github.com/owned/repo/pull/42", { repository: "owned/repo", number: 42 }],
		["github.com/owned/repo/pull/42/files", { repository: "owned/repo", number: 42 }],
		["owned/repo#7", { repository: "owned/repo", number: 7 }],
		["#42", { number: 42 }],
		[" 42 ", { number: 42 }],
	])("reads %s", (input, expected) => { expect(parsePullRequestReference(input)).toEqual(expected); });
	it.each(["", "#", "#0", "https://gitlab.com/a/b/pull/1", "https://github.com/a/../pull/1", "owner/repo/issues/3", "#99999999999"])("rejects %s", input => { expect(parsePullRequestReference(input)).toBeUndefined(); });
	it("validates link commands and drops the renderer's resolution", () => {
		expect(validateCommand({ type: "link-pull-request", id: "task", reference: "#42", repository: "evil/repo", number: 1 })).toEqual({ type: "link-pull-request", id: "task", reference: "#42" });
		expect(() => validateCommand({ type: "link-pull-request", id: "task", reference: "issue 42" })).toThrow();
		expect(() => validateCommand({ type: "watch-pull-request", id: "task", repository: "owned/repo", number: 3, watching: "yes" })).toThrow();
		expect(() => validateCommand({ type: "unlink-pull-request", id: "task", repository: "owned", number: 3 })).toThrow();
	});
	it("drops malformed and repeated stored links", () => {
		const links = validatePullRequestLinks([{ repository: "owned/repo", number: 3, url: "javascript:alert(1)", linkedAt: "2026-10-16T00:00:00Z", source: "manual" }, { repository: "Owned/Repo", number: 3, linkedAt: "x" }, { repository: "bad", number: 1, linkedAt: "x" }]);
		expect(links).toEqual([{ repository: "owned/repo", number: 3, url: "https://github.com/owned/repo/pull/3", linkedAt: "2026-10-16T00:00:00Z", source: "manual" }]);
	});
});
