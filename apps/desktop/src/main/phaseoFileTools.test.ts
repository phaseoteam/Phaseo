import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentTool } from "@phaseo/agent-sdk";
import { describeFileCall, phaseoFileTools } from "./phaseoFileTools";
import { contentHash, unsafeWritePath, writeProjectFile } from "./projectEdits";
import { ProjectInstructions } from "./projectInstructions";
import { unifiedDiff } from "./unifiedDiff";

const roots: string[] = [];
function project(files: Record<string, string | Buffer> = {}, git = false) {
	const root = mkdtempSync(path.join(tmpdir(), "phaseo-file-tools-")); roots.push(root);
	if (git) execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root, windowsHide: true });
	for (const [name, content] of Object.entries(files)) { mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); writeFileSync(path.join(root, name), content); }
	return root;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function tools(root: string, options: Partial<Parameters<typeof phaseoFileTools>[1]> = {}) {
	const list = phaseoFileTools(root, { writable: true, extractPdf: async () => ({ text: "Page one\nPage two\n", pages: 2 }), ...options });
	return (name: string, input: unknown) => {
		const tool = list.find(value => value.id === name) as AgentTool;
		if (typeof tool?.execute !== "function") throw new Error(`Missing ${name}`);
		return Promise.resolve(tool.execute(input, { runId: "run", agentId: "agent", stepIndex: 0, context: undefined, toolCall: { id: "call", name, input }, emitProgress: () => {}, setContext: () => {} })) as Promise<string>;
	};
}
const hashOf = (output: string) => output.match(/hash: ([a-f0-9]{64})/)?.[1];

describe("read_file", () => {
	it("numbers lines, reads ranges and cuts long lines", async () => {
		const lines = Array.from({ length: 2500 }, (_, index) => index === 9 ? "x".repeat(2100) : `line ${index + 1}`);
		const root = project({ "src/long.ts": `${lines.join("\n")}\n` }), call = tools(root);
		const first = await call("read_file", { path: "src/long.ts" });
		expect(first.split("\n")[0]).toBe(`src/long.ts · 2,500 lines · showing 1-2000 · hash: ${contentHash(`${lines.join("\n")}\n`)}`);
		expect(first).toContain("     1\tline 1\n     2\tline 2");
		expect(first).toContain(`    10\t${"x".repeat(2000)}… [line cut: 100 more characters]`);
		expect(first).toContain("[500 more lines. Continue with offset 2001.]");
		const range = await call("read_file", { path: "./src\\long.ts", offset: 2499, limit: 5 });
		expect(range).toContain("showing 2499-2500"); expect(range).toContain("  2500\tline 2500"); expect(range).not.toContain("more lines");
		await expect(call("read_file", { path: "src/long.ts", offset: 3000 })).rejects.toThrow("past the end");
		expect(await call("read_file", { path: path.join(root, "src", "long.ts"), limit: 1 })).toContain("     1\tline 1");
	});
	it("explains binaries, images, PDFs, folders, other encodings and missing paths", async () => {
		const root = project({ "data.bin": Buffer.from([1, 0, 2]), "logo.png": Buffer.from([137, 80, 78, 71]), "paper.pdf": "%PDF-1.4", "latin.txt": Buffer.from([0x63, 0x61, 0x66, 0xe9]), "crlf.txt": "﻿a\r\nb\r\n", "src/a.ts": "" }), call = tools(root);
		expect(await call("read_file", { path: "data.bin" })).toBe("data.bin is a binary file (3 B); it can't be read as text.");
		expect(await call("read_file", { path: "logo.png" })).toContain("is an image (image/png, 4 B)");
		expect(await call("read_file", { path: "paper.pdf" })).toContain("PDF text, 2 pages");
		expect(await call("read_file", { path: "latin.txt" })).toContain("not valid UTF-8");
		expect(await call("read_file", { path: "crlf.txt" })).toMatch(/· hash: [a-f0-9]{64}\n {5}1\ta\n {5}2\tb$/);
		expect(await call("read_file", { path: "src/a.ts" })).toBe("src/a.ts · empty · hash: " + contentHash(""));
		await expect(call("read_file", { path: "src" })).rejects.toThrow("is a folder");
		await expect(call("read_file", { path: "src/missing/foo.ts" })).rejects.toThrow("No file at `src/missing/foo.ts`. Use list_files on `src` to see what exists.");
		await expect(call("read_file", { path: "../outside.txt" })).rejects.toThrow("outside this project");
	});
});

