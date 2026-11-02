import assert from 'node:assert/strict';
import { app, BrowserWindow } from 'electron';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { installControlActions } from './fixtures/control-actions.mjs';
import { storeFixtureTasks } from "./fixtures/workspaceFixture.mjs";
// Chats are referenced by typing "@" in the composer, which replaced the old "Copy chat ID" menu item.
const profile=mkdtempSync(path.join(tmpdir(),'phaseo-chat-reference-'));app.setPath('userData',profile);mkdirSync(path.join(profile,'workspace'));
const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'],db=new DatabaseSync(path.join(profile,'workspace/workspace.sqlite'));
db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL)');
for(const [index,id] of ids.entries())db.prepare('INSERT INTO tasks VALUES (?,?)').run(id,JSON.stringify({id,title:'Owned reference '+(index+1),harness:'phaseo',model:'owned',mode:'chat',status:'completed',pinned:false,archived:false,queue:[],messages:[{id:'message-'+index,role:'user',text:'Owned content',createdAt:'2026-10-04T00:00:00Z'}],nativeSessionId:'private-native-session-'+index,createdAt:'2026-10-04T00:00:00Z',updatedAt:'2026-10-04T00:00:00Z'}));db.close();
await storeFixtureTasks(path.join(profile, "workspace", "workspace.sqlite"));
const entry=process.argv.find(value=>value.startsWith('--app-entry='))?.slice('--app-entry='.length),deadline=setTimeout(()=>app.exit(1),45000);
await import(entry?pathToFileURL(path.resolve(entry)).href:'../dist/main/index.mjs');
app.whenReady().then(async()=>{try{
 const owner=BrowserWindow.getAllWindows()[0];owner.webContents.setBackgroundThrottling(false);if(owner.webContents.isLoading())await new Promise(resolve=>owner.webContents.once('did-finish-load',resolve));await installControlActions(owner);
 const run=code=>owner.webContents.executeJavaScript(code).catch(error=>{if(/could not be cloned/.test(error?.message))return true;throw error});
 // A chat is reachable by its ID from the command palette; native session identifiers never leave the main process.
 await run(`window.__auditOpenChatId(${JSON.stringify(ids[1])})`);
 const overview=await run('window.phaseoDesktop.workspace.overview()');assert.ok(overview.tasks.every(task=>!('nativeSessionId' in task)));assert.ok(!JSON.stringify(overview).includes('private-native-session'));
 // "@" lists other chats; choosing one puts a chip for it in the message, in place of the typed mention, without sending.
 const input="document.querySelector('main [aria-label=Message]')",until=async code=>{for(let i=0;i<300;i++){if(await run(code))return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Mention UI did not settle: '+code);};
 await run(`window.__auditOpenChatId(${JSON.stringify(ids[0])})`);await until(input);
 await run(`window.__auditType(${input},'See @reference')`);
 await until("[...document.querySelectorAll('[role=dialog] [role=option]')].some(node=>node.textContent==='Owned reference 2')");
 if(await run("[...document.querySelectorAll('[role=dialog] [role=option]')].some(node=>node.textContent==='Owned reference 1')"))throw Error('The open chat offered itself');
 await run(`${input}.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`);
 await until(`${input}.value.startsWith('See @[Owned reference 2](chat:${ids[1]})')&&[...document.querySelectorAll('main form [data-mention-kind=chat]')].some(node=>node.textContent.includes('Owned reference 2'))`);
 await run(`window.__auditType(${input},'')`);
 // References are validated before anything is queued: malformed and unknown chat IDs are rejected.
 const send=references=>run(`window.phaseoDesktop.workspace.command({type:'send',id:${JSON.stringify(ids[0])},text:'Owned reference check',threadReferences:${JSON.stringify(references)}}).then(()=>'',error=>String(error))`);
 assert.match(await send(['not-a-chat-id']),/Invalid/);
 assert.ok(await send(['00000000-0000-4000-8000-00000000ffff']));
 assert.match(await send(Array.from({length:11},()=>ids[1])),/Invalid/);
 for(const id of ids){const task=await run(`window.phaseoDesktop.workspace.task(${JSON.stringify(id)})`);assert.equal(task.queue.length,0);assert.equal(task.messages.length,1);assert.equal(task.status,'completed');}
 console.log('CHAT_REFERENCE_SMOKE',JSON.stringify({paletteById:true,nativeSessionExcluded:true,referenceValidation:true,mentionMenu:true,providerInferenceCalls:0,packaged:Boolean(entry)}));clearTimeout(deadline);app.quit();
}catch(error){console.error(error);clearTimeout(deadline);app.exit(1);}});
