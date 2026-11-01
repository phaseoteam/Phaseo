import { describe, expect, it } from "vitest";
import { projectRelative, toolCallEdits } from "./toolCallDiff";

const tool = (title: string, text: string) => ({ type: "tool" as const, title, text });

describe("projectRelative", () => {
	it("keeps relative paths and strips the project folder from absolute ones", () => {
		expect(projectRelative("./src/a.ts")).toBe("src/a.ts");
		expect(projectRelative("/work/app/src/a.ts", "/work/app")).toBe("src/a.ts");
		expect(projectRelative("C:\\Work\\App\\src\\a.ts", "c:\\work\\app\\")).toBe("src/a.ts");
		expect(projectRelative("/elsewhere/a.ts", "/work/app")).toBeUndefined();
		expect(projectRelative("/work/application/a.ts", "/work/app")).toBeUndefined();
	});
});

describe("toolCallEdits", () => {
	it("reads the file from a Phaseo tool's result", () => {
		expect(toolCallEdits(tool("edit_file", "Edited src/app.ts: replaced 1 occurrence (line 4). hash: abc"))).toEqual({ files: ["src/app.ts"] });
		expect(toolCallEdits(tool("write_file", "Created docs/new.md (3 lines). hash: abc"))).toEqual({ files: ["docs/new.md"] });
		expect(toolCallEdits(tool("read_file", "Edited nothing"))).toBeUndefined();
	});
	it("reads the file from a Claude tool's input", () => {
		expect(toolCallEdits(tool("Edit", JSON.stringify({ file_path: "/work/app/src/a.ts", old_string: "a", new_string: "b" })), "/work/app")).toEqual({ files: ["src/a.ts"] });
	});
	it("turns a Codex file change into a patch per file", () => {
		const item = { id: "x", type: "fileChange", status: "completed", changes: [
			{ path: "/work/app/src/a.ts", kind: { type: "update", move_path: null }, diff: "@@ -1 +1 @@\n-old\n+new\n" },
			{ path: "/work/app/notes.txt", kind: { type: "add" }, diff: "one\ntwo\n" },
		] };
		const edits = toolCallEdits(tool("fileChange", JSON.stringify(item, null, 2)), "/work/app");
		expect(edits?.files).toEqual(["src/a.ts", "notes.txt"]);
		expect(edits?.patch).toBe("diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n"
			+ "diff --git a/notes.txt b/notes.txt\n--- /dev/null\n+++ b/notes.txt\n@@ -0,0 +1,2 @@\n+one\n+two\n");
	});
});
