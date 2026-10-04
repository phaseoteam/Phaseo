import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Account, Task } from "../shared/workspace";
import { PhaseoAdapter } from "./phaseoAdapter";
import { WorkspaceStore } from "./workspaceStore";
const task: Task = { id: "chat", title: "Owned notes", harness: "phaseo", mode: "chat", model: "owned", status: "idle", pinned: false, archived: false, queue: [], messages: [], createdAt: "", updatedAt: "" };
const account: Account = { id: "api", name: "Owned", harness: "phaseo", kind: "api", configured: true, endpoint: "http://127.0.0.1:1/v1" };
function fixture() {
 const root = mkdtempSync(path.join(tmpdir(), "phaseo-chat-mcp-")), calls = path.join(root, "calls.txt"), script = path.join(root, "server.cjs"), store = new WorkspaceStore(path.join(root, "state.sqlite"));
 writeFileSync(script, `const fs=require('node:fs'),rl=require('node:readline');rl.createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;let result;if(r.method==='initialize')result={protocolVersion:r.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'owned',version:'1'}};else if(r.method==='tools/list')result={tools:[{name:'notes',description:'Owned non-coding notes',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query']}}]};else if(r.method==='tools/call'){fs.appendFileSync(process.argv[2],r.params.arguments.query+'\\n');result={content:[{type:'text',text:'Owned notes result'}]};}else result={};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,result})+'\\n');});`);
 return { root, calls, store, connection: { id: "12345678-1234-1234-1234-123456789abc", name: "Owned notes", enabled: true, transport: "stdio" as const, executable: process.execPath, arguments: [script, calls] }, close: () => { store.close(); rmSync(root, { recursive: true, force: true }); } };
}
const answer = () => new Response('data: {"choices":[{"delta":{"content":"Finished notes"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
function firstTurn(_url: unknown, options: RequestInit | undefined) {
 const body = JSON.parse(options!.body as string), tools = body.tools.map((tool: { function: { name: string } }) => tool.function.name);
 expect(tools).not.toContain("write_project_file"); expect(tools).not.toContain("run_project_command");
 const name = tools.find((name: string) => name.startsWith("phaseo_")); expect(name).toBeDefined();
 return new Response(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "notes", type: "function", function: { name, arguments: JSON.stringify({ query: "Owned query" }) } }] }, finish_reason: "tool_calls" }] })}\n\ndata: [DONE]\n\n`);
}
describe("General Chat MCP", () => {
 it("retains pending approval across cancellation and SQLite restart", async () => {
  const own = fixture(); let runId = "";
  try {
   const fetcher = vi.fn().mockImplementationOnce(firstTurn);
   const adapter = new PhaseoAdapter(() => "owned", fetcher, undefined, own.store, [own.connection]);
   await expect(adapter.run(task, own.root, "Find notes", { onDelta: () => {}, onSession: id => { runId = id; }, onApproval: async () => { await adapter.cancel(); return "accept"; } }, account)).rejects.toThrow("Task stopped");
   expect(() => readFileSync(own.calls)).toThrow();
   expect(own.store.loadAgentRun(runId)?.run.pause?.pendingToolCalls).toHaveLength(1);
   own.store.close(); own.store = new WorkspaceStore(path.join(own.root, "state.sqlite"));
   const unavailable = vi.fn();
   await expect(new PhaseoAdapter(() => "owned", unavailable, undefined, own.store).run({ ...task, nativeSessionId: runId }, own.root, "Continue", { onDelta: () => {}, onSession: () => {}, onApproval: async () => "accept" }, account)).rejects.toThrow("Restore its connections");
   expect(unavailable).not.toHaveBeenCalled(); expect(() => readFileSync(own.calls)).toThrow(); expect(own.store.loadAgentRun(runId)?.run.pause?.pendingToolCalls).toHaveLength(1);
   const resumed = vi.fn(async (_url, options) => { const body = JSON.parse(options!.body as string); expect(body.messages.filter((message: { tool_call_id?: string }) => message.tool_call_id === "notes")).toHaveLength(1); expect(body.messages.at(-1).content).toBe("Continue"); return answer(); });
   const approval = vi.fn(async () => "accept" as const);
   await new PhaseoAdapter(() => "owned", resumed, undefined, own.store, [own.connection]).run({ ...task, nativeSessionId: runId }, own.root, "Continue", { onDelta: () => {}, onSession: () => {}, onApproval: approval }, account);
   expect(approval).toHaveBeenCalledOnce(); expect(resumed).toHaveBeenCalledOnce(); expect(readFileSync(own.calls, "utf8").trim()).toBe("Owned query"); expect(own.store.loadAgentRun(runId)?.run.status).toBe("completed");
  } finally { own.store.close(); rmSync(own.root, { recursive: true, force: true }); }
 });
 it.each(["accept", "decline"] as const)("uses an owned non-coding tool only after %s", async decision => {
  const own = fixture(); let runId = "";
  try {
   const fetcher = vi.fn().mockImplementationOnce(firstTurn).mockImplementationOnce(async (_url, options) => { const body = JSON.parse(options.body); expect(body.messages.at(-1).tool_call_id).toBe("notes"); expect(body.messages.at(-1).content).toContain(decision === "accept" ? "Owned notes result" : "rejected"); return answer(); });
   const approval = vi.fn(async () => { expect(() => readFileSync(own.calls)).toThrow(); expect(own.store.loadAgentRun(runId)?.run.status).toBe("waiting_for_human"); return decision; });
   await new PhaseoAdapter(() => "owned-key", fetcher, undefined, own.store, [own.connection]).run(task, own.root, "Find notes", { onDelta: () => {}, onSession: id => { runId = id; }, onApproval: approval }, account);
   expect(approval).toHaveBeenCalledWith("Owned notes · notes", expect.stringContaining("Owned query")); expect(fetcher).toHaveBeenCalledTimes(2); expect(own.store.loadAgentRun(runId)?.run.status).toBe("completed");
   if (decision === "accept") expect(readFileSync(own.calls, "utf8").trim()).toBe("Owned query"); else expect(() => readFileSync(own.calls)).toThrow();
  } finally { own.close(); }
 });
 it("excludes project connections from personal chats before discovery", async () => {
  const own = fixture(); try {
   const fetcher = vi.fn(async (_url, options) => { expect(JSON.parse(options!.body as string).tools.some((tool: { function: { name: string } }) => tool.function.name.startsWith("phaseo_"))).toBe(false); return answer(); });
   await new PhaseoAdapter(() => "owned", fetcher, undefined, own.store, [{ ...own.connection, projectId: "other", executable: path.join(own.root, "missing.exe") }]).run(task, own.root, "Find notes", { onDelta: () => {}, onSession: () => {}, onApproval: async () => "accept" }, account);
   expect(fetcher).toHaveBeenCalledOnce();
  } finally { own.close(); }
 });
 it("rejects failed MCP admission before inference", async () => {
  const own = fixture(); try {
   const fetcher = vi.fn(); await expect(new PhaseoAdapter(() => "owned", fetcher, undefined, own.store, [{ ...own.connection, executable: path.join(own.root, "missing.exe") }]).run(task, own.root, "Keep this input", { onDelta: () => {}, onSession: () => {}, onApproval: async () => "accept" }, account)).rejects.toThrow("not submitted"); expect(fetcher).not.toHaveBeenCalled();
  } finally { own.close(); }
 });
 it("rejects configured tools without durable storage before inference", async () => {
  const own = fixture(); try {
   const fetcher = vi.fn(); await expect(new PhaseoAdapter(() => "owned", fetcher, undefined, undefined, [own.connection]).run(task, own.root, "Find notes", { onDelta: () => {}, onSession: () => {}, onApproval: async () => "accept" }, account)).rejects.toThrow("durable run storage"); expect(fetcher).not.toHaveBeenCalled(); expect(() => readFileSync(own.calls)).toThrow();
  } finally { own.close(); }
 });
});
