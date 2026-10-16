import { beforeEach, describe, expect, it, vi } from "vitest";
const ports = vi.hoisted(() => ({ git: vi.fn(), resolve: vi.fn(), calls: [] as { args: string[]; input: string }[], respond: vi.fn() }));
vi.mock("./gitProcess", () => ({ git: ports.git }));
vi.mock("./nativeProcess", () => ({ resolveNativeCommand: ports.resolve }));
vi.mock("node:child_process", () => ({
	execFile: (_file: string, args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
		const call = { args, input: "" }; ports.calls.push(call);
		return { stdin: { on: () => {}, end: (input: string) => { call.input = input; queueMicrotask(() => { try { callback(null, ports.respond(args), ""); } catch (error) { callback(error as Error, "", (error as { stderr?: string }).stderr ?? ""); } }); } } };
	},
}));
import { checkStatus, ghFailure, parsePullRequestCandidates, parsePullRequestView, projectPullRequestAction, projectPullRequestCandidates, projectPullRequestView } from "./projectPullRequestView";

const head = "a".repeat(40);
const pull = (patch: Record<string, unknown> = {}) => ({
	id: "PR_node", number: 12, title: "Owned", body: "Body", state: "OPEN", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-04T00:00:00Z", mergedAt: null, closedAt: null, isDraft: false,
	author: { login: "fixture", avatarUrl: "https://avatars.githubusercontent.com/u/1", __typename: "User" }, headRefName: "feature/x", baseRefName: "main", headRefOid: head, baseRefOid: "b".repeat(40), headRef: { id: "REF" }, headRepository: { nameWithOwner: "owned/repo" },
	reviewDecision: "APPROVED", additions: 3, deletions: 1, changedFiles: 2, mergeable: "MERGEABLE", mergeStateStatus: "BEHIND", viewerCanUpdate: true, viewerCanDeleteHeadRef: true,
	labels: { nodes: [{ name: "bug", color: "d73a4a" }, { name: "bad", color: "javascript:" }] },
	reviewRequests: { nodes: [{ requestedReviewer: { __typename: "User", login: "reviewer", avatarUrl: "https://x/y" } }, { requestedReviewer: { __typename: "Team", slug: "core" } }] },
	latestOpinionatedReviews: { nodes: [{ author: { login: "approver" }, state: "APPROVED", submittedAt: "2026-10-03T00:00:00Z" }] },
	commits: { nodes: [{ commit: { statusCheckRollup: { state: "FAILURE", contexts: { nodes: [{ __typename: "CheckRun", name: "test", status: "COMPLETED", conclusion: "FAILURE", detailsUrl: "https://ci/1" }, { __typename: "StatusContext", context: "deploy", state: "PENDING", targetUrl: "file:///etc/passwd" }] } } } }] },
	history: { totalCount: 1, nodes: [{ commit: { oid: head, messageHeadline: "Add x", committedDate: "2026-10-02T00:00:00Z", additions: 3, deletions: 1, authors: { nodes: [{ name: "Fixture", user: { login: "fixture" } }] } } }] },
	comments: { totalCount: 1, nodes: [{ id: "IC_1", author: { login: "dependabot[bot]", __typename: "Bot" }, body: "Hi", createdAt: "2026-10-02T01:00:00Z", url: "https://github.com/c", reactionGroups: [{ content: "THUMBS_UP", reactors: { totalCount: 2 } }, { content: "HEART", reactors: { totalCount: 0 } }] }] },
	reviews: { totalCount: 2, nodes: [{ id: "R_1", author: { login: "approver" }, body: "", state: "APPROVED", submittedAt: "2026-10-03T00:00:00Z" }, { id: "R_2", author: { login: "approver" }, body: "", state: "COMMENTED", submittedAt: "2026-10-03T00:00:00Z" }] },
	reviewThreads: { totalCount: 1, nodes: [{ id: "T_1", path: "src/x.ts", line: 4, originalLine: 4, diffSide: "RIGHT", isResolved: false, isOutdated: false, viewerCanReply: true, viewerCanResolve: true, viewerCanUnresolve: false, comments: { totalCount: 1, nodes: [{ id: "C_1", author: { login: "approver" }, body: "Nit", createdAt: "2026-10-03T01:00:00Z" }] } }] },
	...patch,
});
const response = (patch?: Record<string, unknown>) => ({ data: { viewer: { login: "fixture" }, repository: { mergeCommitAllowed: false, squashMergeAllowed: true, rebaseMergeAllowed: true, viewerPermission: "WRITE", pullRequest: pull(patch) } } });

