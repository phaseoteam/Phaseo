import { describe, expect, it } from "vitest";
import { parseCodeHostRemote } from "../../shared/codeHosts";
import { azureProvider } from "./azure";
import { bitbucketProvider } from "./bitbucket";
import { forgejoProvider } from "./forgejo";
import { gitlabProvider } from "./gitlab";
import { CodeHostError, type HostRequest } from "./transport";

const head = "a".repeat(40), base = "b".repeat(40);
/** Answers recorded-style responses by "METHOD path" (query string ignored) and keeps every write it was asked for. */
function fake(routes: Record<string, unknown>) {
	const writes: { method: string; path: string; body: unknown }[] = [];
	const request: HostRequest = async (method, path, body) => {
		const key = `${method} ${path.split("?")[0]}`;
		if (method !== "GET") { writes.push({ method, path, body }); return routes[key] ?? {}; }
		if (!(key in routes)) throw new CodeHostError("HTTP 404", 404);
		return routes[key];
	};
	return { request, writes };
}

describe("GitLab", () => {
	const remote = parseCodeHostRemote("git@gitlab.com:group/sub/app.git")!;
	const project = "projects/group%2Fsub%2Fapp", mr = `${project}/merge_requests/7`;
	const listed = { id: 900, iid: 7, title: "Draft: Add search", author: { username: "ada", avatar_url: "https://gitlab.com/a.png" }, draft: true, source_branch: "feature/search", target_branch: "main", updated_at: "2026-10-30T10:00:00Z", created_at: "2026-10-29T10:00:00Z", sha: head, detailed_merge_status: "not_approved", state: "opened" };
	const detail = { ...listed, description: "Body", diff_refs: { head_sha: head, base_sha: base }, head_pipeline: { id: 55, status: "failed", web_url: "https://gitlab.com/p/55" }, changes_count: "3", has_conflicts: false, user: { can_merge: true }, labels: ["ui"], reviewers: [{ username: "bob" }, { username: "cy" }], source_project_id: 1, target_project_id: 1 };
	const routes = {
		[`GET ${project}/merge_requests`]: [listed],
		[`GET ${mr}`]: detail,
		[`GET ${mr}/approvals`]: { approved_by: [{ user: { username: "bob" } }], approvals_left: 1 },
		[`GET ${mr}/notes`]: [{ id: 1, body: "added 1 commit", system: true, created_at: "2026-10-30T10:00:00Z", author: { username: "ada" } }, { id: 2, body: "Looks good", system: false, type: "DiffNote", position: { new_path: "src/a.ts" }, created_at: "2026-10-30T11:00:00Z", author: { username: "bob" } }],
		[`GET ${mr}/commits`]: [{ id: head, title: "Second", committed_date: "2026-10-30T09:00:00Z", author_name: "Ada" }, { id: base, title: "First", committed_date: "2026-10-29T09:00:00Z", author_name: "Ada" }],
		"GET user": { username: "ada" },
		[`GET ${project}`]: { squash_option: "default_off" },
		[`GET ${project}/pipelines/55/jobs`]: [{ name: "test", stage: "test", status: "failed", web_url: "https://gitlab.com/j/1" }, { name: "lint", stage: "test", status: "failed", allow_failure: true }, { name: "deploy", stage: "deploy", status: "manual" }],
	};

	it("lists open merge requests as rows", async () => {
		const page = await gitlabProvider(remote, fake(routes).request).list();
		expect(page.requests).toEqual([expect.objectContaining({ number: 7, url: "https://gitlab.com/group/sub/app/-/merge_requests/7", author: "ada", draft: true, head: "feature/search", review: "required", checks: "unknown", headOid: head })]);
		expect(page.limitReached).toBe(false);
	});

	it("reads a merge request with its pipeline, approvals and notes", async () => {
		const view = await gitlabProvider(remote, fake(routes).request).view(7);
		expect(view).toMatchObject({ state: "OPEN", headOid: head, baseOid: base, changedFiles: 3, statsUnknown: true, review: "required", checks: "failed", mergeMethods: ["merge", "squash"], labels: [{ name: "ui" }], viewer: { login: "ada", canMerge: true } });
		expect(view.checkRuns.map(check => [check.name, check.status])).toEqual([["test / test", "failure"], ["test / lint", "neutral"], ["deploy / deploy", "action-required"]]);
		expect(view.reviews).toEqual([{ actor: { login: "bob" }, state: "APPROVED", submittedAt: "" }]);
		expect(view.reviewers.map(actor => actor.login)).toEqual(["cy"]);
		expect(view.comments).toEqual([expect.objectContaining({ id: "2", kind: "review-comment", path: "src/a.ts", body: "Looks good" })]);
		expect(view.commits.map(entry => entry.headline)).toEqual(["First", "Second"]);
	});

	it("merges with a head guard, and keeps the draft marker when retitling", async () => {
		const host = fake(routes), provider = gitlabProvider(remote, host.request), view = await provider.view(7);
		await provider.act({ ...view, draft: false }, { type: "merge", method: "squash" });
		await provider.act(view, { type: "title", title: "Add search box" });
		await provider.act(view, { type: "ready" });
		await provider.act(view, { type: "comment", body: "Closing", then: "close" });
		expect(host.writes).toEqual([
			{ method: "PUT", path: `${mr}/merge`, body: { sha: head, squash: true } },
			{ method: "PUT", path: mr, body: { title: "Draft: Add search box" } },
			{ method: "PUT", path: mr, body: { title: "Add search" } },
			{ method: "POST", path: `${mr}/notes`, body: { body: "Closing" } },
			{ method: "PUT", path: mr, body: { state_event: "close" } },
		]);
		await expect(provider.act(view, { type: "merge", method: "merge" })).rejects.toThrow(/ready for review/);
		await expect(provider.act(view, { type: "review", event: "request-changes", body: "no" })).rejects.toThrow(/request-changes/);
	});

	it("finds the branch's merge request and creates one", async () => {
		const host = fake({ ...routes, [`POST ${project}/merge_requests`]: { iid: 8 } }), provider = gitlabProvider(remote, host.request);
		expect(await provider.forBranch("feature/search")).toEqual({ repository: "group/sub/app", number: 7, url: "https://gitlab.com/group/sub/app/-/merge_requests/7", title: "Draft: Add search", state: "OPEN", draft: true });
		expect(await provider.create({ head: "x", base: "main", title: "T", body: "B" })).toEqual({ number: 8, url: "https://gitlab.com/group/sub/app/-/merge_requests/8" });
		expect(host.writes[0].body).toMatchObject({ source_branch: "x", target_branch: "main", title: "T", description: "B" });
	});
});

