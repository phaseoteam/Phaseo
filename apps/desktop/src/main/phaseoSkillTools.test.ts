import { realpathSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAgent } from "@phaseo/agent-sdk";
import type { AgentRunResult } from "@phaseo/agent-sdk";
import { describe, expect, it } from "vitest";
import { PhaseoSkills } from "./phaseoSkills";
import { PhaseoSkillTools } from "./phaseoSkillTools";
import { WorkspaceStore } from "./workspaceStore";

describe("model-requested Phaseo skill tools", () => {
 it.each(["decline", "unreviewed"])("does not activate a skill after %s", async decision => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-model-skill-reject-")), folder = path.join(root, "skills", "review"); mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, "SKILL.md"), "---\nname: review\ndescription: Review\n---\nPrivate body");
  try {
   const toolkit = new PhaseoSkillTools(new PhaseoSkills(root), new AbortController().signal), agent = createAgent({ id: "owned-rejection", tools: toolkit.tools() }); let step = 0;
   const client = { generate: async () => ({ message: { role: "assistant" as const, content: "", ...(step++ === 0 ? { toolCalls: [{ id: "activate", name: "load_skill", input: { id: "global:review" } }] } : {}) } }) };
   const pending = await agent.run({ input: "Review", client });
   if (decision === "decline") await toolkit.review(pending.run.pause!.pendingToolCalls![0].call);
   const result = await agent.continueRun({ run: pending, client, ...(decision === "decline" ? { rejections: ["activate"] } : { approvals: ["activate"] }) });
   expect(result.run.status).toBe("completed"); expect(await toolkit.instructions()).toEqual([]); expect(result.run.context).toBeUndefined();
   expect(JSON.stringify(result.run.messages)).not.toContain("Private body");
  } finally { rmSync(root, { recursive: true, force: true }); }
 });
 it.each([false, true])("persists activation only after reviewed, unchanged approval (changed=%s)", async changed => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-model-skills-")), folder = path.join(root, "skills", "review"); mkdirSync(folder, { recursive: true });
  const file = path.join(folder, "SKILL.md"); writeFileSync(file, "---\nname: review\ndescription: Review a project\n---\nOwned private skill body");
  let store = new WorkspaceStore(path.join(root, "state.sqlite"));
  try {
   let toolkit = new PhaseoSkillTools(new PhaseoSkills(root), new AbortController().signal);
   let agent = createAgent({ id: "owned-skills", tools: toolkit.tools(), instructions: async () => JSON.stringify(await toolkit.instructions()) });
   let step = 0;
   const client = { generate: async () => ({ message: { role: "assistant" as const, content: "", ...(step++ === 0 ? { toolCalls: [{ id: "activate", name: "load_skill", input: { id: "global:review" } }] } : {}) } }) };
   const state = { load: async (id: string) => store.loadAgentRun(id) as AgentRunResult<string, unknown, unknown> | null, save: async (result: Parameters<WorkspaceStore["saveAgentRun"]>[0]) => { store.saveAgentRun(result); } };
   const pending = await agent.run({ input: "Review", client, state });
   expect(pending.run.status).toBe("waiting_for_human");
   expect(store.loadAgentRun(pending.run.id)?.run.context).toBeUndefined();
   store.close(); store = new WorkspaceStore(path.join(root, "state.sqlite"));
   const restored = await state.load(pending.run.id); expect(restored?.run.status).toBe("waiting_for_human");
   toolkit = new PhaseoSkillTools(new PhaseoSkills(root), new AbortController().signal);
   agent = createAgent({ id: "owned-skills", tools: toolkit.tools(), instructions: async () => JSON.stringify(await toolkit.instructions()) });
   const review = await toolkit.review(restored!.run.pause!.pendingToolCalls![0].call); expect(review.details).toContain("Owned private skill body");
   if (changed) writeFileSync(file, readFileSync(file, "utf8") + "\nUnreviewed body");
   const result = await agent.continueRun({ run: restored!, client, state, approvals: ["activate"] });
   expect(result.run.status).toBe("completed");
   if (changed) { expect(await toolkit.instructions()).toEqual([]); expect(result.run.context).toBeUndefined(); expect(JSON.stringify(result.run.messages)).toContain("Skill changed during approval"); }
   else { expect(await toolkit.instructions()).toEqual([{ path: realpathSync(file), text: "Owned private skill body" }]); const context = store.loadAgentRun(result.run.id)?.run.context; expect(context).toEqual({ phaseoModelSkills: [expect.objectContaining({ id: "global:review", name: "review" })] }); expect(JSON.stringify(context)).not.toContain("Owned private skill body"); }
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
 });
});
