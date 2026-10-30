import { describe, expect, it } from "vitest";
import { parseReviewPatch } from "./diffRendering";

const changed = "diff --git a/example.ts b/example.ts\nindex 1111111..2222222 100644\n--- a/example.ts\n+++ b/example.ts\n@@ -2,2 +2,2 @@\n-const before = true;\n+const after = false;\n context\n";

describe("desktop review diffs", () => {
	it("retains both sides, original line positions and multiple file patches", () => {
		const files = parseReviewPatch(changed + changed.replaceAll("example.ts", "other.ts"))!;
		expect(files.map(file => file.name)).toEqual(["example.ts", "other.ts"]);
		expect(files[0].deletionLines.join("")).toBe("const before = true;\ncontext\n");
		expect(files[0].additionLines.join("")).toBe("const after = false;\ncontext\n");
		expect(files[0].hunks[0].deletionStart).toBe(2);
		expect(files[0].hunks[0].additionStart).toBe(2);
	});
	it("decodes Git's quoted Unicode paths and retains missing-newline metadata", () => {
		const path = String.raw`[literal] \344\270\226\347\225\214.txt`;
		const patch = `diff --git "a/${path}" "b/${path}"\nindex 1111111..2222222 100644\n--- "a/${path}"\n+++ "b/${path}"\n@@ -1 +1 @@\n-before\n\\ No newline at end of file\n+after\n\\ No newline at end of file\n`;
		const file = parseReviewPatch(patch)![0];
		expect(file.name).toBe("[literal] 世界.txt");
		expect(file.hunks[0].noEOFCRAdditions).toBe(true);
		expect(file.hunks[0].noEOFCRDeletions).toBe(true);
	});
	it("renders added and deleted text files while retaining a raw fallback for unsupported patches", () => {
		const added = "diff --git a/new.txt b/new.txt\nnew file mode 100644\nindex 0000000..1111111\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+hello\n";
		const deleted = "diff --git a/old.txt b/old.txt\ndeleted file mode 100644\nindex 1111111..0000000\n--- a/old.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-goodbye\n";
		expect(parseReviewPatch(added)![0].additionLines.join("")).toBe("hello\n");
		expect(parseReviewPatch(deleted)![0].deletionLines.join("")).toBe("goodbye\n");
		for (const patch of ["not a patch", "diff --git a/file b/file\nBinary files a/file and b/file differ\n", "x".repeat(1_000_001), "\n".repeat(10_000)]) expect(parseReviewPatch(patch)).toBeUndefined();
	});
});