describe("Forgejo", () => {
	const remote = parseCodeHostRemote("https://codeberg.org/someone/thing.git")!;
	const repo = "repos/someone/thing";
	const pull = { id: 5, number: 3, title: "WIP: Fix", html_url: "https://codeberg.org/someone/thing/pulls/3", user: { login: "ada", avatar_url: "https://codeberg.org/a.png" }, head: { ref: "fix", sha: head, repo: { full_name: "someone/thing" } }, base: { ref: "main", sha: base, repo: { full_name: "someone/thing" } }, state: "open", merged: false, mergeable: true, updated_at: "2026-10-30T10:00:00Z", created_at: "2026-10-29T10:00:00Z", additions: 10, deletions: 2, changed_files: 1, body: "B", labels: [{ name: "bug", color: "ee0701" }] };
	const routes = {
		[`GET ${repo}/pulls`]: [pull], [`GET ${repo}/pulls/3`]: pull,
		[`GET ${repo}/commits/${head}/status`]: { statuses: [{ context: "ci/woodpecker", status: "success", target_url: "https://ci.example/1" }] },
		[`GET ${repo}/pulls/3/reviews`]: [{ user: { login: "bob" }, state: "REQUEST_CHANGES", submitted_at: "2026-10-30T09:00:00Z" }, { user: { login: "bob" }, state: "COMMENT", submitted_at: "2026-10-30T09:30:00Z" }],
		[`GET ${repo}/issues/3/comments`]: [{ id: 9, user: { login: "bob" }, body: "Hm", created_at: "2026-10-30T09:00:00Z", updated_at: "2026-10-30T09:00:00Z", html_url: "https://codeberg.org/x#issuecomment-9" }],
		[`GET ${repo}/pulls/3/commits`]: [{ sha: head, commit: { message: "Fix it\n\nbody", author: { name: "Ada", date: "2026-10-30T08:00:00Z" } }, author: { login: "ada" } }],
		[`GET ${repo}`]: { permissions: { push: true }, allow_rebase: false },
		"GET user": { login: "ada" },
	};
	it("reads a pull request, its statuses and the latest verdicts", async () => {
		const provider = forgejoProvider(remote, fake(routes).request);
		expect((await provider.list()).requests[0]).toMatchObject({ number: 3, draft: true, url: "https://codeberg.org/someone/thing/pull/3" });
		const view = await provider.view(3);
		expect(view).toMatchObject({ additions: 10, deletions: 2, mergeable: "MERGEABLE", review: "changes-requested", checks: "passing", mergeMethods: ["merge", "squash"], labels: [{ name: "bug", color: "ee0701" }], viewer: { canMerge: true } });
		expect(view.statsUnknown).toBeUndefined();
		expect(view.commits).toEqual([expect.objectContaining({ headline: "Fix it" })]);
	});
	it("merges with head_commit_id and reviews", async () => {
		const host = fake(routes), provider = forgejoProvider(remote, host.request), view = { ...await provider.view(3), draft: false };
		await provider.act(view, { type: "merge", method: "merge" });
		await provider.act(view, { type: "review", event: "approve", body: "" });
		await expect(provider.act(view, { type: "merge", method: "rebase" })).rejects.toThrow(/merge method/);
		expect(host.writes).toEqual([{ method: "POST", path: `${repo}/pulls/3/merge`, body: { Do: "merge", head_commit_id: head } }, { method: "POST", path: `${repo}/pulls/3/reviews`, body: { event: "APPROVED", body: "", commit_id: head } }]);
	});
});

