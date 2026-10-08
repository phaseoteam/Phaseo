import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PromptCommands } from "./promptCommands";
import { expandPromptCommand } from "../shared/promptCommands";
const fixture = () => { const root = mkdtempSync(path.join(tmpdir(), "phaseo-commands-")); const global = path.join(root, "global"), project = path.join(root, "project"); mkdirSync(global); mkdirSync(project); return { root, global, project, commands: new PromptCommands(global, project) }; };
describe("reusable prompt commands", () => {
 it("saves project and global commands, previews literal arguments, and rejects stale edits", async () => {
  const f = fixture(); try {
   await f.commands.request({ type: "save", scope: "global", name: "review", description: "Global", template: "Review $ARGUMENTS", expectedHash: "new" });
   const project = await f.commands.request({ type: "save", scope: "project", name: "review", description: "Project", template: "Check $1 using $2", expectedHash: "new" });
   expect(await f.commands.list()).toEqual({ commands: [expect.objectContaining({ scope: "global", name: "review" }), expect.objectContaining({ scope: "project", name: "review" })], errors: [] });
   expect(await f.commands.request({ type: "preview", scope: "project", name: "review", arguments: '"file with spaces" one two' })).toEqual(expect.objectContaining({ text: "Check file with spaces using one two" }));
   await expect(f.commands.request({ type: "save", scope: "project", name: "review", description: "", template: "Changed", expectedHash: "stale" })).rejects.toThrow("changed");
   if (!("hash" in project)) throw Error("Missing saved revision"); await f.commands.request({ type: "save", scope: "project", name: "review", description: "Updated", template: "Changed", expectedHash: project.hash });
   expect(await new PromptCommands(f.global).list()).toEqual({ commands: [expect.objectContaining({ scope: "global", name: "review" })], errors: [] });
   expect(readFileSync(path.join(f.project, ".phaseo/commands/review.md"), "utf8")).toContain("Changed");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
 });
 it.each(["../escape", "A", "a/b", "", "x\0y"])("rejects an invalid command identity %s", async name => { const f = fixture(); try { await expect(f.commands.request({ type: "save", scope: "global", name, description: "", template: "Owned", expectedHash: "new" })).rejects.toThrow("lowercase"); } finally { rmSync(f.root, { recursive: true, force: true }); } });
 it("reports invalid files without returning their templates or hiding valid commands", async () => {
  const f = fixture(); try {
   mkdirSync(path.join(f.global, "commands")); writeFileSync(path.join(f.global, "commands/good.md"), "---\ndescription: |\n  Owned multiline description\n---\nOwned text");
   writeFileSync(path.join(f.global, "commands/invalid.md"), Buffer.from([255])); writeFileSync(path.join(f.global, "commands/large.md"), "😀".repeat(4097)); writeFileSync(path.join(f.global, "commands/duplicate.md"), "---\ndescription: a\ndescription: b\n---\nOwned"); writeFileSync(path.join(f.global, "commands/policy.md"), "---\nmodel: hidden-model\n---\nOwned"); writeFileSync(path.join(f.global, "commands/shell.md"), 'Run !`touch owned`');
   const catalog = await f.commands.list(); expect(catalog.commands).toHaveLength(1); expect(catalog.commands[0].description).toBe("Owned multiline description\n"); expect(catalog.errors).toHaveLength(5); expect(catalog.commands[0]).not.toHaveProperty("template");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
 });
 it("rejects outside links for reading and saving", async () => {
  const f = fixture(); try {
   const outside = path.join(f.root, "outside"); mkdirSync(outside); writeFileSync(path.join(outside, "escape.md"), "Outside secret"); mkdirSync(path.join(f.global, "commands")); symlinkSync(path.join(outside, "escape.md"), path.join(f.global, "commands/escape.md"), "file");
   expect((await f.commands.list()).errors).toEqual([expect.stringContaining("outside")]); await expect(f.commands.request({ type: "preview", scope: "global", name: "escape", arguments: "" })).rejects.toThrow("outside");
   symlinkSync(outside, path.join(f.project, ".phaseo"), process.platform === "win32" ? "junction" : "dir"); await expect(f.commands.request({ type: "save", scope: "project", name: "owned", description: "", template: "Owned", expectedHash: "new" })).rejects.toThrow("outside");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
 });
 it("preserves a BOM in revision checks while parsing the Markdown document", async () => {
  const f = fixture(); try {
   mkdirSync(path.join(f.global, "commands")); writeFileSync(path.join(f.global, "commands/bom.md"), "\uFEFF---\ndescription: Owned\n---\nOwned prompt");
   const preview = await f.commands.request({ type: "preview", scope: "global", name: "bom", arguments: "" });
   expect(preview).toEqual(expect.objectContaining({ description: "Owned", text: "Owned prompt" })); if (!("hash" in preview)) throw Error("Missing revision");
   await f.commands.request({ type: "save", scope: "global", name: "bom", description: "", template: "Updated", expectedHash: preview.hash });
   expect(readFileSync(path.join(f.global, "commands/bom.md"), "utf8")).toContain("Updated");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
 });
 it("bounds files and arguments and rejects NUL before writing", async () => { const f = fixture(); try {
  await expect(f.commands.request({ type: "save", scope: "global", name: "large", description: "", template: "😀".repeat(4096), expectedHash: "new" })).rejects.toThrow("16 KiB");
  await expect(f.commands.request({ type: "save", scope: "global", name: "binary", description: "", template: "text\0data", expectedHash: "new" })).rejects.toThrow("contain text");
  await expect(f.commands.request({ type: "preview", scope: "global", name: "owned", arguments: "a".repeat(10001) })).rejects.toThrow("arguments");
  mkdirSync(path.join(f.global, "commands")); for (let i=0;i<201;i++) writeFileSync(path.join(f.global, `commands/command-${i}.md`), "Owned"); await expect(f.commands.list()).rejects.toThrow("200 files");
 } finally { rmSync(f.root, { recursive: true, force: true }); } });
 it("expands placeholders once and retains additional input", () => {
  expect(expandPromptCommand("Review $ARGUMENTS", '$2 !`never run`')).toBe('Review $2 !`never run`');
  expect(expandPromptCommand("Review $1 against $2", "'one two' three four")).toBe("Review one two against three four");
  expect(expandPromptCommand("Literal $0; $1", "owned")).toBe("Literal $0; owned");
  expect(expandPromptCommand("Review changes", "owned context")).toBe("Review changes\n\nowned context");
  expect(() => expandPromptCommand("$ARGUMENTS $ARGUMENTS", "x".repeat(50001))).toThrow("message limit");
 });
});
