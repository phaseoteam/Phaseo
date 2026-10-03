import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

const data = mkdtempSync(path.join(tmpdir(), "phaseo-electron-smoke-"));
app.setPath("userData", data);
const openCodeBinary = process.argv.find(argument => argument.startsWith("--opencode-binary="))?.slice("--opencode-binary=".length);
if (openCodeBinary) {
	process.env.PATH = `${path.dirname(path.resolve(openCodeBinary))}${path.delimiter}${process.env.PATH ?? ""}`;
	for (const name of ["CONFIG", "DATA", "STATE", "CACHE"]) process.env[`XDG_${name}_HOME`] = path.join(data, "native-fixture", name.toLowerCase());
}
const fixtureProject = path.join(data, "fixture-project");
mkdirSync(fixtureProject); writeFileSync(path.join(fixtureProject, "hello.txt"), "Before");
const stream = "BT /F1 12 Tf 20 50 Td (Fixture PDF text) Tj ET";
const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>", `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
let fixturePdf = "%PDF-1.4\n"; const offsets = [0];
for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(fixturePdf)); fixturePdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }
const xref = Buffer.byteLength(fixturePdf);
fixturePdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
writeFileSync(path.join(fixtureProject, "fixture.pdf"), fixturePdf);
for (const args of [["init", "-b", "fixture"], ["config", "user.name", "Fixture"], ["config", "user.email", "fixture@example.invalid"], ["config", "commit.gpgsign", "false"], ["add", "--", "hello.txt", "fixture.pdf"], ["commit", "-m", "Fixture initial commit"]]) execFileSync("git", args, { cwd: fixtureProject, windowsHide: true, stdio: "pipe" });
mkdirSync(path.join(data, "workspace"));
const seed = new DatabaseSync(path.join(data, "workspace", "workspace.sqlite"));
seed.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
seed.prepare("INSERT INTO projects (id, data) VALUES (?, ?)").run("fixture", JSON.stringify({ id: "fixture", name: "Fixture project", directory: fixtureProject, createdAt: new Date().toISOString() }));
seed.close();
const packagedEntry = process.argv.find(argument => argument.startsWith("--app-entry="))?.slice("--app-entry=".length);
await import(packagedEntry ? pathToFileURL(path.resolve(packagedEntry)).href : "../dist/main/index.mjs");

