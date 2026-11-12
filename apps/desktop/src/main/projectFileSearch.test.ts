import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { rankProjectPaths, searchProjectFiles } from "./projectFileSearch";

const files = ["README.md", "src/main/index.ts", "src/renderer/chat/Composer.tsx", "src/renderer/chat/ComposerMenu.tsx", "docs/composer.md", "src/shared/workspace.ts"];

describe("rankProjectPaths", () => {
	it("ranks exact and prefix name matches before path and fuzzy matches", () => {
		expect(rankProjectPaths(files, "composer.tsx").map(file => file.path)[0]).toBe("src/renderer/chat/Composer.tsx");
		expect(rankProjectPaths(files, "compo").map(file => file.path)).toEqual(["docs/composer.md", "src/renderer/chat/Composer.tsx", "src/renderer/chat/ComposerMenu.tsx"]);
		expect(rankProjectPaths(files, "srcwork").map(file => file.path)).toEqual(["src/shared/workspace.ts"]);
		expect(rankProjectPaths(files, "nothing-like-this")).toEqual([]);
	});
	it("offers folders and caps the result count", () => {
		expect(rankProjectPaths(files, "chat")).toContainEqual({ name: "chat", path: "src/renderer/chat", directory: true });
		expect(rankProjectPaths(files, "", 2)).toEqual([{ name: "README.md", path: "README.md", directory: false }, { name: "src", path: "src", directory: true }]);
	});
});

describe("searchProjectFiles", () => {
	it("lists tracked and untracked files but not ignored ones, with or without Git", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-file-search-"));
		try {
			mkdirSync(path.join(root, "src")); mkdirSync(path.join(root, "node_modules"));
			writeFileSync(path.join(root, "src", "tracked.ts"), ""); writeFileSync(path.join(root, "node_modules", "dependency.ts"), "");
			expect((await searchProjectFiles(root, "ts")).map(file => file.path)).toEqual(["src/tracked.ts"]);
			const git = (args: string[]) => execFileSync("git", args, { cwd: path.join(root, "src"), windowsHide: true, stdio: "pipe" });
			const repository = path.join(root, "src");
			git(["init", "-b", "fixture"]); writeFileSync(path.join(repository, ".gitignore"), "ignored.ts\n"); writeFileSync(path.join(repository, "ignored.ts"), ""); writeFileSync(path.join(repository, "untracked.ts"), "");
			git(["add", "tracked.ts"]);
			expect((await searchProjectFiles(repository, ".ts")).map(file => file.path).toSorted()).toEqual(["tracked.ts", "untracked.ts"]);
			await expect(searchProjectFiles(repository, "x".repeat(501))).rejects.toThrow("Invalid file search.");
		} finally { rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	});
});
