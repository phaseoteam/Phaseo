import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAgent, defineTool } from "@phaseo/agent-sdk";
import type { AgentRunResult } from "@phaseo/agent-sdk";
import { describe, expect, it, vi } from "vitest";
import { phaseoPlanTools, publishPhaseoPlan } from "./phaseoPlanTools";
import { WorkspaceStore } from "./workspaceStore";

const current = { steps: [{ text: "Inspect project", status: "completed" }, { text: "Implement", status: "in_progress" }], explanation: "Inspection finished" };
describe("Phaseo plan checkpoints", () => {
 it("recovers a checklist from SQLite before approved execution and retains unrelated context", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-plan-")); let store = new WorkspaceStore(path.join(root, "state.sqlite"));
  try {
   const activity = vi.fn(), callbacks = { onActivity: activity, onDelta: () => {}, onSession: () => {}, onApproval: async () => "accept" as const };
   const state = { load: async (id: string) => store.loadAgentRun(id) as AgentRunResult<string, unknown> | null, save: async (result: AgentRunResult<string, unknown>) => { store.saveAgentRun(result); publishPhaseoPlan(result.run.context, callbacks); } };
   const agent = createAgent({ id: "owned-plan", tools: [...phaseoPlanTools(), defineTool({ id: "effect", requireApproval: true, execute: () => "owned effect" })] });
   const generate = vi.fn().mockResolvedValueOnce({ message: { role: "assistant", content: "", toolCalls: [{ id: "plan", name: "update_plan", input: current }, { id: "read-after-plan", name: "read_plan", input: {} }] } }).mockResolvedValueOnce({ message: { role: "assistant", content: "", toolCalls: [{ id: "effect", name: "effect", input: {} }] } });
   const paused = await agent.run({ input: "Implement", context: { retained: "owned" }, client: { generate }, state });
   expect(JSON.parse(paused.run.messages.find(message => message.role === "tool" && message.toolCallId === "read-after-plan")!.content as string)).toEqual(current);
   expect(paused.run.status).toBe("waiting_for_human"); expect(paused.run.context).toEqual({ retained: "owned", phaseoPlan: current });
   expect(activity).toHaveBeenLastCalledWith(expect.objectContaining({ id: "phaseo-plan", type: "plan", steps: current.steps }));
   store.close(); store = new WorkspaceStore(path.join(root, "state.sqlite")); const recovered = await state.load(paused.run.id);
   const resumed = vi.fn().mockResolvedValueOnce({ message: { role: "assistant", content: "", toolCalls: [{ id: "read", name: "read_plan", input: {} }] } }).mockImplementationOnce(async request => { expect(JSON.parse(request.messages.at(-1).content)).toEqual(current); return { message: { role: "assistant", content: "Done" } }; });
   const result = await agent.continueRun({ run: recovered!, approvals: ["effect"], client: { generate: resumed }, state });
   expect(result.run.status).toBe("completed"); expect(store.loadAgentRun(result.run.id)?.run.context).toEqual({ retained: "owned", phaseoPlan: current });
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
 });
 it.each([null, { steps: [{ text: " ", status: "pending" }] }, { steps: [{ text: "X", status: "unknown" }] }, { steps: Array.from({ length: 201 }, () => ({ text: "X", status: "pending" })) }, { steps: [{ text: "A", status: "in_progress" }, { text: "B", status: "in_progress" }] }, { steps: Array.from({ length: 10 }, () => ({ text: "界".repeat(3000), status: "pending" })) }, { steps: [], explanation: "x".repeat(4001) }])("rejects malformed or oversized plans without changing context (%#)", async input => {
  const agent = createAgent({ id: "invalid-plan", tools: phaseoPlanTools() }); let step = 0;
  const result = await agent.run({ input: "Plan", context: { retained: true }, client: { generate: async () => ({ message: { role: "assistant", content: "", ...(step++ === 0 ? { toolCalls: [{ id: "invalid", name: "update_plan", input }] } : {}) } }) } });
  expect(result.run.context).toEqual({ retained: true }); expect(result.run.messages.some(message => message.role === "tool" && message.isError)).toBe(true);
 });
 it("clears the plan explicitly and supports cancelled steps", async () => {
  const agent = createAgent({ id: "clear-plan", tools: phaseoPlanTools() }); let step = 0;
  const result = await agent.run({ input: "Plan", client: { generate: async () => ({ message: { role: "assistant", content: "", ...(step < 2 ? { toolCalls: [{ id: String(step), name: "update_plan", input: step++ === 0 ? { steps: [{ text: "Abandoned", status: "cancelled" }] } : { steps: [] } }] } : {}) } }) } });
  expect(result.run.context).toEqual({ phaseoPlan: { steps: [], explanation: "" } });
 });
});
