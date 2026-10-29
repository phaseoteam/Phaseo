import { describe, expect, it } from "vitest";
import { linkedItem } from "../../shared/factory/actions";
import { ciFrom, ghError, linkWork, mergeStateFrom, timelineFrom, workItem } from "./github";

const node = (number: number, extra: Record<string, unknown> = {}) => ({
	number, title: `Item ${number}`, body: "", url: `https://github.com/o/r/issues/${number}`, state: "OPEN" as const,
	createdAt: "2026-10-20T10:00:00Z", updatedAt: "2026-10-22T10:00:00Z",
	author: { login: "dependabot", __typename: "Bot" }, labels: { nodes: [{ name: "P1" }] }, comments: { totalCount: 4 },
	...extra,
});

describe("reading GitHub", () => {
	it("turns a GraphQL node into a work item", () => {
		const item = workItem("o/r", node(7), "issue");
		expect(item).toMatchObject({ id: "o/r#7", repo: "o/r", state: "open", comments: 4, priority: "high", author: { login: "dependabot", bot: true } });
		const pull = workItem("o/r", node(9, { isDraft: true, headRefName: "fix-7", body: "Fixes #7", additions: 3, deletions: 1, changedFiles: 2 }), "pull");
		expect(pull).toMatchObject({ state: "draft", branch: "fix-7", linked: 7, diff: { files: 2, additions: 3, deletions: 1 } });
		expect(workItem("o/r", node(10, { state: "MERGED" }), "pull").state).toBe("merged");
	});

	it("links pull requests to issues in their own repository only", () => {
		const items = linkWork([
			workItem("o/a", node(7), "issue"),
			workItem("o/b", node(7), "issue"),
			workItem("o/a", node(9, { body: "Closes #7" }), "pull"),
		]);
		expect(items.find((item) => item.id === "o/a#7")?.linked).toBe(9);
		expect(items.find((item) => item.id === "o/b#7")?.linked).toBeUndefined();
		const pull = items.find((item) => item.id === "o/a#9")!;
		expect(linkedItem(pull, items)?.id).toBe("o/a#7");
	});

	it("links an issue set in GitHub's Development box, without a keyword", () => {
		const references = { nodes: [{ number: 4, repository: { nameWithOwner: "o/other" } }, { number: 7, repository: { nameWithOwner: "O/R" } }] };
		expect(workItem("o/r", node(9, { body: "Tidies up the cart", closingIssuesReferences: references }), "pull").linked).toBe(7);
		expect(workItem("o/r", node(9, { body: "Fixes #8", closingIssuesReferences: references }), "pull").linked).toBe(8);
	});
});

describe("GitHub checks", () => {
	it("sums up checks: running beats failed, and no checks means nothing to wait for", () => {
		expect(ciFrom([], 1).state).toBe("none");
		expect(ciFrom([{ name: "lint", bucket: "pass" }, { name: "skip", bucket: "skipping" }], 1).state).toBe("passed");
		expect(ciFrom([{ name: "lint", bucket: "fail", link: "https://github.com/o/r/actions/runs/1/job/2" }, { name: "e2e", bucket: "pending" }], 1)).toEqual({ state: "pending", failed: [{ name: "lint", link: "https://github.com/o/r/actions/runs/1/job/2" }], checkedAt: 1 });
		expect(ciFrom([{ name: "lint", bucket: "fail", link: "" }, { name: "build", bucket: "pass" }], 1)).toEqual({ state: "failed", failed: [{ name: "lint", link: undefined }], checkedAt: 1 });
	});
});