describe("Bitbucket", () => {
	const remote = parseCodeHostRemote("git@bitbucket.org:ws/repo.git")!;
	const repo = "repositories/ws/repo", pr = `${repo}/pullrequests/4`;
	const entry = { id: 4, title: "Tidy", author: { nickname: "ada", links: { avatar: { href: "https://bb/a.png" } } }, source: { branch: { name: "tidy" }, commit: { hash: "aaaaaaaaaaaa" } }, destination: { branch: { name: "main" }, commit: { hash: "bbbbbbbbbbbb" } }, updated_on: "2026-10-30T10:00:00Z", created_on: "2026-10-29T10:00:00Z", state: "OPEN", summary: { raw: "Body" }, participants: [{ user: { nickname: "bob" }, approved: true, participated_on: "2026-10-30T09:00:00Z" }], reviewers: [{ nickname: "bob" }, { nickname: "cy" }] };
	const routes = {
		[`GET ${repo}/pullrequests`]: { values: [entry] }, [`GET ${pr}`]: entry,
		[`GET ${repo}/commit/aaaaaaaaaaaa`]: { hash: head }, [`GET ${repo}/commit/bbbbbbbbbbbb`]: { hash: base },
		[`GET ${pr}/statuses`]: { values: [{ key: "build", name: "Build", state: "INPROGRESS", url: "https://ci/1" }] },
		[`GET ${pr}/comments`]: { values: [{ id: 1, content: { raw: "Inline" }, inline: { path: "a.ts" }, created_on: "2026-10-30T09:00:00Z", user: { nickname: "bob" } }, { id: 2, deleted: true, content: { raw: "" }, created_on: "2026-10-30T09:00:00Z" }] },
		[`GET ${pr}/commits`]: { values: [{ hash: head, message: "Tidy up", date: "2026-10-30T08:00:00Z", author: { raw: "Ada <ada@example.com>" } }] },
		[`GET ${pr}/diffstat`]: { values: [{ lines_added: 4, lines_removed: 1, status: "modified" }, { lines_added: 2, lines_removed: 0, status: "added" }] },
		"GET user/permissions/repositories": { values: [{ permission: "write" }] },
		"GET user": { nickname: "ada" },
	};
	it("resolves full commits and counts lines from the diffstat", async () => {
		const view = await bitbucketProvider(remote, fake(routes).request).view(4);
		expect(view).toMatchObject({ headOid: head, baseOid: base, additions: 6, deletions: 1, changedFiles: 2, mergeable: "MERGEABLE", review: "approved", checks: "pending", viewer: { canMerge: true } });
		expect(view.reviewers.map(actor => actor.login)).toEqual(["cy"]);
		expect(view.comments).toEqual([expect.objectContaining({ kind: "review-comment", path: "a.ts" })]);
		expect(view.commits[0].authors).toEqual([{ login: "Ada" }]);
	});
	it("re-reads the head before merging, because Bitbucket has no guard", async () => {
		const host = fake(routes), provider = bitbucketProvider(remote, host.request), view = await provider.view(4);
		await provider.act(view, { type: "merge", method: "squash" });
		expect(host.writes).toEqual([{ method: "POST", path: `${pr}/merge`, body: { merge_strategy: "squash" } }]);
		await expect(provider.act({ ...view, headOid: "c".repeat(40) }, { type: "merge", method: "merge" })).rejects.toThrow(/changed/);
		await expect(provider.act(view, { type: "comment", body: "x", then: "reopen" })).rejects.toThrow(/reopen/);
	});
});

