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
