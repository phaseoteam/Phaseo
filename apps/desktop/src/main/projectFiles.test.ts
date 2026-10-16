import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { gitReview, listProjectFiles, parseGitStatus, readFilePreview, readProjectFile, resolveProjectPath } from "./projectFiles";
import { projectTree } from "./projectFileSearch";
import { contentHash } from "./projectEdits";

describe("project boundaries", () => {
	it("parses NUL-delimited rename and unusual filename records", () => {
		expect(parseGitStatus("R  new name.txt\0old name.txt\0 M line\nbreak.txt\0?? [literal].txt\0")).toEqual([
			{ path: "new name.txt", oldPath: "old name.txt", indexStatus: "R", worktreeStatus: " " },
			{ path: "line\nbreak.txt", indexStatus: " ", worktreeStatus: "M" },
			{ path: "[literal].txt", indexStatus: "?", worktreeStatus: "?" },
		]);
		expect(() => parseGitStatus("R  missing\0")).toThrow("incomplete rename");
	});
	it("rejects traversal and links outside a registered project", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-project-"));
		const project = path.join(directory, "project"); const outside = path.join(directory, "outside");
		mkdirSync(project); mkdirSync(outside); writeFileSync(path.join(outside, "secret.txt"), "outside");
		symlinkSync(outside, path.join(project, "link"), process.platform === "win32" ? "junction" : "dir");
		try {
			await expect(resolveProjectPath(project, "../outside/secret.txt")).rejects.toThrow("outside");
			await expect(readProjectFile(project, "link/secret.txt")).rejects.toThrow("outside");
			await expect(resolveProjectPath(project, outside)).rejects.toThrow("inside");
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});
	it("previews text and produces staged and unstaged Git review", async () => {
		const project = mkdtempSync(path.join(tmpdir(), "phaseo-project-"));
		try {
			execFileSync("git", ["init", "-b", "test-workspace"], { cwd: project, windowsHide: true, stdio: "ignore" });
			writeFileSync(path.join(project, "hello.txt"), "Hello\n");
			execFileSync("git", ["add", "--", "hello.txt"], { cwd: project, windowsHide: true });
			expect(await readProjectFile(project, "hello.txt")).toBe("Hello\n");
			expect((await listProjectFiles(project, "")).map(file => file.name)).toEqual(["hello.txt"]);
			const review = await gitReview(project); expect(review.stagedDiff).toContain("+Hello"); expect(review.branch).toBe("test-workspace");
		} finally { rmSync(project, { recursive: true, force: true }); }
	});
	it("previews editable text, large text read-only, images, PDFs and binaries", async () => {
		const project = mkdtempSync(path.join(tmpdir(), "phaseo-preview-"));
		const pdf = async () => ({ text: "PDF text", pages: 2 });
		try {
			writeFileSync(path.join(project, "small.md"), "# Title\n");
			writeFileSync(path.join(project, "large.txt"), "é".repeat(600_000));
			writeFileSync(path.join(project, "image.png"), Buffer.from([137, 80, 78, 71]));
			writeFileSync(path.join(project, "data.bin"), Buffer.from([1, 0, 2]));
			writeFileSync(path.join(project, "paper.pdf"), "%PDF-1.4");
			expect(await readFilePreview(project, "small.md", pdf)).toEqual({ kind: "text", text: "# Title\n", size: 8, truncated: false, hash: contentHash("# Title\n") });
			const large = await readFilePreview(project, "large.txt", pdf);
			expect(large).toMatchObject({ kind: "text", truncated: true, size: 1_200_000 }); expect(large).not.toHaveProperty("hash");
			if (large.kind === "text") expect(large.text).toMatch(/^é+$/);
			expect(await readFilePreview(project, "image.png", pdf)).toEqual({ kind: "image", mimeType: "image/png", dataUrl: "data:image/png;base64,iVBORw==", size: 4 });
			expect(await readFilePreview(project, "data.bin", pdf)).toEqual({ kind: "binary", size: 3 });
			expect(await readFilePreview(project, "paper.pdf", pdf)).toEqual({ kind: "pdf", text: "PDF text", pages: 2, size: 8 });
			await expect(readFilePreview(project, "../outside.txt", pdf)).rejects.toThrow();
		} finally { rmSync(project, { recursive: true, force: true }); }
	});
	it("lists folders lazily without Git-ignored files", async () => {
		const project = mkdtempSync(path.join(tmpdir(), "phaseo-tree-"));
		try {
			execFileSync("git", ["init", "-b", "tree"], { cwd: project, windowsHide: true, stdio: "ignore" });
			mkdirSync(path.join(project, "src")); mkdirSync(path.join(project, "build"));
			writeFileSync(path.join(project, ".gitignore"), "build/\n"); writeFileSync(path.join(project, "src", "app.ts"), ""); writeFileSync(path.join(project, "build", "out.js"), "");
			expect((await projectTree(project, { type: "list", directory: "" })).entries.map(entry => entry.path)).toEqual(["src", ".gitignore"]);
			expect((await projectTree(project, { type: "search", query: "app" })).entries.map(entry => entry.path)).toEqual(["src/app.ts"]);
			await expect(projectTree(project, { type: "list", directory: ".." })).rejects.toThrow("inside this project");
		} finally { rmSync(project, { recursive: true, force: true }); }
	});
});
