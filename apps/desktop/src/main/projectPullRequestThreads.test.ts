import { beforeEach, describe, expect, it, vi } from "vitest";
const ports = vi.hoisted(() => ({ git: vi.fn(), resolve: vi.fn(), execute: vi.fn() }));
vi.mock("./gitProcess", () => ({ git: ports.git }));
vi.mock("./nativeProcess", () => ({ resolveNativeCommand: ports.resolve }));
vi.mock("node:util", () => ({ promisify: () => ports.execute }));
import { parsePullRequestThreads, projectPullRequestThreads } from "./projectPullRequestThreads";
import { validatePullRequestThreadsQuery } from "../shared/pullRequestThreads";
const query = { type: "threads" as const, number: 12, headOid: "a".repeat(40), baseOid: "b".repeat(40) };
const identity = { number: 12, headRefOid: query.headOid, baseRefOid: query.baseOid, repository: { nameWithOwner: "Owned/Repo" } };
const thread = { id: "PRRT_owned", path: "src/世界.ts", line: null, originalLine: 17, diffSide: "LEFT", isResolved: true, isOutdated: true, comments: { totalCount: 7 } };
const comment = { id: "PRRC_owned", author: { login: "reviewer" }, body: "Review **context**\n\n```ts\nconst x=1;\n```", createdAt: "2026-10-04T00:00:00Z" };
const connection = (nodes: unknown[], totalCount = nodes.length, cursor?: string) => ({ nodes, totalCount, pageInfo: { hasNextPage: Boolean(cursor), endCursor: cursor ?? null } });
const threads = (nodes: unknown[] = [thread], cursor?: string) => ({ data: { repository: { pullRequest: { ...identity, reviewThreads: connection(nodes, 21, cursor) } } } });
const comments = (nodes: unknown[] = [comment], cursor?: string) => ({ data: { node: { __typename: "PullRequestReviewThread", id: thread.id, pullRequest: identity, comments: connection(nodes, 7, cursor) } } });
const commentQuery = { ...query, type: "comments" as const, threadId: thread.id };
describe("project review threads", () => {
	beforeEach(() => { vi.clearAllMocks(); ports.git.mockResolvedValue("https://github.com/owned/repo.git"); ports.resolve.mockResolvedValue({ executable: "/owned/gh", prefix: [] }); ports.execute.mockResolvedValue({ stdout: JSON.stringify(threads([thread], "next")) }); });
	it("uses bounded literal GraphQL reads bound to the current origin and both commits", async () => {
		const result = await projectPullRequestThreads("/project", query);
		expect(result).toMatchObject({ type: "threads", total: 21, nextCursor: "next", threads: [{ id: thread.id, originalLine: 17, line: undefined, resolved: true, outdated: true, side: "LEFT", comments: 7 }] });
		expect(ports.execute).toHaveBeenCalledWith("/owned/gh", expect.arrayContaining(["api", "graphql", "--hostname", "github.com", "owner=owned", "name=repo", "number=12"]), expect.objectContaining({ cwd: "/project", windowsHide: true, timeout: 20000, maxBuffer: 8388608 }));
		expect(ports.execute.mock.lastCall![1].join(" ")).toContain("reviewThreads(first:20");
		expect(ports.execute.mock.lastCall![1].join(" ")).not.toContain("mutation");
	});
	it("pages full comments by original thread identity and retains deleted authors and Markdown", async () => {
		ports.execute.mockResolvedValue({ stdout: JSON.stringify(comments([{ ...comment, author: null }], "second")) });
		expect(await projectPullRequestThreads("/project", { ...commentQuery, cursor: "first" })).toMatchObject({ threadId: thread.id, type: "comments", nextCursor: "second", comments: [{ body: comment.body, author: "Deleted user" }] });
		expect(ports.execute.mock.lastCall![1]).toEqual(expect.arrayContaining([`id=${thread.id}`, "after=first"]));
		expect(ports.execute.mock.lastCall![1].join(" ")).toContain("comments(first:5");
	});
	it.each([null, [], {}, { ...query, number: 0 }, { ...query, headOid: "bad" }, { ...query, cursor: "" }, { ...query, cursor: "secret\nline" }, { ...query, cursor: "x".repeat(2049) }, { ...query, type: "other" }, { ...commentQuery, threadId: "bad\nidentity" }])("rejects invalid input before native reads", async value => {
		await expect(projectPullRequestThreads("/project", value)).rejects.toThrow("Invalid"); expect(ports.git).not.toHaveBeenCalled(); expect(ports.execute).not.toHaveBeenCalled();
	});
	it.each([{ number: 13 }, { repository: { nameWithOwner: "another/repo" } }, { headRefOid: "c".repeat(40) }, { baseRefOid: "c".repeat(40) }])("rejects unowned or changed list and comment snapshots", patch => {
		const listing = threads(); Object.assign(listing.data.repository.pullRequest, patch); expect(() => parsePullRequestThreads("owned/repo", query, listing)).toThrow();
		const replies = comments(); replies.data.node.pullRequest = { ...identity, ...patch }; expect(() => parsePullRequestThreads("owned/repo", commentQuery, replies)).toThrow();
	});
	it.each([null, {}, { data: {} }, { errors: [{ message: "private" }], ...threads() }])("rejects incomplete GraphQL responses", value => { expect(() => parsePullRequestThreads("owned/repo", query, value)).toThrow(); });
	it("rejects duplicate IDs, repeated cursors, oversized pages and invalid locations", () => {
		expect(() => parsePullRequestThreads("owned/repo", query, threads([thread, thread]))).toThrow("repeated");
		expect(() => parsePullRequestThreads("owned/repo", { ...query, cursor: "repeat" }, threads([thread], "repeat"))).toThrow("cursor");
		expect(() => parsePullRequestThreads("owned/repo", query, threads(Array.from({ length: 21 }, (_, index) => ({ ...thread, id: "ID" + index }))))).toThrow("page");
		for (const patch of [{ line: 0 }, { comments: { totalCount: -1 } }, { path: "bad\0path" }, { isResolved: "true" }, { diffSide: "BOTH" }]) expect(() => parsePullRequestThreads("owned/repo", query, threads([{ ...thread, ...patch }]))).toThrow();
	});
	it("rejects wrong node types/IDs and malformed or over-budget UTF-8 comments", () => {
		for (const patch of [{ id: "other" }, { __typename: "Issue" }]) { const value = comments(); Object.assign(value.data.node, patch); expect(() => parsePullRequestThreads("owned/repo", commentQuery, value)).toThrow("no longer available"); }
		for (const patch of [{ body: 42 }, { body: "😀".repeat(131073) }, { createdAt: "invalid" }, { author: {} }]) expect(() => parsePullRequestThreads("owned/repo", commentQuery, comments([{ ...comment, ...patch }]))).toThrow("invalid review comments");
		expect(() => parsePullRequestThreads("owned/repo", commentQuery, comments(Array.from({ length: 5 }, (_, index) => ({ ...comment, id: "C" + index, body: "x".repeat(512 * 1024) }))))).toThrow("2 MiB");
	});
	it("returns terminal empty pages and normalizes commit input without forwarding extra fields", () => {
		expect(parsePullRequestThreads("owned/repo", query, threads([]))).toMatchObject({ threads: [], nextCursor: undefined });
		expect(validatePullRequestThreadsQuery({ ...query, headOid: query.headOid.toUpperCase(), token: "private" })).toEqual({ ...query, cursor: undefined });
	});
	it("keeps native errors private", async () => { ports.execute.mockRejectedValue(Error("private token")); await expect(projectPullRequestThreads("/project", query)).rejects.toThrow("Check GitHub CLI sign-in"); });
	it("rejects a changed origin after a successful read", async () => {
		ports.git.mockResolvedValueOnce("https://github.com/owned/repo.git").mockResolvedValueOnce("https://github.com/other/repo.git");
		await expect(projectPullRequestThreads("/project", query)).rejects.toThrow("repository changed");
	});
});
