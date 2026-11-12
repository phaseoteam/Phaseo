import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { findClones, githubRepoOf, originOf } from "./clones";

const origin = (url: string) => `[core]\n\tbare = false\n[remote "origin"]\n\turl = ${url}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n[branch "main"]\n\tremote = origin\n`;

describe("finding local clones", () => {
	it("reads owner/name from GitHub remotes", () => {
		expect(githubRepoOf("https://github.com/o/r.git")).toBe("o/r");
		expect(githubRepoOf("git@github.com:o/r.js.git\n")).toBe("o/r.js");
		expect(githubRepoOf("https://gitlab.com/o/r.git")).toBeNull();
		expect(originOf(origin("https://github.com/o/r"))).toBe("o/r");
		expect(originOf(`[remote "upstream"]\n\turl = https://github.com/u/r\n`)).toBeNull();
	});

	const home = mkdtemp(path.join(os.tmpdir(), "factory-clones-"));
	afterAll(async () => rm(await home, { recursive: true, force: true }));

	it("finds clones in the usual folders and the ones coding tools remember, but not worktrees", async () => {
		const dir = await home;
		const clone = async (folder: string, url: string) => {
			await mkdir(path.join(dir, folder, ".git"), { recursive: true });
			await writeFile(path.join(dir, folder, ".git", "config"), origin(url));
		};
		await clone("code/factory-test-usual", "https://github.com/factory-test/usual.git");
		await clone("elsewhere/deep/down/factory-test-remembered", "git@github.com:factory-test/remembered.git");
		await mkdir(path.join(dir, "code", "factory-test-worktree"), { recursive: true });
		await writeFile(path.join(dir, "code", "factory-test-worktree", ".git"), "gitdir: somewhere/.git/worktrees/x\n");
		// Claude Code remembers a folder inside the clone, not its root.
		await writeFile(path.join(dir, ".claude.json"), JSON.stringify({ projects: { [path.join(dir, "elsewhere/deep/down/factory-test-remembered/src")]: {} } }));

		const found = (await findClones(dir)).filter((entry) => entry.repo.startsWith("factory-test/"));
		expect(found.sort((a, b) => a.repo.localeCompare(b.repo))).toEqual([
			{ repo: "factory-test/remembered", path: path.join(dir, "elsewhere/deep/down/factory-test-remembered").replace(/^[a-z]:/, (drive) => drive.toUpperCase()) },
			{ repo: "factory-test/usual", path: path.join(dir, "code/factory-test-usual").replace(/^[a-z]:/, (drive) => drive.toUpperCase()) },
		]);
	});
});
