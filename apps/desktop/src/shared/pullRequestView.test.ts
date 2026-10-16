import { describe, expect, it } from "vitest";
import { parsePullRequestReference, pullRequestSearchTerms, validatePullRequestActionRequest, validatePullRequestLinks } from "./pullRequestView";
import { validateCommand } from "./workspace";

const head = "A".repeat(40);
describe("pull request actions", () => {
	it("accepts each write with its arguments", () => {
		expect(validatePullRequestActionRequest({ number: 4, headOid: head, action: { type: "merge", method: "squash" } })).toEqual({ number: 4, headOid: "a".repeat(40), action: { type: "merge", method: "squash" } });
		expect(validatePullRequestActionRequest({ number: 4, headOid: head, action: { type: "title", title: "  New  " } }).action).toEqual({ type: "title", title: "New" });
		expect(validatePullRequestActionRequest({ number: 4, headOid: head, action: { type: "review", event: "approve" } }).action).toEqual({ type: "review", event: "approve", body: "" });
		expect(validatePullRequestActionRequest({ number: 4, headOid: head, action: { type: "resolve", threadId: "PRRT_x", resolved: false } }).action).toEqual({ type: "resolve", threadId: "PRRT_x", resolved: false });
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

describe("pull request search terms", () => {
	it("finds a chat by number, reference, link or title of each linked pull request", () => {
		const terms = pullRequestSearchTerms([{ repository: "team/app", number: 12, url: "https://github.com/team/app/pull/12", linkedAt: "2026-10-16T00:00:00Z", source: "manual", snapshot: { title: "Fix login", state: "open", draft: false, mergeable: "MERGEABLE", checks: "passing", review: "none", additions: 1, deletions: 0, author: "octo", head: "fix", base: "main", updatedAt: "2026-10-16T00:00:00Z" } }, { repository: "team/lib", number: 3, url: "https://github.com/team/lib/pull/3", linkedAt: "2026-10-16T00:00:00Z", source: "agent" }]);
		expect(terms).toBe("#12 team/app#12 https://github.com/team/app/pull/12 Fix login #3 team/lib#3 https://github.com/team/lib/pull/3");
		expect(pullRequestSearchTerms(undefined)).toBe("");
	});
});
