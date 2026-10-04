import { beforeEach, describe, expect, it, vi } from "vitest";
const ports = vi.hoisted(() => ({ git: vi.fn(), resolve: vi.fn(), execute: vi.fn() }));
vi.mock("./gitProcess", () => ({ git: ports.git }));
vi.mock("./nativeProcess", () => ({ resolveNativeCommand: ports.resolve }));
vi.mock("node:util", () => ({ promisify: () => ports.execute }));
import { githubRepository, parsePullRequests, projectPullRequests } from "./projectPullRequests";

const entry = { number: 12, title: "Keep <untrusted> 世界", author: { login: "fixture" }, isDraft: true, headRefName: "feature/fixture", baseRefName: "main", updatedAt: "2026-10-04T00:00:00Z", reviewDecision: "REVIEW_REQUIRED", statusCheckRollup: [] };
const response = (nodes: unknown[], hasNextPage = false) => ({ data: { repository: { pullRequests: { nodes: nodes.map(entry => ({ ...entry as object, commits: { nodes: [{ commit: { statusCheckRollup: null } }] } })), pageInfo: { hasNextPage } } } } });
describe("GitHub project pull requests", () => {
	beforeEach(() => { vi.clearAllMocks(); ports.git.mockResolvedValue("git@github.com:phaseoteam/Phaseo.git\n"); ports.resolve.mockResolvedValue({ executable: "/owned/gh", prefix: [] }); ports.execute.mockResolvedValue({ stdout: JSON.stringify(response([entry])) }); });
	it.each(["https://github.com/phaseoteam/Phaseo.git", "git@github.com:phaseoteam/Phaseo.git", "ssh://git@github.com/phaseoteam/Phaseo", "https://github.com/phaseoteam/Phaseo/"])("parses supported remote %s", remote => { expect(githubRepository(remote)).toBe("phaseoteam/Phaseo"); });
	it.each(["https://github.com.evil.test/team/repo", "https://user:secret@github.com/team/repo", "https://github.com/team/repo?token=secret", "file:///owned/repo", "git@other.test:team/repo", "https://github.com/../repo"])("rejects unsupported remote %s", remote => { expect(() => githubRepository(remote)).toThrow("github.com origin"); });
	it("uses explicit host and literal arguments with bounded noninteractive execution", async () => {
		const result = await projectPullRequests("/owned/repository");
		expect(ports.git).toHaveBeenCalledWith("/owned/repository", ["remote", "get-url", "origin"]);
		expect(ports.execute).toHaveBeenCalledWith("/owned/gh", expect.arrayContaining(["api", "graphql", "--hostname", "github.com", "-F", "owner=phaseoteam", "-F", "name=Phaseo"]), expect.objectContaining({ cwd: "/owned/repository", timeout: 20000, maxBuffer: 2097152, windowsHide: true, env: expect.objectContaining({ GH_PROMPT_DISABLED: "1", GH_DEBUG: "" }) }));
		expect(result.requests[0]).toMatchObject({ title: entry.title, url: "https://github.com/phaseoteam/Phaseo/pull/12", draft: true, review: "required", checks: "none" });
		expect(result.limitReached).toBe(false);
	});
	it("constructs canonical links and retains deleted-author records", () => { expect(parsePullRequests("team/repo", [{ ...entry, author: null, url: "javascript:evil" }])[0]).toMatchObject({ author: "Unknown author", url: "https://github.com/team/repo/pull/12" }); });
	it.each([
		[[{ state: "SUCCESS" }], "passing"], [[{ status: "COMPLETED", conclusion: "SKIPPED" }], "passing"],
		[[{ state: "SUCCESS" }, { status: "IN_PROGRESS" }], "pending"], [[{ state: "PENDING" }, { status: "COMPLETED", conclusion: "FAILURE" }], "failed"],
		[[{ state: "UNRECOGNIZED" }], "unknown"], [null, "unknown"],
	])("does not label incomplete or unknown checks as passing", (statusCheckRollup, expected) => { expect(parsePullRequests("team/repo", [{ ...entry, statusCheckRollup }])[0].checks).toBe(expected); });
	it.each([{}, [null], [{ ...entry, number: -1 }], [{ ...entry, updatedAt: "invalid" }], [{ ...entry, title: "x".repeat(2001) }], [entry, entry], Array.from({ length: 101 }, (_, index) => ({ ...entry, number: index + 1 }))])("rejects malformed or excessive lists", value => { expect(() => parsePullRequests("team/repo", value)).toThrow("invalid"); });
	it("reports a missing remote without running GitHub CLI", async () => { ports.git.mockRejectedValue(Error("private diagnostic")); await expect(projectPullRequests("/owned")).rejects.toThrow("origin remote"); expect(ports.execute).not.toHaveBeenCalled(); });
	it("reports CLI installation failures", async () => { ports.resolve.mockRejectedValue(Error("missing")); await expect(projectPullRequests("/owned")).rejects.toThrow("Install GitHub CLI"); });
	it("keeps authentication diagnostics out of renderer errors", async () => { ports.execute.mockRejectedValue(Error("secret fixture diagnostic")); await expect(projectPullRequests("/owned")).rejects.toThrow("Check GitHub CLI sign-in"); });
	it("rejects unreadable output", async () => { ports.execute.mockResolvedValue({ stdout: "not JSON" }); await expect(projectPullRequests("/owned")).rejects.toThrow("unreadable"); });
	it("rejects partial GraphQL responses instead of presenting partial success", async () => { ports.execute.mockResolvedValue({ stdout: JSON.stringify({ ...response([entry]), errors: [{ message: "partial fixture" }] }) }); await expect(projectPullRequests("/owned")).rejects.toThrow("incomplete"); });
	it("requires authoritative pagination metadata", async () => { ports.execute.mockResolvedValue({ stdout: JSON.stringify({ data: { repository: { pullRequests: { nodes: [entry] } } } }) }); await expect(projectPullRequests("/owned")).rejects.toThrow("incomplete"); });
	it("projects compact native check rollups", async () => { ports.execute.mockResolvedValue({ stdout: JSON.stringify({ data: { repository: { pullRequests: { nodes: [{ ...entry, commits: { nodes: [{ commit: { statusCheckRollup: { state: "PENDING" } } }] } }], pageInfo: { hasNextPage: false } } } } }) }); expect((await projectPullRequests("/owned")).requests[0].checks).toBe("pending"); });
	it("flags the server result limit without claiming the list is complete", async () => { ports.execute.mockResolvedValue({ stdout: JSON.stringify(response(Array.from({ length: 100 }, (_, index) => ({ ...entry, number: index + 1 })), true)) }); expect((await projectPullRequests("/owned")).limitReached).toBe(true); });
});
