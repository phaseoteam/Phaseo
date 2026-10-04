import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { connectPhaseoMcp } from "./phaseoMcp";
import { PhaseoAdapter } from "./phaseoAdapter";
import { WorkspaceStore } from "./workspaceStore";
import type { Account, Task } from "../shared/workspace";

function fixture() {
 const root = mkdtempSync(path.join(tmpdir(), "phaseo-prompts-only-")), script = path.join(root, "server.cjs"), calls = path.join(root, "calls.txt");
 writeFileSync(script, `const fs=require('node:fs');require('node:readline').createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;let result;
 if(r.method==='initialize')result={protocolVersion:r.params.protocolVersion,capabilities:{prompts:{}},serverInfo:{name:'prompts',version:'1'}};
 else if(r.method==='prompts/list'){const c=r.params?.cursor;result=c==='repeat'?{prompts:[],nextCursor:'repeat'}:c==='huge'?{prompts:Array.from({length:201},(_,i)=>({name:String(i)}))}:c?{prompts:[{name:'later'}]}:{prompts:[{name:'brief',arguments:[{name:'topic',required:true}]}],nextCursor:'next'};}
 else if(r.method==='prompts/get'){fs.appendFileSync(process.argv[2],JSON.stringify(r.params)+'\\n');if(!r.params.arguments?.topic){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,error:{code:-32602,message:'topic is required'}})+'\\n');return;}result={messages:[{role:'user',content:{type:'text',text:r.params.name==='large'?'世'.repeat(350000):'Owned prompt '+r.params.arguments.topic}},{role:'assistant',content:{type:'image',data:'YWJj',mimeType:'image/png'}},{role:'user',content:{type:'audio',data:'ZGVm',mimeType:'audio/wav'}},{role:'user',content:{type:'resource',resource:{uri:'notes:owned',text:'Owned inline resource'}}}]};}
 else {process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,error:{code:-32601,message:'Unexpected method '+r.method}})+'\\n');return;}
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,result})+'\\n');});`);
 return { root, calls, connection: { id: "12345678-1234-1234-1234-123456789abc", name: "Prompts", enabled: true, transport: "stdio" as const, executable: process.execPath, arguments: [script, calls] }, close: () => rmSync(root, { recursive: true, force: true }) };
}
describe("MCP prompts", () => {
 it("connects a real prompt-only server and preserves messages, media and arguments", async () => {
  const own = fixture(), session = await connectPhaseoMcp([own.connection], own.root, new AbortController().signal);
  try {
   expect(session.tools).toHaveLength(2); expect(session.tools.every(tool => tool.requireApproval)).toBe(true);
   const execute = async (suffix: string, input: unknown) => { const tool = session.tools.find(tool => tool.id.endsWith(suffix))!; if (typeof tool.execute !== "function") throw Error("No execute"); return tool.execute(input, {} as never); };
   expect(await execute("_list_prompts", {})).toMatchObject({ nextCursor: "next", prompts: [{ arguments: [{ name: "topic", required: true }] }] });
   expect(await execute("_list_prompts", { cursor: "next" })).toMatchObject({ prompts: [{ name: "later" }] });
   expect(await execute("_get_prompt", { name: "brief", arguments: { topic: "work" } })).toMatchObject({ messages: [{ role: "user", content: { text: "Owned prompt work" } }, { role: "assistant", content: { type: "image", data: "YWJj" } }, { role: "user", content: { type: "audio", data: "ZGVm" } }, { role: "user", content: { type: "resource", resource: { uri: "notes:owned" } } }] });
   await expect(execute("_list_prompts", { cursor: "repeat" })).rejects.toThrow("cursor");
   await expect(execute("_list_prompts", { cursor: "huge" })).rejects.toThrow("200 entries");
   await expect(execute("_get_prompt", { name: "large", arguments: { topic: "work" } })).rejects.toThrow("1 MB");
   await expect(execute("_get_prompt", { name: "brief", arguments: { topic: 4 } })).rejects.toThrow("strings");
   await expect(execute("_get_prompt", { name: "brief" })).rejects.toThrow("topic is required");
   expect(readFileSync(own.calls, "utf8").trim().split("\n")).toHaveLength(3);
  } finally { await session.close(); own.close(); }
 });
 it.each(["accept", "decline"] as const)("requires %s review before retrieving a prompt in Chat", async decision => {
  const own = fixture(), store = new WorkspaceStore(path.join(own.root, "state.sqlite"));
  const task: Task = { id: "chat", title: "Prompts", harness: "phaseo", mode: "chat", model: "owned", status: "idle", pinned: false, archived: false, queue: [], messages: [], createdAt: "", updatedAt: "" };
  const account: Account = { id: "owned", name: "Owned", harness: "phaseo", kind: "api", configured: true, endpoint: "http://127.0.0.1:1/v1" };
  try {
   const fetcher = vi.fn().mockImplementationOnce(async (_url, options) => { const body = JSON.parse(options.body), name = body.tools.find((tool: { function: { name: string } }) => tool.function.name.endsWith("_get_prompt")).function.name; return new Response(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "prompt", type: "function", function: { name, arguments: JSON.stringify({ name: "brief", arguments: { topic: "work" } }) } }] }, finish_reason: "tool_calls" }] })}\n\ndata: [DONE]\n\n`); }).mockImplementationOnce(async (_url, options) => { const body = JSON.parse(options.body); expect(body.messages[0].content).not.toContain("Owned prompt"); expect(body.messages.at(-1).content).toContain(decision === "accept" ? "Owned prompt work" : "rejected"); if (decision === "accept") expect(JSON.parse(body.messages.at(-1).content).messages[1].content.data).toBe("YWJj"); return new Response('data: {"choices":[{"delta":{"content":"Finished"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'); });
   const approval = vi.fn(async () => { expect(() => readFileSync(own.calls)).toThrow(); return decision; });
   await new PhaseoAdapter(() => "owned", fetcher, undefined, store, [own.connection]).run(task, own.root, "Use prompt", { onDelta: () => {}, onSession: () => {}, onApproval: approval }, account);
   expect(approval).toHaveBeenCalledWith("Prompts · get prompt", expect.stringContaining("brief")); expect(fetcher).toHaveBeenCalledTimes(2);
   if (decision === "accept") expect(JSON.parse(readFileSync(own.calls, "utf8").trim())).toEqual({ name: "brief", arguments: { topic: "work" } }); else expect(() => readFileSync(own.calls)).toThrow();
  } finally { store.close(); own.close(); }
 });
});
