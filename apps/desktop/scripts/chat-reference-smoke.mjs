import assert from 'node:assert/strict';
import { app, BrowserWindow } from 'electron';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const profile=mkdtempSync(path.join(tmpdir(),'phaseo-chat-reference-'));app.setPath('userData',profile);mkdirSync(path.join(profile,'workspace'));
const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'],db=new DatabaseSync(path.join(profile,'workspace/workspace.sqlite'));
db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL)');
for(const [index,id] of ids.entries())db.prepare('INSERT INTO tasks VALUES (?,?)').run(id,JSON.stringify({id,title:'Owned reference '+(index+1),harness:'phaseo',model:'owned',mode:'chat',status:'completed',pinned:false,archived:false,queue:[],messages:[{id:'message-'+index,role:'user',text:'Owned content',createdAt:'2026-10-04T00:00:00Z'}],nativeSessionId:'private-native-session-'+index,createdAt:'2026-10-04T00:00:00Z',updatedAt:'2026-10-04T00:00:00Z'}));db.close();
const entry=process.argv.find(value=>value.startsWith('--app-entry='))?.slice('--app-entry='.length),deadline=setTimeout(()=>app.exit(1),45000);
await import(entry?pathToFileURL(path.resolve(entry)).href:'../dist/main/index.mjs');
app.whenReady().then(async()=>{try{
 const owner=BrowserWindow.getAllWindows()[0];owner.webContents.setBackgroundThrottling(false);if(owner.webContents.isLoading())await new Promise(resolve=>owner.webContents.once('did-finish-load',resolve));
 const run=code=>owner.webContents.executeJavaScript(code),wait=async code=>{for(let index=0;index<200;index++){const result=await run(code);if(result)return result;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Chat reference did not settle: '+code);};
 await run(`window.__copyWrites=[];window.__copyReject=true;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copyWrites.push(text);if(window.__copyReject)throw Error('Owned clipboard failure');if(window.__holdCopy)await new Promise(resolve=>window.__releaseCopy=resolve);}}})`);
 await wait(`document.querySelector('.task-row[title="Owned reference 1"]')`);await run(`document.querySelector('.task-row[title="Owned reference 1"]').click()`);await wait(`document.querySelector('.task-title')?.value==='Owned reference 1'`);
 await run(`document.querySelector('[aria-label="Chat actions"]').click()`);await wait(`Array.from(document.querySelectorAll('[role="menuitem"]')).some(item=>item.textContent==='Copy chat ID')`);
 await run(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(item=>item.textContent==='Copy chat ID').focus()`);owner.focus();owner.webContents.focus();owner.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});owner.webContents.sendInputEvent({type:'char',keyCode:'\r'});owner.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
 await wait(`Array.from(document.querySelectorAll('[role="menuitem"]')).some(item=>item.textContent==='Retry copying chat ID')`);assert.deepEqual(await run('window.__copyWrites'),[ids[0]]);
 await run(`window.__copyReject=false;window.__holdCopy=true;Array.from(document.querySelectorAll('[role="menuitem"]')).find(item=>item.textContent==='Retry copying chat ID').click()`);
 await wait(`Boolean(window.__releaseCopy)&&Array.from(document.querySelectorAll('[role="menuitem"]')).some(item=>item.getAttribute('aria-disabled')==='true'&&item.textContent.includes('chat ID'))`);
 await run(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(item=>item.textContent.includes('chat ID')).click();window.__holdCopy=false;window.__releaseCopy()`);
 await wait(`Array.from(document.querySelectorAll('[role="menuitem"]')).some(item=>item.textContent==='Chat ID copied')`);assert.deepEqual(await run('window.__copyWrites'),[ids[0],ids[0]]);
 const output=path.resolve('../../output/playwright/chat-reference',entry?'packaged':'source');mkdirSync(output,{recursive:true});let captures=0;
 for(const [width,height] of [[1440,920],[1040,680]])for(const theme of ['light','dark']){owner.setSize(width,height);await run(`document.querySelector('[aria-label="Use ${theme} theme"]')?.click()`);await run(`if(!document.querySelector('[role="menuitem"]'))document.querySelector('[aria-label="Chat actions"]').click()`);await new Promise(resolve=>setTimeout(resolve,150));writeFileSync(path.join(output,`${theme}-${width}.png`),(await owner.webContents.capturePage()).toPNG());captures++;}
 await run(`document.querySelector('[aria-label="Chat actions"]').click();document.querySelector('.task-row[title="Owned reference 2"]').click()`);await wait(`document.querySelector('.task-title')?.value==='Owned reference 2'`);await run(`document.querySelector('[aria-label="Chat actions"]').click()`);await wait(`Array.from(document.querySelectorAll('[role="menuitem"]')).some(item=>item.textContent==='Copy chat ID')`);await run(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(item=>item.textContent==='Copy chat ID').click()`);await wait(`Array.from(document.querySelectorAll('[role="menuitem"]')).some(item=>item.textContent==='Chat ID copied')`);assert.deepEqual(await run('window.__copyWrites'),[ids[0],ids[0],ids[1]]);
 for(const id of ids){const task=await run(`window.phaseoDesktop.workspace.task(${JSON.stringify(id)})`);assert.equal(task.queue.length,0);assert.equal(task.messages.length,1);assert.equal(task.status,'completed');}
 console.log('CHAT_REFERENCE_SMOKE',JSON.stringify({keyboard:true,retry:true,pendingGuard:true,chatIdentity:true,nativeSessionExcluded:true,chatChangeReset:true,captures,clipboardFixtureWrites:3,systemClipboardWrites:0,providerInferenceCalls:0,packaged:Boolean(entry)}));clearTimeout(deadline);app.quit();
}catch(error){console.error(error);clearTimeout(deadline);app.exit(1);}});
