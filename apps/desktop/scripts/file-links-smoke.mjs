import assert from "node:assert/strict";
import { app, BrowserWindow, ipcMain } from "electron";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
const profile=mkdtempSync(path.join(tmpdir(),"phaseo-file-links-"));app.setPath("userData",profile);mkdirSync(path.join(profile,"workspace"));
const project=path.join(profile,"project");mkdirSync(project);writeFileSync(path.join(project,"owned handler.ts"),"Owned content");
const source='Inspect [the request handler](<owned handler.ts:7:2) next.\n\n`[literal](<src/literal.ts)`\n\n[Website](https://example.invalid/docs)';
const db=new DatabaseSync(path.join(profile,"workspace/workspace.sqlite"));db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
const time="2026-10-04T00:00:00Z";db.prepare("INSERT INTO projects VALUES (?,?)").run("project",JSON.stringify({id:"project",name:"Owned files",directory:project,createdAt:time}));
for(const [id,projectId] of [["project-chat","project"],["personal-chat",undefined]])db.prepare("INSERT INTO tasks VALUES (?,?)").run(id,JSON.stringify({id,title:id,harness:"phaseo",model:"owned",mode:"chat",projectId,status:"completed",pinned:false,archived:false,queue:[],messages:[{id:"user",role:"user",text:source,createdAt:time},{id:"assistant",role:"assistant",text:source,createdAt:time}],createdAt:time,updatedAt:time}));db.close();
let calls=[],release;const original=ipcMain.handle;
ipcMain.handle=function(channel,listener){return original.call(this,channel,channel==="workspace:editors"?()=>[{id:"vscode",name:"Owned editor",available:true}]:channel==="workspace:open-project"?async(_event,id,request)=>{calls.push({id,request});await new Promise(resolve=>release=resolve);throw Error("Owned editor unavailable");}:listener);};
const entry=process.argv.find(value=>value.startsWith("--app-entry="))?.slice(12),deadline=setTimeout(()=>app.exit(1),60000);
await import(entry?pathToFileURL(path.resolve(entry)).href:"../dist/main/index.mjs");ipcMain.handle=original;
app.whenReady().then(async()=>{try{
 const owner=BrowserWindow.getAllWindows()[0];owner.webContents.setBackgroundThrottling(false);if(owner.webContents.isLoading())await new Promise(resolve=>owner.webContents.once("did-finish-load",resolve));
 const run=code=>owner.webContents.executeJavaScript(code),wait=async code=>{for(let i=0;i<200;i++){const value=await run(code);if(value)return value;await new Promise(resolve=>setTimeout(resolve,25));}throw Error("File link wait expired: "+code);};
 await wait(`document.querySelector('.task-row[title="project-chat"]')`);await run(`document.querySelector('.task-row[title="project-chat"]').click()`);await wait(`document.querySelector('.message-file-link')?.textContent==='the request handler'`);
 assert.equal(await run(`document.querySelectorAll('.message-file-link').length`),1);assert.equal(await run(`document.querySelector('.task-message-user').textContent.includes('[the request handler](<owned handler.ts:7:2)')`),true);
 assert.equal(await run(`document.querySelector('.task-message-assistant code')?.textContent`),'[literal](<src/literal.ts)');
 assert.equal(await run(`document.querySelector('.task-message-assistant a')?.textContent`),'Website');
 const output=path.resolve('../../output/playwright/file-links',entry?'packaged':'source');mkdirSync(output,{recursive:true});let captures=0;
 async function capture(state){for(const [width,height] of [[1440,920],[1180,800],[1040,680]])for(const theme of ['light','dark']){owner.setSize(width,height);await run(`document.querySelector('[aria-label="Use ${theme} theme"]')?.click()`);await new Promise(resolve=>setTimeout(resolve,100));assert.equal(await run(`document.querySelector('.task-message-assistant').scrollWidth<=document.querySelector('.task-message-assistant').clientWidth+1`),true);writeFileSync(path.join(output,`${state}-${theme}-${width}.png`),(await owner.webContents.capturePage()).toPNG());captures++;}}
 await capture('ready');await run(`document.querySelector('.message-file-link').focus()`);owner.focus();owner.webContents.focus();owner.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});owner.webContents.sendInputEvent({type:'char',keyCode:'\r'});owner.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});await wait(`document.querySelector('.message-file-link')?.disabled&&document.querySelector('.message-link-feedback[role="status"]')?.textContent==='Opening…'`);
 await run(`document.querySelector('.message-file-link').click()`);assert.equal(calls.length,1);await capture('pending');release();await wait(`document.querySelector('.message-link-feedback[role="alert"]')?.textContent==='Owned editor unavailable'`);await capture('failed');assert.deepEqual(calls,[{id:'project',request:{editor:'vscode',filename:'owned handler.ts',line:7,column:2}}]);
 for(const id of ['project-chat','personal-chat']){const task=await run(`window.phaseoDesktop.workspace.task(${JSON.stringify(id)})`);assert.deepEqual(task.messages.map(message=>message.text),[source,source]);assert.equal(task.queue.length,0);}
 await run(`document.querySelector('.task-row[title="personal-chat"]').click()`);await wait(`document.querySelector('.task-title')?.value==='personal-chat'`);assert.equal(await run(`document.querySelectorAll('.message-file-link').length`),0);
 console.log('FILE_LINK_SMOKE',JSON.stringify({descriptiveLabel:true,assistantOnly:true,literalCode:true,personalInert:true,originalTextPreserved:true,keyboard:true,pendingGuard:true,error:true,ownedEditorRequests:calls.length,commercialEditorLaunches:0,providerInferenceCalls:0,captures,packaged:Boolean(entry)}));clearTimeout(deadline);app.quit();
}catch(error){console.error(error);clearTimeout(deadline);app.exit(1);}});
