import { app, BrowserWindow } from "electron";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
const profile = mkdtempSync(path.join(tmpdir(), "phaseo-resources-native-")); app.setPath("userData", profile);
const calls = path.join(profile, "reads.txt"), script = path.join(profile, "resources.cjs");
writeFileSync(script, `const fs=require('node:fs');require('node:readline').createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;let result;if(r.method==='initialize')result={protocolVersion:r.params.protocolVersion,capabilities:{resources:{}},serverInfo:{name:'owned-documents',version:'1'}};else if(r.method==='resources/read'){fs.appendFileSync(process.argv[2],r.params.uri+'\\n');result={contents:[{uri:r.params.uri,text:'Owned document content'}]};}else {process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,error:{code:-32601,message:'Unexpected method'}})+'\\n');return;}process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,result})+'\\n');});`);
let requests = 0, fixtureError;
const server = createServer(async (request, response) => {
 try {
  if (request.url === "/v1/models") { response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ object: "list", data: [{ id: "owned", object: "model" }] })); return; }
  if (request.url !== "/v1/chat/completions") throw Error("Unexpected owned endpoint");
  let raw = ""; for await (const chunk of request) { raw += chunk; if (raw.length > 1000000) throw Error("Large owned body"); }
  const body = JSON.parse(raw); requests++;
  const result = body.messages.find(message => message.role === "tool");
  if (result && !result.content.includes("Owned document content") && !result.content.includes("rejected")) throw Error("Resource result missing");
  const tool = body.tools.find(tool => tool.function.name.endsWith("_read_resource")); if (!tool) throw Error("Resource tool missing");
  const delta = result ? { content: "Document reviewed" } : { tool_calls: [{ index: 0, id: "document", type: "function", function: { name: tool.function.name, arguments: JSON.stringify({ uri: "notes:owned" }) } }] };
  response.setHeader("content-type", "text/event-stream"); response.end(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: result ? "stop" : "tool_calls" }] })}\n\ndata: [DONE]\n\n`);
 } catch (error) { fixtureError = error; response.writeHead(500); response.end("Owned fixture failed"); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const endpoint = `http://127.0.0.1:${server.address().port}/v1`, entry = process.argv.find(value => value.startsWith("--app-entry="))?.slice(12);
const deadline = setTimeout(() => { console.error("Resource audit deadline"); server.close(); app.exit(1); }, 60000);
await import(entry ? pathToFileURL(path.resolve(entry)).href : "../dist/main/index.mjs");
app.whenReady().then(async () => {
 try {
  const owner = BrowserWindow.getAllWindows()[0]; if (owner.webContents.isLoading()) await new Promise(resolve => owner.webContents.once("did-finish-load", resolve));
  await owner.webContents.executeJavaScript(`(async()=>{
   const api=window.phaseoDesktop.workspace, wait=async predicate=>{for(let i=0;i<300;i++){const value=await predicate();if(value)return value;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Resource workflow wait expired');};
   const overview=await api.command({type:'add-account',name:'Owned documents',harness:'phaseo',kind:'api',endpoint:${JSON.stringify(endpoint)},apiKey:'owned-unused'}), account=overview.accounts.find(value=>value.name==='Owned documents');
   await api.mcp({type:'save',connection:{id:'12345678-1234-1234-1234-123456789abc',name:'Documents',enabled:true,transport:'stdio',executable:${JSON.stringify(process.execPath)},arguments:${JSON.stringify([script, calls])}}});
   const ids=[];
   for(const decision of ['accept','decline']){
    const state=await api.command({type:'create-task',title:'Documents '+decision,harness:'phaseo',mode:'chat',model:'owned',accountId:account.id}), task=state.tasks.find(value=>!ids.includes(value.id));ids.push(task.id);
    await api.command({type:'send',id:task.id,text:'Read owned document'});
    const waiting=await wait(async()=>{const task=await api.task(ids.at(-1));if(task.status==='failed')throw Error(task.error);return task.approvals?.length?task:false;});
    if(waiting.approvals[0].method!=='Documents · read resource'||!JSON.stringify(waiting.approvals[0]).includes('notes:owned'))throw Error('Resource approval identity missing');
    await api.command({type:'approval',id:task.id,approvalId:waiting.approvals[0].id,decision});
    await wait(async()=>{const value=await api.task(task.id);if(value.status==='failed')throw Error(value.error);return value.status==='completed';});
   }
  })()`);
  if (fixtureError) throw fixtureError;
  if (!existsSync(calls) || readFileSync(calls, "utf8").trim() !== "notes:owned" || requests !== 4) throw Error("Unexpected resource effects or requests");
  console.log("PHASEO_RESOURCES_SMOKE", JSON.stringify({ resourceOnly: true, approval: true, denial: true, resourceReads: 1, loopbackModelRequests: requests, providerInferenceCalls: 0, packaged: Boolean(entry) }));
  clearTimeout(deadline); server.close(); app.quit();
 } catch (error) { console.error(error); clearTimeout(deadline); server.close(); app.exit(1); }
});
