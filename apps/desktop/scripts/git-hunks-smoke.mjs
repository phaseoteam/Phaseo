import { app, BrowserWindow } from "electron";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const data = mkdtempSync(path.join(tmpdir(), "phaseo-hunk-smoke-"));
app.setPath("userData", data);
const repository = path.join(data, "repository"); mkdirSync(repository); mkdirSync(path.join(data, "workspace"));
const git = args => execFileSync("git", args, { cwd: repository, windowsHide: true }).toString();
git(["init", "-b", "fixture"]); git(["config", "user.name", "Fixture"]); git(["config", "user.email", "fixture@example.invalid"]); git(["config", "commit.gpgsign", "false"]);
const filename = "[literal] 世界.txt", target = path.join(repository, filename);
const original = Array.from({ length: 30 }, (_, index) => `Line ${index}`).join("\n") + "\n";
writeFileSync(target, original); git(["add", "--", filename]); git(["commit", "-m", "fixture"]);
const edited = original.replace("Line 2\n", "First edit\n").replace("Line 25\n", "Second edit\n"); writeFileSync(target, edited);
const db = new DatabaseSync(path.join(data, "workspace/workspace.sqlite")); db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
db.prepare("INSERT INTO projects VALUES (?, ?)").run("fixture", JSON.stringify({ id: "fixture", name: "Fixture", directory: repository, createdAt: new Date().toISOString() })); db.close();
const entry = process.argv.find(value => value.startsWith("--app-entry="))?.slice("--app-entry=".length);
await import(entry ? pathToFileURL(path.resolve(entry)).href : "../dist/main/index.mjs");
app.whenReady().then(async () => {
	try {
		const window = BrowserWindow.getAllWindows()[0];
		if (window.webContents.isLoading()) await new Promise(resolve => window.webContents.once("did-finish-load", resolve));
		const run = expression => window.webContents.executeJavaScript(expression);
		async function wait(expression) { for (let attempt = 0; attempt < 100; attempt++) { if (await run(expression)) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error("Hunk UI did not settle: " + expression); }
		const result = await window.webContents.executeJavaScript(`(async()=>{const api=window.phaseoDesktop.workspace,filename=${JSON.stringify(filename)};const review=await api.gitHunks('fixture',filename,false);if(review.hunks.length!==2)throw Error('Missing hunks');await api.gitCommand('fixture',{type:'stage-hunk',filename,index:1,hash:review.hash});const staged=(await api.gitReview('fixture')).stagedDiff;let stale=false;try{await api.gitCommand('fixture',{type:'stage-hunk',filename,index:0,hash:review.hash})}catch(error){stale=String(error).includes('diff changed')}const confirmed=await api.gitHunks('fixture',filename,true);await api.gitCommand('fixture',{type:'unstage-hunk',filename,index:0,hash:confirmed.hash});let outside=false;try{await api.gitHunks('fixture','../outside',false)}catch{outside=true}return {partial:staged.includes('Second edit')&&!staged.includes('First edit'),stale,outside,unstaged:!(await api.gitReview('fixture')).stagedDiff}})()`);
		if (Object.values(result).some(value => !value) || readFileSync(target, "utf8") !== edited) throw new Error("Hunk workflow failed: " + JSON.stringify(result));
		await run(`Array.from(document.querySelectorAll('.sidebar-item')).find(button=>button.textContent.trim()==='Projects').click()`);
		await wait(`Boolean(document.querySelector('select[aria-label="Project"] option[value="fixture"]'))`);
		await run(`(()=>{const select=document.querySelector('select[aria-label="Project"]');select.value='fixture';select.dispatchEvent(new Event('change',{bubbles:true}));Array.from(document.querySelectorAll('.project-toolbar button')).find(button=>button.textContent==='Git review').click()})()`);
		await wait(`Boolean(document.querySelector('.git-file-list button[aria-pressed]'))`);
		await run(`Array.from(document.querySelectorAll('.git-file-list button')).find(button=>button.textContent==='Review changes').click()`);
		await wait(`document.querySelectorAll('.git-hunk-panel .git-hunk').length===2&&!document.querySelector('.git-hunk-panel').getAttribute('aria-busy').includes('true')`);
		const captures = path.resolve('output/playwright/git-hunks', entry ? 'packaged' : 'source'); mkdirSync(captures, { recursive: true });
		for (const [width, height] of [[1440, 920], [1040, 680]]) {
			window.setSize(width, height);
			for (const theme of ['light', 'dark']) {
				await run(`(()=>{const theme=${JSON.stringify(theme)};if(document.documentElement.dataset.theme!==theme)document.querySelector('[aria-label="Use '+theme+' theme"]').click();document.querySelector('.git-hunk-panel').scrollIntoView({block:'start'})})()`);
				await new Promise(resolve => setTimeout(resolve, 150));
				const layout = await run(`(()=>{const panel=document.querySelector('.git-hunk-panel'),style=getComputedStyle(panel);return {padding:style.paddingLeft,font:getComputedStyle(panel.querySelector('h2')).fontFamily,overflow:document.documentElement.scrollWidth>innerWidth}})()`);
				if (layout.padding !== '16px' || !layout.font.includes('Montserrat') || layout.overflow) throw Error('Hunk layout failed: '+JSON.stringify(layout));
				writeFileSync(path.join(captures, width+'-'+theme+'.png'), (await window.webContents.capturePage()).toPNG());
			}
		}
		await run(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='All changes').click()`);
		await wait(`!document.querySelector('.git-hunk-panel')`);
		await run(`Array.from(document.querySelectorAll('.git-file-list button')).find(button=>button.textContent==='Review changes').click()`);
		await wait(`document.querySelectorAll('.git-hunk-panel .git-hunk').length===2&&!document.querySelector('.git-hunk-panel').getAttribute('aria-busy').includes('true')`);
		await run(`(()=>{const button=document.querySelectorAll('.git-hunk-panel .git-hunk > .project-toolbar button')[1];button.click();button.click()})()`);
		await wait(`document.querySelectorAll('.git-hunk-panel .git-hunk').length===2&&Boolean(Array.from(document.querySelectorAll('.git-hunk-panel button')).find(button=>button.textContent==='Unstage change'))&&!document.querySelector('.git-hunk-panel').getAttribute('aria-busy').includes('true')`);
		if (!git(["diff", "--cached"]).includes("Second edit") || git(["diff", "--cached"]).includes("First edit")) throw new Error("UI staged the wrong hunk.");
		await run(`Array.from(document.querySelectorAll('.git-hunk-panel button')).find(button=>button.textContent==='Unstage change').click()`);
		await wait(`!Array.from(document.querySelectorAll('.git-hunk-panel button')).some(button=>button.textContent==='Unstage change')&&!document.querySelector('.git-hunk-panel').getAttribute('aria-busy').includes('true')`);
		if (git(["diff", "--cached"]) || readFileSync(target, "utf8") !== edited) throw new Error("UI unstage changed the working file.");
		console.log("GIT_HUNKS_SMOKE", JSON.stringify({ ...result, workingFilePreserved: true, renderer: true }), "ISOLATED_DATA", data); app.exit(0);
	} catch (error) { console.error(error); app.exit(1); }
}).catch(error => { console.error(error); app.exit(1); });
