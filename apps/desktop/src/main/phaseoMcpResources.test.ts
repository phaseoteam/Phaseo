import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { connectPhaseoMcp } from "./phaseoMcp";
import { PhaseoAdapter } from "./phaseoAdapter";
import { WorkspaceStore } from "./workspaceStore";
import type { Account, Task } from "../shared/workspace";

function fixture() {
 const root = mkdtempSync(path.join(tmpdir(), "phaseo-resource-only-")), script = path.join(root, "server.cjs"), calls = path.join(root, "calls.txt");
 writeFileSync(script, `const fs=require('node:fs');require('node:readline').createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;let result;
 if(r.method==='initialize')result={protocolVersion:r.params.protocolVersion,capabilities:{resources:{}},serverInfo:{name:'documents',version:'1'}};
 else if(r.method==='resources/list'){const c=r.params?.cursor;result=c==='repeat'?{resources:[],nextCursor:'repeat'}:c==='huge'?{resources:Array.from({length:201},(_,i)=>({name:String(i),uri:'notes:'+i}))}:c?{resources:[{name:'Second',uri:'notes:second'}]}:{resources:[{name:'First',uri:'notes:first'}],nextCursor:'next'};}
 else if(r.method==='resources/templates/list')result={resourceTemplates:[{name:'Notes',uriTemplate:'notes:{topic}'}]};
 else if(r.method==='resources/read'){fs.appendFileSync(process.argv[2],r.params.uri+'\\n');result={contents:[{uri:r.params.uri,text:r.params.uri==='notes:large'?'世'.repeat(350000):'Owned resource text'}]};}
 else {process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,error:{code:-32601,message:'Unexpected method '+r.method}})+'\\n');return;}
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,result})+'\\n');});`);
 return { root, calls, connection: { id: "12345678-1234-1234-1234-123456789abc", name: "Documents", enabled: true, transport: "stdio" as const, executable: process.execPath, arguments: [script, calls] }, close: () => rmSync(root, { recursive: true, force: true }) };
}
describe("MCP resources", () => {
 it("connects a real resource-only server and follows pages and templates", async () => {
  const own = fixture(); const session = await connectPhaseoMcp([own.connection], own.root, new AbortController().signal);
  try {
   expect(session.tools).toHaveLength(3); expect(session.tools.every(tool => tool.requireApproval)).toBe(true);
   const execute = async (suffix: string, input: unknown) => { const tool = session.tools.find(tool => tool.id.endsWith(suffix))!; if (typeof tool.execute !== "function") throw Error("No execute"); return tool.execute(input, {} as never); };
   expect(await execute("_resources", {})).toMatchObject({ nextCursor: "next" });
   expect(await execute("_resources", { cursor: "next" })).toMatchObject({ resources: [{ uri: "notes:second" }] });
   expect(await execute("_resource_templates", {})).toMatchObject({ resourceTemplates: [{ uriTemplate: "notes:{topic}" }] });
   expect(await execute("_read_resource", { uri: "notes:first" })).toMatchObject({ contents: [{ text: "Owned resource text" }] });
   await expect(execute("_resources", { cursor: "repeat" })).rejects.toThrow("cursor");
   await expect(execute("_resources", { cursor: "huge" })).rejects.toThrow("200 entries");
   await expect(execute("_read_resource", { uri: "notes:large" })).rejects.toThrow("1 MB");
   await expect(execute("_read_resource", { uri: "notes:first", unexpected: true })).rejects.toThrow("arguments");
   expect(readFileSync(own.calls, "utf8").trim().split("\n")).toEqual(["notes:first", "notes:large"]);
  } finally { await session.close(); own.close(); }
 });
 it.each(["accept", "decline"] as const)("requires %s review before retrieving document content in Chat", async decision => {
  const own = fixture(), store = new WorkspaceStore(path.join(own.root, "state.sqlite"));
  const task: Task = { id: "chat", title: "Documents", harness: "phaseo", mode: "chat", model: "owned", status: "idle", pinned: false, archived: false, queue: [], messages: [], createdAt: "", updatedAt: "" };
  const account: Account = { id: "owned", name: "Owned", harness: "phaseo", kind: "api", configured: true, endpoint: "http://127.0.0.1:1/v1" };
  try {
   const fetcher = vi.fn().mockImplementationOnce(async (_url, options) => { const body = JSON.parse(options.body), name = body.tools.find((tool: { function: { name: string } }) => tool.function.name.endsWith("_read_resource")).function.name; return new Response(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "read", type: "function", function: { name, arguments: JSON.stringify({ uri: "notes:first" }) } }] }, finish_reason: "tool_calls" }] })}\n\ndata: [DONE]\n\n`); }).mockImplementationOnce(async (_url, options) => { const body = JSON.parse(options.body); expect(body.messages.at(-1).content).toContain(decision === "accept" ? "Owned resource text" : "rejected"); return new Response('data: {"choices":[{"delta":{"content":"Finished"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'); });
   const approval = vi.fn(async () => { expect(() => readFileSync(own.calls)).toThrow(); return decision; });
   await new PhaseoAdapter(() => "owned", fetcher, undefined, store, [own.connection]).run(task, own.root, "Read document", { onDelta: () => {}, onSession: () => {}, onApproval: approval }, account);
   expect(approval).toHaveBeenCalledWith("Documents · read resource", expect.stringContaining("notes:first")); expect(fetcher).toHaveBeenCalledTimes(2);
   if (decision === "accept") expect(readFileSync(own.calls, "utf8").trim()).toBe("notes:first"); else expect(() => readFileSync(own.calls)).toThrow();
  } finally { store.close(); own.close(); }
 });
});