describe("list_files and find_files", () => {
	it("lists Git-aware trees with folders marked and an explicit truncation line", async () => {
		const root = project({ ".gitignore": "build/\n*.log\n", "src/app.ts": "", "src/lib/util.ts": "", "build/out.js": "", "debug.log": "", "README.md": "" }, true), call = tools(root);
		expect(await call("list_files", {})).toBe(["./ · 3 entries · Git-ignored files hidden", "src/", ".gitignore", "README.md"].join("\n"));
		expect(await call("list_files", { recursive: true })).toBe(["./ · 6 entries, recursive · Git-ignored files hidden", "src/", "src/lib/", "src/lib/util.ts", "src/app.ts", ".gitignore", "README.md"].join("\n"));
		expect(await call("list_files", { recursive: true, limit: 2 })).toBe(["./ · 6 entries, recursive · Git-ignored files hidden", "src/", "src/lib/", "[4 more entries not shown]"].join("\n"));
		expect(await call("list_files", { path: "build" })).toBe("build/ · 1 entry\nbuild/out.js");
		await expect(call("list_files", { path: "src/app.ts" })).rejects.toThrow("is a file, not a folder");
		expect(await call("find_files", { pattern: "**/*.ts" })).toBe("2 files match `**/*.ts`\nsrc/app.ts\nsrc/lib/util.ts");
		expect(await call("find_files", { pattern: "src/**/util*" })).toBe("1 file match `src/**/util*`\nsrc/lib/util.ts");
		expect(await call("find_files", { pattern: "*.{md,js}" })).toBe("1 file match `*.{md,js}`\nREADME.md");
		expect(await call("find_files", { pattern: "*.log" })).toContain("No files match");
	});
	it("walks projects outside Git, skipping .git and node_modules", async () => {
		const root = project({ "a.txt": "", "node_modules/x/index.js": "", "empty/.keep": "" }), call = tools(root);
		mkdirSync(path.join(root, "nested", "deeper"), { recursive: true });
		expect(await call("list_files", { recursive: true })).toBe(["./ · 5 entries, recursive", "empty/", "empty/.keep", "nested/", "nested/deeper/", "a.txt"].join("\n"));
		expect(await call("list_files", { path: "node_modules", recursive: true })).toBe(["node_modules/ · 2 entries, recursive", "node_modules/x/", "node_modules/x/index.js"].join("\n"));
	});
});

