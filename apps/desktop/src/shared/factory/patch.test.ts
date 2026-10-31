import { describe, expect, it } from "vitest";
import { commentSide, parsePatch } from "./patch";

describe("parsePatch", () => {
	it("numbers each side from the hunk header, as GitHub does for line comments", () => {
		const rows = parsePatch("@@ -4,4 +4,4 @@ export function subtotal(lines) {\n \tlet total = 0;\n-\ttotal += line.cents * line.quantity;\n+\ttotal += line.cents * (line.quantity ?? 1);\n \treturn total;\n\\ No newline at end of file\n");
		expect(rows).toEqual([
			{ kind: "hunk", text: "@@ -4,4 +4,4 @@ export function subtotal(lines) {" },
			{ kind: "context", text: "\tlet total = 0;", old: 4, new: 4 },
			{ kind: "remove", text: "\ttotal += line.cents * line.quantity;", old: 5 },
			{ kind: "add", text: "\ttotal += line.cents * (line.quantity ?? 1);", new: 5 },
			{ kind: "context", text: "\treturn total;", old: 6, new: 6 },
		]);
		expect(commentSide(rows[2]!)).toEqual({ side: "LEFT", line: 5 });
		expect(commentSide(rows[3]!)).toEqual({ side: "RIGHT", line: 5 });
		expect(commentSide(rows[0]!)).toBeNull();
	});

	it("reads a new file and several hunks", () => {
		const rows = parsePatch("@@ -0,0 +1,2 @@\n+a\n+b\n@@ -10 +12 @@\n-x\n+y");
		expect(rows.map((row) => `${row.kind}:${row.old ?? ""}/${row.new ?? ""}`)).toEqual(["hunk:/", "add:/1", "add:/2", "hunk:/", "remove:10/", "add:/12"]);
	});
});
