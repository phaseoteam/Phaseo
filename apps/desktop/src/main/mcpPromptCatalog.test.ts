import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { McpPromptCatalogService } from "./mcpPromptCatalog";
import { mcpPromptDraft } from "../shared/mcpPrompts";

function fixture(mode = "normal") {
 const root = mkdtempSync(path.join(tmpdir(), "phaseo-prompt-catalog-")), script = path.join(root, "server.cjs"), calls = path.join(root, "calls.txt");
 writeFileSync(script, `const fs=require('node:fs'),mode=process.argv[3];require('node:readline').createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;fs.appendFileSync(process.argv[2],r.method+'\\n');let result;
 if(r.method==='initialize')result={protocolVersion:r.params.protocolVersion,capabilities:{prompts:{}},serverInfo:{name:'owned',version:'1'}};
 else if(r.method==='prompts/list'){const c=r.params?.cursor;result=mode==='cycle'?{prompts:[],nextCursor:c==='a'?'b':'a'}:mode==='empty-pages'?{prompts:[],nextCursor:String(Number(c??0)+1)}:mode==='bytes'?{prompts:Array.from({length:2},(_,i)=>({name:'page'+(c??0)+'-'+i,arguments:Array.from({length:100},(_,a)=>({name:String(a),description:'x'.repeat(4000)}))})),nextCursor:String(Number(c??0)+1)}:c?{prompts:[{name:'later'}]}:{prompts:[{name:'brief',description:'Owned brief',arguments:[{name:'topic',required:true}]}],nextCursor:'next'};}
 else if(r.method==='prompts/get')result={messages:r.params.name==='media'?[{role:'user',content:{type:'image',mimeType:'image/png',data:'YWJj'}}]:[{role:'user',content:{type:'text',text:'Brief '+r.params.arguments.topic}},{role:'assistant',content:{type:'text',text:'Example answer'}}]};
 else {process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,error:{code:-32601,message:'Unexpected method'}})+'\\n');return;}
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,result})+'\\n');});`);
 return { root, calls, connection: { id: "12345678-1234-1234-1234-123456789abc", name: "Owned", enabled: true, transport: "stdio" as const, executable: process.execPath, arguments: [script, calls, mode] }, close: () => rmSync(root, { recursive: true, force: true }) };
}
describe("MCP composer catalog", () => {
 it("follows pages in a scoped real service and previews role-labelled text", async () => {
  const own = fixture();
  try {
   const service = new McpPromptCatalogService([own.connection, { ...own.connection, id: "87654321-1234-1234-1234-123456789abc", projectId: "other", executable: path.join(own.root, "missing.exe") }, { ...own.connection, enabled: false, executable: path.join(own.root, "missing.exe") }], own.root);
   const catalog = await service.request({ type: "list" }, new AbortController().signal);
   expect("prompts" in catalog && catalog.prompts.map(prompt => prompt.name)).toEqual(["brief", "later"]);
   expect(readFileSync(own.calls, "utf8")).not.toContain("prompts/get");
   const preview = await service.request({ type: "preview", connectionId: own.connection.id, name: "brief", arguments: { topic: "work" } }, new AbortController().signal);
   expect(preview).toMatchObject({ server: "Owned", name: "brief", text: "User:\nBrief work\n\nAssistant:\nExample answer" });
   await expect(service.request({ type: "preview", connectionId: "87654321-1234-1234-1234-123456789abc", name: "brief", arguments: {} }, new AbortController().signal)).rejects.toThrow("unavailable in this chat");
  } finally { own.close(); }
 });
 it("keeps media previewable while refusing lossy draft insertion", async () => {
  const own = fixture(); try {
   const preview = await new McpPromptCatalogService([own.connection], own.root).request({ type: "preview", connectionId: own.connection.id, name: "media", arguments: {} }, new AbortController().signal);
   expect(preview).toMatchObject({ messages: [{ content: { type: "image", data: "YWJj" } }], insertionError: expect.stringContaining("media") }); expect("text" in preview).toBe(false);
  } finally { own.close(); }
 });
 it.each([["cycle", "repeated"], ["empty-pages", "20 pages"], ["bytes", "2 MB"]])("bounds %s discovery before returning a catalog", async (mode, message) => {
  const own = fixture(mode); try { await expect(new McpPromptCatalogService([own.connection], own.root).request({ type: "list" }, new AbortController().signal)).rejects.toThrow(message); } finally { own.close(); }
 });
 it("rejects invalid preview input without starting a configured process", async () => {
  const own = fixture(); try {
   await expect(new McpPromptCatalogService([own.connection], own.root).request({ type: "preview", connectionId: own.connection.id, name: "brief", arguments: { topic: 4 } }, new AbortController().signal)).rejects.toThrow("Invalid"); expect(() => readFileSync(own.calls)).toThrow();
  } finally { own.close(); }
 });
 it("bounds text drafts and rejects empty content", () => {
  expect(mcpPromptDraft([{ role: "user", content: { type: "text", text: "x".repeat(100001) } }]).insertionError).toContain("limit");
  expect(mcpPromptDraft([]).insertionError).toContain("no text");
  expect(mcpPromptDraft([{ role: "assistant", content: { type: "text", text: "Example" } }]).text).toBe("Assistant:\nExample");
 });
});
