import { app, BrowserWindow } from "electron";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { startContentHttpFixture } from "./fixtures/mcp-content-http.mjs";
const httpMode = process.argv.includes("--http");
const promptMode = process.argv.includes("--prompts");
const expectedContent = promptMode ? "Owned prompt content" : "Owned document content";
const identity = promptMode ? "brief" : "notes:owned";
const argumentsValue = JSON.stringify(promptMode ? { name: "brief", arguments: { topic: "work" } } : { uri: "notes:owned" });
const humanWait = process.argv.includes("--long-human-wait") ? 65000 : 0;
const mode = process.argv.find(value => value.startsWith("--mode="))?.slice(7) ?? "chat";
if (!["chat", "code", "plan"].includes(mode)) throw Error("Unsupported resource audit mode");
const profile = mkdtempSync(path.join(tmpdir(), "phaseo-resources-native-")); app.setPath("userData", profile);
const calls = path.join(profile, "reads.txt"), script = path.join(profile, "resources.cjs");
writeFileSync(script, `const fs=require('node:fs');const promptMode=${JSON.stringify(promptMode)};let pending;const send=value=>process.stdout.write(JSON.stringify(value)+'\\n');require('node:readline').createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;let result;
 if(r.id==='resource-form'){if(r.result?.action!=='accept'||r.result.content?.topic!=='work')throw Error('Resource form answer missing');fs.appendFileSync(process.argv[2],pending.identity+'\\n');send({jsonrpc:'2.0',id:pending.id,result:promptMode?{messages:[{role:'user',content:{type:'text',text:'Owned prompt content'}}]}:{contents:[{uri:pending.identity,text:'Owned document content'}]}});return;}
 if(r.method==='initialize')result={protocolVersion:r.params.protocolVersion,capabilities:promptMode?{prompts:{}}:{resources:{}},serverInfo:{name:'owned-documents',version:'1'}};
 else if(r.method===(promptMode?'prompts/get':'resources/read')){if(promptMode&&(r.params.name!=='brief'||r.params.arguments?.topic!=='work'))throw Error('Prompt arguments missing');pending={id:r.id,identity:promptMode?r.params.name:r.params.uri};send({jsonrpc:'2.0',id:'resource-form',method:'elicitation/create',params:{mode:'form',message:'Which notes?',requestedSchema:{type:'object',properties:{topic:{type:'string'}},required:['topic']}}});return;}
 else {send({jsonrpc:'2.0',id:r.id,error:{code:-32601,message:'Unexpected method'}});return;}send({jsonrpc:'2.0',id:r.id,result});});`);
