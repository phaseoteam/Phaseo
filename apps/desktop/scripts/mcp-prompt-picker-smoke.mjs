import { startPromptHttpFixture } from "./fixtures/mcp-prompt-http.mjs";
import assert from "node:assert/strict";
import { app, BrowserWindow, nativeImage } from "electron";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
// TODO(desktop composer menus): the redesigned composer has no MCP prompt picker yet. Re-add the removed UI checks (the MCP
// prompts tab and search focus, End/Home/Up/Down navigation, the empty-search status, IME Enter preservation, argument
// focus, double-click guards on Load and Insert, stale arguments disabling Insert until Reload, inserting the labelled
// draft and image chips into the composer, the import-failure alert keeping the draft, draft and image chips surviving a
// reload, the attachment preview, the catalogue error and Refresh, closing during a slow load, and dialog layout captures)
// once the new menus land. The bridge flows they drove are checked below.
const promptPixels = nativeImage.createFromBitmap(Buffer.alloc(128 * 80 * 4, Buffer.from([210, 126, 42, 255])), { width: 128, height: 80 }).toPNG().toString("base64");
const profile = mkdtempSync(path.join(tmpdir(), "phaseo-mcp-picker-")); app.setPath("userData", profile);
mkdirSync(path.join(profile, "workspace")); const project = path.join(profile, "project"); mkdirSync(project);
const calls = path.join(profile, "calls.jsonl"), control = path.join(profile, "control.json"), fixture = path.join(profile, "prompts.cjs"); writeFileSync(control, "{}");
writeFileSync(fixture, String.raw`const fs=require('node:fs'),calls=process.argv[2],control=process.argv[3],server=process.argv[4],timers=new Set();const log=value=>fs.appendFileSync(calls,JSON.stringify({pid:process.pid,server,...value})+'\n');process.on('exit',()=>log({closed:true}));const rl=require('node:readline').createInterface({input:process.stdin});rl.on('close',()=>{for(const timer of timers)clearTimeout(timer);process.exit(0);});rl.on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;const flags=JSON.parse(fs.readFileSync(control,'utf8'));log({method:r.method,params:r.params});const reply=()=>{let result;if(r.method==='initialize')result={protocolVersion:r.params.protocolVersion,capabilities:{prompts:{}},serverInfo:{name:'owned-picker',version:'1'}};else if(r.method==='prompts/list'){if(flags.failList){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,error:{code:-32000,message:'Owned catalog failure'}})+'\n');return;}result=r.params?.cursor?{prompts:[{name:'later'}]}:{prompts:[{name:'brief',description:'Write an owned brief',arguments:[{name:'topic',description:'Subject',required:true}]},{name:'media',description:'Media preview'},{name:'long-'+ 'x'.repeat(700),description:'Owned wrapping test'}],nextCursor:'next'};}else if(r.method==='prompts/get'){if(flags.failGet){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,error:{code:-32000,message:'Owned preview failure'}})+'\n');return;}result={messages:r.params.name==='media'?[{role:'user',content:{type:'image',mimeType:'image/png',data:flags.invalidImage?'YWJj':'${promptPixels}'}}]:[{role:'user',content:{type:'text',text:server+' brief for '+r.params.arguments.topic}},{role:'assistant',content:{type:'text',text:'Example answer'}}]};log({retrieved:r.params.name});}else {process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,error:{code:-32601,message:'Unexpected method'}})+'\n');return;}process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,result})+'\n');};const delay=r.method==='prompts/list'?flags.delayList:r.method==='prompts/get'?flags.delayGet:0;if(delay){const timer=setTimeout(()=>{timers.delete(timer);reply();},delay);timers.add(timer);}else reply();});`);
const httpMode = process.argv.includes("--http"), httpFixture = httpMode ? await startPromptHttpFixture(calls, control, promptPixels) : undefined;
const connectionFor = name => httpMode ? { transport: "http", url: `${httpFixture.url}/${name}` } : { transport: "stdio", executable: process.execPath, arguments: [fixture, calls, control, name] };
const now = new Date().toISOString(), db = new DatabaseSync(path.join(profile, "workspace/workspace.sqlite"));
db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY,data TEXT NOT NULL);CREATE TABLE tasks (id TEXT PRIMARY KEY,data TEXT NOT NULL)");
db.prepare("INSERT INTO projects VALUES (?,?)").run("project", JSON.stringify({ id: "project", name: "Website", directory: project, createdAt: now }));
db.prepare("INSERT INTO projects VALUES (?,?)").run("other", JSON.stringify({ id: "other", name: "Other", directory: project, createdAt: now }));
for (const [id, projectId] of [["personal", undefined], ["project-chat", "project"]]) db.prepare("INSERT INTO tasks VALUES (?,?)").run(id, JSON.stringify({ id, title: id, projectId, harness: "phaseo", mode: "chat", model: "default", status: "completed", pinned: false, archived: false, queue: [], messages: [], createdAt: now, updatedAt: now })); db.close();
const entry = process.argv.find(value => value.startsWith("--app-entry="))?.slice(12), deadline = setTimeout(() => { console.error("MCP picker deadline"); app.exit(1); }, 150000);
await import(entry ? pathToFileURL(path.resolve(entry)).href : "../dist/main/index.mjs");
const records = () => existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
app.whenReady().then(async () => {
 try {
  const owner = BrowserWindow.getAllWindows()[0]; owner.webContents.setBackgroundThrottling(false); if (owner.webContents.isLoading()) await new Promise(resolve => owner.webContents.once("did-finish-load", resolve));
  const run = code => owner.webContents.executeJavaScript(code);
  const until = async predicate => { for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 25)); } throw Error("Owned service did not settle"); };
  const prompts = (taskId, request) => run(`window.phaseoDesktop.workspace.mcpPrompts(${JSON.stringify(taskId)},{...${JSON.stringify(request)},requestId:crypto.randomUUID()})`);
  const failure = code => run(`(${code}).then(()=>'',error=>String(error))`);
  await run(`(async()=>{const api=window.phaseoDesktop.workspace,connection={id:'12345678-1234-1234-1234-123456789abc',name:'Global',enabled:true,...${JSON.stringify(connectionFor("Global"))}};await api.mcp({type:'save',connection});await api.mcp({type:'save',connection:{...connection,id:'87654321-1234-1234-1234-123456789abc',name:'Project',projectId:'project',...${JSON.stringify(connectionFor("Project"))}}});await api.mcp({type:'save',connection:{...connection,id:'87654321-1234-1234-1234-123456789abd',projectId:'other',executable:${JSON.stringify(path.join(profile, "missing.exe"))}}});await api.mcp({type:'save',connection:{...connection,id:'87654321-1234-1234-1234-123456789abe',enabled:false,executable:${JSON.stringify(path.join(profile, "missing.exe"))}}});})()`);
  // Personal chats see only global servers; a project chat adds its project's servers, across catalogue pages.
  const personal = await prompts("personal", { type: "list" }), scoped = await prompts("project-chat", { type: "list" }); assert.equal(personal.prompts.length, 4); assert.equal(scoped.prompts.length, 8); assert.equal(records().filter(row => row.method === "prompts/get").length, 0);
  const brief = scoped.prompts.find(entry => entry.server === "Project" && entry.name === "brief"), media = scoped.prompts.find(entry => entry.server === "Project" && entry.name === "media"); assert.ok(brief && media, JSON.stringify(scoped.prompts.map(entry => entry.server + ":" + entry.name)));
  assert.deepEqual(brief.arguments, [{ name: "topic", description: "Subject", required: true }]);
  // Previews fetch the prompt with its arguments and format it as a labelled draft, without submitting a turn.
  const first = await prompts("project-chat", { type: "preview", connectionId: brief.connectionId, name: "brief", arguments: { topic: "work" } }); assert.ok(first.text.includes("Project brief for work"), first.text); assert.equal(records().filter(row => row.method === "prompts/get").length, 1);
  const second = await prompts("project-chat", { type: "preview", connectionId: brief.connectionId, name: "brief", arguments: { topic: "other" } }); assert.equal(second.text, "User:\nProject brief for other\n\nAssistant:\nExample answer");
  // Prompt images become chat attachments only when their bytes match the declared format.
  writeFileSync(control, JSON.stringify({ invalidImage: true })); const invalid = await prompts("project-chat", { type: "preview", connectionId: media.connectionId, name: "media", arguments: {} }); assert.ok(invalid.text.includes("[Image:"));
  assert.match(await failure(`window.phaseoDesktop.workspace.mcpPromptAttachments('project-chat',${JSON.stringify(invalid.messages)})`), /declared format/);
  writeFileSync(control, "{}"); const valid = await prompts("project-chat", { type: "preview", connectionId: media.connectionId, name: "media", arguments: {} }); assert.equal(valid.imageCount, 1);
  const inserted = await run(`window.phaseoDesktop.workspace.mcpPromptAttachments('project-chat',${JSON.stringify(valid.messages)})`); assert.ok(inserted.text.endsWith("[Image: prompt-image-1.png]")); assert.equal(inserted.attachments.length, 1);
  const image = await run(`window.phaseoDesktop.workspace.attachment('project-chat',${JSON.stringify(inserted.attachments[0].id)})`); assert.equal(image.dataUrl, `data:image/png;base64,${promptPixels}`);
  // Catalogue failures are reported and a later request recovers.
  writeFileSync(control, JSON.stringify({ failList: true })); assert.match(await failure("window.phaseoDesktop.workspace.mcpPrompts('project-chat',{type:'list',requestId:crypto.randomUUID()})"), /Owned catalog failure/); writeFileSync(control, "{}"); assert.equal((await prompts("project-chat", { type: "list" })).prompts.length, 8);
  // Cancelling a slow catalogue request closes the services it opened.
  writeFileSync(control, JSON.stringify({ delayList: 10000 })); const before = records().length;
  await run("window.ownedPromptRequest=crypto.randomUUID();window.ownedPromptList=window.phaseoDesktop.workspace.mcpPrompts('project-chat',{type:'list',requestId:window.ownedPromptRequest}).then(()=>'',error=>String(error));true");
  await until(() => records().slice(before).some(row => row.method === "prompts/list")); const owners = new Set(records().slice(before).filter(row => row.method === "initialize").map(row => row.sessionId ?? row.pid));
  await run("window.phaseoDesktop.workspace.mcpPrompts('project-chat',{type:'cancel',requestId:window.ownedPromptRequest})"); await run("window.ownedPromptList");
  await until(() => [...owners].every(owner => records().some(row => (row.sessionId ?? row.pid) === owner && row.closed))); writeFileSync(control, "{}");
  assert.equal((await prompts("project-chat", { type: "list" })).prompts.length, 8);
  const task = await run("window.phaseoDesktop.workspace.task('project-chat')"); assert.equal(task.messages.length, 0); assert.equal(task.queue.length, 0);
  if (httpFixture) { assert.equal(httpFixture.failure, undefined); assert.equal(httpFixture.sessions.size, 0); assert.equal(httpFixture.terminations, records().filter(row => row.method === "initialize").length); await httpFixture.close(); }
  console.log("MCP_PROMPT_PICKER_SMOKE", JSON.stringify({ realServices: true, transport: httpMode ? "http" : "stdio", httpSessionTerminations: httpFixture?.terminations, scope: true, pagination: true, argumentPreview: true, mediaPreserved: true, imageInsertion: true, imageFormatRejected: true, loadFailureRetry: true, closeCancellation: true, composerMenus: "deferred", turnSubmissions: 0, providerInferenceCalls: 0, packaged: Boolean(entry) })); clearTimeout(deadline); app.quit();
 } catch (error) { console.error(error); await httpFixture?.close(); clearTimeout(deadline); app.exit(1); }
});
