import { app, BrowserWindow, ipcMain, shell } from "electron";
import { realpathSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const data = realpathSync(mkdtempSync(path.join(tmpdir(), "phaseo-editor-smoke-")));
app.setPath("userData", data);
const project = path.join(data, "project"); mkdirSync(project);
const filename = "notes & 世界.txt"; writeFileSync(path.join(project, filename), "Owned document");
mkdirSync(path.join(data, "workspace"));
const seed = new DatabaseSync(path.join(data, "workspace/workspace.sqlite"));
seed.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
for (const [id, worktree] of [["fixture", undefined], ["removed", { sourceProjectId: "fixture", branch: "owned", baseCommit: "owned", removedAt: new Date().toISOString() }]]) seed.prepare("INSERT INTO projects VALUES (?, ?)").run(id, JSON.stringify({ id, name: id, directory: project, createdAt: new Date().toISOString(), worktree }));
seed.close();
const packagedEntry = process.argv.find(argument => argument.startsWith("--app-entry="))?.slice("--app-entry=".length);
await import(packagedEntry ? pathToFileURL(path.resolve(packagedEntry)).href : "../dist/main/index.mjs");
app.whenReady().then(async () => {
	try {
		const window = BrowserWindow.getAllWindows()[0];
		if (!window) throw new Error("Desktop window missing.");
		if (window.webContents.isLoading()) await new Promise(resolve => window.webContents.once("did-finish-load", resolve));
		const reveals = [], folders = [];
		shell.showItemInFolder = target => { if (target !== path.join(project, filename)) throw new Error("Unexpected reveal target."); reveals.push(target); };
		shell.openPath = async target => { if (target !== project) throw new Error("Unexpected folder target."); folders.push(target); return ""; };
		const result = await window.webContents.executeJavaScript(`(async()=>{
			const api=window.phaseoDesktop.workspace;
			const editors=await api.editors();
			if(editors.length!==20||editors.some(editor=>typeof editor.id!=='string'||typeof editor.available!=='boolean'||'executable' in editor))throw new Error('Invalid editor metadata');
			await api.openProject('fixture',{editor:'file-manager',filename:${JSON.stringify(filename)}});
			await api.openProject('fixture',{editor:'file-manager'});
			await api.openProject('fixture',{editor:'file-manager',filename:${JSON.stringify(path.join(project, filename))}});
			for(const [id,request] of [['fixture',{editor:'file-manager',filename:'../private.txt'}],['missing',{editor:'file-manager'}],['removed',{editor:'file-manager'}],['fixture',{editor:'powershell.exe'}],['fixture',{editor:'vscode',filename:${JSON.stringify(filename)},line:0}],['fixture',{editor:'file-manager',filename:${JSON.stringify(filename)},line:1}]]){
				let rejected=false;try{await api.openProject(id,request);}catch{rejected=true;}if(!rejected)throw new Error('Invalid editor request accepted');
			}
			return {editorCount:editors.length};
		})()`);
		if (reveals.length !== 2 || folders.length !== 1) throw new Error("Invalid request reached the operating-system port.");
		for (const name of ["workspace:editors", "workspace:open-project"]) {
			let rejected = false;
			try { await ipcMain._invokeHandlers.get(name)({ sender: { id: -1 } }, "fixture", { editor: "file-manager" }); } catch { rejected = true; }
			if (!rejected) throw new Error("Untrusted editor sender accepted.");
		}
		console.log("EDITOR_SMOKE", JSON.stringify({ ...result, reveal: true, folder: true, invalidRequests: true, trustedSender: true, packaged: Boolean(packagedEntry) }));
		app.exit(0);
	} catch (error) { console.error(error); app.exit(1); }
});