const httpFixture = httpMode ? await startContentHttpFixture(calls, promptMode) : undefined;
const connection = { id: "12345678-1234-1234-1234-123456789abc", name: "Documents", enabled: true, ...(httpMode ? { transport: "http", url: httpFixture.url } : { transport: "stdio", executable: process.execPath, arguments: [script, calls] }) };
let requests = 0, fixtureError;
const server = createServer(async (request, response) => {
 try {
  if (request.method === "GET" && new URL(request.url, "http://owned.local").pathname === "/v1/models") { response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ object: "list", data: [{ id: "owned", object: "model" }] })); return; }
  if (request.url !== (mode === "chat" ? "/v1/chat/completions" : "/v1/responses")) throw Error(`Unexpected owned endpoint: ${request.method} ${request.url}`);
  let raw = ""; for await (const chunk of request) { raw += chunk; if (raw.length > 1000000) throw Error("Large owned body"); }
  const body = JSON.parse(raw); requests++;
  const result = (mode === "chat" ? body.messages : body.input).find(message => mode === "chat" ? message.role === "tool" : message.type === "function_call_output");
  const content = result?.content ?? result?.output;
  if (result && !content.includes(expectedContent) && !content.includes("rejected")) throw Error("Resource result missing");
  const tool = body.tools.map(tool => tool.function ?? tool).find(tool => tool.name.endsWith(promptMode ? "_get_prompt" : "_read_resource")); if (!tool) throw Error("Resource tool missing");
  const delta = result ? { content: "Document reviewed" } : { tool_calls: [{ index: 0, id: "document", type: "function", function: { name: tool.name, arguments: argumentsValue } }] };
  const output = result ? [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Document reviewed" }] }] : [{ type: "function_call", id: "document-item", call_id: "document", name: tool.name, arguments: argumentsValue }];
  const event = mode === "chat" ? { choices: [{ delta, finish_reason: result ? "stop" : "tool_calls" }] } : { type: "response.completed", response: { id: "owned-" + requests, model: "owned", status: "completed", output } };
  response.setHeader("content-type", "text/event-stream"); response.end(`data: ${JSON.stringify(event)}\n\n${mode === "chat" ? "data: [DONE]\n\n" : ""}`);
 } catch (error) { fixtureError = error; response.writeHead(500); response.end("Owned fixture failed"); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const endpoint = `http://127.0.0.1:${server.address().port}/v1`, entry = process.argv.find(value => value.startsWith("--app-entry="))?.slice(12);
const deadline = setTimeout(() => { console.error("Resource audit deadline"); void httpFixture?.close(); server.close(); app.exit(1); }, humanWait + 60000);
await import(entry ? pathToFileURL(path.resolve(entry)).href : "../dist/main/index.mjs");
app.whenReady().then(async () => {
 try {
  const owner = BrowserWindow.getAllWindows()[0]; if (owner.webContents.isLoading()) await new Promise(resolve => owner.webContents.once("did-finish-load", resolve));
  await owner.webContents.executeJavaScript(`(async()=>{
   const api=window.phaseoDesktop.workspace, wait=async predicate=>{for(let i=0;i<300;i++){const value=await predicate();if(value)return value;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Resource workflow wait expired');};
   const overview=await api.command({type:'add-account',name:'Owned documents',harness:'phaseo',kind:'api',endpoint:${JSON.stringify(endpoint)},apiKey:'owned-unused'}), account=overview.accounts.find(value=>value.name==='Owned documents');
   await api.mcp({type:'save',connection:${JSON.stringify(connection)}});
   const ids=[];
   for(const decision of ['accept','decline','cancel']){
    const state=await api.command({type:'create-task',title:'Documents '+decision,harness:'phaseo',mode:${JSON.stringify(mode)},model:'owned',accountId:account.id}), task=state.tasks.find(value=>!ids.includes(value.id));ids.push(task.id);await api.command({type:'update-task',id:task.id,title:'Documents '+decision});
    await api.command({type:'send',id:task.id,text:'Read owned document'});
    const waiting=await wait(async()=>{const task=await api.task(ids.at(-1));if(task.status==='failed')throw Error(task.error);return task.approvals?.length?task:false;});
    if(waiting.approvals[0].method!==${JSON.stringify(promptMode?'Documents · get prompt':'Documents · read resource')}||!JSON.stringify(waiting.approvals[0]).includes(${JSON.stringify(identity)}))throw Error('Resource approval identity missing');
    await api.command({type:'approval',id:task.id,approvalId:waiting.approvals[0].id,decision:decision==='cancel'?'accept':decision});
    if(decision!=='decline'){
     const asking=await wait(async()=>{const value=await api.task(task.id);if(value.status==='failed')throw Error(value.error);return value.forms?.length?value:false;});
     if(!asking.forms[0].form.title.startsWith('Documents:'))throw Error('Resource form identity missing');
     if(decision==='cancel'){
      await api.command({type:'cancel',id:task.id});
      await wait(async()=>{const value=await api.task(task.id);return value.status==='interrupted'&&!value.forms?.length;});
      await wait(async()=>{try{await api.mcp({type:'save',connection:${JSON.stringify({ ...connection, enabled: false })}});return true;}catch{return false;}});
      continue;
     }
     await new Promise(resolve=>setTimeout(resolve,${humanWait}));
     const row=await wait(()=>Array.from(document.querySelectorAll('.task-row')).find(row=>row.title==='Documents '+decision));row.click();
     const topic=await wait(()=>document.querySelector('input[aria-label="topic"]'));Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(topic,'work');topic.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,25));topic.closest('form').requestSubmit();
    }
    await wait(async()=>{const value=await api.task(task.id);if(value.status==='failed')throw Error(value.error);return value.status==='completed';});
   }
  })()`);
  if (fixtureError) throw fixtureError;
  if (httpFixture && (httpFixture.failure || httpFixture.sessions.size || httpFixture.initialized !== 3 || httpFixture.terminated !== 3)) throw httpFixture.failure ?? Error("HTTP content sessions were not fully terminated.");
  if (!existsSync(calls) || readFileSync(calls, "utf8").trim() !== identity || requests !== 5) throw Error("Unexpected resource effects or requests");
  console.log(promptMode ? "PHASEO_PROMPTS_SMOKE" : "PHASEO_RESOURCES_SMOKE", JSON.stringify({ mode, transport: httpMode ? "http" : "stdio", httpSessionsTerminated: httpFixture?.terminated, resourceOnly: !promptMode, promptOnly: promptMode, elicitation: true, renderedForm: true, cancellation: true, configurationGuardReleased: true, humanWaitMs: humanWait, approval: true, denial: true, resourceReads: promptMode ? 0 : 1, promptRetrievals: promptMode ? 1 : 0, loopbackModelRequests: requests, providerInferenceCalls: 0, packaged: Boolean(entry) }));
  clearTimeout(deadline); server.close(); await httpFixture?.close(); app.quit();
 } catch (error) { console.error(error); clearTimeout(deadline); server.close(); await httpFixture?.close(); app.exit(1); }
});