describe("Azure DevOps", () => {
	const remote = parseCodeHostRemote("https://dev.azure.com/org/proj/_git/repo")!;
	const api = (path: string) => `proj/_apis/git/repositories/repo/${path}`;
	const entry = { pullRequestId: 12, title: "Ship", createdBy: { uniqueName: "ada@example.com", displayName: "Ada" }, isDraft: false, sourceRefName: "refs/heads/ship", targetRefName: "refs/heads/main", creationDate: "2026-10-29T10:00:00Z", status: "active", mergeStatus: "conflicts", reviewers: [{ uniqueName: "bob@example.com", vote: -10 }, { uniqueName: "cy@example.com", vote: 0, isRequired: true }], lastMergeSourceCommit: { commitId: head }, lastMergeTargetCommit: { commitId: base }, description: "B" };
	const routes = {
		[`GET ${api("pullrequests")}`]: { value: [entry] }, [`GET ${api("pullrequests/12")}`]: entry,
		[`GET ${api("pullrequests/12/statuses")}`]: { value: [{ state: "pending", context: { genre: "ci", name: "build" } }, { state: "succeeded", context: { genre: "ci", name: "build" } }] },
		[`GET ${api("pullrequests/12/threads")}`]: { value: [{ id: 1, comments: [{ id: 1, content: "Voted", commentType: "system", publishedDate: "2026-10-30T09:00:00Z" }] }, { id: 2, threadContext: { filePath: "/src/a.ts" }, comments: [{ id: 1, content: "Why?", commentType: "text", publishedDate: "2026-10-30T09:00:00Z", author: { uniqueName: "bob@example.com" } }] }] },
		[`GET ${api("pullrequests/12/commits")}`]: { value: [] },
		"GET _apis/connectionData": { authenticatedUser: { id: "user-1", providerDisplayName: "Ada" } },
	};
	it("reads votes, the latest status per check and text comments only", async () => {
		const view = await azureProvider(remote, fake(routes).request).view(12);
		expect(view).toMatchObject({ number: 12, head: "ship", base: "main", mergeable: "CONFLICTING", review: "changes-requested", checks: "passing", statsUnknown: true, url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/12" });
		expect(view.comments).toEqual([expect.objectContaining({ id: "2-1", kind: "review-comment", path: "src/a.ts" })]);
		expect(view.reviewers.map(actor => actor.login)).toEqual(["cy@example.com"]);
	});
	it("completes with the head it saw and votes as the signed-in person", async () => {
		const host = fake(routes), provider = azureProvider(remote, host.request), view = await provider.view(12);
		await provider.act(view, { type: "merge", method: "squash" });
		await provider.act(view, { type: "review", event: "approve", body: "" });
		expect(host.writes).toEqual([
			{ method: "PATCH", path: `${api("pullrequests/12")}?api-version=7.1`, body: { status: "completed", lastMergeSourceCommit: { commitId: head }, completionOptions: { mergeStrategy: "squash" } } },
			{ method: "PUT", path: `${api("pullrequests/12/reviewers/user-1")}?api-version=7.1`, body: { vote: 10 } },
		]);
	});
});
