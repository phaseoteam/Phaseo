import assert from "node:assert/strict";
import { app, BrowserWindow } from "electron";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
const profile = mkdtempSync(path.join(tmpdir(), "phaseo-skill-runtime-")); app.setPath("userData", profile);
const project = path.join(profile, "project"), workspace = path.join(profile, "workspace"), skill = path.join(workspace, "skills/review/SKILL.md"); mkdirSync(project); mkdirSync(path.dirname(skill), { recursive: true });
const skillBody = "Use concrete examples. Owned skill instructions."; writeFileSync(skill, `---\nname: review\ndescription: Review clearly\n---\n${skillBody}`);
const db = new DatabaseSync(path.join(workspace, "workspace.sqlite")); db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY,data TEXT NOT NULL)"); db.prepare("INSERT INTO projects VALUES (?,?)").run("project", JSON.stringify({ id: "project", name: "Owned project", directory: project, createdAt: new Date().toISOString() })); db.close();
const calls = { chat: 0, plan: 0, code: 0 }; let fixtureError;
const server = createServer(async (request, response) => {
 try {
  let raw = ""; for await (const chunk of request) { raw += chunk; assert.ok(raw.length <= 1024 * 1024); }
  if (new URL(request.url, "http://owned.local").pathname.replace(/\/$/, "") === "/v1/models") { response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ data: ["chat", "plan", "code"].map(mode => ({ id: "owned-" + mode })) })); return; }
  if (request.method !== "POST") { console.log("OWNED_READ", request.method, request.url); response.statusCode = 404; response.end(); return; }
  const body = JSON.parse(raw), mode = body.model.replace("owned-", ""); assert.ok(mode in calls); const step = ++calls[mode]; let name, input, output;
  const instructions = mode === "chat" ? body.messages.find(message => message.role === "system")?.content : body.instructions;
  const tools = body.tools.map(tool => tool.function ?? tool); assert.ok(tools.some(tool => (tool.name ?? tool.id) === "load_skill"));
  if (mode !== "code") assert.ok(tools.every(tool => ["list_skills", "load_skill", ...(mode === "plan" ? ["project_files"] : [])].includes(tool.name ?? tool.id)));
  if (mode === "chat") {
   assert.equal(request.url, "/v1/chat/completions");
   if (step === 1) { assert.ok(!instructions.includes(skillBody)); name = "list_skills"; input = {}; }
   else if (step === 2) { const catalog = body.messages.at(-1); assert.equal(catalog.tool_call_id, "chat-1"); assert.ok(catalog.content.includes("global:review") && !catalog.content.includes(skillBody)); name = "load_skill"; input = { id: "global:review" }; }
   else { assert.equal(step, 3); assert.ok(instructions.includes(skillBody)); }
   response.setHeader("content-type", "text/event-stream"); response.end("data: " + JSON.stringify({ choices: [{ delta: name ? { tool_calls: [{ index: 0, id: "chat-" + step, type: "function", function: { name, arguments: JSON.stringify(input) } }] } : { content: "Owned chat finished" }, finish_reason: name ? "tool_calls" : "stop" }] }) + "\n\ndata: [DONE]\n\n"); return;
  }
  assert.equal(request.url, "/v1/responses");
  if (mode === "plan") { assert.equal(step, 1); assert.ok(instructions.includes(skillBody)); }
  else if (step === 1) { assert.ok(!instructions.includes(skillBody)); name = "load_skill"; input = { id: "global:review" }; }
  else if (step === 2) { assert.ok(instructions.includes(skillBody)); name = "write_project_file"; input = { path: "effect.txt", content: "Owned skill effect", expectedHash: "new", instructionRevision: instructions.match(/instructionRevision ([a-f0-9]{64})/)?.[1] }; assert.ok(input.instructionRevision); }
  else { assert.equal(step, 3); assert.equal(readFileSync(path.join(project, "effect.txt"), "utf8"), "Owned skill effect"); }
  output = name ? [{ type: "function_call", id: "item-" + mode + step, call_id: mode + step, name, arguments: JSON.stringify(input) }] : [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Owned " + mode + " finished" }] }];
  response.setHeader("content-type", "text/event-stream"); response.end("data: " + JSON.stringify({ type: "response.completed", response: { id: "response-" + mode + step, model: body.model, status: "completed", output } }) + "\n\n");
 } catch (error) { fixtureError = error; console.error(error); response.statusCode = 500; response.end("Owned fixture failure"); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const endpoint = `http://127.0.0.1:${server.address().port}/v1`, entry = process.argv.find(value => value.startsWith("--app-entry="))?.slice(12);
const deadline = setTimeout(() => { console.error("Phaseo skill runtime audit expired"); server.close(); app.exit(1); }, 60000);
await import(entry ? pathToFileURL(path.resolve(entry)).href : "../dist/main/index.mjs");
app.whenReady().then(async () => {
 try {
  const owner = BrowserWindow.getAllWindows()[0]; owner.webContents.setBackgroundThrottling(false); if (owner.webContents.isLoading()) await new Promise(resolve => owner.webContents.once("did-finish-load", resolve));
  const run = code => owner.webContents.executeJavaScript(code), wait = async code => { for (let index = 0; index < 400; index++) { const value = await run(code); if (value) return value; await new Promise(resolve => setTimeout(resolve, 25)); } throw Error("UI did not settle: " + code); };
  const accountId = await run(`(async()=>{const state=await window.phaseoDesktop.workspace.command({type:'add-account',name:'Owned skill fixture',kind:'api',harness:'phaseo',endpoint:${JSON.stringify(endpoint)},apiKey:'owned-unused'});return state.accounts.find(account=>account.name==='Owned skill fixture').id})()`);
  const output = path.resolve("../../output/playwright/phaseo-skill-runtime", entry ? "packaged" : "source"); mkdirSync(output, { recursive: true }); let captures = 0;
  for (const mode of ["chat", "plan", "code"]) {
   const id = await run(`(async()=>{const api=window.phaseoDesktop.workspace,before=new Set((await api.overview()).tasks.map(task=>task.id));const state=await api.command({type:'create-task',projectId:'project',harness:'phaseo',accountId:${JSON.stringify(accountId)},model:'owned-${mode}',mode:'${mode}'});const id=state.tasks.find(task=>!before.has(task.id)).id;await api.command({type:'send',id,text:${JSON.stringify(mode === "plan" ? "/skill:review Owned plan" : "Owned " + mode)},${mode === "plan" ? "nativeAction:{kind:'skill',id:'global:review',name:'review',arguments:'Owned plan'}," : ""}});return id})()`);
   const pending = await wait(`(async()=>{const task=await window.phaseoDesktop.workspace.task(${JSON.stringify(id)});if(task.status==='failed')throw Error(task.error);return task.approvals?.length?task:false})()`);
   assert.equal(pending.approvals[0].method, "Use Phaseo skill review"); assert.ok(pending.approvals[0].description.includes(skillBody)); if (mode === "plan") assert.equal(calls.plan, 0);
   await wait(`Array.from(document.querySelectorAll('.task-row')).some(row=>row.title===${JSON.stringify(pending.title)})`); await run(`Array.from(document.querySelectorAll('.task-row')).find(row=>row.title===${JSON.stringify(pending.title)}).click()`); await wait(`document.querySelector('[aria-label="Approval needed"] pre')?.textContent.includes(${JSON.stringify(skillBody)})`);
   for (const [width, height] of [[1440, 920], [1040, 680]]) for (const theme of ["light", "dark"]) { owner.setSize(width, height); await run(`document.querySelector('[aria-label="Use ${theme} theme"]')?.click()`); await run(`document.querySelector('[aria-label="Approval needed"]').scrollIntoView({block:'center'})`); await new Promise(resolve => setTimeout(resolve, 200)); assert.ok(await run(`(()=>{const panel=document.querySelector('[aria-label="Approval needed"]'),r=panel.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&panel.scrollWidth<=panel.clientWidth+1&&getComputedStyle(panel).fontFamily.includes('Montserrat')})()`)); writeFileSync(path.join(output, `${mode}-approval-${width}-${theme}.png`), (await owner.webContents.capturePage()).toPNG()); captures++; }
   await run(`Array.from(document.querySelectorAll('[aria-label="Approval needed"] button')).find(button=>button.textContent==='Allow').click()`);
   if (mode === "code") { const effect = await wait(`(async()=>{const task=await window.phaseoDesktop.workspace.task(${JSON.stringify(id)});if(task.status==='failed')throw Error(task.error);return task.approvals?.some(approval=>approval.method==='write_project_file')?task:false})()`); assert.equal(effect.approvals.length, 1); await run(`window.phaseoDesktop.workspace.command({type:'approval',id:${JSON.stringify(id)},approvalId:${JSON.stringify(effect.approvals[0].id)},decision:'accept'})`); }
   const finished = await wait(`(async()=>{const task=await window.phaseoDesktop.workspace.task(${JSON.stringify(id)});if(task.status==='failed')throw Error(task.error);return task.status==='completed'?task:false})()`); assert.ok(finished.messages.some(message => message.role === "assistant" && message.text.includes("Owned " + mode + " finished")));
  }
  const deniedId = await run(`(async()=>{const api=window.phaseoDesktop.workspace,before=new Set((await api.overview()).tasks.map(task=>task.id));const state=await api.command({type:'create-task',projectId:'project',harness:'phaseo',accountId:${JSON.stringify(accountId)},model:'owned-plan',mode:'plan'});const id=state.tasks.find(task=>!before.has(task.id)).id;await api.command({type:'send',id,text:'/skill:review Owned deny',nativeAction:{kind:'skill',id:'global:review',name:'review',arguments:'Owned deny'}});return id})()`);
  const deniedPending = await wait(`(async()=>{const task=await window.phaseoDesktop.workspace.task(${JSON.stringify(deniedId)});return task.approvals?.length?task:false})()`);
  await wait(`Array.from(document.querySelectorAll('.task-row')).some(row=>row.title===${JSON.stringify(deniedPending.title)})`); await run(`Array.from(document.querySelectorAll('.task-row')).find(row=>row.title===${JSON.stringify(deniedPending.title)}).click()`); await wait(`document.querySelector('[aria-label="Approval needed"] pre')?.textContent.includes('Owned deny')`);
  await run(`Array.from(document.querySelectorAll('[aria-label="Approval needed"] button')).find(button=>button.textContent==='Deny').click()`);
  const denied = await wait(`(async()=>{const task=await window.phaseoDesktop.workspace.task(${JSON.stringify(deniedId)});return task.status==='failed'?task:false})()`); assert.equal(denied.queue.length, 1); assert.equal(denied.queue[0].nativeAction.id, "global:review"); assert.equal(denied.queue[0].text, "/skill:review Owned deny"); assert.ok(!denied.messages.some(message => message.role === "user"));
  assert.ok(!fixtureError); assert.deepEqual(calls, { chat: 3, plan: 1, code: 3 }); console.log("PHASEO_SKILLS_SMOKE", JSON.stringify({ renderedSkillApprovals: 3, modelDiscovery: true, explicitPlan: true, chatPlanRestrictions: true, confirmedFileEffect: true, deniedPreflightQueueRetained: true, captures, loopbackModelRequests: 7, providerInferenceCalls: 0, packaged: Boolean(entry) })); clearTimeout(deadline); server.close(); app.quit();
 } catch (error) { console.error(error); clearTimeout(deadline); server.close(); app.exit(1); }
});
