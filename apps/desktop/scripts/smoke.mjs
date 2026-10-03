import { app, BrowserWindow, dialog } from "electron";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";

const data = mkdtempSync(path.join(tmpdir(), "phaseo-electron-smoke-"));
app.setPath("userData", data);
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
		const window = BrowserWindow.getAllWindows()[0];
		if (!window) throw new Error("Desktop window missing");
		if (window.webContents.isLoading()) await new Promise(resolve => window.webContents.once("did-finish-load", resolve));
		const result = await window.webContents.executeJavaScript(`(async () => {
			try {
			const api = window.phaseoDesktop.workspace;
			const initial = await api.get();
			if (initial.tasks.length) throw new Error('Isolated workspace is not empty');
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
			return { tasks: restored.tasks.length, bridge: true, validation: true, renderer: true, pty: true, editor: true, editConflicts: true, git: true, commands: true, attachments: true, pdf: true };
			} catch (error) { throw new Error(error.stack ?? String(error)); }
		})()`);
		const output = fileURLToPath(new URL("../../../output/playwright", import.meta.url));
		mkdirSync(output, { recursive: true });
		writeFileSync(path.join(output, "electron-workspace.png"), (await window.webContents.capturePage()).toPNG());
		console.log("DESKTOP_SMOKE", JSON.stringify(result), "ISOLATED_DATA", data);
	} catch (error) { console.error(error); app.exit(1); return; }
	app.quit();
});
setTimeout(() => { console.error("Desktop smoke timed out"); app.exit(1); }, 45000).unref();
