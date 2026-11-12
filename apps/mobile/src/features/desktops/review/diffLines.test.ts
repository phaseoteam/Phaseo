import { appendBlock, changedLabel, diffRows, diffSummary, fileCounts, pickedRows, rangeLabel, readsCode, reviewComment } from "./diffLines";

const patch = [
  "diff --git a/src/usage.ts b/src/usage.ts",
  "index 1111111..2222222 100644",
  "--- a/src/usage.ts",
  "+++ b/src/usage.ts",
  "@@ -10,4 +10,5 @@ export function usage() {",
  "   const rows = read();",
  "-  return rows.length;",
  "+  const total = rows.reduce((sum, row) => sum + row.tokens, 0);",
  "+  return total;",
  " }",
  "\\ No newline at end of file",
  "@@ -40,2 +41,2 @@",
  "-old",
  "+new",
  "",
].join("\n");

describe("review diff lines", () => {
  it("numbers each line on its side and drops the file headers", () => {
    const rows = diffRows(patch);
    expect(rows.map((row) => [row.kind, "oldLine" in row ? row.oldLine : null, "newLine" in row ? row.newLine : null, row.text])).toEqual([
      ["hunk", null, null, "@@ -10,4 +10,5 @@ export function usage() {"],
      ["context", 10, 10, "  const rows = read();"],
      ["remove", 11, null, "  return rows.length;"],
      ["add", null, 11, "  const total = rows.reduce((sum, row) => sum + row.tokens, 0);"],
      ["add", null, 12, "  return total;"],
      ["context", 12, 13, "}"],
      ["note", null, null, "No newline at end of file"],
      ["hunk", null, null, "@@ -40,2 +41,2 @@"],
      ["remove", 40, null, "old"],
      ["add", null, 41, "new"],
    ]);
  });

  it("puts a line-range comment into the draft as a quoted block, after what's already typed", () => {
    const rows = diffRows(patch);
    const picked = pickedRows(rows, rows[4]!.key, rows[1]!.key);
    expect(rangeLabel("src/usage.ts", picked)).toBe("src/usage.ts:L10-L12");
    const block = reviewComment("src/usage.ts", picked, "  Sum the cached tokens too. ");
    expect(block).toBe([
      "src/usage.ts:L10-L12",
      "```diff",
      "   const rows = read();",
      "-  return rows.length;",
      "+  const total = rows.reduce((sum, row) => sum + row.tokens, 0);",
      "+  return total;",
      "```",
      "Sum the cached tokens too.",
    ].join("\n"));
    expect(appendBlock("", block)).toBe(block);
    expect(appendBlock("Looks close.  \n", block)).toBe(`Looks close.\n\n${block}`);
  });

  it("names removed-only lines by their old numbers, and a hunk heading picks no lines", () => {
    const rows = diffRows(patch);
    expect(rangeLabel("a.ts", pickedRows(rows, rows[8]!.key, rows[8]!.key))).toBe("a.ts:L40 (removed)");
    expect(pickedRows(rows, rows[0]!.key, rows[0]!.key)).toEqual([]);
    expect(pickedRows(rows, "missing", rows[0]!.key)).toEqual([]);
  });

  it("counts files and lines for the list and the folder headings", () => {
    const files = [{ path: "a", status: "modified" as const, additions: 3, deletions: 1 }, { path: "logo.png", status: "modified" as const, additions: -1, deletions: -1, binary: true as const }];
    expect(diffSummary(files)).toBe("2 files · +3 −1");
    expect(fileCounts(files[0]!)).toBe("+3 −1");
    expect(fileCounts(files[1]!)).toBe("Binary");
    expect(changedLabel([])).toBeNull();
    expect(changedLabel([{ path: "a", status: "modified", staged: false }, { path: "b", status: "untracked", staged: false }])).toBe("2 changed");
  });

  it("offers Review only on a computer from protocol 4 that lets this phone read code", () => {
    expect(readsCode({ status: "connected", protocol: 4, capabilities: ["code"] })).toBe(true);
    expect(readsCode({ status: "connected", protocol: 4, capabilities: [] })).toBe(false);
    expect(readsCode({ status: "connected", protocol: 3, capabilities: ["code"] })).toBe(false);
    expect(readsCode({ status: "offline" })).toBe(false);
  });
});
