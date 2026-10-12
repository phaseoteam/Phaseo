import { describe, expect, it } from "vitest";
import { parseFileReference, validateProjectOpen } from "./editors";

describe("file reference positions", () => {
	it("parses relative, absolute, Unicode and file URLs with explicit positions", () => {
		expect(parseFileReference("src/main.ts:12:4")).toEqual({ filename: "src/main.ts", line: 12, column: 4 });
		expect(parseFileReference("src/main.ts#L12-L16")).toEqual({ filename: "src/main.ts", line: 12 });
		expect(parseFileReference("./notes%20%E4%B8%96%E7%95%8C.md#L3C2")).toEqual({ filename: "./notes 世界.md", line: 3, column: 2 });
		expect(parseFileReference("E:\\project\\main.ts:2:1")).toEqual({ filename: "E:\\project\\main.ts", line: 2, column: 1 });
		expect(parseFileReference("file:///E:/project/main.ts#L8")).toEqual({ filename: "E:/project/main.ts", line: 8 });
		expect(parseFileReference("file:///home/project/a%23b.txt")).toEqual({ filename: "/home/project/a#b.txt" });
	});
	it("keeps web links, unsafe schemes, heading fragments and invalid positions out of file actions", () => {
		for (const href of ["https://example.com/file.ts", "javascript:alert(1)", "data:text/html,owned", "file://other-host/file.ts", "file:///tmp/file.ts?query=1", "#heading", "file.ts#unknown", "file.ts:0", "file.ts:2:0", "file.ts:10000001", "file%GG.ts", "file%00.ts"]) expect(parseFileReference(href), href).toBeUndefined();
	});
	it("validates positions as structured data requiring an editor and file", () => {
		expect(validateProjectOpen({ editor: "vscode", filename: "main.ts", line: 2, column: 3 })).toEqual({ editor: "vscode", filename: "main.ts", line: 2, column: 3 });
		for (const request of [{ editor: "vscode", line: 1 }, { editor: "vscode", filename: "main.ts", column: 1 }, { editor: "file-manager", filename: "main.ts", line: 1 }, { editor: "vscode", filename: "main.ts", line: "1" }, { editor: "vscode", filename: "main.ts", line: 1.5 }]) expect(() => validateProjectOpen(request)).toThrow();
	});
});
