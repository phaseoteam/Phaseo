import { defineTool } from "@phaseo/agent-sdk";
import type { AgentToolCall } from "@phaseo/agent-sdk";
import type { PhaseoSkills } from "./phaseoSkills";
import type { AgentCallbacks } from "./agentAdapter";

type Activation = { id: string; name: string; hash: string; path: string };
/** Run-owned approvals; only identities and revisions enter durable SDK context. */
export class PhaseoSkillTools {
 private readonly reviewed = new Map<string, Activation>();
 private readonly active = new Map<string, Activation>();
 private readonly firstLoad = new Set<string>();
 constructor(private readonly skills: PhaseoSkills, private readonly signal: AbortSignal) {}
 snapshot() { return [...this.active.values()]; }
 async restore(context: unknown, callbacks: AgentCallbacks) {
  if (!context || typeof context !== "object" || !("phaseoModelSkills" in context)) return;
  const entries = context.phaseoModelSkills;
  if (!Array.isArray(entries) || entries.length > 32) throw new Error("Invalid saved model skill context.");
  const identities = new Set<string>();
  for (const entry of entries) {
   if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || typeof entry.name !== "string" || typeof entry.hash !== "string" || !/^[a-f0-9]{64}$/.test(entry.hash) || typeof entry.path !== "string" || identities.has(entry.id)) throw new Error("Invalid saved model skill context.");
   identities.add(entry.id);
   const call = { id: `restore:${entry.id}`, name: "load_skill", input: { id: entry.id } };
   const current = await this.skills.read(entry.id); if (current.name !== entry.name) throw new Error("Saved skill identity changed.");
   const review = await this.review(call);
   if (await callbacks.onApproval(review.title, review.details) !== "accept") throw new Error("Restored skill activation declined.");
   this.signal.throwIfAborted(); const confirmed = await this.skills.read(entry.id), approved = this.reviewed.get(call.id)!;
   this.reviewed.delete(call.id);
   if (confirmed.hash !== approved.hash || confirmed.path !== approved.path) throw new Error("Skill changed during approval. Review it again before running.");
   this.active.set(entry.id, approved); this.firstLoad.add(entry.id);
  }
  await this.instructions();
 }
 private id(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input) || !("id" in input) || typeof input.id !== "string") throw new Error("Expected a skill identity.");
  return input.id;
 }
 async review(call: AgentToolCall) {
  this.signal.throwIfAborted();
  if (call.name !== "load_skill") throw new Error("Expected a skill activation call.");
  const skill = await this.skills.read(this.id(call.input));
  this.signal.throwIfAborted();
  if (!skill.enabled || !skill.modelInvocable) throw new Error("This skill is unavailable for model activation.");
  this.reviewed.set(call.id, { id: skill.id, name: skill.name, hash: skill.hash, path: skill.path! });
  return { title: `Use Phaseo skill ${skill.name}`, details: `${skill.path}\n\n${skill.content}` };
 }
 async instructions() {
  const instructions: { path: string; text: string }[] = [];
  for (const activation of this.active.values()) {
   this.signal.throwIfAborted(); const skill = await this.skills.read(activation.id);
   if (!skill.enabled || !skill.modelInvocable) throw new Error("An active skill is unavailable for model activation.");
   if (this.firstLoad.has(activation.id) && (skill.hash !== activation.hash || skill.path !== activation.path)) throw new Error("Skill changed after approval. Review it again before running.");
   instructions.push({ path: skill.path!, text: skill.content });
  }
  this.signal.throwIfAborted(); this.firstLoad.clear(); return instructions;
 }
 tools() {
  return [defineTool({ id: "list_skills", description: "Discover available skill names and descriptions without loading their instructions.", parameters: { type: "object", properties: {}, additionalProperties: false }, onError: "return-to-model", execute: async () => this.skills.catalog(this.signal, "model") }),
   defineTool({ id: "load_skill", description: "Activate a discovered skill after the user reviews its full instructions. Supply the catalog identity.", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false }, requireApproval: true, onError: "return-to-model",
    execute: async (input: unknown, context) => {
     this.signal.throwIfAborted();
     const id = this.id(input), reviewed = this.reviewed.get(context.toolCall.id);
     this.reviewed.delete(context.toolCall.id);
     if (!reviewed || reviewed.id !== id) throw new Error("Skill instructions have not been reviewed for this call.");
     const skill = await this.skills.read(id); this.signal.throwIfAborted();
     if (!skill.enabled || !skill.modelInvocable || skill.hash !== reviewed.hash || skill.path !== reviewed.path) return { blocked: true, reason: "Skill changed during approval. Request activation again to review it." };
     if (!this.active.has(id) && this.active.size >= 32) throw new Error("Active skills exceed 32 definitions.");
     const next = new Map(this.active); next.set(id, reviewed);
     if (Buffer.byteLength(JSON.stringify(await Promise.all([...next.values()].map(async entry => ({ path: entry.path, text: (await this.skills.read(entry.id)).content }))))) > 64 * 1024) throw new Error("Active skill instructions exceed 64 KiB.");
     const confirmed = await this.skills.read(id); this.signal.throwIfAborted();
     if (!confirmed.enabled || !confirmed.modelInvocable || confirmed.hash !== reviewed.hash || confirmed.path !== reviewed.path) return { blocked: true, reason: "Skill changed during approval. Request activation again to review it." };
     this.active.set(id, reviewed); this.firstLoad.add(id);
     const saved = context.context && typeof context.context === "object" && !Array.isArray(context.context) ? context.context : {};
     context.setContext({ ...saved, phaseoModelSkills: [...this.active.values()] });
     return { id, name: skill.name, instructions: skill.content };
    },
   })];
 }
}
