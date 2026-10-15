import { installControlActions } from "./fixtures/control-actions.mjs";
import { app, BrowserWindow } from "electron";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
// TODO(desktop composer menus): the redesigned composer has no native command and skill picker or "/" menu yet. Re-add the
// removed UI checks (OpenCode tab in the Commands dialog, native action search, insertion as a native intent with
// "Use as plain text", the intent surviving a chat switch, and prefix edits clearing it) once the new menus land.
const profile=mkdtempSync(path.join(tmpdir(),'phaseo-native-actions-'));app.setPath('userData',profile);mkdirSync(path.join(profile,'workspace'));
const project=path.join(profile,'project');mkdirSync(project);const now=new Date().toISOString();const db=new DatabaseSync(path.join(profile,'workspace/workspace.sqlite'));
db.exec('CREATE TABLE projects (id TEXT PRIMARY KEY,data TEXT NOT NULL);CREATE TABLE tasks (id TEXT PRIMARY KEY,data TEXT NOT NULL)');db.prepare('INSERT INTO projects VALUES (?,?)').run('project',JSON.stringify({id:'project',name:'Website',directory:project,createdAt:now}));
for(const [id,title,projectId] of [['personal','Owned personal',undefined],['project-chat','Owned project','project']])db.prepare('INSERT INTO tasks VALUES (?,?)').run(id,JSON.stringify({id,title,projectId,harness:'opencode',model:'default',mode:'chat',status:'completed',pinned:false,archived:false,queue:[],messages:[{id:id+'-message',role:'assistant',text:'Owned history',createdAt:now}],createdAt:now,updatedAt:now}));db.close();
const requests=[];const scopes=[];const server=createServer((request,response)=>{const url=new URL(request.url,'http://localhost');requests.push(url.pathname);if(['/api/command','/api/skill'].includes(url.pathname))scopes.push(url.searchParams.get('location[directory]'));response.setHeader('content-type','application/json');if(url.pathname==='/api/info'){response.end(JSON.stringify({pid:process.pid,version:'2.0.22'}));return;}if(url.pathname==='/api/command'){response.end(JSON.stringify({location:{directory:project},data:[{name:'review-native',description:'Owned native review'}]}));return;}if(url.pathname==='/api/skill'){response.end(JSON.stringify({location:{directory:project},data:[{id:'owned-skill',name:'Research',description:'Owned skill',path:project+'/SKILL.md',content:'Owned native context'}]}));return;}response.setHeader('content-type','text/html');response.end('<html><title>Owned browser</title><body>Owned command audit</body></html>');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const address=`http://127.0.0.1:${server.address().port}`;
process.env.XDG_STATE_HOME=path.join(profile,'native-state');mkdirSync(path.join(process.env.XDG_STATE_HOME,'opencode'),{recursive:true});writeFileSync(path.join(process.env.XDG_STATE_HOME,'opencode/service.json'),JSON.stringify({id:'owned-audit',pid:process.pid,version:'2.0.22',url:address}));
const entry=process.argv.find(value=>value.startsWith('--app-entry='))?.slice(12);const deadline=setTimeout(()=>{console.error('Native action audit expired');server.close();app.exit(1);},90000);
await import(entry?pathToFileURL(path.resolve(entry)).href:'../dist/main/index.mjs');
app.whenReady().then(async()=>{
 const owner=BrowserWindow.getAllWindows()[0];owner.webContents.setBackgroundThrottling(false);if(owner.webContents.isLoading())await new Promise(resolve=>owner.webContents.once('did-finish-load',resolve));await installControlActions(owner);
 const run=async code=>{try{return await owner.webContents.executeJavaScript(code)}catch(error){console.error("FAILED_SCRIPT",code);throw error}};const wait=async code=>{for(let i=0;i<300;i++){if(await run(code))return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Native action workflow did not settle: '+code);};
 try{
  // The native OpenCode catalog is read from each chat's own execution location.
  for(const id of ['project-chat','personal']){
   const catalog=await run(`window.phaseoDesktop.workspace.nativeActions(${JSON.stringify(id)})`);
   if(!catalog.actions.some(action=>action.kind==='command'&&action.name==='review-native'&&action.description==='Owned native review')||!catalog.actions.some(action=>action.kind==='skill'&&action.name==='Research'))throw Error('Native catalogue incomplete for '+id+': '+JSON.stringify(catalog));
  }
  if(!scopes.includes(project)||!scopes.includes(path.join(profile,'tasks','personal')))throw Error('Native catalog location differs from execution location');
  // A native intent must match the message it travels with, and other harnesses reject it before queueing.
  const action={kind:'command',id:'review-native',name:'review-native',arguments:'target'};
  const mismatch=await run(`window.phaseoDesktop.workspace.command({type:'send',id:'project-chat',text:'/review-native other',nativeAction:${JSON.stringify(action)}}).then(()=>'',error=>String(error))`);
  if(!mismatch.includes('does not match'))throw Error('Mismatched native intent was accepted: '+mismatch);
  const created=await run(`window.phaseoDesktop.workspace.command({type:'create-task',harness:'codex',model:'default',mode:'chat'})`);const other=created.tasks.find(task=>task.harness==='codex').id;
  const crossHarness=await run(`window.phaseoDesktop.workspace.command({type:'send',id:${JSON.stringify(other)},text:'/review-native target',nativeAction:${JSON.stringify(action)}}).then(()=>'',error=>String(error))`);
  if(!crossHarness.includes('OpenCode'))throw Error('Another harness accepted an OpenCode native action: '+crossHarness);
  // Drafts stay with their chat.
  await run("window.__auditOpenChat('Owned project')");await run("window.__auditType(document.querySelector('main [aria-label=Message]'),'Existing draft')");
  await run("window.__auditOpenChat('Owned personal')");await wait("document.querySelector('main [aria-label=Message]')?.value===''");
  await run("window.__auditOpenChat('Owned project')");await wait("document.querySelector('main [aria-label=Message]')?.value==='Existing draft'");
  const unchanged=await run("(async()=>{const api=window.phaseoDesktop.workspace;const tasks=await Promise.all(['personal','project-chat',"+JSON.stringify(other)+"].map(id=>api.task(id)));return tasks.every(task=>task.messages.length<=1&&task.queue.length===0);})()");if(!unchanged)throw Error('Native action checks submitted input');
  if(requests.some(route=>route.includes('/session')))throw Error('Catalogue reads submitted native input');
  console.log('NATIVE_ACTIONS_SMOKE',JSON.stringify({nativeCatalog:true,scope:true,intentValidation:true,crossHarnessRejected:true,chatSwitch:true,noSubmission:true,composerMenus:'deferred',providerInferenceCalls:0,packaged:Boolean(entry)}));clearTimeout(deadline);server.close();app.quit();
 }catch(error){console.error(error);clearTimeout(deadline);server.close();app.exit(1);}
});
