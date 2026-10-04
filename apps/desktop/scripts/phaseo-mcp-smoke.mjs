import { app, BrowserWindow } from "electron";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
const profile=mkdtempSync(path.join(tmpdir(),"phaseo-managed-mcp-"));app.setPath("userData",profile);
const project=path.join(profile,"project");mkdirSync(project);mkdirSync(path.join(profile,"workspace"));
const seed=new DatabaseSync(path.join(profile,"workspace/workspace.sqlite"));seed.exec("CREATE TABLE projects (id TEXT PRIMARY KEY,data TEXT NOT NULL)");
for(const id of ['fixture','other'])seed.prepare("INSERT INTO projects VALUES (?,?)").run(id,JSON.stringify({id,name:id,directory:project,createdAt:new Date().toISOString()}));seed.close();
const calls=path.join(profile,"calls.jsonl"),fixture=fileURLToPath(new URL('./fixtures/phaseo-mcp.cjs',import.meta.url));
let modelRequests=0,httpToolCalls=0,fixtureError;
const server=createServer(async(request,response)=>{
 try{
  if(request.url==="/mcp"){
   if(request.method!=="POST"){response.writeHead(405);response.end();return;}
   let raw='';for await(const chunk of request)raw+=chunk;const rpc=JSON.parse(raw);if(rpc.id===undefined){response.writeHead(202);response.end();return;}
   let result;if(rpc.method==='initialize')result={protocolVersion:rpc.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'owned-http-mcp',version:'1'}};else if(rpc.method==='tools/list')result={tools:[{name:'owned_http_lookup',description:'Read owned HTTP notes',inputSchema:{type:'object'}}]};else if(rpc.method==='tools/call'){if(rpc.params.name!=='owned_http_lookup')throw Error('Unexpected HTTP tool');httpToolCalls++;result={content:[{type:'text',text:'Owned HTTP MCP result'}]};}else result={};
   response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({jsonrpc:'2.0',id:rpc.id,result}));return;
  }
  if(new URL(request.url,"http://owned.local").pathname==="/v1/models"&&request.method==="GET"){response.writeHead(200,{"content-type":"application/json"});response.end(JSON.stringify({object:"list",data:[{id:"owned-fixture",object:"model"}]}));return;}
  if(request.url!=="/v1/responses"||request.method!=="POST")throw Error(`Unexpected fixture endpoint: ${request.method} ${request.url}`);
  let raw='';for await(const chunk of request){raw+=chunk;if(raw.length>1000000)throw Error('Fixture body too large');}const body=JSON.parse(raw);modelRequests++;
  const finished=body.input.some(item=>item.type==='function_call_output');const tool=body.tools.map(tool=>tool.function??tool).find(tool=>tool.name?.startsWith('phaseo_'));if(!tool)throw Error('Managed tool absent from gateway request');
  const output=finished?[{type:'message',role:'assistant',content:[{type:'output_text',text:'Owned task finished.'}]}]:[{type:'function_call',id:'owned-call-item',call_id:'owned-call',name:tool.name,arguments:JSON.stringify({query:'owned notes'})}];
  response.writeHead(200,{'content-type':'text/event-stream'});response.end('data: '+JSON.stringify({type:'response.completed',response:{id:'owned-'+modelRequests,model:'owned-fixture',status:'completed',output}})+'\n\n');
 }catch(error){console.error("Owned gateway fixture:",error);fixtureError=error;response.writeHead(500);response.end('Owned fixture failure');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const endpoint=`http://127.0.0.1:${server.address().port}/v1`;
const packagedEntry=process.argv.find(value=>value.startsWith('--app-entry='))?.slice('--app-entry='.length);
const deadline=setTimeout(()=>{console.error('PHASEO_MCP_SMOKE deadline');server.close();app.exit(1);},60000);
try { await import(packagedEntry?pathToFileURL(path.resolve(packagedEntry)).href:'../dist/main/index.mjs'); } catch(error) { console.error(error);clearTimeout(deadline);server.close();app.exit(1); }

app.whenReady().then(async()=>{
 try{
  const owner=BrowserWindow.getAllWindows()[0];if(owner.webContents.isLoading())await new Promise(resolve=>owner.webContents.once('did-finish-load',resolve));
  const result=await owner.webContents.executeJavaScript(`(async()=>{
   const api=window.phaseoDesktop.workspace;
   const wait=async predicate=>{for(let i=0;i<200;i++){const value=await predicate();if(value)return value;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('MCP audit wait expired');};
   const accounts=await api.command({type:'add-account',name:'Owned fixture',kind:'api',harness:'phaseo',endpoint:${JSON.stringify(endpoint)},apiKey:'unused-owned-fixture'});const account=accounts.accounts.find(account=>account.name==='Owned fixture');
   const connection={id:'12345678-1234-1234-1234-123456789abc',name:'Owned MCP',projectId:'fixture',enabled:true,transport:'stdio',executable:${JSON.stringify(process.execPath)},arguments:${JSON.stringify([fixture,calls,"elicit"])}};
   await api.mcp({type:'save',connection});
   await api.mcp({type:'save',connection:{...connection,id:'87654321-1234-1234-1234-123456789abc',projectId:'other',executable:${JSON.stringify(path.join(profile,'missing.exe'))}}});
   await api.mcp({type:'save',connection:{...connection,id:'87654321-1234-1234-1234-123456789abd',enabled:false,executable:${JSON.stringify(path.join(profile,'missing.exe'))}}});
   const ids=[];
   for(const decision of ['accept','decline']){
    const overview=await api.command({type:'create-task',harness:'phaseo',accountId:account.id,model:'owned-fixture',mode:'code',projectId:'fixture'});const task=overview.tasks.find(task=>!ids.includes(task.id));ids.push(task.id);await api.command({type:'update-task',id:task.id,title:'Owned '+decision});
    await api.command({type:'send',id:task.id,text:'Read owned notes'});const waiting=await wait(async()=>{const value=await api.task(task.id);if(value.status==='failed')throw Error(value.error);return value.approvals?.length?value:false;});
    if(waiting.approvals[0].method!=='Owned MCP · owned_lookup')throw Error('Approval did not identify server and tool');let blocked=false;try{await api.mcp({type:'save',connection:{...connection,enabled:false}});}catch{blocked=true;}if(!blocked)throw Error('Active Phaseo MCP configuration changed');
    await api.command({type:'approval',id:task.id,approvalId:waiting.approvals[0].id,decision});if(decision==='accept'){const asking=await wait(async()=>{const value=await api.task(task.id);if(value.status==='failed')throw Error(value.error);return value.forms?.length?value:false;});if(!asking.forms[0].form.title.startsWith('Owned MCP:')||asking.forms[0].form.fields.length!==2)throw Error('MCP form did not identify its server');const row=await wait(()=>Array.from(document.querySelectorAll('.task-row')).find(row=>row.title==='Owned '+decision));row.click();const topic=await wait(()=>document.querySelector('select[aria-label="topic"]'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(topic,'0');topic.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,25));const count=document.querySelector('input[aria-label="count"]');if(!count||count.type!=='number'||count.min!=='1'||count.max!=='5')throw Error('Typed MCP form did not render');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(count,'2');count.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,25));topic.closest('form').requestSubmit();}await wait(async()=>{const value=await api.task(task.id);if(value.status==='failed')throw Error(value.error);return value.status==='completed';});
   }
   await api.mcp({type:'save',connection:{...connection,enabled:false}});
   const httpConnection={id:'87654321-1234-1234-1234-123456789abe',name:'Owned HTTP',enabled:true,transport:'http',url:${JSON.stringify(endpoint.replace(/\/v1$/,'/mcp'))}};
   await api.mcp({type:'save',connection:httpConnection});
   const httpOverview=await api.command({type:'create-task',harness:'phaseo',accountId:account.id,model:'owned-fixture',mode:'plan',projectId:'fixture'});const httpTask=httpOverview.tasks.find(task=>!ids.includes(task.id));ids.push(httpTask.id);await api.command({type:'send',id:httpTask.id,text:'Read owned HTTP notes'});
   const httpWaiting=await wait(async()=>{const value=await api.task(httpTask.id);if(value.status==='failed')throw Error(value.error);return value.approvals?.length?value:false;});if(httpWaiting.approvals[0].method!=='Owned HTTP · owned_http_lookup')throw Error('HTTP approval did not identify tool');await api.command({type:'approval',id:httpTask.id,approvalId:httpWaiting.approvals[0].id,decision:'accept'});await wait(async()=>{const value=await api.task(httpTask.id);if(value.status==='failed')throw Error(value.error);return value.status==='completed';});
   await api.mcp({type:'save',connection:{...httpConnection,enabled:false}});
   await api.mcp({type:'save',connection:{...connection,enabled:true,executable:${JSON.stringify(path.join(profile,'missing.exe'))}}});
   const overview=await api.command({type:'create-task',harness:'phaseo',accountId:account.id,model:'owned-fixture',mode:'plan',projectId:'fixture'});const task=overview.tasks.find(task=>!ids.includes(task.id));await api.command({type:'send',id:task.id,text:'Retain this input'});
   const failed=await wait(async()=>{const value=await api.task(task.id);return value.status==='failed'?value:false;});if(failed.queue.length!==1||failed.queue[0].text!=='Retain this input'||failed.messages.some(message=>message.role==='user'))throw Error('MCP preflight lost or submitted input');
   return {approval:true,denial:true,scope:true,activeConfigurationGuard:true,preflightQueueRetention:true,completedTasks:ids.length};
  })()`);
  if(fixtureError)throw fixtureError;
  const records=existsSync(calls)?readFileSync(calls,'utf8').trim().split('\n').map(line=>JSON.parse(line)):[];if(records.length!==1||records[0].name!=='owned_lookup'||records[0].elicitation?.action!=='accept'||records[0].elicitation?.content?.topic!=='work'||records[0].elicitation?.content?.count!==2||modelRequests!==6||httpToolCalls!==1)throw Error('Unapproved native tool or unexpected inference fixture request');
  console.log('PHASEO_MCP_SMOKE',JSON.stringify({...result,nativeToolCalls:records.length,httpToolCalls,elicitation:true,renderedForm:true,loopbackModelRequests:modelRequests,providerInferenceCalls:0,packaged:Boolean(packagedEntry)}));clearTimeout(deadline);server.close();app.quit();
 }catch(error){console.error(error);clearTimeout(deadline);server.close();app.exit(1);}
});
