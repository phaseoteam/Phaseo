import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Account, Task } from "../shared/workspace";
import { PhaseoAdapter } from "./phaseoAdapter";
import { WorkspaceStore } from "./workspaceStore";
const task: Task = { id: "task", title: "Owned", harness: "phaseo", mode: "chat", model: "owned", status: "idle", pinned: false, archived: false, queue: [], messages: [], createdAt: "", updatedAt: "" };
const account: Account = { id: "api", name: "Owned", harness: "phaseo", kind: "api", configured: true, endpoint: "http://127.0.0.1:1/v1" };
const call = (id: string, name: string, input: unknown) => new Response(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: JSON.stringify(input) } }] }, finish_reason: "tool_calls" }] })}\n\ndata: [DONE]\n\n`);
describe("durable Phaseo Chat skills", () => {
 it.each(["decline", "changed"])("keeps a %s activation out of Chat guidance", async outcome => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-chat-reject-")), global = path.join(root, "instructions"), skill = path.join(root, "skills", "explain", "SKILL.md"); mkdirSync(global); mkdirSync(path.dirname(skill), { recursive: true }); writeFileSync(skill, "---\nname: explain\ndescription: Explain\n---\nPrivate active body"); const store = new WorkspaceStore(path.join(root, "state.sqlite")); let runId = "";
  try {
   const fetcher = vi.fn().mockResolvedValueOnce(call("load", "load_skill", { id: "global:explain" })).mockImplementationOnce(async (_url, options) => { const body = JSON.parse(options.body); expect(body.messages[0].content).not.toContain("Private active body"); expect(body.messages.at(-1).content).toContain(outcome === "changed" ? "Skill changed during approval" : "rejected"); return new Response('data: {"choices":[{"delta":{"content":"Alternative answer"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'); });
   await new PhaseoAdapter(() => "owned", fetcher, global, store).run(task, ".", "Explain", { onDelta: () => {}, onSession: id => { runId = id; }, onApproval: async () => { if (outcome === "changed") writeFileSync(skill, readFileSync(skill, "utf8") + "\nChanged body"); return outcome === "decline" ? "decline" : "accept"; } }, account);
   expect(store.loadAgentRun(runId)?.run.context).toEqual({}); expect(store.loadAgentRun(runId)?.run.status).toBe("completed");
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
 });
 it("preserves image history, streamed text and active skill approval across SQLite restart", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-chat-run-")), global = path.join(root, "instructions"), skill = path.join(root, "skills", "explain", "SKILL.md"); mkdirSync(global); mkdirSync(path.dirname(skill), { recursive: true });
  writeFileSync(skill, "---\nname: explain\ndescription: Explain clearly\nuser-invocable: false\n---\nOriginal skill body");
  const image = { id: "image", taskId: "task", name: "image.png", kind: "image" as const, mimeType: "image/png", size: 3, filePath: "/owned-image", dataUrl: "data:image/png;base64,YWJj" };
  const current = { ...task, messages: [{ id: "question", role: "user" as const, text: "Describe", attachments: [image], createdAt: "" }] }; let store = new WorkspaceStore(path.join(root, "state.sqlite")), runId = "";
  try {
   const fetcher = vi.fn().mockImplementationOnce(async (_url, options) => { const body = JSON.parse(options.body); expect(body.messages.at(-1).content[1].image_url.url).toBe(image.dataUrl); expect(body.tools.map((tool: { function: { name: string } }) => tool.function.name)).toEqual(["update_plan", "read_plan", "ask_user", "list_skills", "load_skill"]); expect(JSON.stringify(body)).not.toContain("Original skill body"); return call("list", "list_skills", {}); })
   .mockImplementationOnce(async (_url, options) => { const body = JSON.parse(options.body); expect(body.messages.at(-1).tool_call_id).toBe("list"); expect(body.messages.at(-1).content).toContain("global:explain"); expect(body.messages.at(-1).content).not.toContain("Original skill body"); return call("activate", "load_skill", { id: "global:explain" }); })
   .mockImplementationOnce(async (_url, options) => { expect(JSON.parse(options.body).messages[0].content).toContain("Original skill body"); return call("pause", "load_skill", { id: "global:explain" }); });
   const adapter = new PhaseoAdapter(() => "owned-key", fetcher, global, store); let approvals = 0;
   await expect(adapter.run(current, ".", "Describe", { onDelta: () => {}, onSession: id => { runId = id; }, onApproval: async (_title, details) => { expect(details).toContain("Original skill body"); if (++approvals === 2) await adapter.cancel(); return "accept"; } }, account, [image])).rejects.toThrow("Task stopped");
   expect(store.loadAgentRun(runId)?.run.status).toBe("waiting_for_human"); expect(JSON.stringify(store.loadAgentRun(runId)?.run.context)).not.toContain("Original skill body");
   store.close(); store = new WorkspaceStore(path.join(root, "state.sqlite")); writeFileSync(skill, readFileSync(skill, "utf8").replace("Original skill body", "Updated skill body"));
   const resumed = vi.fn(async (_url, options) => { const body = JSON.parse(options.body); expect(body.messages[0].content).toContain("Updated skill body"); expect(JSON.stringify(body.messages)).toContain(image.dataUrl); expect(body.messages.some((message: { tool_call_id?: string }) => message.tool_call_id === "pause")).toBe(true); expect(body.messages.at(-1).content[0].text).toBe("Continue"); expect(body.messages.at(-1).content[1].image_url.url).toBe("data:image/png;base64,ZGVm"); return new Response('data: {"choices":[{"delta":{"content":"First "}}]}\n\ndata: {"choices":[{"delta":{"content":"answer"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'); }); const onDelta = vi.fn(), reviews: string[] = [];
   const secondImage = { ...image, id: "second-image", dataUrl: "data:image/png;base64,ZGVm" };
   await new PhaseoAdapter(() => "owned-key", resumed, global, store).run({ ...current, messages: [...current.messages, { id: "follow-up", role: "user", text: "Continue", attachments: [secondImage], createdAt: "" }], nativeSessionId: runId }, ".", "Continue", { onDelta, onSession: () => {}, onApproval: async (_title, details) => { reviews.push(details); return "accept"; } }, account, [image, secondImage]);
   expect(reviews).toHaveLength(2); expect(reviews.every(details => details.includes("Updated skill body"))).toBe(true); expect(onDelta.mock.calls.map(entry => entry[1]).join("")).toBe("First answer"); expect(onDelta).toHaveBeenCalledTimes(2); expect(store.loadAgentRun(runId)?.run.status).toBe("completed");
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
 });
});
