import { fileLines, fileMention, folderChain, isMarkdown, readsFiles, sizeLabel, splitFilePath, treeRows, withMention, type Folder } from "./fileTree";

const entry = (path: string, directory = false) => ({ name: path.slice(path.lastIndexOf("/") + 1), path, directory });

describe("Files", () => {
  it("shows Files only from protocol 5 with Read code on", () => {
    expect(readsFiles({ status: "connected", protocol: 5, capabilities: ["code"] })).toBe(true);
    expect(readsFiles({ status: "connected", protocol: 4, capabilities: ["code"] })).toBe(false);
    expect(readsFiles({ status: "connected", protocol: 5, capabilities: [] })).toBe(false);
    expect(readsFiles({ status: "offline", protocol: 5, capabilities: ["code"] })).toBe(false);
  });

  it("lays out open folders under their parent, with a note while one reads, is empty or failed", () => {
    const folders = new Map<string, Folder>([
      ["", { entries: [entry("src", true), entry("docs", true), entry("empty", true), entry("README.md")], truncated: false }],
      ["src", { entries: [entry("src/usage.ts")], truncated: true }],
      ["empty", { entries: [], truncated: false }],
      ["broken", { error: "That project isn't on this computer any more." }],
    ]);
    const rows = treeRows(folders, new Set(["src", "docs", "empty"]));
    expect(rows.map((row) => (row.kind === "entry" ? `${row.depth}:${row.entry.path}${row.open ? " (open)" : ""}` : `${row.depth}:${row.text}`))).toEqual([
      "0:src (open)",
      "1:src/usage.ts",
      "1:More files are here than the phone shows. Search to find one.",
      "0:docs (open)",
      "1:Reading…",
      "0:empty (open)",
      "1:Empty folder",
      "0:README.md",
    ]);
    expect(treeRows(folders, new Set(), "broken")).toEqual([{ kind: "note", key: "note:broken", depth: 0, text: "That project isn't on this computer any more." }]);
    expect(treeRows(new Map([["", { entries: [], truncated: false }]]), new Set())).toEqual([{ kind: "note", key: "note:", depth: 0, text: "No files" }]);
  });

  it("opens a folder found by search with the folders above it, so it shows in the tree", () => {
    expect(folderChain("src/lib/deep")).toEqual(["src", "src/lib", "src/lib/deep"]);
    expect(folderChain("src")).toEqual(["src"]);
    const folders = new Map<string, Folder>([
      ["", { entries: [entry("src", true)], truncated: false }],
      ["src", { entries: [entry("src/lib", true)], truncated: false }],
      ["src/lib", { entries: [entry("src/lib/a.ts")], truncated: false }],
    ]);
    const shown = (open: Set<string>) => treeRows(folders, open).flatMap((row) => (row.kind === "entry" ? [row.entry.path] : []));
    expect(shown(new Set(["src/lib"]))).toEqual(["src"]);
    expect(shown(new Set(folderChain("src/lib")))).toEqual(["src", "src/lib", "src/lib/a.ts"]);
  });

  it("adds a file to the message the way the window names it", () => {
    expect(fileMention("src/usage.ts")).toBe("@src/usage.ts");
    expect(fileMention("src", true)).toBe("@src/");
    expect(withMention("", "@src/usage.ts")).toBe("@src/usage.ts ");
    expect(withMention("Look at  \n", "@src/usage.ts")).toBe("Look at @src/usage.ts ");
    expect(withMention("Look at @a.ts ", "@b.ts")).toBe("Look at @a.ts @b.ts ");
  });

  it("splits paths and lines, and words sizes", () => {
    expect(splitFilePath("src/lib/usage.ts")).toEqual({ name: "usage.ts", folder: "src/lib" });
    expect(splitFilePath("README.md")).toEqual({ name: "README.md", folder: "" });
    expect(isMarkdown("docs/Guide.MD")).toBe(true);
    expect(isMarkdown("src/md.ts")).toBe(false);
    expect(fileLines("a\r\nb\n")).toEqual(["a", "b"]);
    expect(fileLines("")).toEqual([""]);
    expect(fileLines("a\n\n")).toEqual(["a", ""]);
    expect(sizeLabel(1)).toBe("1 byte");
    expect(sizeLabel(812)).toBe("812 bytes");
    expect(sizeLabel(14 * 1024)).toBe("14 KB");
    expect(sizeLabel(1.4 * 1024 * 1024)).toBe("1.4 MB");
  });
});