describe("mergeStateFrom", () => {
	const repo = { squashMergeAllowed: true, mergeCommitAllowed: false, rebaseMergeAllowed: true, viewerDefaultMergeMethod: "REBASE", viewerPermission: "WRITE", deleteBranchOnMerge: true };
	const clean = { mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", reviewDecision: "", isDraft: false };

	it("offers only the methods the repository allows, the one GitHub offers first as the default", () => {
		expect(mergeStateFrom(clean, repo)).toEqual({ methods: ["squash", "rebase"], preferred: "rebase", blocker: undefined, checking: false, unstable: false, deletesBranch: true, base: "main", conflicts: false, behind: false });
		expect(mergeStateFrom({ ...clean, mergeable: "CONFLICTING", mergeStateStatus: "DIRTY", baseRefName: "develop" }, repo)).toMatchObject({ base: "develop", conflicts: true });
		// A remembered method the repository no longer allows falls back to one it does.
		expect(mergeStateFrom(clean, { ...repo, viewerDefaultMergeMethod: "MERGE" }).preferred).toBe("squash");
	});

	it("says what stops a merge, the first thing to deal with first", () => {
		expect(mergeStateFrom(clean, { ...repo, viewerPermission: "READ" }).blocker).toBe("You can't merge in this repository");
		expect(mergeStateFrom({ ...clean, isDraft: true, mergeable: "CONFLICTING" }, repo).blocker).toBe("It's a draft: mark it ready first");
		expect(mergeStateFrom({ ...clean, mergeable: "CONFLICTING", mergeStateStatus: "DIRTY" }, repo).blocker).toBe("It has conflicts with the base branch");
		expect(mergeStateFrom({ ...clean, reviewDecision: "REVIEW_REQUIRED", mergeStateStatus: "BLOCKED" }, repo).blocker).toBe("It needs an approving review");
		expect(mergeStateFrom({ ...clean, mergeStateStatus: "BLOCKED" }, repo).blocker).toMatch(/branch rules/);
		expect(mergeStateFrom({ ...clean, mergeStateStatus: "UNSTABLE" }, repo)).toMatchObject({ blocker: undefined, unstable: true });
		expect(mergeStateFrom({ ...clean, mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" }, repo).checking).toBe(true);
	});
});

describe("ghError", () => {
	it("keeps what GitHub said and drops gh's wrapping", () => {
		expect(ghError("failed to create review: GraphQL: Review Can not approve your own pull request (addPullRequestReview)\n")).toBe("GitHub said: Can not approve your own pull request");
		expect(ghError("X Pull request #9 is not mergeable: the merge commit cannot be cleanly created.")).toBe("X Pull request #9 is not mergeable: the merge commit cannot be cleanly created.");
	});
});

describe("timelineFrom", () => {
	const who = { login: "dan", avatarUrl: "https://a/dan" };
	it("reads comments, reviews with their line comments, events and commits", () => {
		const entries = timelineFrom("o/r", [
			{ __typename: "PullRequestCommit", commit: { abbreviatedOid: "8e90e0a", messageHeadline: "Count a missing quantity as 1", committedDate: "2026-10-27T09:00:00Z", author: { name: "Dan", user: who } } },
			{ __typename: "IssueComment", id: "C1", databaseId: 11, author: who, body: "Looks good", createdAt: "2026-10-27T09:01:00Z", url: "u", viewerCanUpdate: true, viewerCanDelete: true },
			{ __typename: "PullRequestReview", id: "R1", databaseId: 12, author: { login: "kim" }, body: "", state: "CHANGES_REQUESTED", submittedAt: "2026-10-27T09:02:00Z", comments: { nodes: [{ id: "RC1", databaseId: 13, author: { login: "kim" }, body: "Off by one", createdAt: "2026-10-27T09:02:00Z", path: "src/a.js", line: 8 }] } },
			{ __typename: "PullRequestReview", id: "R2", author: who, body: "", state: "PENDING", createdAt: "2026-10-27T09:03:00Z", comments: { nodes: [] } },
			{ __typename: "LabeledEvent", actor: who, createdAt: "2026-10-27T09:04:00Z", label: { name: "bug" } },
			{ __typename: "CrossReferencedEvent", actor: who, createdAt: "2026-10-27T09:05:00Z", willCloseTarget: true, source: { __typename: "PullRequest", number: 15, title: "Fix it", repository: { nameWithOwner: "o/r" } } },
			{ __typename: "ClosedEvent", actor: who, createdAt: "2026-10-27T09:06:00Z", stateReason: "COMPLETED", closer: { __typename: "PullRequest", number: 15 } },
			{ __typename: "MentionedEvent", createdAt: "2026-10-27T09:07:00Z" },
		]);
		expect(entries.map((entry) => entry.kind === "event" ? entry.text : `${entry.kind}:${entry.author}`)).toEqual([
			"Count a missing quantity as 1", "comment:dan", "review:kim", "added the bug label", "linked a pull request that will close this", "closed this as completed in #15",
		]);
		expect(entries[1]).toMatchObject({ databaseId: 11, canEdit: true, canDelete: true, avatar: "https://a/dan" });
		expect(entries[2]).toMatchObject({ state: "changes", comments: [{ path: "src/a.js", line: 8, body: "Off by one" }] });
		expect(entries[4]).toMatchObject({ ref: { number: 15, pull: true, repo: "o/r" } });
	});
});
