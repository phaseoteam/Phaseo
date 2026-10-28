import { describe, expect, it } from "vitest";
import { isRelativeDirectory, projectTreeEntries, validateProjectTreeRequest } from "./projectTree";
import { isRefName, validateGitDiffRequest } from "./gitDiff";

const files = ["README.md", "src/app.ts", "src/lib/util.ts", "src/lib/b.ts", "docs/guide.md", "src2/x.ts"];

describe("project tree", () => {
	it("lists one folder's children, folders first, by name", () => {
		expect(projectTreeEntries(files, { type: "list", directory: "" }).entries.map(entry => `${entry.directory ? "d" : "f"}:${entry.path}`)).toEqual(["d:docs", "d:src", "d:src2", "f:README.md"]);
		expect(projectTreeEntries(files, { type: "list", directory: "src" }).entries.map(entry => entry.name)).toEqual(["lib", "app.ts"]);
		expect(projectTreeEntries(files, { type: "list", directory: "missing" }).entries).toEqual([]);
	});
	it("expands every folder below one and reports truncation", () => {
		const expanded = projectTreeEntries(files, { type: "expand", directory: "src" });
		expect(expanded.entries.map(entry => entry.path)).toEqual(["src/lib", "src/app.ts", "src/lib/b.ts", "src/lib/util.ts"]);
		expect(projectTreeEntries(files, { type: "expand", directory: "" }, 2)).toMatchObject({ truncated: true, entries: [{ path: "docs" }, { path: "src" }] });
	});
	it("rejects folders outside the project", () => {
		for (const value of ["..", "a/../b", "/etc", "C:/Windows", "a\\b", "a/", "./a", "a\0b"]) expect(isRelativeDirectory(value)).toBe(false);
		expect(isRelativeDirectory("")).toBe(true); expect(isRelativeDirectory("src/lib")).toBe(true);
		expect(() => validateProjectTreeRequest({ type: "list", directory: "../x" })).toThrow("inside this project");
		expect(() => validateProjectTreeRequest({ type: "search", query: 4 })).toThrow("search");
		expect(validateProjectTreeRequest({ type: "search", query: "app" })).toEqual({ type: "search", query: "app" });
	});
});

describe("diff requests", () => {
	it("accepts the three scopes and rejects unsafe refs and snapshots", () => {
		expect(validateGitDiffRequest({ scope: "branch", baseRef: "origin/main" })).toEqual({ scope: "branch", baseRef: "origin/main", ignoreWhitespace: false });
		expect(validateGitDiffRequest({ scope: "uncommitted", ignoreWhitespace: true })).toEqual({ scope: "uncommitted", ignoreWhitespace: true });
		expect(() => validateGitDiffRequest({ scope: "turn", from: "HEAD", to: "a".repeat(40) })).toThrow("snapshot");
		expect(() => validateGitDiffRequest({ scope: "other" })).toThrow("Invalid");
		for (const value of ["-x", "a..b", "a b", "a~1", "a^", "a:b", "refs/", "x.lock", "a@{1}", ""]) expect(isRefName(value)).toBe(false);
		for (const value of ["main", "origin/feature/one", "release-1.2"]) expect(isRefName(value)).toBe(true);
	});
});
