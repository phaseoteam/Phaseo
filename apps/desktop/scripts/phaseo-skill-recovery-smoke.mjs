import assert from "node:assert/strict";
import { app, BrowserWindow, dialog } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const profile = argument("profile"), stage = argument("stage"), endpoint = argument("endpoint"), entry = argument("app-entry"); assert.ok(profile && endpoint && ["write", "read"].includes(stage)); app.setPath("userData", profile);
const mode = argument("mode") ?? "code"; assert.ok(["chat", "code"].includes(mode));
if (mode === "chat") dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(profile, "owned.png")] });
const deadline = setTimeout(() => { console.error("Skill recovery stage expired", stage); app.exit(1); }, 45000);
await import(entry ? pathToFileURL(path.resolve(entry)).href : "../dist/main/index.mjs");
app.whenReady().then(async () => {
 try {
  const owner = BrowserWindow.getAllWindows()[0]; owner.webContents.setBackgroundThrottling(false); if (owner.webContents.isLoading()) await new Promise(resolve => owner.webContents.once("did-finish-load", resolve));
  const run = code => owner.webContents.executeJavaScript(code), wait = async code => { for (let index = 0; index < 400; index++) { const value = await run(code); if (value) return value; await new Promise(resolve => setTimeout(resolve, 25)); } throw Error("Recovery UI did not settle: " + code); };
  let id;
  if (stage === "write") {
   id = await run(`(async()=>{const api=window.phaseoDesktop.workspace,state=await api.command({type:'add-account',name:'Owned crash fixture',kind:'api',harness:'phaseo',endpoint:${JSON.stringify(endpoint)},apiKey:'owned-unused'});const accountId=state.accounts.find(account=>account.name==='Owned crash fixture').id;const created=await api.command({type:'create-task',${mode === "code" ? "projectId:'project'," : ""}harness:'phaseo',accountId,model:'owned',mode:${JSON.stringify(mode)}});const id=created.tasks[0].id;${mode === "chat" ? "const imported=await api.chooseAttachments(id);if(imported.errors.length||imported.attachments.length!==1)throw Error('Owned image import failed');" : ""}await api.command({type:'send',id,text:'Owned crash recovery',${mode === "chat" ? "attachments:imported.attachments.map(file=>file.id)" : ""}});return id})()`);
  } else {
   id = JSON.parse(readFileSync(path.join(profile, "pending.json"), "utf8")).taskId;
   const recovered = await run(`window.phaseoDesktop.workspace.task(${JSON.stringify(id)})`); assert.equal(recovered.status, "interrupted"); assert.equal(recovered.approvals.length, 0);
   await run(`window.phaseoDesktop.workspace.command({type:'resume',id:${JSON.stringify(id)}})`);
  }
  const pending = async () => wait(`(async()=>{const task=await window.phaseoDesktop.workspace.task(${JSON.stringify(id)});if(task.status==='failed')throw Error(task.error);return task.approvals?.length?task:false})()`);
  const skill = await pending(); assert.equal(skill.approvals[0].method, "Use Phaseo skill review"); assert.ok(skill.approvals[0].description.includes(stage === "write" ? "Initial crash guidance" : "Changed after crash"));
  await wait(`Array.from(document.querySelectorAll('.task-row')).some(row=>row.title===${JSON.stringify(skill.title)})`); await run(`Array.from(document.querySelectorAll('.task-row')).find(row=>row.title===${JSON.stringify(skill.title)}).click()`); await wait(`document.querySelector('[aria-label="Approval needed"] pre')?.textContent.includes(${JSON.stringify(stage === "write" ? "Initial crash guidance" : "Changed after crash")})`);
  if (stage === "read") {
   const output = path.resolve("../../output/playwright/phaseo-skill-recovery", entry ? "packaged" : "source", mode); mkdirSync(output, { recursive: true }); owner.setSize(1040, 680);
   await run(`document.querySelector('[aria-label="Approval needed"]').scrollIntoView({block:'center'})`);
   await wait(`(()=>{const panel=document.querySelector('[aria-label="Approval needed"]'),body=panel?.querySelector('pre'),r=body?.getBoundingClientRect();return r&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&body.textContent.includes('Changed after crash')})()`);
   await new Promise(resolve => setTimeout(resolve, 200)); writeFileSync(path.join(output, "recovery-approval.png"), (await owner.webContents.capturePage()).toPNG());
  }
  await run(`Array.from(document.querySelectorAll('[aria-label="Approval needed"] button')).find(button=>button.textContent==='Allow').click()`);
  if (mode === "chat") {
   const activation = await wait(`(async()=>{const task=await window.phaseoDesktop.workspace.task(${JSON.stringify(id)});if(task.status==='failed')throw Error(task.error);return task.approvals?.some(approval=>approval.method==='Use Phaseo skill explain')?task:false})()`);
   assert.equal(activation.approvals.length, 1); assert.ok(activation.approvals[0].description.includes(stage === "write" ? "Original pending guidance" : "Changed pending guidance"));
   if (stage === "write") { const metadata = { taskId: id, runId: activation.nativeSessionId }; writeFileSync(path.join(profile, "pending.json"), JSON.stringify(metadata)); console.log("SKILL_RECOVERY_PENDING", JSON.stringify(metadata)); return; }
   await wait(`document.querySelector('[aria-label="Approval needed"] pre')?.textContent.includes('Changed pending guidance')`);
   await run(`Array.from(document.querySelectorAll('[aria-label="Approval needed"] button')).find(button=>button.textContent==='Allow').click()`);
   const finished = await wait(`(async()=>{const task=await window.phaseoDesktop.workspace.task(${JSON.stringify(id)});if(task.status==='failed')throw Error(task.error);return task.status==='completed'?task:false})()`);
   assert.ok(finished.messages.some(message=>message.role==='assistant'&&message.text==='Recovery finished')); assert.equal(finished.messages.filter(message=>message.role==='user'&&message.text==='Owned crash recovery').length, 1); assert.equal(finished.messages.find(message=>message.role==='user'&&message.text==='Owned crash recovery').attachments.length, 1); assert.equal(finished.projectId, undefined);
   console.log("SKILL_RECOVERY_RESUMED", JSON.stringify({ mode, interruptedTask: true, renderedReapproval: true, originalImageRetained: true, personalChat: true, packaged: Boolean(entry) })); clearTimeout(deadline); app.quit(); return;
  }
  const effect = await wait(`(async()=>{const task=await window.phaseoDesktop.workspace.task(${JSON.stringify(id)});if(task.status==='failed')throw Error(task.error);return task.approvals?.some(approval=>approval.method==='write_project_file')?task:false})()`); assert.equal(effect.approvals.length, 1);
  if (stage === "write") { const metadata = { taskId: id, runId: effect.nativeSessionId }; writeFileSync(path.join(profile, "pending.json"), JSON.stringify(metadata)); console.log("SKILL_RECOVERY_PENDING", JSON.stringify(metadata)); return; }
  await run(`window.phaseoDesktop.workspace.command({type:'approval',id:${JSON.stringify(id)},approvalId:${JSON.stringify(effect.approvals[0].id)},decision:'accept'})`);
  const fresh = await wait(`(async()=>{const task=await window.phaseoDesktop.workspace.task(${JSON.stringify(id)});if(task.status==='failed')throw Error(task.error);return task.approvals?.some(approval=>approval.id!==${JSON.stringify(effect.approvals[0].id)}&&approval.method==='write_project_file')?task:false})()`);
  await run(`window.phaseoDesktop.workspace.command({type:'approval',id:${JSON.stringify(id)},approvalId:${JSON.stringify(fresh.approvals[0].id)},decision:'accept'})`);
  await wait(`(async()=>{const task=await window.phaseoDesktop.workspace.task(${JSON.stringify(id)});if(task.status==='failed')throw Error(task.error);return task.status==='completed'})()`);
  assert.equal(readFileSync(path.join(profile, "project/effect.txt"), "utf8"), "Fresh approved effect"); console.log("SKILL_RECOVERY_RESUMED", JSON.stringify({ interruptedTask: true, renderedReapproval: true, staleEffectBlocked: true, freshEffect: true, packaged: Boolean(entry) })); clearTimeout(deadline); app.quit();
 } catch (error) { console.error(error); clearTimeout(deadline); app.exit(1); }
});
