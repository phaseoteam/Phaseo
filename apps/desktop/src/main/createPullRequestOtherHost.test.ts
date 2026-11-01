import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CodeHostProvider } from "./codeHosts/common";

const create = vi.fn(async (_request: { head: string; base: string; title: string; body: string }) => ({ number: 7, url: "https://gitlab.com/owned/repo/-/merge_requests/7" }));
vi.mock("./codeHosts", () => ({ codeHostProvider: async () => ({ remote: { repository: "owned/repo" }, forBranch: async () => null, create }) as unknown as CodeHostProvider }));
const { createPullRequest } = await import("./createPullRequest");

describe("creating a merge request on another code host", () => {
	it("uses the writer's title and description, and the commits when it has none", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-create-mr-")), git = (cwd: string, args: string[]) => execFileSync("git", args, { cwd, windowsHide: true, stdio: "pipe" }).toString().trim();
		try {
			const origin = path.join(directory, "origin.git"), root = path.join(directory, "root");
			git(directory, ["init", "--bare", "-b", "main", origin]);
			mkdirSync(root); git(root, ["init", "-b", "main"]); git(root, ["config", "user.name", "Fixture"]); git(root, ["config", "user.email", "fixture@example.invalid"]); git(root, ["config", "commit.gpgsign", "false"]);
			writeFileSync(path.join(root, "a.txt"), "a\n"); git(root, ["add", "."]); git(root, ["commit", "-m", "Base"]); git(root, ["remote", "add", "origin", origin]); git(root, ["push", "-u", "origin", "main"]);
			git(root, ["remote", "set-head", "origin", "main"]);
			git(root, ["switch", "-c", "feature/m"]); writeFileSync(path.join(root, "m.txt"), "m\n"); git(root, ["add", "."]); git(root, ["commit", "-m", "Add m"]);
			const result = await createPullRequest(root, undefined, async context => context.branch === "feature/m" ? { title: "Add m", body: "Adds m.", model: "openai/gpt-6-mini" } : undefined);
			expect(result).toMatchObject({ repository: "owned/repo", number: 7, status: "created", writtenBy: "openai/gpt-6-mini" });
			expect(create).toHaveBeenLastCalledWith({ head: "feature/m", base: "main", title: "Add m", body: "Adds m." });
			expect(await createPullRequest(root, undefined, async () => { throw new Error("offline"); })).not.toHaveProperty("writtenBy");
			expect(create).toHaveBeenLastCalledWith({ head: "feature/m", base: "main", title: "Add m", body: "" });
		} finally { rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	}, 30000);
});
