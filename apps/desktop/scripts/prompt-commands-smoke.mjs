import { installControlActions } from "./fixtures/control-actions.mjs";
import { app, BrowserWindow } from "electron";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
// The composer's "/" menu is checked below; saved prompts are edited as files, so there is no in-app editor to drive.
const profile=mkdtempSync(path.join(tmpdir(),'phaseo-prompt-commands-'));app.setPath('userData',profile);mkdirSync(path.join(profile,'workspace'));
const project=path.join(profile,'project');mkdirSync(project);const now=new Date().toISOString();const db=new DatabaseSync(path.join(profile,'workspace/workspace.sqlite'));
db.exec('CREATE TABLE projects (id TEXT PRIMARY KEY,data TEXT NOT NULL);CREATE TABLE tasks (id TEXT PRIMARY KEY,data TEXT NOT NULL)');db.prepare('INSERT INTO projects VALUES (?,?)').run('project',JSON.stringify({id:'project',name:'Website',directory:project,createdAt:now}));
for(const [id,title,projectId] of [['personal','Owned personal',undefined],['project-chat','Owned project','project']])db.prepare('INSERT INTO tasks VALUES (?,?)').run(id,JSON.stringify({id,title,projectId,harness:'phaseo',model:'default',mode:'chat',status:'completed',pinned:false,archived:false,queue:[],messages:[{id:id+'-message',role:'assistant',text:'Owned history',createdAt:now}],createdAt:now,updatedAt:now}));db.close();
const entry=process.argv.find(value=>value.startsWith('--app-entry='))?.slice(12);const deadline=setTimeout(()=>{console.error('Prompt command audit expired');app.exit(1);},90000);
await import(entry?pathToFileURL(path.resolve(entry)).href:'../dist/main/index.mjs');
app.whenReady().then(async()=>{
 const owner=BrowserWindow.getAllWindows()[0];owner.webContents.setBackgroundThrottling(false);if(owner.webContents.isLoading())await new Promise(resolve=>owner.webContents.once('did-finish-load',resolve));await installControlActions(owner);
 const run=async code=>{try{return await owner.webContents.executeJavaScript(code)}catch(error){console.error("FAILED_SCRIPT",code);throw error}};const wait=async code=>{for(let i=0;i<300;i++){if(await run(code))return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Command UI did not settle: '+code);};
 const commands=(projectId,request)=>run(`window.phaseoDesktop.workspace.promptCommands(${JSON.stringify(projectId)},${JSON.stringify(request)})`);
 try{
  await commands(undefined,{type:'save',scope:'global',name:'review',description:'Global review',template:'Global $ARGUMENTS',expectedHash:'new'});
  await commands('project',{type:'save',scope:'project',name:'review',description:'Project review',template:'Review $1 against $2',expectedHash:'new'});
  // Project commands are offered only in that project's chats.
  const projectList=await commands('project',{type:'list'}),personalList=await commands(undefined,{type:'list'});
  if(projectList.commands.map(command=>command.scope+':'+command.name).sort().join()!=='global:review,project:review')throw Error('Project command catalogue incomplete');
  if(personalList.commands.some(command=>command.scope==='project'||command.description==='Project review'))throw Error('Project commands leaked to personal');
  // Previews expand quoted and trailing arguments without submitting anything.
  const preview=await commands('project',{type:'preview',scope:'project',name:'review',arguments:'"file with spaces" context extra'});
  if(preview.text!=='Review file with spaces against context extra')throw Error('Argument preview incorrect: '+preview.text);
  if((await commands(undefined,{type:'preview',scope:'global',name:'review',arguments:''})).text!=='Global')throw Error('Empty-argument preview incorrect');
  // Saving checks the file's hash, so an external edit is never overwritten.
  await commands(undefined,{type:'save',scope:'global',name:'brief',description:'Write an everyday brief',template:'Explain $ARGUMENTS clearly.',expectedHash:'new'});
  const brief=(await commands(undefined,{type:'list'})).commands.find(command=>command.name==='brief');if(!brief)throw Error('Created command missing');
  writeFileSync(path.join(profile,'commands/brief.md'),'External edit');
  const stale=await run(`window.phaseoDesktop.workspace.promptCommands(undefined,${JSON.stringify({type:'save',scope:'global',name:'brief',description:'Write an everyday brief',template:'Stale replacement',expectedHash:brief.hash})}).then(()=>'',error=>String(error))`);
  if(!stale.includes('changed since it was read'))throw Error('Stale edit was accepted');if(readFileSync(path.join(profile,'commands/brief.md'),'utf8')!=='External edit')throw Error('Stale edit overwrote file');
  // Typing "/" lists saved prompts. One without arguments replaces the draft; one with arguments leaves "/name " to fill in.
  await commands(undefined,{type:'save',scope:'global',name:'hello',description:'Greet',template:'Say hello.',expectedHash:'new'});
  await run("window.__auditOpenChat('Owned personal')");
  const input="document.querySelector('main textarea[aria-label=Message]')",key=name=>run(`${input}.dispatchEvent(new KeyboardEvent('keydown',{key:'${name}',bubbles:true,cancelable:true}))`);
  const option=label=>`[...document.querySelectorAll('[role=dialog][aria-label=Commands] [role=option]')].find(node=>node.textContent.startsWith(${JSON.stringify(label)}))`;
  await run(`window.__auditType(${input},'/hel')`);await wait(option('/hello'));await key('Enter');await wait(`${input}.value==='Say hello.'&&!document.querySelector('[role=dialog][aria-label=Commands]')`);
  await run(`window.__auditType(${input},'/rev')`);await wait(option('/review'));await key('Tab');await wait(`${input}.value==='/review '`);
  await run(`window.__auditType(${input},'/')`);await wait(option('/brief'));await key('Escape');await wait("!document.querySelector('[role=dialog][aria-label=Commands]')");
  await run(`window.__auditType(${input},'')`);
  // A composer draft belongs to its chat and survives switching chats.
  await run("window.__auditOpenChat('Owned project')");await run("window.__auditType(document.querySelector('main textarea[aria-label=Message]'),'Existing draft')");
  await run("window.__auditOpenChat('Owned personal')");await wait("document.querySelector('main textarea[aria-label=Message]')?.value===''");
  await run("window.__auditOpenChat('Owned project')");await wait("document.querySelector('main textarea[aria-label=Message]')?.value==='Existing draft'");
  const unchanged=await run("(async()=>{const api=window.phaseoDesktop.workspace;const tasks=await Promise.all(['personal','project-chat'].map(id=>api.task(id)));return tasks.every(task=>task.messages.length===1&&task.queue.length===0);})()");if(!unchanged)throw Error('Command workflow submitted input');
  console.log('PROMPT_COMMANDS_SMOKE',JSON.stringify({scope:true,argumentPreview:true,draftPreserved:true,staleEdit:true,noSubmission:true,chatSwitch:true,slashMenu:true,providerInferenceCalls:0,packaged:Boolean(entry)}));clearTimeout(deadline);app.quit();
 }catch(error){console.error(error);clearTimeout(deadline);app.exit(1);}
});