app.whenReady().then(async () => {
	try {
		dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(fixtureProject, "hello.txt"), path.join(fixtureProject, "fixture.pdf")] });
		dialog.showSaveDialog = async (_window, options) => ({ canceled: false, filePath: path.join(data, path.basename(options.defaultPath)) });
		const window = BrowserWindow.getAllWindows()[0];
		if (!window) throw new Error("Desktop window missing");
		if (window.webContents.isLoading()) await new Promise(resolve => window.webContents.once("did-finish-load", resolve));
		const result = await window.webContents.executeJavaScript(`(async () => {
			try {
			const api = window.phaseoDesktop.workspace;
			const initial = await api.get();
			if (initial.tasks.length) throw new Error('Isolated workspace is not empty');
			const checkNativeOpenCode = ${Boolean(openCodeBinary)};
			if (checkNativeOpenCode) {
				const models = await api.models('opencode',undefined,'fixture');
				if (!Array.isArray(models)) throw new Error('Native OpenCode model discovery failed');
				const installation = (await api.installations()).find(value=>value.harness==='opencode');
				if (!installation?.installed || installation.version!=='2.0.22') throw new Error('Native OpenCode version check failed');
			}
			const created = await api.command({type:'create-task',harness:'codex',model:'default',mode:'chat'});
			const task = created.tasks[0];
			await api.command({type:'update-task',id:task.id,title:'Electron bridge check',pinned:true});
			await api.command({type:'update-task',id:task.id,archived:true});
			const restored = await api.command({type:'update-task',id:task.id,archived:false});
			if (restored.tasks[0].title !== 'Electron bridge check' || !restored.tasks[0].pinned) throw new Error('IPC persistence mismatch');
			let rejected = false;
			try { await api.command({type:'send',id:task.id,text:42}); } catch { rejected = true; }
			if (!rejected) throw new Error('Malformed IPC was accepted');
			const button = Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Tasks');
			if (!button) throw new Error('Task navigation missing'); button.click();
			await new Promise(resolve => setTimeout(resolve, 200));
			const row = document.querySelector('.task-row');
			if (!row || !row.textContent.includes('Electron bridge check')) throw new Error('Persisted task missing from renderer');
			row.click(); await new Promise(resolve => setTimeout(resolve, 100));
			if (document.querySelector('[aria-label="Task title"]').value !== 'Electron bridge check') throw new Error('Task detail missing');
			const terminals = await api.terminal({type:'open'}); const terminalId = terminals[0].id;
			await api.terminal({type:'resize',id:terminalId,columns:100,rows:30});
			const windows = (await window.phaseoDesktop.getRuntimeInfo()).platform === 'win32';
			await api.terminal({type:'write',id:terminalId,data:windows ? "Write-Output ('PHASEO_' + 'PTY_CHECK')\\r" : "printf 'PHASEO_%s\\\\n' 'PTY_CHECK'\\r"});
			let checked = false;
			for (let attempt = 0; attempt < 100; attempt++) { const current = await api.terminals(); if (current.find(value => value.id === terminalId)?.output.includes('PHASEO_PTY_CHECK')) { checked = true; break; } await new Promise(resolve => setTimeout(resolve, 100)); }
			if (!checked) throw new Error('PTY command did not produce output');
			await api.terminal({type:'close',id:terminalId});
			const documentBefore = await api.readDocument('fixture','hello.txt');
			await api.writeDocument('fixture','hello.txt','First edit',documentBefore.hash);
			let staleRejected = false;
			try { await api.writeDocument('fixture','hello.txt','Stale edit',documentBefore.hash); } catch { staleRejected = true; }
			if (!staleRejected || (await api.readFile('fixture','hello.txt')) !== 'First edit') throw new Error('Stale file edit was accepted');
			Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Projects').click();
			await new Promise(resolve => setTimeout(resolve,200));
			const projectSelect = document.querySelector('select[aria-label="Project"]');
			Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(projectSelect,'fixture'); projectSelect.dispatchEvent(new Event('change',{bubbles:true}));
			await new Promise(resolve => setTimeout(resolve,200));
			Array.from(document.querySelectorAll('.project-browser aside button')).find(button => button.textContent.includes('hello.txt')).click();
			await new Promise(resolve => setTimeout(resolve,100));
			Array.from(document.querySelectorAll('.project-browser button')).find(button => button.textContent.trim() === 'Edit').click();
			await new Promise(resolve => setTimeout(resolve,100));
			const editor = document.querySelector('textarea[aria-label="Edit hello.txt"]');
			if (!editor) throw new Error('Project editor did not open');
			Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(editor,'UI edit'); editor.dispatchEvent(new Event('input',{bubbles:true}));
			await new Promise(resolve => setTimeout(resolve,100));
			Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Save').click();
			await new Promise(resolve => setTimeout(resolve,200));
			if ((await api.readFile('fixture','hello.txt')) !== 'UI edit') throw new Error('Editor save failed');
			Array.from(document.querySelectorAll('.project-toolbar button')).find(button => button.textContent.trim() === 'Git review').click();
			await new Promise(resolve => setTimeout(resolve,700));
			const stage = Array.from(document.querySelectorAll('.git-file-list button')).find(button => button.textContent.trim() === 'Stage');
			if (!stage) throw new Error('Git file staging control missing'); stage.click();
			let staged = false;
			for (let attempt = 0; attempt < 50; attempt++) { if ((await api.gitReview('fixture')).stagedDiff.includes('+UI edit')) { staged = true; break; } await new Promise(resolve => setTimeout(resolve,100)); }
			if (!staged) throw new Error('Git staging did not update the index');
			await new Promise(resolve => setTimeout(resolve,200));
			const commitInput = document.querySelector('[aria-label="Commit message"]');
			Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(commitInput,'Fixture UI commit'); commitInput.dispatchEvent(new Event('input',{bubbles:true}));
			await new Promise(resolve => setTimeout(resolve,100));
			Array.from(document.querySelectorAll('.project-review button')).find(button => button.textContent.trim() === 'Commit staged changes').click();
			let committed = false;
			for (let attempt = 0; attempt < 50; attempt++) { if (!(await api.gitReview('fixture')).status) { committed = true; break; } await new Promise(resolve => setTimeout(resolve,100)); }
			if (!committed) throw new Error('Git commit did not finish');
			window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}));
			await new Promise(resolve => setTimeout(resolve,100));
			const search = document.querySelector('[aria-label="Search commands and tasks"]');
			if (!search || document.activeElement !== search) throw new Error('Command search did not receive focus');
			Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'Electron bridge check'); search.dispatchEvent(new Event('input',{bubbles:true}));
			await new Promise(resolve => setTimeout(resolve,100));
			search.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
			await new Promise(resolve => setTimeout(resolve,200));
			if (document.querySelector('.command-palette') || document.querySelector('[aria-label="Task title"]')?.value !== 'Electron bridge check') throw new Error('Command task navigation failed');
			const attach = Array.from(document.querySelectorAll('.task-composer button')).find(button => button.textContent.trim() === 'Attach files');
			if (!attach) throw new Error('Attachment picker control missing'); attach.click();
			let uploaded = false;
			for (let attempt = 0; attempt < 50; attempt++) { if (document.querySelector('.attachment-drafts')?.textContent.includes('hello.txt')) { uploaded = true; break; } await new Promise(resolve => setTimeout(resolve,100)); }
			if (!uploaded) throw new Error('Fixture upload did not reach the composer');
			const pdfPreview = document.querySelector('[aria-label="Preview fixture.pdf"]');
			if (!pdfPreview) throw new Error('PDF attachment was not imported'); pdfPreview.click();
			let previewed = false;
			for (let attempt = 0; attempt < 50; attempt++) { if (document.querySelector('.attachment-preview pre')?.textContent.includes('Page 1\\nFixture PDF text')) { previewed = true; break; } await new Promise(resolve => setTimeout(resolve,100)); }
			if (!previewed) throw new Error('PDF text preview did not render');
			document.querySelector('[aria-label="Close attachment preview"]').click();
			return { tasks: restored.tasks.length, bridge: true, validation: true, renderer: true, pty: true, editor: true, editConflicts: true, git: true, commands: true, attachments: true, pdf: true, ...(checkNativeOpenCode ? {nativeOpenCode:true} : {}) };
			} catch (error) { throw new Error(error.stack ?? String(error)); }
		})()`);
		// Seed a protocol-shaped form solely for renderer interaction checks;
		// request validation and native replies are exercised by runtime tests.
		const fixtureDb = new DatabaseSync(path.join(data, "workspace", "workspace.sqlite"));
		const taskRow = fixtureDb.prepare("SELECT data FROM tasks LIMIT 1").get();
		const fixtureTask = JSON.parse(taskRow.data);
		const fixtureAttachments = fixtureDb.prepare("SELECT data FROM attachments").all().map(row => JSON.parse(row.data));
		fixtureTask.messages = [{ id: "export-fixture", role: "user", text: "Export conversation fixture", createdAt: new Date().toISOString(), attachments: fixtureAttachments }];
		fixtureTask.steering = [{ id: "fixture-steering", text: "Unacknowledged instruction", createdAt: new Date().toISOString(), status: "unconfirmed", error: "Fixture connection closed" }];
		fixtureTask.forms = [{ id: "fixture-request", form: { id: "fixture-form", title: "Form interaction check", fields: [
			{ key: "enabled", type: "boolean", title: "Include details", default: false },
			{ key: "count", type: "integer", title: "Item count", default: 2, minimum: 1, maximum: 5, when: [{ key: "enabled", op: "eq", value: true }] },
			{ key: "choices", type: "multiselect", title: "Sections", options: [{ value: "summary", label: "Summary" }, { value: "details", label: "Details" }] },
			{ key: "profile", type: "string", title: "Profile", hidden: true, default: "local" },
		] } }];
		fixtureDb.prepare("UPDATE tasks SET data=? WHERE id=?").run(JSON.stringify(fixtureTask), fixtureTask.id); fixtureDb.close();
		await window.webContents.executeJavaScript(`(async () => {
			await window.phaseoDesktop.workspace.command({type:'update-task',id:${JSON.stringify(fixtureTask.id)},title:'Electron bridge check'});
			await new Promise(resolve => setTimeout(resolve,100));
			const recovery=Array.from(document.querySelectorAll('.task-approval')).find(card=>card.textContent.includes('Unacknowledged instruction'));
			if (!recovery || !recovery.textContent.includes('Delivery unconfirmed') || !recovery.textContent.includes('may send it twice')) throw new Error('Steering recovery did not render');
			Array.from(recovery.querySelectorAll('button')).find(button=>button.textContent==='Discard').click();
			await new Promise(resolve => setTimeout(resolve,100)); if ((await window.phaseoDesktop.workspace.get()).tasks.find(task=>task.id===${JSON.stringify(fixtureTask.id)}).steering.length) throw new Error('Steering recovery discard failed');
			const toggle=document.querySelector('select[aria-label="Include details"]');
			if (!toggle || toggle.value!=='false' || document.querySelector('[aria-label="Item count"]')) throw new Error('Form defaults or initial visibility failed');
			Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(toggle,'true'); toggle.dispatchEvent(new Event('change',{bubbles:true}));
			await new Promise(resolve => setTimeout(resolve,100));
			const count=document.querySelector('[aria-label="Item count"]');
			if (!count || count.value!=='2') throw new Error('Conditional form default failed');
			if (document.querySelector('[aria-label="Profile"]')) throw new Error('Hidden form field was visible by default');
			Array.from(document.querySelectorAll('.task-question button')).find(button=>button.textContent==='Show advanced fields').click();
			await new Promise(resolve => setTimeout(resolve,100)); if (document.querySelector('[aria-label="Profile"]')?.value!=='local') throw new Error('Advanced form field did not retain its default');
			Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(count,'0'); count.dispatchEvent(new Event('input',{bubbles:true}));
			await new Promise(resolve => setTimeout(resolve,100));
			if (!count.validity.rangeUnderflow) throw new Error('Numeric form bounds failed');
			const choice=Array.from(document.querySelectorAll('.task-question .question-option')).find(label=>label.textContent.includes('Summary'))?.querySelector('input');
			if (!choice) throw new Error('Form selection missing'); choice.click();
			await new Promise(resolve => setTimeout(resolve,100)); if (!choice.checked) throw new Error('Form selection did not update');
		})()`);
		result.forms = true;
		result.steeringRecovery = true;
		for (const format of ["markdown", "json"]) {
			const extension = format === "markdown" ? "md" : "json";
			await window.webContents.executeJavaScript(`(() => { const picker=document.querySelector('[aria-label="Export conversation"]'); if (!picker) throw new Error('Export control missing'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(picker,${JSON.stringify(format)}); picker.dispatchEvent(new Event('change',{bubbles:true})); })()`);
			const filename = path.join(data, `Electron bridge check.${extension}`);
			for (let attempt = 0; attempt < 50 && !existsSync(filename); attempt++) await new Promise(resolve => setTimeout(resolve, 100));
			const exported = readFileSync(filename, "utf8");
			if (format === "markdown" && !exported.includes("Fixture PDF text")) throw new Error("Markdown attachment export failed");
			if (format === "json") { const snapshot = JSON.parse(exported); const pdf = snapshot.attachments.find(file => file.mimeType === "application/pdf"); if (!pdf || Buffer.from(pdf.data,"base64").toString() !== fixturePdf || snapshot.messages[0].text !== "Export conversation fixture") throw new Error("JSON original attachment export failed"); }
			await new Promise(resolve => setTimeout(resolve, 100));
		}
		result.exports = true;
		dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(data, "Electron bridge check.json")] });
		await window.webContents.executeJavaScript(`(async () => {
			document.querySelector('[aria-label="New task"]').click(); await new Promise(resolve=>setTimeout(resolve,100));
			const importer=Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Import conversation'); if (!importer) throw new Error('Import control missing'); importer.click();
			let imported; for (let attempt=0;attempt<100;attempt++) { imported=(await window.phaseoDesktop.workspace.get()).tasks.find(task=>task.id!==${JSON.stringify(fixtureTask.id)}); if (imported) break; await new Promise(resolve=>setTimeout(resolve,100)); }
			if (!imported || imported.status!=='idle' || imported.nativeSessionId || imported.queue.length || imported.messages[0].text!=='Export conversation fixture') throw new Error('Fresh task import failed');
			const pdf=imported.messages[0].attachments.find(file=>file.mimeType==='application/pdf'); if (!pdf || pdf.taskId!==imported.id) throw new Error('Imported PDF ownership failed');
			const preview=await window.phaseoDesktop.workspace.attachment(imported.id,pdf.id); if (!preview.text.includes('Fixture PDF text')) throw new Error('Imported PDF extraction failed');
			await new Promise(resolve=>setTimeout(resolve,100)); if (!document.querySelector('.task-message')?.textContent.includes('Export conversation fixture')) throw new Error('Imported conversation did not render');
		})()`);
		result.imports = true;
		// Quota rendering uses a protocol-shaped fixture; native read commands have
		// separate transport tests and isolated installed-CLI verification.
		ipcMain.removeHandler("workspace:account-status");
		ipcMain.handle("workspace:account-status", () => ({ checkedAt: new Date().toISOString(), authenticated: true, plan: "pro", identity: "fixture@example.invalid", ordinaryUsageAllowed: false, usage: [{ id: "codex", name: "Codex", primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: null }, secondary: null, spendControlReached: null }] }));
		await window.webContents.executeJavaScript(`(async () => {
			Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='Accounts').click(); await new Promise(resolve=>setTimeout(resolve,100));
			const row=Array.from(document.querySelectorAll('article')).find(article=>article.textContent.includes('Codex local login')); if (!row) throw new Error('Native account status control missing');
			Array.from(row.querySelectorAll('button')).find(button=>button.textContent==='Check status').click();
			for(let attempt=0;attempt<30 && !row.textContent.includes('75% remaining');attempt++) await new Promise(resolve=>setTimeout(resolve,100));
			if (!row.textContent.includes('75% remaining') || !row.textContent.includes('Included usage is blocked.') || !row.textContent.includes('Secondary window: unavailable')) throw new Error('Account quota fixture did not render');
			Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='Tasks').click(); await new Promise(resolve=>setTimeout(resolve,100));
		})()`);
		result.accountStatus = true;
		const updatedAccount = await window.webContents.executeJavaScript(`(async () => {
			const api=window.phaseoDesktop.workspace;
			const created=await api.command({type:'add-account',name:'Fixture API account',harness:'phaseo',kind:'api',endpoint:'https://example.invalid/v1',apiKey:'initial-fixture-key'}); const account=created.accounts.find(value=>value.name==='Fixture API account');
			Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='Accounts').click(); await new Promise(resolve=>setTimeout(resolve,100));
			let row=Array.from(document.querySelectorAll('article')).find(article=>article.textContent.includes('Fixture API account')); row.querySelectorAll('button')[0].click(); await new Promise(resolve=>setTimeout(resolve,100));
			const editor=row.querySelector('form'); const inputs=editor.querySelectorAll('input'); if (inputs[2].value!=='') throw new Error('Account editor exposed a stored key');
			for(const [input,value] of [[inputs[0],'Renamed API account'],[inputs[2],'rotated-fixture-key']]) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value); input.dispatchEvent(new Event('input',{bubbles:true})); }
			await new Promise(resolve=>setTimeout(resolve,100)); editor.requestSubmit();
			for(let attempt=0;attempt<30 && row.querySelector('form');attempt++) await new Promise(resolve=>setTimeout(resolve,100)); if(row.querySelector('form')) throw new Error('Account editing did not finish');
			let updated=(await api.get()).accounts.find(value=>value.id===account.id); if(updated.name!=='Renamed API account' || !updated.secretId || updated.secretId===account.id) throw new Error('Credential rotation metadata failed');
			Array.from(row.querySelectorAll('button')).find(button=>button.textContent==='Archive').click();
			for(let attempt=0;attempt<30 && !(await api.get()).accounts.find(value=>value.id===account.id).archived;attempt++) await new Promise(resolve=>setTimeout(resolve,100));
			Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Archived accounts').click(); await new Promise(resolve=>setTimeout(resolve,100));
			row=Array.from(document.querySelectorAll('article')).find(article=>article.textContent.includes('Renamed API account')); if(!row) throw new Error('Archived account missing'); Array.from(row.querySelectorAll('button')).find(button=>button.textContent==='Restore').click();
			for(let attempt=0;attempt<30 && (await api.get()).accounts.find(value=>value.id===account.id).archived;attempt++) await new Promise(resolve=>setTimeout(resolve,100));
			updated=(await api.get()).accounts.find(value=>value.id===account.id); if(updated.archived) throw new Error('Account restore failed');
			Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='Tasks').click(); await new Promise(resolve=>setTimeout(resolve,100)); return updated;
		})()`);
		if (readFileSync(path.join(data, "workspace", "credentials", `${updatedAccount.secretId}.credential`)).includes(Buffer.from("rotated-fixture-key"))) throw new Error("API key was stored without encryption");
		result.accountManagement = true;
		const agentFixture = path.join(data, "acp-fixture.cjs"); const agentRequests = path.join(data, "acp-requests.txt");
		writeFileSync(agentFixture, `const readline=require('node:readline'); const fs=require('node:fs'); readline.createInterface({input:process.stdin}).on('line',line=>{const request=JSON.parse(line); fs.appendFileSync(${JSON.stringify(agentRequests)},request.method+'\\n'); if(request.method==='initialize') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result:{protocolVersion:request.params.protocolVersion,agentInfo:{name:'Smoke ACP fixture',version:'1.2.3'},agentCapabilities:{loadSession:true,promptCapabilities:{image:true}},authMethods:[{id:'browser',name:'Browser sign-in'}]}})+'\\n');});`);
		await window.webContents.executeJavaScript(`(async () => {
			const api=window.phaseoDesktop.workspace;
			const created=await api.command({type:'add-agent',name:'Fixture agent',executable:${JSON.stringify(process.execPath)},arguments:[${JSON.stringify(agentFixture)}]}); const agent=created.agents.find(value=>value.name==='Fixture agent');
			Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='Agents').click(); await new Promise(resolve=>setTimeout(resolve,100));
			let row=Array.from(document.querySelectorAll('article')).find(article=>article.textContent.includes('Fixture agent')); Array.from(row.querySelectorAll('button')).find(button=>button.textContent==='Check connection').click();
			for(let attempt=0;attempt<50 && !row.textContent.includes('Smoke ACP fixture');attempt++) await new Promise(resolve=>setTimeout(resolve,100));
			if(!row.textContent.includes('1.2.3') || !row.textContent.includes('Image input') || !row.textContent.includes('Browser sign-in')) throw new Error('ACP native connection status missing');
			Array.from(row.querySelectorAll('button')).find(button=>button.textContent==='Edit').click(); await new Promise(resolve=>setTimeout(resolve,100));
			const form=document.querySelector('.account-form'); const name=form.querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(name,'Renamed agent'); name.dispatchEvent(new Event('input',{bubbles:true})); await new Promise(resolve=>setTimeout(resolve,100)); form.requestSubmit();
			for(let attempt=0;attempt<30 && (await api.get()).agents.find(value=>value.id===agent.id).name!=='Renamed agent';attempt++) await new Promise(resolve=>setTimeout(resolve,100));
			if((await api.get()).agents.find(value=>value.id===agent.id).name!=='Renamed agent') throw new Error('Agent edit failed');
			Array.from(row.querySelectorAll('button')).find(button=>button.textContent==='Archive').click();
			for(let attempt=0;attempt<30 && !(await api.get()).agents.find(value=>value.id===agent.id).archived;attempt++) await new Promise(resolve=>setTimeout(resolve,100));
			let rejected=false; try { await api.command({type:'create-task',harness:'acp',agentId:agent.id,model:'default',mode:'chat'}); } catch { rejected=true; } if(!rejected) throw new Error('Archived agent accepted a new task');
			Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Archived agents').click(); await new Promise(resolve=>setTimeout(resolve,100)); row=Array.from(document.querySelectorAll('article')).find(article=>article.textContent.includes('Renamed agent')); if(!row) throw new Error('Archived agent missing'); Array.from(row.querySelectorAll('button')).find(button=>button.textContent==='Restore').click();
			for(let attempt=0;attempt<30 && (await api.get()).agents.find(value=>value.id===agent.id).archived;attempt++) await new Promise(resolve=>setTimeout(resolve,100)); if((await api.get()).agents.find(value=>value.id===agent.id).archived) throw new Error('Agent restore failed');
			Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='Tasks').click(); await new Promise(resolve=>setTimeout(resolve,100));
		})()`);
		if (readFileSync(agentRequests, "utf8").trim() !== "initialize") throw new Error("ACP connection check created a session or attempted inference");
		result.agentManagement = true;
		await window.webContents.executeJavaScript(`(async () => {
			const api=window.phaseoDesktop.workspace; Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='MCP').click(); await new Promise(resolve=>setTimeout(resolve,100));
			const form=document.querySelector('[aria-label="MCP connection"]'); if(!form) throw new Error('MCP connection form missing'); const inputs=form.querySelectorAll('input');
			for(const [input,value] of [[inputs[0],'Fixture MCP'],[inputs[1],${JSON.stringify(process.execPath)}],[inputs[2],${JSON.stringify(JSON.stringify([agentFixture]))}]]) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value); input.dispatchEvent(new Event('input',{bubbles:true})); }
			const scope=form.querySelector('select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(scope,'fixture'); scope.dispatchEvent(new Event('change',{bubbles:true})); await new Promise(resolve=>setTimeout(resolve,100)); form.requestSubmit();
			let connection; for(let attempt=0;attempt<30;attempt++) { connection=(await api.get()).mcpConnections.find(value=>value.name==='Fixture MCP'); if(connection)break; await new Promise(resolve=>setTimeout(resolve,100)); } if(!connection || connection.projectId!=='fixture' || !connection.enabled) throw new Error('MCP settings failed to persist');
			let row=Array.from(document.querySelectorAll('article')).find(article=>article.textContent.includes('Fixture MCP')); const disable=Array.from(row.querySelectorAll('button')).find(button=>button.textContent==='Disable'); for(let attempt=0;attempt<30 && disable.disabled;attempt++) await new Promise(resolve=>setTimeout(resolve,100)); disable.click();
			for(let attempt=0;attempt<30 && (await api.get()).mcpConnections.find(value=>value.id===connection.id).enabled;attempt++) await new Promise(resolve=>setTimeout(resolve,100)); if((await api.get()).mcpConnections.find(value=>value.id===connection.id).enabled) throw new Error('MCP disable failed');
			const edit=Array.from(row.querySelectorAll('button')).find(button=>button.textContent==='Edit'); for(let attempt=0;attempt<30 && edit.disabled;attempt++) await new Promise(resolve=>setTimeout(resolve,100)); edit.click(); await new Promise(resolve=>setTimeout(resolve,100)); const name=form.querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(name,'Renamed MCP'); name.dispatchEvent(new Event('input',{bubbles:true})); await new Promise(resolve=>setTimeout(resolve,100)); form.requestSubmit();
			for(let attempt=0;attempt<30 && (await api.get()).mcpConnections.find(value=>value.id===connection.id).name!=='Renamed MCP';attempt++) await new Promise(resolve=>setTimeout(resolve,100)); if((await api.get()).mcpConnections.find(value=>value.id===connection.id).name!=='Renamed MCP') throw new Error('MCP editing failed');
			const archive=Array.from(row.querySelectorAll('button')).find(button=>button.textContent==='Archive'); for(let attempt=0;attempt<30 && archive.disabled;attempt++) await new Promise(resolve=>setTimeout(resolve,100)); archive.click(); for(let attempt=0;attempt<30 && !(await api.get()).mcpConnections.find(value=>value.id===connection.id).archived;attempt++) await new Promise(resolve=>setTimeout(resolve,100));
			Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Archived connections').click(); await new Promise(resolve=>setTimeout(resolve,100)); row=Array.from(document.querySelectorAll('article')).find(article=>article.textContent.includes('Renamed MCP')); if(!row) throw new Error('Archived MCP missing'); Array.from(row.querySelectorAll('button')).find(button=>button.textContent==='Restore').click();
			for(let attempt=0;attempt<30 && (await api.get()).mcpConnections.find(value=>value.id===connection.id).archived;attempt++) await new Promise(resolve=>setTimeout(resolve,100)); const restored=(await api.get()).mcpConnections.find(value=>value.id===connection.id); if(restored.archived || restored.enabled) throw new Error('MCP restore enabled execution unexpectedly');
			let rejected=false; try {await api.mcp({type:'save',connection:{...restored,transport:'http',url:'http://example.invalid/mcp'}});}catch{rejected=true;} if(!rejected) throw new Error('Unsafe MCP URL accepted');
			Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='Tasks').click(); await new Promise(resolve=>setTimeout(resolve,100));
		})()`);
		result.mcpManagement = true;
		// Reasoning selectors use a catalog fixture; adapter validation and a
		// fresh installed-Codex catalog check provide separate native evidence.
		ipcMain.removeHandler("workspace:models");
		ipcMain.handle("workspace:models", () => [{ id: "fixture-model", name: "Fixture model", default: true, defaultReasoningEffort: "low", reasoningEfforts: [{ id: "low", description: "Fixture low" }, { id: "high", description: "Fixture high" }] }]);
		await window.webContents.executeJavaScript(`(async () => {
			const task=(await window.phaseoDesktop.workspace.get()).tasks.find(value=>value.id!==${JSON.stringify(fixtureTask.id)});
			Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Task settings').click(); await new Promise(resolve=>setTimeout(resolve,100));
			const form=document.querySelector('[aria-label="Task settings"]'); if(!form) throw new Error('Task settings missing');
			const model=form.querySelector('[aria-label="Task model"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(model,'fixture-model'); model.dispatchEvent(new Event('input',{bubbles:true}));
			const mode=form.querySelector('[aria-label="Task mode"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(mode,'plan'); mode.dispatchEvent(new Event('change',{bubbles:true})); await new Promise(resolve=>setTimeout(resolve,100));
			const effort=form.querySelector('[aria-label="Reasoning effort"]'); if(!Array.from(effort.options).some(value=>value.value==='high')) throw new Error('Native reasoning choices missing'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(effort,'high'); effort.dispatchEvent(new Event('change',{bubbles:true})); await new Promise(resolve=>setTimeout(resolve,100)); form.requestSubmit();
			for(let attempt=0;attempt<30 && document.querySelector('[aria-label="Task settings"]');attempt++) await new Promise(resolve=>setTimeout(resolve,100));
			const updated=(await window.phaseoDesktop.workspace.get()).tasks.find(value=>value.id===task.id); if(updated.model!=='fixture-model' || updated.mode!=='plan' || updated.reasoningEffort!=='high' || updated.messages[0].text!=='Export conversation fixture' || updated.status!=='idle') throw new Error('Conversation settings changed history or started execution');
		})()`);
		result.taskSettings = true;
		const modelAgentFixture = path.join(data, "acp-model-fixture.cjs");
		writeFileSync(modelAgentFixture, `const readline=require('node:readline'); const config={id:'model',name:'Model',category:'model',type:'select',currentValue:'small',options:[{value:'small',name:'Small fixture model'}]}; readline.createInterface({input:process.stdin}).on('line',line=>{const request=JSON.parse(line); if(request.id===undefined)return; const result=request.method==='initialize'?{protocolVersion:request.params.protocolVersion,agentCapabilities:{}}:request.method==='session/new'?{sessionId:'model-fixture',configOptions:[config],modes:{currentModeId:'analysis',availableModes:[{id:'analysis',name:'Analysis fixture'}]}}:request.method==='session/set_config_option'?{configOptions:[config]}:request.method==='session/prompt'?{stopReason:'end_turn'}:{}; process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\\n');});`);
		await window.webContents.executeJavaScript(`(async () => {
			const api=window.phaseoDesktop.workspace; let state=await api.command({type:'add-agent',name:'Model fixture',executable:${JSON.stringify(process.execPath)},arguments:[${JSON.stringify(modelAgentFixture)}]}); const agent=state.agents.find(value=>value.name==='Model fixture');
			state=await api.command({type:'create-task',harness:'acp',agentId:agent.id,model:'default',mode:'chat'}); const task=state.tasks.find(value=>value.agentId===agent.id); await api.command({type:'send',id:task.id,text:'Native model fixture'});
			for(let attempt=0;attempt<50 && (await api.get()).tasks.find(value=>value.id===task.id).status!=='completed';attempt++) await new Promise(resolve=>setTimeout(resolve,100));
			const discovered=(await api.get()).tasks.find(value=>value.id===task.id); if(discovered.nativeModels?.[0]?.id!=='small') throw new Error('Native ACP model catalog missing');
			const row=Array.from(document.querySelectorAll('.task-row')).find(value=>value.textContent.includes('Native model fixture')); if(!row) throw new Error('ACP task missing'); row.click(); await new Promise(resolve=>setTimeout(resolve,100)); Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Task settings').click(); await new Promise(resolve=>setTimeout(resolve,100));
			const form=document.querySelector('[aria-label="Task settings"]'); if(!form.querySelector('option[value="small"]')) throw new Error('Native ACP models missing from settings');
			const model=form.querySelector('[aria-label="Task model"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(model,'small'); model.dispatchEvent(new Event('input',{bubbles:true})); const mode=form.querySelector('[aria-label="Agent mode"]'); if(!mode.querySelector('option[value="analysis"]')) throw new Error('Native ACP modes missing'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(mode,'analysis'); mode.dispatchEvent(new Event('change',{bubbles:true})); await new Promise(resolve=>setTimeout(resolve,100)); form.requestSubmit();
			for(let attempt=0;attempt<30 && (await api.get()).tasks.find(value=>value.id===task.id).model!=='small';attempt++) await new Promise(resolve=>setTimeout(resolve,100)); if((await api.get()).tasks.find(value=>value.id===task.id).model!=='small') throw new Error('Native ACP model selection did not persist');
			if((await api.get()).tasks.find(value=>value.id===task.id).nativeMode!=='analysis') throw new Error('Native ACP mode selection did not persist');
		})()`);
		result.acpModels = true;
		const authAgentFixture = path.join(data, "acp-auth-fixture.cjs"); const authMarker = path.join(data, "owned-auth-completed"); const authRequests = path.join(data, "auth-requests.txt");
		const authNode = execFileSync(process.platform === "win32" ? "where.exe" : "which", ["node"], { windowsHide: true }).toString().split(/\r?\n/).find(value => value && (process.platform !== "win32" || /\.exe$/i.test(value)));
		if (!authNode) throw new Error("The terminal auth fixture needs the installed Node executable");
		writeFileSync(authAgentFixture, `const fs=require('node:fs'); const readline=require('node:readline'); if(process.argv.includes('--login')){process.stdout.write('Owned native sign-in. Type confirm.\\n'); readline.createInterface({input:process.stdin}).on('line',line=>{if(line.trim()==='confirm'){fs.writeFileSync(${JSON.stringify(authMarker)},'complete');process.exit(0);}});}else{readline.createInterface({input:process.stdin}).on('line',line=>{const request=JSON.parse(line);fs.appendFileSync(${JSON.stringify(authRequests)},request.method+'\\n');if(request.id===undefined)return;let result=request.method==='initialize'?{protocolVersion:request.params.protocolVersion,agentCapabilities:{},authMethods:[{id:'fixture-terminal',name:'Fixture interactive login',type:'terminal',args:['--login'],env:{OWNED_AUTH_FIXTURE:'1'}}]}:request.method==='session/new'?{sessionId:'auth-fixture'}:request.method==='session/prompt'?{stopReason:'end_turn'}:{};const response=request.method==='session/new'&&!fs.existsSync(${JSON.stringify(authMarker)})?{jsonrpc:'2.0',id:request.id,error:{code:-32000,message:'Authentication required'}}:{jsonrpc:'2.0',id:request.id,result};process.stdout.write(JSON.stringify(response)+'\\n');});}`);
		await window.webContents.executeJavaScript(`(async () => {
			const api=window.phaseoDesktop.workspace; let state=await api.command({type:'add-agent',name:'Auth fixture',executable:${JSON.stringify(authNode)},arguments:[${JSON.stringify(authAgentFixture)}]}); const agent=state.agents.find(value=>value.name==='Auth fixture'); state=await api.command({type:'create-task',harness:'acp',agentId:agent.id,model:'default',mode:'chat'}); const task=state.tasks.find(value=>value.agentId===agent.id); await api.command({type:'send',id:task.id,text:'Owned sign-in fixture task'});
			let current; for(let attempt=0;attempt<50;attempt++){current=(await api.get()).tasks.find(value=>value.id===task.id);if(current.questions?.length)break;await new Promise(resolve=>setTimeout(resolve,100));} if(!current.questions?.length) throw new Error('Native auth choice missing'); await api.command({type:'answer',id:task.id,requestId:current.questions[0].id,answers:{'auth-method':['Fixture interactive login (fixture-terminal)']}});
			for(let attempt=0;attempt<50;attempt++){current=(await api.get()).tasks.find(value=>value.id===task.id);if(current.authTerminalId)break;await new Promise(resolve=>setTimeout(resolve,100));}if(!current.authTerminalId)throw new Error('Native auth terminal missing'); const terminalId=current.authTerminalId;
			const row=Array.from(document.querySelectorAll('.task-row')).find(value=>value.textContent.includes('Owned sign-in fixture task')); if(!row)throw new Error('Auth task missing'); row.click(); for(let attempt=0;attempt<50&&!document.querySelector('.task-auth-terminal .xterm');attempt++)await new Promise(resolve=>setTimeout(resolve,100));if(!document.querySelector('.task-auth-terminal .xterm'))throw new Error('Native sign-in terminal did not render');
			await api.terminal({type:'write',id:terminalId,data:'confirm\\r'}); for(let attempt=0;attempt<50;attempt++){current=(await api.get()).tasks.find(value=>value.id===task.id);if(current.status==='completed')break;await new Promise(resolve=>setTimeout(resolve,100));}if(current.status!=='completed'||current.authTerminalId)throw new Error('Native sign-in did not continue the task'); if((await api.terminals()).some(value=>value.id===terminalId))throw new Error('Native sign-in transcript retained');
		})()`);
		if (!existsSync(authMarker) || readFileSync(authRequests, "utf8").includes("authenticate")) throw new Error("Terminal authentication used an incorrect native method");
		const authDb = new DatabaseSync(path.join(data, "workspace", "workspace.sqlite"), { readOnly: true });
		try { if (authDb.prepare("SELECT COUNT(*) AS count FROM terminals WHERE data LIKE '%Owned native sign-in%'").get().count) throw new Error("Native authentication output was persisted"); } finally { authDb.close(); }
		result.acpTerminalAuth = true;
		const cancelledMarker = path.join(data, "cancelled-auth-completed");
		const cancelledAuthFixture = path.join(data, "cancelled-auth-fixture.cjs");
		writeFileSync(cancelledAuthFixture, readFileSync(authAgentFixture, "utf8").replaceAll(JSON.stringify(authMarker), JSON.stringify(cancelledMarker)));
		await window.webContents.executeJavaScript(`(async () => {
			const api=window.phaseoDesktop.workspace;let state=await api.command({type:'add-agent',name:'Cancelled auth fixture',executable:${JSON.stringify(authNode)},arguments:[${JSON.stringify(cancelledAuthFixture)}]});const agent=state.agents.find(value=>value.name==='Cancelled auth fixture');state=await api.command({type:'create-task',harness:'acp',agentId:agent.id,model:'default',mode:'chat'});const task=state.tasks.find(value=>value.agentId===agent.id);await api.command({type:'send',id:task.id,text:'Cancelled sign-in original instruction'});
			let current;for(let attempt=0;attempt<50;attempt++){current=(await api.get()).tasks.find(value=>value.id===task.id);if(current.questions?.length)break;await new Promise(resolve=>setTimeout(resolve,100));}if(!current.questions?.length)throw new Error('Cancelled auth choice missing');await api.command({type:'answer',id:task.id,requestId:current.questions[0].id,answers:{'auth-method':['Fixture interactive login (fixture-terminal)']}});
			for(let attempt=0;attempt<50;attempt++){current=(await api.get()).tasks.find(value=>value.id===task.id);if(current.authTerminalId)break;await new Promise(resolve=>setTimeout(resolve,100));}if(!current.authTerminalId)throw new Error('Cancelled auth terminal missing');const terminalId=current.authTerminalId;await api.command({type:'cancel',id:task.id});for(let attempt=0;attempt<30;attempt++){current=(await api.get()).tasks.find(value=>value.id===task.id);if(!current.authTerminalId&&current.queue.length)break;await new Promise(resolve=>setTimeout(resolve,100));}if(current.status!=='interrupted'||current.authTerminalId||current.queue[0]?.text!=='Cancelled sign-in original instruction')throw new Error('Cancelled auth lost original input');if((await api.terminals()).some(value=>value.id===terminalId))throw new Error('Cancelled sign-in terminal remained active');
		})()`);
		if (existsSync(cancelledMarker)) throw new Error("Cancelled terminal authentication unexpectedly completed");
		const managedProject = await window.webContents.executeJavaScript(`(async () => {
			const api=window.phaseoDesktop.workspace; Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='Projects').click(); await new Promise(resolve=>setTimeout(resolve,100)); const select=document.querySelector('[aria-label="Project"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'fixture');select.dispatchEvent(new Event('change',{bubbles:true})); await new Promise(resolve=>setTimeout(resolve,100)); Array.from(document.querySelectorAll('.project-toolbar button')).find(button=>button.textContent==='Git review').click();
			for(let attempt=0;attempt<50&&!document.querySelector('[aria-label="Create worktree"]');attempt++)await new Promise(resolve=>setTimeout(resolve,100));const form=document.querySelector('[aria-label="Create worktree"]');if(!form)throw new Error('Worktree controls missing');const branch=form.querySelector('[aria-label="Worktree branch"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(branch,'feature/smoke-worktree');branch.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,100));form.requestSubmit();
			let project;for(let attempt=0;attempt<50;attempt++){project=(await api.get()).projects.find(value=>value.worktree?.branch==='feature/smoke-worktree');if(project)break;await new Promise(resolve=>setTimeout(resolve,100));}if(!project||project.worktree.sourceProjectId!=='fixture')throw new Error('Managed worktree project did not persist');if((await api.readFile(project.id,'hello.txt')).trim()!=='UI edit')throw new Error('Managed worktree did not start from committed files');if((await api.gitReview(project.id)).branch!=='feature/smoke-worktree')throw new Error('Managed worktree branch incorrect');return project;
		})()`);
		if (path.relative(path.join(data, "workspace", "worktrees"), managedProject.directory).split(path.sep).length !== 1) throw new Error("Managed worktree escaped its owned directory");
		result.worktrees = true;
		await window.webContents.executeJavaScript(`(async () => {
			const api=window.phaseoDesktop.workspace;const id=${JSON.stringify(managedProject.id)};const before=await api.readDocument(id,'hello.txt');await api.writeDocument(id,'hello.txt',before.text+'owned dirty fixture',before.hash);let rejected=false;try{await api.removeWorktree(id);}catch{rejected=true;}if(!rejected)throw new Error('Dirty worktree removal was allowed');const dirty=await api.readDocument(id,'hello.txt');await api.writeDocument(id,'hello.txt',before.text,dirty.hash);
			const state=await api.command({type:'create-task',projectId:id,harness:'codex',model:'default',mode:'chat',title:'Retained checkout history'});const task=state.tasks.find(value=>value.projectId===id);if(!task)throw new Error('Worktree task missing');for(let attempt=0;attempt<30&&!Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Remove worktree');attempt++)await new Promise(resolve=>setTimeout(resolve,100));Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Remove worktree').click();await new Promise(resolve=>setTimeout(resolve,100));document.querySelector('[aria-label="Remove worktree"] button').click();let removed;for(let attempt=0;attempt<50;attempt++){removed=await api.get();if(removed.projects.find(value=>value.id===id)?.worktree?.removedAt)break;await new Promise(resolve=>setTimeout(resolve,100));}if(!removed.projects.find(value=>value.id===id)?.worktree?.removedAt||!removed.tasks.some(value=>value.id===task.id))throw new Error('Worktree removal did not retain its history');
		})()`);
		if (existsSync(managedProject.directory)) throw new Error("Removed managed checkout still exists");
		result.worktreeRemoval = true;
		await window.webContents.executeJavaScript(`(async () => {
			const api=window.phaseoDesktop.workspace;Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='Inbox').click();for(let attempt=0;attempt<30&&!document.querySelector('[aria-label="Inbox filter"]');attempt++)await new Promise(resolve=>setTimeout(resolve,100));const filter=document.querySelector('[aria-label="Inbox filter"]');if(!filter)throw new Error('Inbox did not open');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(filter,'unread');filter.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,100));const article=Array.from(document.querySelectorAll('.attention-item')).find(value=>value.querySelector('h3')?.textContent==='Owned sign-in fixture task');if(!article||!article.textContent.includes('Task completed')||!article.textContent.includes('Unread'))throw new Error('Completed task missing from unread inbox');article.querySelector('button').click();let task;for(let attempt=0;attempt<30;attempt++){task=(await api.get()).tasks.find(value=>value.title==='Owned sign-in fixture task');if(task.inboxReadAt===task.updatedAt&&document.querySelector('.task-detail'))break;await new Promise(resolve=>setTimeout(resolve,100));}if(task.inboxReadAt!==task.updatedAt||task.status!=='completed'||task.queue.length)throw new Error('Inbox review changed execution or failed to persist read state');
		})()`);
		result.inbox = true;
		await window.webContents.executeJavaScript(`(async () => {
			const api=window.phaseoDesktop.workspace;let invalid=false;try{await api.savePreferences({notifications:['all'],notificationTitles:false});}catch{invalid=true;}if(!invalid)throw new Error('Invalid notification settings accepted');Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='Settings').click();for(let attempt=0;attempt<30&&!document.querySelector('[aria-label="Desktop alerts"]');attempt++)await new Promise(resolve=>setTimeout(resolve,100));const select=document.querySelector('[aria-label="Desktop alerts"]');if(!select)throw new Error('Settings did not open');for(let attempt=0;attempt<30&&select.disabled;attempt++)await new Promise(resolve=>setTimeout(resolve,100));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'attention');select.dispatchEvent(new Event('change',{bubbles:true}));for(let attempt=0;attempt<30&&(await api.preferences()).preferences.notifications!=='attention';attempt++)await new Promise(resolve=>setTimeout(resolve,100));if((await api.preferences()).preferences.notifications!=='attention')throw new Error('Notification settings did not persist');await api.savePreferences({notifications:'off',notificationTitles:false});
		})()`);
		result.notificationSettings = true;
		const notificationTask = await window.webContents.executeJavaScript("window.phaseoDesktop.workspace.get().then(state=>state.tasks.find(value=>value.title==='Owned sign-in fixture task').id)");
		window.webContents.send("workspace:open-task", notificationTask);
		await window.webContents.executeJavaScript(`(async()=>{for(let attempt=0;attempt<30;attempt++){if(document.querySelector('[aria-label="Task title"]')?.value==='Owned sign-in fixture task')return;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Notification task navigation failed');})()`);
		result.notificationNavigation = true;
		const secondInstance = path.join(data, "second-instance.mjs");
		const entry = packagedEntry ? path.resolve(packagedEntry) : fileURLToPath(new URL("../dist/main/index.mjs", import.meta.url));
		writeFileSync(secondInstance, `import { app } from 'electron'; app.setPath('userData', ${JSON.stringify(data)}); await import(${JSON.stringify(pathToFileURL(entry).href)}); setTimeout(() => app.exit(1), 3000);`);
		await promisify(execFile)(process.execPath, [secondInstance], { windowsHide: true, timeout: 10000 });
		if (BrowserWindow.getAllWindows().length !== 1) throw new Error("Second instance changed the primary desktop window");
		result.singleInstance = true;
		const output = fileURLToPath(new URL("../../../output/playwright", import.meta.url));
		mkdirSync(output, { recursive: true });
		writeFileSync(path.join(output, "electron-workspace.png"), (await window.webContents.capturePage()).toPNG());
		console.log("DESKTOP_SMOKE", JSON.stringify(result), "ISOLATED_DATA", data);
	} catch (error) { console.error(error); app.exit(1); return; }
	app.quit();
});
setTimeout(() => { console.error("Desktop smoke timed out"); app.exit(1); }, 45000).unref();
