import assert from "node:assert/strict";
import { app, BrowserWindow } from "electron";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
// TODO(desktop composer menus): the redesigned composer has no native command and skill picker yet. Re-add the removed UI
// checks (OpenAI tab in the Commands dialog, search focus, End/Home/Up/Down active-descendant navigation, IME Enter
// preservation, the empty-search status, argument focus and Back, dialog layout captures, and inserting an explicit
// native draft without submitting a turn) once the new menus land.
const profile=mkdtempSync(path.join(tmpdir(),'phaseo-openai-picker-'));app.setPath('userData',profile);mkdirSync(path.join(profile,'workspace'));const project=path.join(profile,'project'),accountPath=path.join(profile,'account');mkdirSync(accountPath);const skill=path.join(project,'.agents','skills','owned-brief','SKILL.md');mkdirSync(path.dirname(skill),{recursive:true});writeFileSync(skill,'---\nname: owned-brief\ndescription: Owned project skill\n---\nExplain the requested topic.\n');writeFileSync(path.join(accountPath,'config.toml'),'model_provider = "owned"\n[model_providers.owned]\nname = "Owned unavailable endpoint"\nbase_url = "http://127.0.0.1:1/v1"\nwire_api = "responses"\n');
const now=new Date().toISOString(),db=new DatabaseSync(path.join(profile,'workspace/workspace.sqlite'));db.exec('CREATE TABLE projects (id TEXT PRIMARY KEY,data TEXT NOT NULL);CREATE TABLE tasks (id TEXT PRIMARY KEY,data TEXT NOT NULL);CREATE TABLE accounts (id TEXT PRIMARY KEY,data TEXT NOT NULL)');db.prepare('INSERT INTO projects VALUES (?,?)').run('project',JSON.stringify({id:'project',name:'Website',directory:project,createdAt:now}));db.prepare('INSERT INTO accounts VALUES (?,?)').run('owned',JSON.stringify({id:'owned',name:'Owned account',harness:'codex',kind:'native',configured:true,configDirectory:accountPath}));for(const[id,projectId]of[['personal',undefined],['project-chat','project']])db.prepare('INSERT INTO tasks VALUES (?,?)').run(id,JSON.stringify({id,title:id,projectId,accountId:'owned',harness:'codex',model:'default',mode:'chat',status:'completed',pinned:false,archived:false,queue:[],messages:[],createdAt:now,updatedAt:now}));db.close();
const entry=process.argv.find(value=>value.startsWith('--app-entry='))?.slice(12),deadline=setTimeout(()=>{console.error('OpenAI picker audit expired');app.exit(1);},60000);await import(entry?pathToFileURL(path.resolve(entry)).href:'../dist/main/index.mjs');
app.whenReady().then(async()=>{
 const owner=BrowserWindow.getAllWindows()[0];owner.webContents.setBackgroundThrottling(false);if(owner.webContents.isLoading())await new Promise(resolve=>owner.webContents.once('did-finish-load',resolve));const run=code=>owner.webContents.executeJavaScript(code);
 try{
  // The installed OpenAI CLI lists the project's skills for project chats only, using the chat's selected account.
  const personal=await run("window.phaseoDesktop.workspace.nativeActions('personal')");assert.ok(!personal.actions.some(action=>action.name==='owned-brief'));
  const projectCatalog=await run("window.phaseoDesktop.workspace.nativeActions('project-chat')");assert.ok(projectCatalog.actions.some(action=>action.kind==='skill'&&action.name==='owned-brief'&&action.description==='Owned project skill'),JSON.stringify(projectCatalog));
  const task=await run("window.phaseoDesktop.workspace.task('project-chat')");assert.equal(task.messages.length,0);assert.equal(task.queue.length,0);console.log('OPENAI_NATIVE_PICKER_SMOKE',JSON.stringify({installedNativeCatalog:true,selectedAccount:true,projectPersonalScope:true,composerMenus:'deferred',turnSubmissions:0,packaged:Boolean(entry)}));clearTimeout(deadline);app.quit();
 }catch(error){console.error(error);clearTimeout(deadline);app.exit(1);}
});
