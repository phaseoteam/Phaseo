import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Account, Task } from "../shared/workspace";
import { WorkspaceStore } from "./workspaceStore";
import { PhaseoCodingAdapter } from "./phaseoCodingAdapter";

const task: Task = { id: "task", title: "Task", harness: "phaseo", model: "model", mode: "code", status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };
const account: Account = { id: "account", name: "API", harness: "phaseo", kind: "api", configured: true, endpoint: "https://api.phaseo.app/v1" };
describe("Phaseo coding run loop", () => {
 it.each(["code", "plan"] as const)("reviews only the unfinished serial MCP effect after SQLite recovery in %s", async mode => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-serial-recovery-")); let store = new WorkspaceStore(path.join(root, "state.sqlite"));
  try {
   const script = path.join(root, "server.cjs"), calls = path.join(root, "calls.txt");
   writeFileSync(script,`const readline=require('node:readline'),fs=require('node:fs');readline.createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;let result;if(r.method==='initialize')result={protocolVersion:r.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'owned',version:'1'}};else if(r.method==='tools/list')result={tools:[{name:'effect',inputSchema:{type:'object',properties:{value:{type:'string'}},required:['value']}}]};else if(r.method==='tools/call'){fs.appendFileSync(process.argv[2],r.params.arguments.value+'\\n');if(r.params.arguments.value==='second'){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,error:{code:-32603,message:'Owned interrupted effect'}})+'\\n');return;}result={content:[{type:'text',text:'Confirmed first effect'}]};}else result={};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,result})+'\\n');});`);
   const connections = [{id:"12345678-1234-1234-1234-123456789abc",name:"Owned",enabled:true,transport:"stdio" as const,executable:process.execPath,arguments:[script,calls]}];
   let runId = "";
   const generate = vi.fn(async request => { const name = request.tools.find((tool: {id:string}) => tool.id.startsWith("phaseo_")).id; return {message:{role:"assistant" as const,content:"",toolCalls:[{id:"one",name,input:{value:"first"}},{id:"two",name,input:{value:"second"}}]}}; });
   const adapter = new PhaseoCodingAdapter(()=>"owned-key",store,()=>({generate}),connections);
   await expect(adapter.run({...task,mode},root,"Perform owned effects",{onSession:id=>{runId=id;},onDelta:()=>{},onApproval:async()=>"accept",onActivity:activity=>{if(activity.id==="two" && activity.status==="running")void adapter.cancel();}},account)).rejects.toThrow("abort");
   const saved = store.loadAgentRun(runId)!; expect(saved.run.pause?.pendingToolCalls?.map(entry=>entry.call.id)).toEqual(["two"]); expect(saved.run.messages.filter(message=>message.role==="tool").map(message=>message.toolCallId)).toEqual(["one"]);
   store.close(); store = new WorkspaceStore(path.join(root,"state.sqlite"));
   const approval = vi.fn(async (_title, details) => {expect(details).toContain("may already have completed");return "decline" as const;});
   const resumed = vi.fn(async request => {expect(request.messages.filter((message:{role:string})=>message.role==="tool").map((message:{toolCallId:string})=>message.toolCallId)).toEqual(["one","two"]);return {message:{role:"assistant" as const,content:"Recovered"}};});
   await new PhaseoCodingAdapter(()=>"owned-key",store,()=>({generate:resumed}),connections).run({...task,mode,nativeSessionId:runId},root,"Continue",{onSession:()=>{},onDelta:()=>{},onApproval:approval},account);
   expect(approval).toHaveBeenCalledOnce();expect(resumed).toHaveBeenCalledOnce();expect(readFileSync(calls,"utf8").trim().split("\n")).toEqual(["first"]);expect(store.loadAgentRun(runId)?.run.status).toBe("completed");
  } finally {store.close();rmSync(root,{recursive:true,force:true});}
 });

 it.each(["code", "plan"] as const)("retains images and role history through pending skill recovery in %s", async mode => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-code-images-")), global = path.join(root, "instructions"), skill = path.join(root, "skills/explain/SKILL.md"); mkdirSync(global); mkdirSync(path.dirname(skill), { recursive: true }); writeFileSync(skill, "---\nname: explain\ndescription: Explain images\n---\nOriginal guidance");
  const image = { id: "image", taskId: task.id, name: "owned.png", kind: "image" as const, mimeType: "image/png", size: 3, filePath: "owned.png", dataUrl: "data:image/png;base64,YWJj" };
  const current = { ...task, mode, messages: [{ id: "earlier", role: "user" as const, text: "Earlier question", createdAt: "" }, { id: "reply", role: "assistant" as const, text: "Earlier answer", createdAt: "" }, { id: "question", role: "user" as const, text: "Inspect this", attachments: [image], createdAt: "" }] };
  let store = new WorkspaceStore(path.join(root, "state.sqlite")), runId = "";
  try {
   const generate = vi.fn(async request => { expect(request.messages.slice(0, 2)).toEqual([{ role: "user", content: "Earlier question" }, { role: "assistant", content: "Earlier answer" }]); expect(request.messages.at(-1).content).toEqual([{ type: "text", text: "Inspect this" }, { type: "image_url", image_url: { url: image.dataUrl } }]); if (mode === "plan") expect(request.tools.some((tool: { id: string }) => ["write_project_file", "run_project_command"].includes(tool.id))).toBe(false); return { message: { role: "assistant" as const, content: "", toolCalls: [{ id: "pending", name: "load_skill", input: { id: "global:explain" } }] } }; });
   const first = new PhaseoCodingAdapter(() => "owned-key", store, () => ({ generate }), [], global);
   await expect(first.run(current, root, "Inspect this", { onDelta: () => {}, onSession: id => { runId = id; }, onApproval: async () => { await first.cancel(); return "accept"; } }, account, [image])).rejects.toThrow("Task stopped");
   expect(store.loadAgentRun(runId)?.run.status).toBe("waiting_for_human"); store.close(); store = new WorkspaceStore(path.join(root, "state.sqlite")); writeFileSync(skill, readFileSync(skill, "utf8").replace("Original guidance", "Updated guidance"));
   const nextImage = { ...image, id: "new-image", dataUrl: "data:image/png;base64,ZGVm" }, document = { id: "document", taskId: task.id, name: "notes.txt", kind: "text" as const, mimeType: "text/plain", size: 5, filePath: "notes.txt", text: "Owned notes" };
   const resumed = vi.fn(async request => { expect(request.instructions).toContain("Updated guidance"); expect(JSON.stringify(request.messages)).toContain(image.dataUrl); expect(request.messages.at(-1).content[0].text).toContain("Continue with correction"); expect(request.messages.at(-1).content[0].text).toContain("Owned notes"); expect(request.messages.at(-1).content[1].image_url.url).toBe(nextImage.dataUrl); expect(request.messages.filter((message: { role: string }) => message.role === "user")).toHaveLength(3); expect(request.messages.at(-2).toolCallId).toBe("pending"); return { message: { role: "assistant" as const, content: "Finished with image" } }; });
   const approval = vi.fn(async (_title, details) => { expect(details).toContain("Updated guidance"); return "accept" as const; });
   await new PhaseoCodingAdapter(() => "owned-key", store, () => ({ generate: resumed }), [], global).run({ ...current, nativeSessionId: runId, messages: [...current.messages, { id: "follow-up", role: "user", text: "Continue with correction", attachments: [nextImage, document], createdAt: "" }] }, root, "Continue with correction", { onSession: () => {}, onDelta: () => {}, onApproval: approval }, account, [image, nextImage, document]);
   expect(approval).toHaveBeenCalledOnce(); expect(resumed).toHaveBeenCalledOnce(); expect(store.loadAgentRun(runId)?.run.status).toBe("completed");
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
 });
 it.each(["accept", "decline"] as const)("executes an owned native MCP tool only after %s", async decision => {
  const root=mkdtempSync(path.join(tmpdir(),"phaseo-mcp-run-"));const store=new WorkspaceStore(path.join(root,"state.sqlite"));
  try {
   const script=path.join(root,"server.cjs"),calls=path.join(root,"calls.txt");
   writeFileSync(script,`const readline=require('node:readline'),fs=require('node:fs');readline.createInterface({input:process.stdin}).on('line',line=>{const request=JSON.parse(line);if(request.id===undefined)return;let result;if(request.method==='initialize')result={protocolVersion:request.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'owned-fixture',version:'1'}};else if(request.method==='tools/list')result={tools:[{name:'owned_lookup',description:'Owned fixture',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query']}}]};else if(request.method==='tools/call'){fs.writeFileSync(process.argv[2],request.params.arguments.query);result={content:[{type:'text',text:'Owned result'}]};}else result={};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\\n');});`);
   const connection={id:"12345678-1234-1234-1234-123456789abc",name:"Owned",enabled:true,transport:"stdio" as const,executable:process.execPath,arguments:[script,calls]};
   const generate=vi.fn().mockImplementationOnce(async request=>{const tool=request.tools.find((tool:{id:string})=>tool.id.startsWith('phaseo_'));expect(tool).toBeDefined();return {message:{role:'assistant',content:'',toolCalls:[{id:'lookup',name:tool.id,input:{query:'owned query'}}]}};}).mockResolvedValueOnce({message:{role:'assistant',content:'Finished'}});
   let runId='';const approval=vi.fn(async()=>{expect(()=>readFileSync(calls)).toThrow();expect(store.loadAgentRun(runId)?.run.status).toBe('waiting_for_human');return decision;});
   const adapter=new PhaseoCodingAdapter(()=>"secret",store,()=>({generate}),[connection]);
   await adapter.run(task,root,"Look up owned data",{onSession:id=>{runId=id;},onDelta:()=>{},onApproval:approval},account);
   expect(approval).toHaveBeenCalledWith('Owned · owned_lookup',expect.stringContaining('owned query'));expect(store.loadAgentRun(runId)?.run.status).toBe('completed');
   if(decision==='accept')expect(readFileSync(calls,'utf8')).toBe('owned query');else expect(()=>readFileSync(calls)).toThrow();
  } finally {store.close();rmSync(root,{recursive:true,force:true});}
 });
 it("preserves input before inference when native MCP setup fails",async()=>{const root=mkdtempSync(path.join(tmpdir(),"phaseo-mcp-failure-"));const store=new WorkspaceStore(path.join(root,"state.sqlite"));try{const generate=vi.fn();const adapter=new PhaseoCodingAdapter(()=>"secret",store,()=>({generate}),[{id:"12345678-1234-1234-1234-123456789abc",name:"Missing",enabled:true,transport:"stdio",executable:path.join(root,"missing.exe"),arguments:[]}]);await expect(adapter.run(task,root,"Pending",{onSession:()=>{},onDelta:()=>{},onApproval:async()=>"accept"},account)).rejects.toThrow("not submitted");expect(generate).not.toHaveBeenCalled();}finally{store.close();rmSync(root,{recursive:true,force:true});}});

	it.each(["accept", "decline"] as const)("persists a pending edit and continues after %s", async decision => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-agent-"));
		const store = new WorkspaceStore(path.join(root, "state.sqlite"));
		try {
			const generate = vi.fn().mockResolvedValueOnce({ message: { role: "assistant", content: "", toolCalls: [{ id: "edit", name: "write_project_file", input: { path: "hello.txt", content: "Hello", expectedHash: "new" } }] } }).mockResolvedValueOnce({ message: { role: "assistant", content: "Finished" } });
			let runId = "";
			const adapter = new PhaseoCodingAdapter(() => "secret", store, () => ({ generate }));
			await adapter.run(task, root, "Create hello.txt", {
				onSession: id => { runId = id; }, onDelta: () => {}, onApproval: async () => {
					expect(store.loadAgentRun(runId)?.run.status).toBe("waiting_for_human");
					return decision;
				},
			}, account);
			expect(store.loadAgentRun(runId)?.run.status).toBe("completed");
			if (decision === "accept") expect(readFileSync(path.join(root, "hello.txt"), "utf8")).toBe("Hello");
			else expect(() => readFileSync(path.join(root, "hello.txt"))).toThrow();
			expect(JSON.stringify(store.loadAgentRun(runId))).not.toContain("secret");
		} finally { store.close(); rmSync(root, { recursive: true, force: true }); }
	});
});