describe("pull request view", () => {
	beforeEach(() => { ports.calls.length = 0; ports.git.mockResolvedValue("git@github.com:owned/repo.git"); ports.resolve.mockResolvedValue({ executable: "/owned/gh", prefix: [] }); ports.respond.mockReturnValue(JSON.stringify(response())); });
	it("reads checks, reviews, threads, commits and permissions from one response", () => {
		const view = parsePullRequestView("owned/repo", 12, response());
		expect(view.checkRuns).toEqual([{ name: "test", status: "failure", url: "https://ci/1" }, { name: "deploy", status: "pending" }]);
		expect(view.mergeMethods).toEqual(["squash", "rebase"]);
		expect(view.labels).toEqual([{ name: "bug", color: "d73a4a" }, { name: "bad" }]);
		expect(view.reviewers.map(value => value.login)).toEqual(["reviewer", "core"]);
		expect(view.comments.map(value => [value.id, value.kind])).toEqual([["IC_1", "comment"], ["R_1", "review"], ["C_1", "review-comment"]]);
		expect(view.comments[0]).toMatchObject({ author: { login: "dependabot[bot]", bot: true }, reactions: [{ content: "THUMBS_UP", count: 2 }] });
		expect(view).toMatchObject({ behind: true, headRefExists: true, viewer: { canMerge: true, canUpdate: true, login: "fixture" }, commitCount: 1, threads: [{ id: "T_1", canReply: true, canResolve: true, comments: [{ threadId: "T_1", path: "src/x.ts" }] }] });
	});
	it("maps check conclusions the way GitHub's own page does", () => {
		expect(["SUCCESS", "CANCELLED", "SKIPPED", "NEUTRAL", "ACTION_REQUIRED", "TIMED_OUT"].map(conclusion => checkStatus({ status: "COMPLETED", conclusion }))).toEqual(["success", "cancelled", "skipped", "neutral", "action-required", "failure"]);
		expect(checkStatus({ status: "IN_PROGRESS" })).toBe("pending");
		expect(checkStatus({ __typename: "StatusContext", state: "ERROR" })).toBe("failure");
	});
	it("rejects partial responses and another pull request", () => {
		expect(() => parsePullRequestView("owned/repo", 12, { errors: [{}], data: response().data })).toThrow("incomplete");
		expect(() => parsePullRequestView("owned/repo", 13, response())).toThrow("invalid");
	});
	it("keeps tokens out of surfaced GitHub errors", () => {
		expect(ghFailure("gh: Bad credentials ghp_abcdefghijklmnopqrstuvwxyz0123456789 (HTTP 401)", "Could not merge.")).toBe("Could not merge. GitHub said: Bad credentials [hidden] (HTTP 401)");
		expect(ghFailure("some trace", "Could not merge.")).toBe("Could not merge.");
	});
	it("reads through gh without a shell", async () => {
		await projectPullRequestView("/owned", 12);
		expect(ports.calls[0].args).toEqual(expect.arrayContaining(["api", "graphql", "--hostname", "github.com", "-F", "number=12", "-F", "owner=owned", "-F", "name=repo"]));
	});
	it("merges with the chosen method pinned to the head the person saw", async () => {
		await projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "merge", method: "squash" } });
		expect(ports.calls[1].args).toEqual(["api", "--hostname", "github.com", "--method", "PUT", "repos/owned/repo/pulls/12/merge", "-f", "merge_method=squash", "-f", `sha=${head}`]);
		expect(ports.calls).toHaveLength(3);
	});
	it("refuses a merge method the repository does not allow, and a stale head", async () => {
		await expect(projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "merge", method: "merge" } })).rejects.toThrow("does not allow");
		await expect(projectPullRequestAction("/owned", { number: 12, headOid: "c".repeat(40), action: { type: "close" } })).rejects.toThrow("changed");
	});
	it("sends comment and reply bodies on stdin", async () => {
		await projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "comment", body: "Line one\n--flag" } });
		expect(ports.calls[1]).toMatchObject({ args: expect.arrayContaining(["repos/owned/repo/issues/12/comments", "-F", "body=@-"]), input: "Line one\n--flag" });
		await projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "reply", threadId: "T_1", body: "Done" } });
		expect(ports.calls[4]).toMatchObject({ args: expect.arrayContaining(["-f", "id=T_1", "-F", "body=@-"]), input: "Done" });
		await expect(projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "resolve", threadId: "T_other", resolved: true } })).rejects.toThrow("no longer");
	});
	it("deletes only a closed same-repository branch", async () => {
		await expect(projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "delete-branch" } })).rejects.toThrow("Close or merge");
		ports.respond.mockReturnValue(JSON.stringify(response({ state: "MERGED" })));
		await projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "delete-branch" } });
		expect(ports.calls.at(-2)!.args).toEqual(["api", "--hostname", "github.com", "--method", "DELETE", "repos/owned/repo/git/refs/heads/feature/x"]);
	});
	it("reads required checks, edits and auto-merge", () => {
		const view = parsePullRequestView("owned/repo", 12, { data: { ...response().data, repository: { ...response().data.repository, autoMergeAllowed: true, pullRequest: pull({ viewerCanEnableAutoMerge: true, viewerCanDisableAutoMerge: true, autoMergeRequest: { mergeMethod: "SQUASH", enabledBy: { login: "fixture" } },
			commits: { nodes: [{ commit: { statusCheckRollup: { contexts: { nodes: [{ __typename: "CheckRun", name: "build", status: "COMPLETED", conclusion: "SUCCESS", isRequired: true }] } } } }] },
			comments: { totalCount: 1, nodes: [{ id: "IC_1", author: { login: "bot" }, body: "Hi", createdAt: "2026-10-02T01:00:00Z", lastEditedAt: "2026-10-02T02:00:00Z" }] } }) } } });
		expect(view.checkRuns).toEqual([{ name: "build", status: "success", required: true }]);
		expect(view.comments[0].editedAt).toBe("2026-10-02T02:00:00Z");
		expect(view).toMatchObject({ autoMergeAllowed: true, autoMerge: { method: "squash", enabledBy: "fixture" }, viewer: { canEnableAutoMerge: true, canDisableAutoMerge: true } });
	});
	it("turns auto-merge on with the chosen method and the seen head, and off", async () => {
		await projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "enable-auto-merge", method: "rebase" } });
		expect(ports.calls[1].args).toEqual(["pr", "merge", "12", "--repo", "owned/repo", "--auto", "--rebase", "--match-head-commit", head]);
		await expect(projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "disable-auto-merge" } })).rejects.toThrow("already off");
		ports.respond.mockReturnValue(JSON.stringify({ data: { ...response().data, repository: { ...response().data.repository, pullRequest: pull({ autoMergeRequest: { mergeMethod: "SQUASH" } }) } } }));
		await projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "disable-auto-merge" } });
		expect(ports.calls.at(-2)!.args).toEqual(["pr", "merge", "12", "--repo", "owned/repo", "--disable-auto"]);
	});
	it("toggles the viewer's own reaction on a comment, even after a push", async () => {
		await projectPullRequestAction("/owned", { number: 12, headOid: "c".repeat(40), action: { type: "react", subjectId: "IC_1", content: "HEART", reacted: true } });
		expect(ports.calls[1].args).toEqual(expect.arrayContaining(["-f", "id=IC_1", "-f", "content=HEART"]));
		expect(ports.calls[1].args.join(" ")).toContain("addReaction");
		await projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "react", subjectId: "IC_1", content: "HEART", reacted: false } });
		expect(ports.calls.at(-2)!.args.join(" ")).toContain("removeReaction");
		await expect(projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "react", subjectId: "IC_9", content: "HEART", reacted: true } })).rejects.toThrow("no longer");
		await expect(projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "react", subjectId: "IC_1", content: "PARTY", reacted: true } })).rejects.toThrow("Invalid reaction");
		const view = parsePullRequestView("owned/repo", 12, response({ comments: { totalCount: 1, nodes: [{ id: "IC_1", author: { login: "x" }, body: "Hi", createdAt: "2026-10-02T01:00:00Z", viewerCanReact: true, reactionGroups: [{ content: "HEART", viewerHasReacted: true, reactors: { totalCount: 3, nodes: [{ login: "octo" }, {}] } }] }] } }));
		expect(view.comments[0]).toMatchObject({ canReact: true, reactions: [{ content: "HEART", count: 3, viewerHasReacted: true, actors: ["octo"] }] });
	});
	it("adds and removes labels and review requests", async () => {
		await projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "label", name: "needs review", applied: true } });
		expect(ports.calls[1].args).toEqual(["api", "--hostname", "github.com", "--method", "POST", "repos/owned/repo/issues/12/labels", "-f", "labels[]=needs review"]);
		await projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "label", name: "bug", applied: false } });
		expect(ports.calls.at(-2)!.args).toEqual(["api", "--hostname", "github.com", "--method", "DELETE", "repos/owned/repo/issues/12/labels/bug"]);
		await expect(projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "label", name: "gone", applied: false } })).rejects.toThrow("no longer");
		await projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "reviewer", login: "octo", requested: true } });
		expect(ports.calls.at(-2)!.args).toEqual(["api", "--hostname", "github.com", "--method", "POST", "repos/owned/repo/pulls/12/requested_reviewers", "-f", "reviewers[]=octo"]);
		await expect(projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "reviewer", login: "fixture", requested: true } })).rejects.toThrow("author");
		await expect(projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "reviewer", login: "-bad name", requested: true } })).rejects.toThrow("Invalid reviewer");
	});
	it("lists label and reviewer candidates, marking what the pull request has", async () => {
		const data = { data: { repository: { labels: { totalCount: 101, nodes: [{ name: "bug", color: "d73a4a", description: "Broken" }, { name: "docs" }] }, assignableUsers: { totalCount: 3, nodes: [{ login: "fixture" }, { login: "octo", name: "Octo Cat", avatarUrl: "https://a/b" }, { login: "mona" }] }, pullRequest: { author: { login: "fixture" }, labels: { nodes: [{ name: "bug" }] }, reviewRequests: { nodes: [{ requestedReviewer: { login: "Mona" } }] } } } } };
		expect(parsePullRequestCandidates("labels", data)).toEqual({ kind: "labels", truncated: true, candidates: [{ key: "bug", label: "bug", detail: "Broken", color: "d73a4a", applied: true }, { key: "docs", label: "docs", applied: false }] });
		expect(parsePullRequestCandidates("reviewers", data)).toEqual({ kind: "reviewers", truncated: false, candidates: [{ key: "octo", label: "octo", detail: "Octo Cat", avatarUrl: "https://a/b", applied: false }, { key: "mona", label: "mona", applied: true }] });
		ports.respond.mockReturnValue(JSON.stringify(data));
		expect((await projectPullRequestCandidates("/owned", { number: 12, kind: "labels" })).candidates).toHaveLength(2);
		await expect(projectPullRequestCandidates("/owned", { number: 12, kind: "teams" })).rejects.toThrow("Invalid");
	});
	it("posts a review with its line comments as one JSON body on stdin", async () => {
		await projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "review", event: "comment", body: "", comments: [{ path: "src/x.ts", line: 6, side: "RIGHT", startLine: 4, startSide: "RIGHT", body: "Why?" }] } });
		expect(ports.calls[1].args).toEqual(["api", "--hostname", "github.com", "--method", "POST", "repos/owned/repo/pulls/12/reviews", "--input", "-"]);
		expect(JSON.parse(ports.calls[1].input)).toEqual({ event: "COMMENT", commit_id: head, comments: [{ path: "src/x.ts", line: 6, side: "RIGHT", start_line: 4, start_side: "RIGHT", body: "Why?" }] });
	});
	it("closes after a comment, and says the comment landed when the close is refused", async () => {
		await projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "comment", body: "Bye", then: "close" } });
		expect(ports.calls[2].args).toEqual(["api", "--hostname", "github.com", "--method", "PATCH", "repos/owned/repo/pulls/12", "-f", "state=closed"]);
		ports.respond.mockReturnValueOnce(JSON.stringify(response())).mockReturnValueOnce("{}").mockImplementationOnce(() => { throw Object.assign(new Error("x"), { stderr: "gh: Forbidden (HTTP 403)" }); });
		await expect(projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "comment", body: "Bye", then: "close" } })).rejects.toThrow("The comment was posted, but the pull request could not be closed. GitHub said: Forbidden (HTTP 403)");
		await expect(projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "comment", body: "Hi", then: "reopen" } })).rejects.toThrow("Only a closed");
	});
	it("edits the description and only comments GitHub lets the viewer edit, by kind", async () => {
		await projectPullRequestAction("/owned", { number: 12, headOid: "c".repeat(40), action: { type: "body", body: "New body" } });
		expect(ports.calls[1]).toMatchObject({ args: ["api", "--hostname", "github.com", "--method", "PATCH", "repos/owned/repo/pulls/12", "-F", "body=@-"], input: "New body" });
		await expect(projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "update-comment", commentId: "IC_1", kind: "comment", body: "Edit" } })).rejects.toThrow("Only its author");
		ports.respond.mockReturnValue(JSON.stringify(response({ comments: { totalCount: 1, nodes: [{ id: "IC_1", author: { login: "fixture" }, body: "Hi", createdAt: "2026-10-02T01:00:00Z", viewerCanUpdate: true }] } })));
		await projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "update-comment", commentId: "IC_1", kind: "comment", body: "Edit" } });
		expect(ports.calls.at(-2)).toMatchObject({ args: expect.arrayContaining(["-f", "id=IC_1", "-F", "body=@-"]), input: "Edit" });
		expect(ports.calls.at(-2)!.args.join(" ")).toContain("updateIssueComment");
		await expect(projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "update-comment", commentId: "IC_1", kind: "review-comment", body: "Edit" } })).rejects.toThrow("no longer");
	});
	it("rebases, reverts a merged pull request and approves waiting workflow runs", async () => {
		await projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "update-branch", method: "rebase" } });
		expect(ports.calls[1].args.join(" ")).toContain("updateMethod:REBASE");
		await expect(projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "revert" } })).rejects.toThrow("Only a merged");
		ports.respond.mockImplementation((args: string[]) => args.join(" ").includes("revertPullRequest") ? JSON.stringify({ data: { revertPullRequest: { revertPullRequest: { url: "https://github.com/owned/repo/pull/13" } } } }) : JSON.stringify(response({ state: "MERGED" })));
		expect((await projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "revert" } })).revertUrl).toBe("https://github.com/owned/repo/pull/13");
		ports.respond.mockReset();
		ports.respond.mockReturnValue(JSON.stringify(response({ commits: { nodes: [{ commit: { statusCheckRollup: { contexts: { nodes: [1, 2, 3].map(index => ({ __typename: "CheckRun", name: `ci ${index}`, status: "COMPLETED", conclusion: "ACTION_REQUIRED", detailsUrl: `https://github.com/owned/repo/actions/runs/${index === 3 ? 1 : index}/job/9` })) } } } }] } })));
		ports.calls.length = 0;
		await projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "approve-workflows" } });
		expect(ports.calls.slice(1, 3).map(call => call.args.at(-1))).toEqual(["repos/owned/repo/actions/runs/1/approve", "repos/owned/repo/actions/runs/2/approve"]);
	});
	it("reads startLine, edit rights and a cursor for a thread's further comments", () => {
		const view = parsePullRequestView("owned/repo", 12, response({ reviewThreads: { totalCount: 1, nodes: [{ id: "T_1", path: "src/x.ts", line: 6, startLine: 4, originalLine: 6, diffSide: "RIGHT", isResolved: false, comments: { totalCount: 30, pageInfo: { hasNextPage: true, endCursor: "Y3Vyc29y" }, nodes: [{ id: "C_1", author: { login: "approver" }, body: "Nit", createdAt: "2026-10-03T01:00:00Z", viewerCanUpdate: true }] } }] } }));
		expect(view.threads[0]).toMatchObject({ startLine: 4, line: 6, commentsCursor: "Y3Vyc29y", totalComments: 30, comments: [{ canEdit: true }] });
	});
	it("surfaces GitHub's reason inline", async () => {
		ports.respond.mockReturnValueOnce(JSON.stringify(response())).mockImplementationOnce(() => { throw Object.assign(new Error("x"), { stderr: "gh: Pull Request is not mergeable (HTTP 405)" }); });
		await expect(projectPullRequestAction("/owned", { number: 12, headOid: head, action: { type: "merge", method: "rebase" } })).rejects.toThrow("Could not merge. GitHub said: Pull Request is not mergeable (HTTP 405)");
	});
});
