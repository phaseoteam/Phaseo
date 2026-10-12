import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PhaseoSkills } from "./phaseoSkills";
import { AgentInputRejectedError } from "./agentAdapter";
import { ProjectInstructions } from "./projectInstructions";
function skill(root: string, directory: string, name: string, content = `---\nname: ${name}\ndescription: Explain the requested topic\n---\nOwned instructions`) { const file = path.join(root, directory, name, "SKILL.md"); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, content); return file; }
describe("Phaseo skill catalog", () => {
 it("filters invocation policies independently for users and models", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-skill-policies-"));
  const definition = (name: string, policy: string) => `---\nname: ${name}\ndescription: Policy fixture\n${policy}\n---\nOwned instructions`;
  try {
   skill(root, "skills", "user-only", definition("user-only", "disable-model-invocation: YES"));
   skill(root, "skills", "model-only", definition("model-only", "user-invocable: off"));
   skill(root, "skills", "disabled", definition("disabled", "enabled: false"));
   skill(root, "skills", "invalid", definition("invalid", "enabled: sometimes"));
   const skills = new PhaseoSkills(root);
   expect((await skills.catalog()).actions.map(entry => entry.name)).toEqual(["user-only"]);
   expect((await skills.catalog(undefined, "model")).actions.map(entry => entry.name)).toEqual(["model-only"]);
   expect((await skills.catalog()).errors).toHaveLength(1);
   for (const name of ["model-only", "disabled"]) await expect(skills.approve({ kind: "skill", id: `global:${name}`, name, arguments: "" }, { onDelta: () => {}, onSession: () => {}, onApproval: async () => { throw new Error("Must not ask for approval"); } }, new AbortController().signal)).rejects.toThrow("unavailable for user activation");
  } finally { rmSync(root, { recursive: true, force: true }); }
 });
 it.each(["enabled: no", "user-invocable: false"])("stops active guidance when its invocation policy is revoked: %s", async policy => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-skill-revoked-")), file = skill(root, "skills", "review");
  try {
   const skills = new PhaseoSkills(root), controller = new AbortController();
   const approved = await skills.approve({ kind: "skill", id: "global:review", name: "review", arguments: "" }, { onDelta: () => {}, onSession: () => {}, onApproval: async () => "accept" }, controller.signal);
   const reader = skills.instructionReader(approved, controller.signal); await reader();
   writeFileSync(file, readFileSync(file, "utf8").replace("description:", `${policy}\ndescription:`));
   await expect(reader()).rejects.toThrow("unavailable for user activation");
  } finally { rmSync(root, { recursive: true, force: true }); }
 });
 it("counts disabled definitions toward the discovery limit", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-skills-disabled-limit-"));
  try { for (let index = 0; index < 201; index++) skill(root, "skills", `skill-${index}`, `---\nname: skill-${index}\ndescription: Disabled\nenabled: false\n---\nBody`); await expect(new PhaseoSkills(root).catalog()).rejects.toThrow("200 definitions"); }
  finally { rmSync(root, { recursive: true, force: true }); }
 });
 it("closes the gap between activation approval and the first instruction load", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-skill-first-load-")), file = skill(root, "skills", "review");
  try { const skills = new PhaseoSkills(root), controller = new AbortController(), approved = await skills.approve({ kind: "skill", id: "global:review", name: "review", arguments: "" }, { onDelta: () => {}, onSession: () => {}, onApproval: async () => "accept" }, controller.signal); const reader = skills.instructionReader(approved, controller.signal); writeFileSync(file, readFileSync(file, "utf8") + "\nUnreviewed change"); await expect(reader()).rejects.toThrow("after approval"); }
  finally { rmSync(root, { recursive: true, force: true }); }
 });
 it("includes refreshed active skill guidance in effect revisions", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-active-skill-")); const file = skill(root, "skills", "review");
  try { const skills = new PhaseoSkills(root), instructions = new ProjectInstructions(root, undefined, undefined, async () => { const active = await skills.read("global:review"); return { path: active.path!, text: active.content }; }); await instructions.load(".", true); const before = instructions.revision(); writeFileSync(file, readFileSync(file, "utf8") + "\nChanged skill guidance"); await instructions.refresh(); expect(instructions.revision()).not.toBe(before); expect(instructions.prompt()).toContain("Changed skill guidance"); }
  finally { rmSync(root, { recursive: true, force: true }); }
 });
 it("requires approval of the full current body and rejects approval-time changes", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-skill-approve-")); const file = skill(root, "skills", "review"); const action = { kind: "skill" as const, id: "global:review", name: "review", arguments: "target" };
  try { const skills = new PhaseoSkills(root); let details = ""; const result = await skills.approve(action, { onDelta: () => {}, onSession: () => {}, onApproval: async (_title, text) => { details = text; return "accept"; } }, new AbortController().signal); expect(result.content).toBe("Owned instructions"); expect(details).toContain("Owned instructions"); expect(details).toContain("target"); await expect(skills.approve(action, { onDelta: () => {}, onSession: () => {}, onApproval: async () => { writeFileSync(file, readFileSync(file, "utf8") + "\nChanged"); return "accept"; } }, new AbortController().signal)).rejects.toBeInstanceOf(AgentInputRejectedError); }
  finally { rmSync(root, { recursive: true, force: true }); }
 });
 it("rejects declined and cancelled activation without reading the model", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-skill-decline-")); skill(root, "skills", "review"); const action = { kind: "skill" as const, id: "global:review", name: "review", arguments: "" };
  try { const skills = new PhaseoSkills(root); await expect(skills.approve(action, { onDelta: () => {}, onSession: () => {}, onApproval: async () => "decline" }, new AbortController().signal)).rejects.toThrow("declined"); const controller = new AbortController(); await expect(skills.approve(action, { onDelta: () => {}, onSession: () => {}, onApproval: async () => { controller.abort(); return "accept"; } }, controller.signal)).rejects.toBeInstanceOf(AgentInputRejectedError); }
  finally { rmSync(root, { recursive: true, force: true }); }
 });
 it("bounds the number of definitions before returning a catalog", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-skills-limit-"));
  try { for (let index = 0; index < 201; index++) skill(root, "skills", `skill-${index}`); await expect(new PhaseoSkills(root).catalog()).rejects.toThrow("200 definitions"); }
  finally { rmSync(root, { recursive: true, force: true }); }
 }, 15000);
 it("keeps global, project and compatible identities distinct without exposing bodies", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-skills-")), project = path.join(root, "project"); mkdirSync(project);
  try { skill(root, "skills", "explain"); skill(project, ".phaseo/skills", "explain"); skill(project, ".agents/skills", "review"); const skills = new PhaseoSkills(root, project), catalog = await skills.catalog(); expect(catalog.errors).toEqual([]); expect(catalog.actions.map(entry => entry.id)).toEqual(["project:explain", "agents:review", "global:explain"]); expect(JSON.stringify(catalog)).not.toContain("Owned instructions"); expect((await skills.read("agents:review")).content).toBe("Owned instructions"); expect((await new PhaseoSkills(root).catalog()).actions.map(entry => entry.id)).toEqual(["global:explain"]); }
  finally { rmSync(root, { recursive: true, force: true }); }
 });
 it("reports malformed definitions, mismatched names and invalid text", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-skills-invalid-"));
  try { skill(root, "skills", "valid"); skill(root, "skills", "mismatch", "---\nname: other\ndescription: Invalid\n---\nBody"); skill(root, "skills", "missing", "No metadata"); const binary = skill(root, "skills", "binary"); writeFileSync(binary, Buffer.from([0xff])); const catalog = await new PhaseoSkills(root).catalog(); expect(catalog.actions).toHaveLength(1); expect(catalog.errors).toHaveLength(3); await expect(new PhaseoSkills(root).read("global:../outside")).rejects.toThrow("identity"); }
  finally { rmSync(root, { recursive: true, force: true }); }
 });
 it("rejects byte overflow and changes activation revisions when files change", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-skills-revisions-"));
  try { const file = skill(root, "skills", "review"), skills = new PhaseoSkills(root), before = await skills.read("global:review"); skill(root, "skills", "review", "---\nname: review\ndescription: Updated\n---\nChanged instructions"); const after = await skills.read("global:review"); expect(after.hash).not.toBe(before.hash); writeFileSync(file, "😀".repeat(4096) + "x"); await expect(skills.read("global:review")).rejects.toThrow("16 KiB"); }
  finally { rmSync(root, { recursive: true, force: true }); }
 });
});
