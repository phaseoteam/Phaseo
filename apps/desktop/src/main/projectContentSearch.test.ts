import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clipLine, parseGitGrep, searchProjectContents } from "./projectContentSearch";

describe("project content search", () => {
	it("reads git grep's NUL-separated output and counts columns in characters", () => {
		const output = "src/a.ts\x0012\x005\x00\tconst needle = 1;\nsrc/é.ts\x003\x0010\x00// café Needle\n";
		expect(parseGitGrep(output)).toEqual([{ path: "src/a.ts", line: 12, column: 5, text: "\tconst needle = 1;" }, { path: "src/é.ts", line: 3, column: 9, text: "// café Needle" }]);
		expect(parseGitGrep(output, 1)).toHaveLength(1);
	});
	it("clips long lines around the match", () => {
		const long = `${"a".repeat(500)}needle${"b".repeat(500)}`;
		const clipped = clipLine(long, 501);
		expect(clipped.text.length).toBeLessThan(250);
		expect(clipped.text.slice(clipped.column - 1, clipped.column + 5)).toBe("needle");
	});
	it("searches a folder that is not a repository, skipping binary files", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-content-search-"));
		try {
			writeFileSync(path.join(root, "notes.md"), "first\nThe NEEDLE here\n");
			writeFileSync(path.join(root, "image.bin"), Buffer.from([0, 110, 101, 101, 100, 108, 101]));
			const result = await searchProjectContents(root, "needle");
			expect(result).toEqual({ matches: [{ path: "notes.md", line: 2, column: 5, text: "The NEEDLE here" }], truncated: false });
			await expect(searchProjectContents(root, " ")).rejects.toThrow("Invalid content search");
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
});
