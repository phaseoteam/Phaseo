import assert from "node:assert/strict";
import { app, BrowserWindow } from "electron";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { storeFixtureTasks } from "./fixtures/workspaceFixture.mjs";
// TODO(desktop composer menus): the redesigned composer has no skill picker or "/" menu yet. Re-add the removed UI checks
// (Phaseo tab in the Commands dialog, search focus, End/Home/Up/Down active-descendant navigation, the empty-search status,
// dialog layout captures, the "2 more skill definitions" warning, IME Enter preservation, argument focus and Back, and
// inserting "/skill:owned-brief topic" as a native intent with "Use as plain text") once the new menus land.
const profile=mkdtempSync(path.join(tmpdir(),'phaseo-skill-picker-'));app.setPath('userData',profile);mkdirSync(path.join(profile,'workspace'));const project=path.join(profile,'project');mkdirSync(project);
const writeSkill=(root,directory,name,body='Owned instructions',policy='')=>{const file=path.join(root,directory,name,'SKILL.md');mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,'---\nname: '+name+'\ndescription: Owned scope skill\n'+policy+'---\n'+body);};
writeSkill(path.join(profile,'workspace'),'skills','owned-brief');writeSkill(project,'.phaseo/skills','owned-brief');writeSkill(project,'.agents/skills','compat-brief');writeSkill(project,'.phaseo/skills','model-only','Hidden body','user-invocable: false\n');for(let i=0;i<12;i++){const file=path.join(project,'.phaseo/skills','invalid-'+i,'SKILL.md');mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,'Malformed fixture');}
const now=new Date().toISOString(),db=new DatabaseSync(path.join(profile,'workspace/workspace.sqlite'));db.exec('CREATE TABLE projects (id TEXT PRIMARY KEY,data TEXT NOT NULL);CREATE TABLE tasks (id TEXT PRIMARY KEY,data TEXT NOT NULL);CREATE TABLE accounts (id TEXT PRIMARY KEY,data TEXT NOT NULL)');db.prepare('INSERT INTO projects VALUES (?,?)').run('project',JSON.stringify({id:'project',name:'Website',directory:project,createdAt:now}));db.prepare('INSERT INTO accounts VALUES (?,?)').run('owned',JSON.stringify({id:'owned',name:'Owned account',harness:'phaseo',kind:'api',configured:true,endpoint:'http://127.0.0.1:1/v1'}));for(const[id,projectId]of[['personal',undefined],['project-chat','project']])db.prepare('INSERT INTO tasks VALUES (?,?)').run(id,JSON.stringify({id,title:id,projectId,accountId:'owned',harness:'phaseo',model:'owned',mode:'chat',status:'completed',pinned:false,archived:false,queue:[],messages:[],createdAt:now,updatedAt:now}));db.close();
await storeFixtureTasks(path.join(profile, "workspace", "workspace.sqlite"));
const entry=process.argv.find(value=>value.startsWith('--app-entry='))?.slice(12),deadline=setTimeout(()=>{console.error('Phaseo skill picker audit expired');app.exit(1);},60000);await import(entry?pathToFileURL(path.resolve(entry)).href:'../dist/main/index.mjs');
if(entry){const archive=path.dirname(path.dirname(path.dirname(path.resolve(entry)))),html=readFileSync('dist/renderer/index.html','utf8'),asset=html.match(/src="([^"\s]+\.js)"/)?.[1];assert.ok(asset);for(const file of ['dist/main/index.mjs','dist/preload/index.cjs','dist/renderer/index.html','dist/renderer/'+asset.replace(/^\.\//,'').replace(/^\//,'')])assert.deepEqual(readFileSync(path.join(archive,file)),readFileSync(file));}
app.whenReady().then(async()=>{
 const owner=BrowserWindow.getAllWindows()[0];owner.webContents.setBackgroundThrottling(false);if(owner.webContents.isLoading())await new Promise(resolve=>owner.webContents.once('did-finish-load',resolve));const run=code=>owner.webContents.executeJavaScript(code);
 try{
  // Phaseo's own skill catalogue: global skills everywhere, project and compatible skills only in that project's chats,
  // model-only skills hidden from people, and malformed definitions reported instead of dropped.
  const personal=await run("window.phaseoDesktop.workspace.nativeActions('personal')");assert.equal(personal.actions.filter(action=>action.name==='owned-brief').length,1);assert.equal(personal.actions[0].id,'global:owned-brief');assert.ok(!personal.actions.some(action=>action.name==='compat-brief'));
  const projectCatalog=await run("window.phaseoDesktop.workspace.nativeActions('project-chat')");
  assert.deepEqual(projectCatalog.actions.filter(action=>action.name==='owned-brief').map(action=>action.id).sort(),['global:owned-brief','project:owned-brief'],JSON.stringify(projectCatalog.actions));assert.ok(projectCatalog.actions.some(action=>action.name==='compat-brief'));assert.ok(!projectCatalog.actions.some(action=>action.name==='model-only'));
  assert.equal(projectCatalog.errors?.length,12,JSON.stringify(projectCatalog.errors));
  const task=await run("window.phaseoDesktop.workspace.task('project-chat')");assert.equal(task.messages.length,0);assert.equal(task.queue.length,0);console.log('PHASEO_SKILL_PICKER_SMOKE',JSON.stringify({ownCatalog:true,malformedDefinitionsReported:true,projectPersonalScope:true,modelOnlyHidden:true,composerMenus:'deferred',turnSubmissions:0,packaged:Boolean(entry)}));clearTimeout(deadline);app.quit();
 }catch(error){console.error(error);clearTimeout(deadline);app.exit(1);}
});
