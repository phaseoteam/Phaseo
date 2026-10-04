import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Account, Task } from "../shared/workspace";
import { answerPhaseoQuestion } from "./phaseoQuestionTools";
import { PhaseoAdapter } from "./phaseoAdapter";
import { PhaseoCodingAdapter } from "./phaseoCodingAdapter";
import { WorkspaceStore } from "./workspaceStore";
const input = { questions: [{ header: "Direction", question: "Which direction?", options: [{ label: "A" }, { label: "B" }] }] };
const account: Account = { id: "owned", name: "Owned", harness: "phaseo", kind: "api", configured: true, endpoint: "http://127.0.0.1:1/v1" };
const sse = (message: { content: string; toolCalls?: { id: string; name: string; input: unknown }[] }) => new Response('data: '+JSON.stringify({ choices: [{ delta: message.toolCalls ? { tool_calls: message.toolCalls.map((call, index) => ({ index, id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.input) } })) } : { content: message.content }, finish_reason: message.toolCalls ? "tool_calls" : "stop" }] })+'\n\ndata: [DONE]\n\n');
describe("durable Phaseo questions", () => {
 it.each(["chat", "code", "plan"] as const)("keeps a newer plan across a second question after recovery in %s", async mode => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-plan-revision-")); let store = new WorkspaceStore(path.join(root, "state.sqlite")), runId = "";
  const global = path.join(root, "instructions"); mkdirSync(global); for (const name of ["original", "revised"]) { const directory = path.join(root, "skills", name); mkdirSync(directory, { recursive: true }); writeFileSync(path.join(directory, "SKILL.md"), "---\nname: " + name + "\ndescription: Owned selected guidance\n---\n" + name + " guidance"); }
  const task: Task = { id: "task", title: "Owned", harness: "phaseo", model: "owned", mode, status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };
  const oldPlan = { steps: [{ text: "Original plan", status: "pending" }], explanation: "" }, newPlan = { steps: [{ text: "Revised plan", status: "completed" }], explanation: "Confirmed revision" };
  const message = (plan: typeof oldPlan, id: string) => ({ role: "assistant" as const, content: "", toolCalls: [{ id: "plan-" + id, name: "update_plan", input: plan }, { id, name: "ask_user", input }] });
  try {
   const callbacks = { onSession: (id: string) => { runId = id; }, onDelta: () => {}, onApproval: async () => "accept" as const, onQuestion: async () => { await original.cancel(); return {}; } };
   const original = mode === "chat" ? new PhaseoAdapter(() => "owned", vi.fn(async () => sse(message(oldPlan, "old-question"))), global, store) : new PhaseoCodingAdapter(() => "owned", store, () => ({ generate: async () => ({ message: message(oldPlan, "old-question") }) }), [], global);
   await expect(original.run(task, root, "Begin", callbacks, account, [], { kind: "skill", id: "global:original", name: "original", arguments: "Begin" })).rejects.toThrow(/aborted|stopped/i); expect(store.loadAgentRun(runId)?.run.context).toEqual({ phaseoPlan: oldPlan, phaseoSkill: { id: "global:original", name: "original" } });
   store.close(); store = new WorkspaceStore(path.join(root, "state.sqlite")); let step = 0;
   const next = () => step++ === 0 ? message(newPlan, "new-question") : { role: "assistant" as const, content: "Finished", toolCalls: [] };
   const questions = vi.fn(async () => ({ "question-0": ["A"] }));
   const resumed = mode === "chat" ? new PhaseoAdapter(() => "owned", vi.fn(async () => sse(next())), global, store) : new PhaseoCodingAdapter(() => "owned", store, () => ({ generate: async () => ({ message: next() }) }), [], global);
   await resumed.run({ ...task, nativeSessionId: runId }, root, "Continue", { ...callbacks, onQuestion: questions }, account, [], { kind: "skill", id: "global:revised", name: "revised", arguments: "Continue" });
   expect(questions).toHaveBeenCalledTimes(2); expect(store.loadAgentRun(runId)?.run.status).toBe("completed"); expect(store.loadAgentRun(runId)?.run.context).toEqual({ phaseoPlan: newPlan, phaseoSkill: { id: "global:revised", name: "revised" } });
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
 });

 it("accepts bounded multiple choices and a free-text question together", async () => {
  const raw = { questions: [{ header: "Choices", question: "Select options", multiSelect: true, options: [{ label: "A" }, { label: "B" }] }, { header: "Details", question: "Describe the work" }] };
  const result = await answerPhaseoQuestion(raw, { onDelta: () => {}, onSession: () => {}, onApproval: async () => "accept", onQuestion: async () => ({ "question-0": ["A", "B"], "question-1": ["Owned details"] }) }, new AbortController().signal);
  expect(result).toEqual({ answers: [{ question: "Select options", answers: ["A", "B"] }, { question: "Describe the work", answers: ["Owned details"] }] });
 });
 it.each([{ values: [] as string[] }, { values: ["A", "B"] }, { values: ["x".repeat(10001)] }])("rejects missing or oversized single-choice answers (%#)", async ({ values }) => {
  await expect(answerPhaseoQuestion(input, { onDelta: () => {}, onSession: () => {}, onApproval: async () => "accept", onQuestion: async () => ({ "question-0": values }) }, new AbortController().signal)).rejects.toThrow();
 });
 it.each(["chat", "code", "plan"] as const)("restores an unanswered question after SQLite reopen in %s", async mode => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-question-")); let store = new WorkspaceStore(path.join(root, "state.sqlite")), runId = "";
  const task: Task = { id: "task", title: "Owned", harness: "phaseo", model: "owned", mode, status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };
  const questionMessage = { role: "assistant" as const, content: "", toolCalls: [{ id: "ask", name: "ask_user", input }] };
  try {
   const callbacks = { onSession: (id: string) => { runId = id; }, onDelta: () => {}, onApproval: vi.fn(async () => "accept" as const), onQuestion: vi.fn(async () => { expect(store.loadAgentRun(runId)?.run.status).toBe("waiting_for_human"); await original.cancel(); return {}; }) };
   const original = mode === "chat" ? new PhaseoAdapter(() => "owned", vi.fn(async () => sse(questionMessage)), undefined, store) : new PhaseoCodingAdapter(() => "owned", store, () => ({ generate: async () => ({ message: questionMessage }) }));
   await expect(original.run(task, root, "Choose", callbacks, account)).rejects.toThrow(/aborted|stopped/i);
   expect(callbacks.onApproval).not.toHaveBeenCalled(); expect(store.loadAgentRun(runId)?.run.pause?.pendingToolCalls?.[0].kind).toBe("manual");
   store.close(); store = new WorkspaceStore(path.join(root, "state.sqlite"));
   const answer = vi.fn(async questions => { expect(questions).toEqual([expect.objectContaining({ id: "question-0", question: "Which direction?", isOther: true })]); return { "question-0": ["Custom direction"] }; });
   const check = (messages: { role: string; content: unknown }[]) => { const tool = messages.find(message => message.role === "tool"); expect(JSON.parse(tool!.content as string)).toEqual({ answers: [{ question: "Which direction?", answers: ["Custom direction"] }] }); expect(messages.filter(message => message.role === "user" && message.content === "Continue")).toHaveLength(1); return { role: "assistant" as const, content: "Finished" }; };
   const resumed = mode === "chat" ? new PhaseoAdapter(() => "owned", vi.fn(async (_url, options) => sse(check(JSON.parse(options.body as string).messages))), undefined, store) : new PhaseoCodingAdapter(() => "owned", store, () => ({ generate: async request => ({ message: check(request.messages) }) }));
   await resumed.run({ ...task, nativeSessionId: runId }, root, "Continue", { ...callbacks, onQuestion: answer }, account);
   expect(answer).toHaveBeenCalledOnce(); expect(store.loadAgentRun(runId)?.run.status).toBe("completed");
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
 });
 it.each([null, { questions: [] }, { questions: [{ header: "X", question: "Q", options: [{ label: "same" }, { label: "same" }] }] }, { questions: [{ header: "X", question: "x".repeat(4001) }] }])("rejects malformed questions before asking (%#)", async raw => {
  const question = vi.fn(); await expect(answerPhaseoQuestion(raw, { onDelta: () => {}, onSession: () => {}, onApproval: async () => "accept", onQuestion: question }, new AbortController().signal)).rejects.toThrow(); expect(question).not.toHaveBeenCalled();
 });
});
