import { describe, expect, it } from "vitest";
import { extractTerminalLinks, projectPath, splitPosition, terminalContext } from "./terminalLinks";

const texts = (line: string) => extractTerminalLinks(line).map(link => `${link.kind}:${link.text}`);

describe("terminal links", () => {
	it("finds compiler and test output paths with positions", () => {
		expect(texts("src/main/app.ts:12:5: error TS2322")).toEqual(["path:src/main/app.ts:12:5"]);
		expect(texts("src/app.ts(12,5): error TS2322: Type")).toEqual(["path:src/app.ts(12,5)"]);
		expect(texts(" FAIL  ./tests/a.test.ts > works")).toEqual(["path:./tests/a.test.ts"]);
		expect(texts("at C:\\repo\\src\\index.js:3:9")).toEqual(["path:C:\\repo\\src\\index.js:3:9"]);
		expect(texts("index.ts:40:2 - error")).toEqual(["path:index.ts:40:2"]);
	});

	it("keeps addresses apart from paths and skips request routes", () => {
		expect(texts("Local: http://localhost:5173/ ready")).toEqual(["url:http://localhost:5173/"]);
		expect(texts("GET /api/items?page=2 200")).toEqual([]);
		expect(texts("version 1.2.3 and word")).toEqual([]);
	});

	it("splits positions", () => {
		expect(splitPosition("src/a.ts:12:5")).toEqual({ path: "src/a.ts", line: 12, column: 5 });
		expect(splitPosition("src/a.ts(7)")).toEqual({ path: "src/a.ts", line: 7 });
		expect(splitPosition("src/a.ts")).toEqual({ path: "src/a.ts" });
	});

	it("resolves paths inside the project only", () => {
		expect(projectPath("src/a.ts", "C:\\repo\\apps\\web", "C:\\repo", true)).toBe("apps/web/src/a.ts");
		expect(projectPath("c:\\REPO\\src\\a.ts", "C:\\repo", "C:\\repo", true)).toBe("src/a.ts");
		expect(projectPath("../../outside.ts", "/repo/src", "/repo", false)).toBeUndefined();
		expect(projectPath("/etc/passwd", "/repo", "/repo", false)).toBeUndefined();
		expect(projectPath("~/notes.md", "/repo", "/repo", false)).toBeUndefined();
	});

	it("wraps selected output for the composer", () => {
		expect(terminalContext("Terminal 1", "\nerror: boom\n\n")).toBe("Output from Terminal 1:\n```text\nerror: boom\n```");
		expect(terminalContext("Build", "```x```")).toContain("````text");
	});
});
