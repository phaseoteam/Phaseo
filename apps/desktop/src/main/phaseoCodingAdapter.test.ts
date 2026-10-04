import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Account, Task } from "../shared/workspace";
import { WorkspaceStore } from "./workspaceStore";
import { PhaseoCodingAdapter } from "./phaseoCodingAdapter";

const task: Task = { id: "task", title: "Task", harness: "phaseo", model: "model", mode: "code", status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };
const account: Account = { id: "account", name: "API", harness: "phaseo", kind: "api", configured: true, endpoint: "https://api.phaseo.app/v1" };
describe("Phaseo coding run loop", () => {
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