describe("search_files", () => {
	it("uses git grep with globs, case, literal text, context and caps", async () => {
		const root = project({ ".gitignore": "ignored.ts\n", "src/a.ts": "const Foo = 1;\nfoo(bar)\nend\n", "src/b.tsx": "foo here\n", "ignored.ts": "foo\n", "notes.md": "foo note\r\n" }, true), call = tools(root);
		execFileSync("git", ["add", "src/a.ts"], { cwd: root, windowsHide: true });
		expect((await call("search_files", { pattern: "foo" })).split("\n").sort()).toEqual(["notes.md:1: foo note", "src/a.ts:2: foo(bar)", "src/b.tsx:1: foo here"]);
		expect(await call("search_files", { pattern: "foo", glob: "*.ts", caseSensitive: false })).toBe("src/a.ts:1: const Foo = 1;\nsrc/a.ts:2: foo(bar)");
		expect(await call("search_files", { pattern: "foo(", literal: true, path: "src" })).toBe("src/a.ts:2: foo(bar)");
		expect(await call("search_files", { pattern: "\\bFoo\\b\\s=\\s\\d", path: "src/a.ts", contextLines: 1 })).toBe("src/a.ts:1: const Foo = 1;\nsrc/a.ts-2- foo(bar)");
		expect(await call("search_files", { pattern: "o", glob: "src/**", maxResults: 2 })).toMatch(/^src\/a\.ts:1: .*\nsrc\/a\.ts:2: .*\n\[Showing the first 2 matches; there are more\./);
		expect(await call("search_files", { pattern: "absent" })).toBe("No matches for `absent`.");
		await expect(call("search_files", { pattern: "foo(" })).rejects.toThrow("Invalid search pattern");
	});
	it("falls back to a bounded scan outside Git", async () => {
		const root = project({ "a.ts": "alpha\nBeta\n", "deep/b.ts": "beta\n", "big.txt": `beta${"x".repeat(1024 * 1024)}`, "bin.dat": Buffer.from("beta\0") }), call = tools(root);
		expect(await call("search_files", { pattern: "beta", caseSensitive: false })).toBe("a.ts:2: Beta\ndeep/b.ts:1: beta");
		expect(await call("search_files", { pattern: "b.t", literal: true })).toBe("No matches for `b.t`.");
		expect(await call("search_files", { pattern: "beta", glob: "deep/*.ts" })).toBe("deep/b.ts:1: beta");
		await expect(call("search_files", { pattern: "(" })).rejects.toThrow("Invalid search pattern");
	});
});

describe("edit_file", () => {
	it("replaces unique text and refuses missing or ambiguous matches", async () => {
		const root = project({ "a.ts": "one\ntwo\ntwo\nthree\n" }), call = tools(root);
		await expect(call("edit_file", { path: "a.ts", oldString: "four", newString: "x" })).rejects.toThrow("`oldString` was not found in `a.ts`.");
		await expect(call("edit_file", { path: "a.ts", oldString: "     2\ttwo", newString: "x" })).rejects.toThrow("line-number prefixes");
		await expect(call("edit_file", { path: "a.ts", oldString: "two", newString: "2" })).rejects.toThrow("matches 2 places in `a.ts` (lines 2, 3)");
		const result = await call("edit_file", { path: "a.ts", oldString: "one\n", newString: "ONE\n" });
		expect(result).toBe(`Edited a.ts: replaced 1 occurrence (line 1). hash: ${contentHash("ONE\ntwo\ntwo\nthree\n")}`);
		expect(await call("edit_file", { path: "a.ts", oldString: "two", newString: "2", replaceAll: true, expectedHash: hashOf(result) })).toContain("replaced 2 occurrences (lines 2, 3)");
		expect(readFileSync(path.join(root, "a.ts"), "utf8")).toBe("ONE\n2\n2\nthree\n");
		await expect(call("edit_file", { path: "a.ts", oldString: "three", newString: "3", expectedHash: contentHash("stale") })).rejects.toThrow("changed since you read it");
		await expect(call("edit_file", { path: "missing.ts", oldString: "a", newString: "b" })).rejects.toThrow("No file at `missing.ts`");
	});
	it("keeps CRLF line endings and a BOM when the model sends LF", async () => {
		const root = project({ "win.cs": "﻿class A\r\n{\r\n\tint x;\r\n}\r\n" }), call = tools(root);
		await call("edit_file", { path: "win.cs", oldString: "{\n\tint x;\n}", newString: "{\n\tint x;\n\tint y;\n}" });
		expect(readFileSync(path.join(root, "win.cs"), "utf8")).toBe("﻿class A\r\n{\r\n\tint x;\r\n\tint y;\r\n}\r\n");
	});
	it("refuses files that are not UTF-8", async () => {
		const root = project({ "latin.txt": Buffer.from([0x63, 0x61, 0x66, 0xe9]) }), call = tools(root);
		await expect(call("edit_file", { path: "latin.txt", oldString: "caf", newString: "x" })).rejects.toThrow("not valid UTF-8");
		expect(readFileSync(path.join(root, "latin.txt"))).toEqual(Buffer.from([0x63, 0x61, 0x66, 0xe9]));
	});
});

describe("write_file and delete_file", () => {
	it("creates files in new folders and guards replacements with the read hash", async () => {
		const root = project({ "src/a.ts": "old\r\n" }), call = tools(root);
		expect(await call("write_file", { path: "src/new/deep/file.ts", content: "export {};\n" })).toBe(`Created src/new/deep/file.ts (1 line). hash: ${contentHash("export {};\n")}`);
		expect(readFileSync(path.join(root, "src", "new", "deep", "file.ts"), "utf8")).toBe("export {};\n");
		await expect(call("write_file", { path: "src/a.ts", content: "x" })).rejects.toThrow("already exists. Read it with read_file");
		await expect(call("write_file", { path: "src/a.ts", content: "x", expectedHash: contentHash("stale") })).rejects.toThrow("changed since you read it");
		await expect(call("write_file", { path: "src/other.ts", content: "x", expectedHash: contentHash("old") })).rejects.toThrow("Omit expectedHash to create it");
		const hash = hashOf(await call("read_file", { path: "src/a.ts" }));
		await call("write_file", { path: "src/a.ts", content: "new\nlines\n", expectedHash: hash });
		expect(readFileSync(path.join(root, "src", "a.ts"), "utf8")).toBe("new\r\nlines\r\n");
		await expect(call("write_file", { path: "src/a.ts/child.ts", content: "x" })).rejects.toThrow("parent is a file");
		await expect(call("write_file", { path: "../escape.ts", content: "x" })).rejects.toThrow("outside this project");
		await expect(call("delete_file", { path: "src/a.ts", expectedHash: contentHash("stale") })).rejects.toThrow("changed since you read it");
		expect(await call("delete_file", { path: "src/a.ts", expectedHash: contentHash("new\r\nlines\r\n") })).toBe("Deleted src/a.ts.");
		expect(readdirSync(path.join(root, "src")).sort()).toEqual(["new"]);
	});
	it("refuses .git, alternate data streams and reserved device names", async () => {
		const root = project({ ".git/config": "[core]\n", "sub/x.txt": "" }), call = tools(root);
		for (const target of [".git/config", ".git/hooks/pre-commit", "sub/.GIT/x", "a/.git"]) await expect(call("write_file", { path: target, content: "x" })).rejects.toThrow("`.git` can't be changed");
		await expect(call("write_file", { path: "sub/x.txt:ads", content: "x" })).rejects.toThrow("alternate data stream");
		await expect(writeProjectFile(root, ".git/config", "x", contentHash("[core]\n"))).rejects.toThrow(".git");
		expect(readFileSync(path.join(root, ".git", "config"), "utf8")).toBe("[core]\n");
		expect(unsafeWritePath("sub/CON", "win32")).toContain("reserved"); expect(unsafeWritePath("nul.txt", "win32")).toContain("reserved"); expect(unsafeWritePath("COM1.log", "win32")).toContain("reserved");
		expect(unsafeWritePath("trailing./x", "win32")).toContain("dot or space"); expect(unsafeWritePath(".git.", "win32")).toContain(".git");
		expect(unsafeWritePath("src/console.ts", "win32")).toBeUndefined(); expect(unsafeWritePath("src/aux/x.ts", "linux")).toBeUndefined();
		if (process.platform === "win32") await expect(call("write_file", { path: "sub/aux.ts", content: "x" })).rejects.toThrow("reserved");
	});
	it("writes atomically and serialises concurrent changes to one file", async () => {
		const root = project({ "list.txt": "a\nb\nc\n" }), call = tools(root);
		const edits = await Promise.all(["a", "b", "c"].map(letter => call("edit_file", { path: "list.txt", oldString: `${letter}\n`, newString: `${letter.toUpperCase()}\n` })));
		expect(edits.every(result => result.startsWith("Edited"))).toBe(true);
		expect(readFileSync(path.join(root, "list.txt"), "utf8")).toBe("A\nB\nC\n");
		const hash = contentHash("A\nB\nC\n");
		// Both writes carry the same read hash; whichever runs second must see the first one's change.
		const contents = ["first", "second"], results = await Promise.allSettled(contents.map(content => writeProjectFile(root, "list.txt", content, hash)));
		expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
		expect(readFileSync(path.join(root, "list.txt"), "utf8")).toBe(contents[results.findIndex(result => result.status === "fulfilled")]);
		expect(readdirSync(root)).toEqual(["list.txt"]);
		const created = await Promise.allSettled(["one", "two"].map(content => call("write_file", { path: "new.txt", content })));
		expect(created.filter(result => result.status === "fulfilled")).toHaveLength(1);
		expect(created.find(result => result.status === "rejected")).toMatchObject({ reason: expect.objectContaining({ message: expect.stringContaining("already exists") }) });
		expect(readFileSync(path.join(root, "new.txt"), "utf8")).toBe(["one", "two"][created.findIndex(result => result.status === "fulfilled")]);
		expect(readdirSync(root).sort()).toEqual(["list.txt", "new.txt"]);
	});
	it("leaves out write tools when not writable", () => {
		expect(phaseoFileTools(project(), { writable: false }).map(tool => tool.id)).toEqual(["read_file", "list_files", "search_files", "find_files"]);
		expect(phaseoFileTools(project(), { writable: true }).filter(tool => tool.requireApproval).map(tool => tool.id)).toEqual(["edit_file", "write_file", "delete_file"]);
	});
});

describe("instruction gate in file tools", () => {
	it("holds back a write until newly applicable instructions have been prompted, without blocking reads", async () => {
		const root = project({ "AGENTS.md": "Root rule", "src/file.ts": "before\n", "docs/readme.md": "doc\n" });
		const instructions = new ProjectInstructions(root); await instructions.load(".", true); instructions.prompt();
		const call = tools(root, { instructions });
		writeFileSync(path.join(root, "src", "AGENTS.md"), "Scoped rule");
		const read = await call("read_file", { path: "src/file.ts" });
		expect(read).toContain("Note: project instructions now apply here (src/AGENTS.md)"); expect(read).toContain("     1\tbefore");
		expect(await call("edit_file", { path: "docs/readme.md", oldString: "doc", newString: "DOC" })).toContain("Edited docs/readme.md");
		const blocked = await call("edit_file", { path: "src/file.ts", oldString: "before", newString: "after" });
		expect(blocked).toBe("Not done: project instructions for `src/file.ts` changed since your last step (new: src/AGENTS.md). They will be in your instructions on the next step. Review them, then retry this action if it still fits.");
		expect(readFileSync(path.join(root, "src", "file.ts"), "utf8")).toBe("before\n");
		expect(instructions.prompt()).toContain("Scoped rule");
		expect(await call("edit_file", { path: "src/file.ts", oldString: "before", newString: "after" })).toContain("Edited src/file.ts");
		writeFileSync(path.join(root, "AGENTS.md"), "Changed root rule");
		expect(await call("write_file", { path: "src/new/created.ts", content: "x" })).toContain("(changed: AGENTS.md)");
		instructions.prompt();
		expect(await call("write_file", { path: "src/new/created.ts", content: "x" })).toContain("Created src/new/created.ts");
	});
});

describe("approval previews", () => {
	it("shows unified diffs for edits and writes and the size for deletes", async () => {
		const body = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join("\n") + "\n";
		const root = project({ "src/app.ts": body });
		const edit = await describeFileCall(root, "edit_file", { path: "src/app.ts", oldString: "line 10\n", newString: "line ten\n" });
		expect(edit.title).toBe("Edit src/app.ts");
		expect(edit.details).toBe(["--- a/src/app.ts", "+++ b/src/app.ts", "@@ -7,7 +7,7 @@", " line 7", " line 8", " line 9", "-line 10", "+line ten", " line 11", " line 12", " line 13"].join("\n"));
		const created = await describeFileCall(root, "write_file", { path: "src/new/file.ts", content: "a\nb" });
		expect(created).toEqual({ title: "Create src/new/file.ts", details: ["--- /dev/null", "+++ b/src/new/file.ts", "@@ -0,0 +1,2 @@", "+a", "+b", "\\ No newline at end of file"].join("\n") });
		expect(await describeFileCall(root, "delete_file", { path: "src/app.ts", expectedHash: contentHash(body) })).toEqual({ title: "Delete src/app.ts", details: "151 B · 20 lines" });
		expect((await describeFileCall(root, "edit_file", { path: "src/app.ts", oldString: "nope", newString: "x" })).details).toContain("This will fail: `oldString` was not found");
		const huge = await describeFileCall(root, "write_file", { path: "big.txt", content: Array.from({ length: 1000 }, (_, index) => `${index}`).join("\n") });
		expect(huge.details.split("\n")).toHaveLength(2 + 400 + 1); expect(huge.details).toMatch(/\[602 more diff lines not shown\]$/);
	});
	it("diffs with separate hunks and context", () => {
		const before = Array.from({ length: 30 }, (_, index) => `${index + 1}`).join("\n") + "\n";
		const after = before.replace("2\n", "two\n").replace("25\n", "").replace("30\n", "30\n31\n");
		expect(unifiedDiff(before, after, { path: "n.txt" })).toBe([
			"--- a/n.txt", "+++ b/n.txt",
			"@@ -1,5 +1,5 @@", " 1", "-2", "+two", " 3", " 4", " 5",
			"@@ -22,9 +22,9 @@", " 22", " 23", " 24", "-25", " 26", " 27", " 28", " 29", " 30", "+31",
		].join("\n"));
		expect(unifiedDiff("same\n", "same\n", { path: "x" })).toBe("");
		expect(unifiedDiff("a\n", "a", { path: "x" })).toBe(["--- a/x", "+++ b/x", "@@ -1,1 +1,1 @@", "-a", "+a", "\\ No newline at end of file"].join("\n"));
	});
});
