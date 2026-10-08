import { app, BrowserWindow } from "electron";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
const profile = mkdtempSync(path.join(tmpdir(), "phaseo-instructions-audit-"));
app.setPath("userData", profile);
const project = path.join(profile, "project"); mkdirSync(project); mkdirSync(path.join(project, "src")); mkdirSync(path.join(profile, "workspace"));
writeFileSync(path.join(project, "AGENTS.md"), "Owned root guidance"); writeFileSync(path.join(project, "src/AGENTS.md"), "Owned scoped guidance"); writeFileSync(path.join(project, "src/file.txt"), "Before");
const seed = new DatabaseSync(path.join(profile, "workspace/workspace.sqlite")); seed.exec("CREATE TABLE projects (id TEXT PRIMARY KEY,data TEXT NOT NULL)"); seed.prepare("INSERT INTO projects VALUES (?,?)").run("fixture", JSON.stringify({ id: "fixture", name: "Owned instructions", directory: project, createdAt: new Date().toISOString() })); seed.close();
let calls = 0, codeCalls = 0, chatCalls = 0, planCalls = 0, fixtureError;
const assert = (value, message) => { if (!value) throw Error(message); };
const server = createServer(async (request, response) => {
 try {
  let raw = ""; for await (const chunk of request) { raw += chunk; assert(raw.length <= 1000000, "Fixture request too large"); }
  const url = new URL(request.url, "http://owned.local");
  if (url.pathname === "/v1/models") { response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ data: [{ id: "owned-fixture" }] })); return; }
  const body = JSON.parse(raw); calls++;
  if (url.pathname === "/v1/chat/completions") {
   chatCalls++; assert(body.messages.some(message => message.role === "system" && message.content.includes("Owned root guidance")), "Chat root missing"); assert(!JSON.stringify(body.messages).includes("Owned scoped guidance"), "Chat scope leaked"); assert(body.tools?.every(tool => ["update_plan", "read_plan", "ask_user", "list_skills", "load_skill"].includes(tool.function.name)), "Chat mutation tools");
   response.setHeader("content-type", "text/event-stream"); response.end('data: {"choices":[{"delta":{"content":"Owned chat finished"}}]}\n\ndata: [DONE]\n\n'); return;
  }
  assert(url.pathname === "/v1/responses", "Unexpected endpoint");
  const instructions = body.instructions ?? ""; assert(instructions.includes("Owned root guidance"), "Root missing");
  const tools = body.tools.map(tool => tool.function ?? tool); const writable = tools.some(tool => tool.name === "write_project_file"); let output;
  if (!writable) { planCalls++; assert(tools.some(tool => tool.name === "project_files") && tools.every(tool => ["project_files", "update_plan", "read_plan", "ask_user", "list_skills", "load_skill"].includes(tool.name)), "Plan mutation tools"); output = [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Owned plan finished" }] }]; }
  else {
   codeCalls++; const revision = instructions.match(/instructionRevision ([a-f0-9]{64})/)?.[1]; assert(revision, "Revision missing");
   let name, input;
   if (codeCalls === 1) { assert(!instructions.includes("Owned scoped guidance"), "Premature scope"); name = "project_files"; input = { action: "read", path: "src/file.txt" }; }
   else if (codeCalls === 2) { assert(instructions.includes("Owned scoped guidance"), "Scope missing"); name = "write_project_file"; input = { path: "src/file.txt", content: "After", expectedHash: createHash("sha256").update("Before").digest("hex"), instructionRevision: revision }; }
   else { assert(codeCalls === 3 && readFileSync(path.join(project, "src/file.txt"), "utf8") === "After", "Write not confirmed"); }
   output = name ? [{ type: "function_call", id: "item-" + codeCalls, call_id: "call-" + codeCalls, name, arguments: JSON.stringify(input) }] : [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Owned code finished" }] }];
  }
  response.setHeader("content-type", "text/event-stream"); response.end('data: ' + JSON.stringify({ type: "response.completed", response: { id: "response-" + calls, model: "owned-fixture", status: "completed", output } }) + '\n\n');
 } catch (error) { fixtureError = error; console.error(error); response.statusCode = 500; response.end("Owned fixture failed"); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const endpoint = `http://127.0.0.1:${server.address().port}/v1`;
const packagedEntry = process.argv.find(value => value.startsWith("--app-entry="))?.slice(12);
const deadline = setTimeout(() => { console.error("Instruction audit expired"); server.close(); app.exit(1); }, 60000);
await import(packagedEntry ? pathToFileURL(path.resolve(packagedEntry)).href : "../dist/main/index.mjs");
app.whenReady().then(async () => {
 try {
  const owner = BrowserWindow.getAllWindows()[0]; if (owner.webContents.isLoading()) await new Promise(resolve => owner.webContents.once("did-finish-load", resolve));
  const result = await owner.webContents.executeJavaScript(`(async () => {
   const api = window.phaseoDesktop.workspace;
   const wait = async predicate => { for (let i=0;i<400;i++) { const value=await predicate(); if(value)return value; await new Promise(resolve=>setTimeout(resolve,25)); } throw Error('Instruction wait expired'); };
   const state = await api.command({ type:'add-account', name:'Owned instruction fixture', kind:'api', harness:'phaseo', endpoint:${JSON.stringify(endpoint)}, apiKey:'unused-owned' });
   const account = state.accounts.find(value=>value.name==='Owned instruction fixture'); const ids=[];
   for(const mode of ['chat','plan','code']) {
    const state=await api.command({type:'create-task',harness:'phaseo',accountId:account.id,model:'owned-fixture',mode,projectId:'fixture'}); const task=state.tasks.find(value=>!ids.includes(value.id)); ids.push(task.id);
    await api.command({type:'send',id:task.id,text:'Owned '+mode});
    if(mode==='code') { const pending=await wait(async()=>{const task=await api.task(ids.at(-1));if(task.status==='failed')throw Error(task.error);return task.approvals?.length?task:false;}); if(pending.approvals[0].method!=='write_project_file')throw Error('Wrong approval'); await api.command({type:'approval',id:task.id,approvalId:pending.approvals[0].id,decision:'accept'}); }
    const finished=await wait(async()=>{const task=await api.task(ids.at(-1));if(task.status==='failed')throw Error(task.error);return task.status==='completed'?task:false;});
    if(!JSON.stringify(finished).includes('Project instructions'))throw Error('Instruction activity missing');
   }
   return {completedTasks:ids.length,confirmedInstructionActivity:true,approval:true};
  })()`);
  assert(!fixtureError, "Fixture failed"); assert(chatCalls === 1 && planCalls === 1 && codeCalls === 3, "Unexpected model requests");
  writeFileSync(path.join(project, "AGENTS.md"), Buffer.from([255]));
  const retained = await owner.webContents.executeJavaScript(`(async()=>{const api=window.phaseoDesktop.workspace;const state=await api.overview();const account=state.accounts.find(value=>value.name==='Owned instruction fixture');const before=new Set(state.tasks.map(value=>value.id));const created=await api.command({type:'create-task',harness:'phaseo',accountId:account.id,model:'owned-fixture',mode:'code',projectId:'fixture'});const task=created.tasks.find(value=>!before.has(value.id));await api.command({type:'send',id:task.id,text:'Retain owned input'});for(let i=0;i<400;i++){const value=await api.task(task.id);if(value.status==='failed'){if(value.queue.length!==1||value.queue[0].text!=='Retain owned input'||value.messages.some(message=>message.role==='user'))throw Error('Input lost');return true;}await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Retention wait expired');})()`);
  assert(calls === 5 && retained, "Invalid instructions submitted");
  console.log("PROJECT_INSTRUCTIONS_SMOKE", JSON.stringify({ ...result, preflightQueueRetention:retained, loopbackModelRequests:calls, providerInferenceCalls:0, packaged:Boolean(packagedEntry) })); clearTimeout(deadline); server.close(); app.quit();
 } catch (error) { console.error(error); clearTimeout(deadline); server.close(); app.exit(1); }
});
