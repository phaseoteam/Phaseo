import { beforeEach, describe, expect, it, vi } from "vitest";
const ports = vi.hoisted(() => ({ git: vi.fn() }));
vi.mock("./gitProcess", () => ({ git: ports.git }));
import { listPullRequestDirectory, parseDirectoryEntry, parseDirectoryPage } from "./pullRequestDirectory";

const node = (overrides: Record<string, unknown> = {}) => ({ number: 7, title: "Add the page", url: "javascript:evil", state: "OPEN", isDraft: false, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", author: { login: "octo", avatarUrl: "https://avatars.githubusercontent.com/u/1", __typename: "User" }, headRefName: "feature", baseRefName: "main", headRefOid: "a".repeat(40), additions: 10, deletions: 2, reviewDecision: "APPROVED", mergeable: "MERGEABLE", repository: { nameWithOwner: "team/app" }, labels: { nodes: [{ name: "bug", color: "d73a4a" }, { name: "bad", color: "nothex" }] }, reviewRequests: { nodes: [{ requestedReviewer: { __typename: "User", login: "Me" } }] }, commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] }, ...overrides });
const page = (nodes: unknown[], next?: string) => JSON.stringify({ data: { viewer: { login: "me" }, search: { issueCount: nodes.length, pageInfo: { hasNextPage: Boolean(next), endCursor: next ?? null }, nodes } } });
const projectFor = (repository: string) => repository.toLowerCase() === "team/app" ? "project-1" : undefined;

describe("pull request directory", () => {
	beforeEach(() => { vi.clearAllMocks(); ports.git.mockImplementation(async (directory: string) => directory === "/app" || directory === "/app-copy" ? "git@github.com:team/app.git\n" : directory === "/lib" ? "https://github.com/team/lib\n" : "https://gitlab.com/team/other\n"); });

	it("parses a search result into a row with a canonical link and the viewer's review request", () => {
		expect(parseDirectoryEntry(node(), projectFor, "me")).toMatchObject({ projectId: "project-1", repository: "team/app", number: 7, url: "https://github.com/team/app/pull/7", state: "open", review: "approved", checks: "passing", mergeable: "MERGEABLE", viewerReviewRequested: true, labels: [{ name: "bug", color: "d73a4a" }, { name: "bad" }], author: { login: "octo" } });
		expect(parseDirectoryEntry(node({ commits: { nodes: [{ commit: { statusCheckRollup: null } }] } }), projectFor)?.checks).toBe("none");
		expect(parseDirectoryEntry(node({ reviewRequests: { nodes: [] } }), projectFor, "me")?.viewerReviewRequested).toBe(false);
	});
	it.each([{ repository: { nameWithOwner: "other/repo" } }, { number: 0 }, { headRefOid: "nope" }, { state: "DRAFT" }, { updatedAt: "never" }, { repository: { nameWithOwner: "../x" } }])("drops malformed or foreign rows %#", overrides => { expect(parseDirectoryEntry(node(overrides), projectFor)).toBeUndefined(); });
	it("reads a page and its cursor, and refuses an errored answer", () => {
		expect(parseDirectoryPage(JSON.parse(page([node()], "next=")), projectFor)).toMatchObject({ viewer: "me", next: "next=", entries: [{ number: 7 }] });
		expect(() => parseDirectoryPage({ errors: [{ message: "bad" }] }, projectFor)).toThrow("could not run");
		expect(() => parseDirectoryPage({ data: {} }, projectFor)).toThrow("incomplete");
	});

	it("searches every GitHub project once, files shared repositories under the first, and names projects it cannot read", async () => {
		const read = vi.fn(async (_cwd: string, args: string[]) => args.some(arg => arg.includes("repo:team/lib")) ? page([node({ number: 3, repository: { nameWithOwner: "team/lib" }, updatedAt: "2026-10-03T00:00:00Z" })]) : page([]));
		const projects = [{ id: "app", directory: "/app" }, { id: "app-copy", directory: "/app-copy" }, { id: "lib", directory: "/lib" }, { id: "other", directory: "/other" }, { id: "tree", directory: "/app", worktree: {} }];
		const result = await listPullRequestDirectory(projects, { state: "open", text: "", filters: { labels: [["bug"]] }, limit: 100 }, read);
		expect(read).toHaveBeenCalledTimes(1);
		const query = read.mock.calls[0][1].find(arg => arg.startsWith("q="))!;
		expect(query).toBe("q=is:pr archived:false repo:team/app repo:team/lib is:open label:bug sort:updated-desc");
		expect(result.entries).toEqual([expect.objectContaining({ projectId: "lib", number: 3 })]);
		expect(result.errors).toEqual([{ projectId: "other", message: "This project has no github.com origin remote." }]);
		expect(result.viewer).toBe("me");
	});
	it("pages up to the limit and reports that more remain", async () => {
		const read = vi.fn().mockResolvedValueOnce(page([node({ number: 1 })], "c1")).mockResolvedValueOnce(page([node({ number: 2 })], "c2"));
		const result = await listPullRequestDirectory([{ id: "app", directory: "/app" }], { state: "all", text: "", filters: {}, limit: 200 }, read);
		expect(read).toHaveBeenCalledTimes(2);
		expect(read.mock.calls[1][1]).toEqual(expect.arrayContaining(["after=c1", "first=100"]));
		expect(result).toMatchObject({ truncated: true, entries: [{ number: 1 }, { number: 2 }] });
	});
	it("keeps sign-in failures to a readable message per project", async () => {
		const read = vi.fn().mockRejectedValue(Object.assign(new Error("gh failed"), { stderr: "gh: HTTP 401: Bad credentials ghp_secretsecretsecret (HTTP 401)" }));
		const result = await listPullRequestDirectory([{ id: "app", directory: "/app" }], { state: "open", text: "", filters: {} }, read);
		expect(result.entries).toEqual([]);
		expect(result.errors[0].message).toContain("Could not load pull requests");
		expect(result.errors[0].message).not.toContain("ghp_secret");
	});
	it("narrows to one project and validates the request", async () => {
		const read = vi.fn().mockResolvedValue(page([]));
		await listPullRequestDirectory([{ id: "app", directory: "/app" }, { id: "lib", directory: "/lib" }], { state: "merged", text: "", filters: {}, projectId: "lib" }, read);
		expect(read.mock.calls[0][1].find((arg: string) => arg.startsWith("q="))).toBe("q=is:pr archived:false repo:team/lib is:merged sort:updated-desc");
		await expect(listPullRequestDirectory([], { state: "everything" }, read)).rejects.toThrow("state");
	});
});
