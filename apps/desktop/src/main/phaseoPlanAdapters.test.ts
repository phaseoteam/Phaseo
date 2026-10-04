import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Account, Task } from "../shared/workspace";
import { PhaseoCodingAdapter } from "./phaseoCodingAdapter";
import { PhaseoAdapter } from "./phaseoAdapter";
import { WorkspaceStore } from "./workspaceStore";
const account: Account = { id: "owned", name: "Owned", kind: "api", harness: "phaseo", configured: true, endpoint: "http://127.0.0.1:1/v1" };
describe("Phaseo checklist in every mode", () => {
 it.each(["chat", "code", "plan"] as const)("publishes durable progress in %s without an action approval", async mode => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-plan-adapter-")), store = new WorkspaceStore(path.join(root, "state.sqlite"));
  const task: Task = { id: "task", title: "Owned", harness: "phaseo", model: "owned", mode, status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };
  let step = 0, runId = ""; const activity = vi.fn(), approval = vi.fn(async () => "accept" as const);
  const next = (messages: Array<{ role: string; content: unknown }>) => {
   if (step++ === 0) return { role: "assistant" as const, content: "", toolCalls: [{ id: "update", name: "update_plan", input: { steps: [{ text: "Research", status: "in_progress" }] } }, { id: "read", name: "read_plan", input: {} }] };
   if (step === 2) { expect(JSON.parse(messages.at(-1)!.content as string)).toEqual({ steps: [{ text: "Research", status: "in_progress" }], explanation: "" }); return { role: "assistant" as const, content: "", toolCalls: [{ id: "complete", name: "update_plan", input: { steps: [{ text: "Research", status: "completed" }] } }] }; }
   return { role: "assistant" as const, content: "Finished" };
  };
  const callbacks = { onActivity: activity, onApproval: approval, onDelta: () => {}, onSession: (id: string) => { runId = id; } };
  try {
   if (mode === "chat") {
    const fetcher = vi.fn(async (_url, options) => { const body = JSON.parse(options.body as string); expect(body.tools.map((tool: { function: { name: string } }) => tool.function.name)).toEqual(["update_plan", "read_plan"]); const message = next(body.messages); const delta = message.toolCalls ? { tool_calls: message.toolCalls.map((call, index) => ({ index, id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.input) } })) } : { content: message.content }; return new Response('data: '+JSON.stringify({ choices: [{ delta, finish_reason: message.toolCalls ? "tool_calls" : "stop" }] })+'\n\ndata: [DONE]\n\n'); });
    await new PhaseoAdapter(() => "owned", fetcher, undefined, store).run(task, root, "Research", callbacks, account);
   } else await new PhaseoCodingAdapter(() => "owned", store, () => ({ generate: async request => ({ message: next(request.messages) }) })).run(task, root, "Research", callbacks, account);
   expect(approval).not.toHaveBeenCalled(); expect(store.loadAgentRun(runId)?.run.context).toEqual({ phaseoPlan: { steps: [{ text: "Research", status: "completed" }], explanation: "" } });
   expect(activity).toHaveBeenLastCalledWith(expect.objectContaining({ type: "plan", steps: [{ text: "Research", status: "completed" }] }));
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
 });
});
