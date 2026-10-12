import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GlobalInstructions } from "./globalInstructions";

describe("global instruction editing", () => {
 it("persists bounded Unicode guidance, including BOM revisions and clearing", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-global-edit-"));
  try { const instructions = new GlobalInstructions(root); expect(await instructions.read()).toEqual({ content: "", hash: "new" }); const saved = await instructions.save({ content: "\ufeff" + "😀".repeat(4095), expectedHash: "new" }); expect((await new GlobalInstructions(root).read())).toEqual(saved); const empty = await instructions.save({ content: "", expectedHash: saved.hash }); expect(empty.content).toBe(""); expect(readFileSync(path.join(root, "AGENTS.md"), "utf8")).toBe(""); }
  finally { rmSync(root, { recursive: true, force: true }); }
 });
 it("retains external edits and serializes concurrent saves from the same revision", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-global-stale-"));
  try { const instructions = new GlobalInstructions(root); const results = await Promise.allSettled([instructions.save({ content: "First", expectedHash: "new" }), instructions.save({ content: "Second", expectedHash: "new" })]); expect(results.map(result => result.status)).toEqual(["fulfilled", "rejected"]); const loaded = await instructions.read(); writeFileSync(path.join(root, "AGENTS.md"), "External"); await expect(instructions.save({ content: "Stale", expectedHash: loaded.hash })).rejects.toThrow("changed"); expect(readFileSync(path.join(root, "AGENTS.md"), "utf8")).toBe("External"); }
  finally { rmSync(root, { recursive: true, force: true }); }
 });
 it("rejects oversized, binary, invalid Unicode and malformed revision edits", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-global-bounds-"));
  try { const instructions = new GlobalInstructions(root); for (const content of ["😀".repeat(4096) + "x", "binary\0text", "\ud800"]) await expect(instructions.save({ content, expectedHash: "new" })).rejects.toThrow("UTF-8"); await expect(instructions.save({ content: "Valid", expectedHash: "bad" })).rejects.toThrow("revision"); expect(await instructions.read()).toEqual({ content: "", hash: "new" }); }
  finally { rmSync(root, { recursive: true, force: true }); }
 });
});
