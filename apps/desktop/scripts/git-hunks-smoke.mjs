import { installChatNavigation } from "./chat-navigation.mjs";
import { app, BrowserWindow, ipcMain } from "electron";
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
const original = Array.from({ length: 30 }, (_, index) => `Line ${index}${index === 3 ? ' <img src=x onerror=alert(1)> ' + 'Long context '.repeat(18) : ''}`).join("\n") + "\n";
writeFileSync(target, original); git(["add", "--", filename]); git(["commit", "-m", "fixture"]);
let edited = original.replace("Line 2\n", "First edit\n").replace("Line 25\n", "Second edit\n"); writeFileSync(target, edited);
const db = new DatabaseSync(path.join(data, "workspace/workspace.sqlite")); db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
db.prepare("INSERT INTO projects VALUES (?, ?)").run("fixture", JSON.stringify({ id: "fixture", name: "Fixture", directory: repository, createdAt: new Date().toISOString() })); db.close();
const entry = process.argv.find(value => value.startsWith("--app-entry="))?.slice("--app-entry=".length);
const originalHandle = ipcMain.handle; let contextRequests = 0, delayContext = false;
ipcMain.handle = function (channel, listener) { return originalHandle.call(this, channel, channel === 'workspace:git-diff-file' ? async (event, ...args) => { contextRequests++; if (delayContext) { delayContext = false; await new Promise(resolve => setTimeout(resolve, 250)); } return listener(event, ...args); } : listener); };
await import(entry ? pathToFileURL(path.resolve(entry)).href : "../dist/main/index.mjs");
ipcMain.handle = originalHandle;
app.whenReady().then(async () => {
	try {
		const window = BrowserWindow.getAllWindows()[0];
		window.webContents.setBackgroundThrottling(false);
		if (window.webContents.isLoading()) await new Promise(resolve => window.webContents.once("did-finish-load", resolve));
		await installChatNavigation(window);
		const run = expression => window.webContents.executeJavaScript(expression).catch(error => { console.error('FAILED_SCRIPT', expression.slice(0, 400)); throw error; });
		async function wait(expression) { for (let attempt = 0; attempt < 100; attempt++) { if (await run(expression)) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error("Hunk UI did not settle: " + expression); }
		const captures = path.resolve('output/playwright/git-hunks', entry ? 'packaged' : 'source'); mkdirSync(captures, { recursive: true });
		const result = await window.webContents.executeJavaScript(`(async()=>{const api=window.phaseoDesktop.workspace,filename=${JSON.stringify(filename)};const review=await api.gitHunks('fixture',filename,false);if(review.hunks.length!==2)throw Error('Missing hunks');await api.gitCommand('fixture',{type:'stage-hunk',filename,index:1,hash:review.hash});const staged=(await api.gitReview('fixture')).stagedDiff;let stale=false;try{await api.gitCommand('fixture',{type:'stage-hunk',filename,index:0,hash:review.hash})}catch(error){stale=String(error).includes('diff changed')}const confirmed=await api.gitHunks('fixture',filename,true);await api.gitCommand('fixture',{type:'unstage-hunk',filename,index:0,hash:confirmed.hash});let outside=false;try{await api.gitHunks('fixture','../outside',false)}catch{outside=true}return {partial:staged.includes('Second edit')&&!staged.includes('First edit'),stale,outside,unstaged:!(await api.gitReview('fixture')).stagedDiff}})()`);
		if (Object.values(result).some(value => !value) || readFileSync(target, "utf8") !== edited) throw new Error("Hunk workflow failed: " + JSON.stringify(result));
		const full = await run(`(async()=>{const api=window.phaseoDesktop.workspace,review=await api.gitReview('fixture');return api.gitDiffContents('fixture',{filename:${JSON.stringify(filename)},staged:false,hash:review.diffHash})})()`);
		if (full.oldFile.contents !== original || full.newFile.contents !== edited) throw Error('Bridge returned incorrect full file versions');
		// The Diff is its own pane tab (T3).
		const surface = `document.querySelector('aside[aria-label="Tools"] .diff-surface')`;
		const viewer = `${surface}?.querySelector('diffs-container')`;
		// In Code, the new chat's project (Fixture) gives the pane its Diff tab.
		const openChanges = async () => { await run(`window.__auditNavigate('Tasks')`); await run(`Array.from(document.querySelectorAll('[role=radiogroup][aria-label=Workspace] [role=radio]')).find(button=>button.textContent==='Code').click()`); await run(`Array.from(document.querySelectorAll('aside button')).find(button=>button.textContent.startsWith('New chat')).click()`); await wait(`Boolean(Array.from(document.querySelectorAll('main button')).find(button=>/Choose a project|Fixture/.test(button.textContent)))`); if (!await run(`Array.from(document.querySelectorAll('main button')).some(button=>button.textContent.trim()==='Fixture')`)) { await run(`Array.from(document.querySelectorAll('main button')).find(button=>button.textContent.includes('Choose a project')).click()`); await wait(`Boolean(Array.from(document.querySelectorAll('[role=menuitem]')).find(item=>item.textContent.trim()==='Fixture'))`); await run(`Array.from(document.querySelectorAll('[role=menuitem]')).find(item=>item.textContent.trim()==='Fixture').click()`); } await run(`window.__auditPanel('Diff')`); await wait(`Boolean(${viewer}?.shadowRoot?.textContent.includes('First edit'))`); };
		await openChanges();
		// Uncommitted work, then side by side for the context expansion.
		await run(`${surface}.querySelector('[aria-label^="Diff scope"]').click()`);
		await wait(`Boolean(Array.from(document.querySelectorAll('[role=menuitemradio]')).find(item=>item.textContent.trim()==='Uncommitted'))`);
		await run(`Array.from(document.querySelectorAll('[role=menuitemradio]')).find(item=>item.textContent.trim()==='Uncommitted').click()`);
		await wait(`${surface}.dataset.diffScope==='uncommitted'&&Boolean(${viewer}?.shadowRoot?.textContent.includes('First edit'))`);
		await run(`${surface}.querySelector('[aria-label="Split diff view"]').click()`);
		await wait(`localStorage.getItem('phaseo.desktop.diffLayout')==='"split"'&&Boolean(${viewer}?.shadowRoot?.querySelector('pre[data-diff-type="split"]'))`);
		await wait(`Boolean(${viewer}?.shadowRoot?.querySelector('[data-expand-index="1"] [data-expand-button]'))`);
		if (await run(`Boolean(${viewer}.shadowRoot.querySelector('img,script'))`)) throw Error('Diff interpreted source markup');
		edited = edited.replace('Line 1\n', 'Refreshed context\n'); writeFileSync(target, edited);
		await run(`${viewer}.shadowRoot.querySelector('[data-expand-index="1"] [data-expand-button]').click()`);
		await wait(`document.querySelector('aside[aria-label="Tools"] [data-diff-context-error]')?.textContent.includes('diff changed')`);
		await run(`document.querySelector('aside[aria-label="Tools"] [data-diff-context-error] button').click()`);
		await wait(`!document.querySelector('aside[aria-label="Tools"] [data-diff-context-error]')&&Boolean(${viewer}?.shadowRoot?.textContent.includes('Refreshed context'))`);
		const beforeContext = contextRequests; delayContext = true;
		await run(`(()=>{const button=${viewer}.shadowRoot.querySelector('[data-expand-index="1"] [data-expand-button]');if(button.tabIndex!==0||!button.getAttribute('aria-label')?.includes('unchanged'))throw Error('Expansion control is not named or keyboard-focusable');button.focus();button.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,composed:true,cancelable:true}));button.click()})()`);
		await wait(`Array.from(document.querySelectorAll('aside[aria-label="Tools"] [role=status]')).some(node=>node.textContent.includes('Loading unchanged lines'))`);
		await wait(`${viewer}?.shadowRoot?.querySelector('code[data-additions] [data-line="11"]')?.textContent==='Line 10'&&!Array.from(document.querySelectorAll('aside[aria-label="Tools"] [role=status]')).some(node=>node.textContent.includes('Loading unchanged lines'))`);
		if (contextRequests !== beforeContext + 1) throw Error('Repeated expansion duplicated full file requests');
		// Sticky 32px file headers, the change summary and the file tree.
		const header = await run(`(()=>{const node=${viewer}.shadowRoot.querySelector('[data-diffs-header]'),style=getComputedStyle(node);return {position:style.position,height:node.getBoundingClientRect().height,stat:${surface}.querySelector('[aria-label$="removed"]')?.textContent}})()`);
		if (header.position !== 'sticky' || Math.round(header.height) !== 32 || !/^\+\d+−\d+$/.test(header.stat ?? '')) throw Error('Diff header layout failed: '+JSON.stringify(header));
		await run(`${surface}.querySelector('[aria-label="Show file tree"]').click()`);
		await wait(`Boolean(Array.from(${surface}.querySelectorAll('[role=tree] button')).find(button=>button.title===${JSON.stringify(filename)}))`);
		await run(`${surface}.querySelector('[aria-label="Collapse all files"]').click()`);
		await wait(`Boolean(${surface}.querySelector('[aria-label="Expand all files"]'))`);
		await run(`${surface}.querySelector('[aria-label="Expand all files"]').click()`);
		await run(`${surface}.querySelector('[aria-label="Hide file tree"]').click()`);
		for (const [width, height] of [[1440, 920], [1040, 680]]) {
			window.setSize(width, height);
			for (const theme of ['light', 'dark']) {
				await run(`window.__auditTheme(${JSON.stringify(theme)})`);
				for (const layout of ['unified', 'split']) {
					await run(`${surface}.querySelector('[aria-label="${layout === 'unified' ? 'Stacked diff view' : 'Split diff view'}"]').click()`);
					await wait(`Boolean(${viewer}?.shadowRoot?.querySelector('pre[data-diff-type="${layout === 'split' ? 'split' : 'single'}"]'))`);
					const text = await run(`${viewer}.shadowRoot.querySelector('pre').textContent`);
					if (!text.includes('First edit')) throw Error('Diff omitted a side of the change');
					await new Promise(resolve => setTimeout(resolve, 150));
					if (await run(`document.documentElement.scrollWidth>innerWidth`)) throw Error('Diff overflowed the window');
					writeFileSync(path.join(captures, width+'-'+theme+'-'+layout+'.png'), (await window.webContents.capturePage()).toPNG());
				}
			}
		}
		// The layout is remembered across closing and reopening the panel.
		await run(`document.querySelector('aside[aria-label="Tools"] [aria-label="Close panel"]').click()`);
		await wait(`!document.querySelector('aside[aria-label="Tools"]')`);
		await openChanges();
		// The loop above ended on the split layout, so that is what comes back.
		await wait(`Boolean(${viewer}?.shadowRoot?.querySelector('pre[data-diff-type="split"]'))&&${surface}.querySelector('[aria-label="Split diff view"]').getAttribute('aria-checked')==='true'`);
		// Staging and committing moved out of the diff into Git actions.
		// The card can close while Git refreshes; like a person, reopen it before looking.
		const details = `(document.querySelector('.git-actions')||document.querySelector('[aria-label="Chat details"]')?.click(),true)`;
		const stage = `(${details}&&document.querySelector('.git-actions button[aria-label=${JSON.stringify('Stage ' + filename)}]'))`;
		const unstage = `(${details}&&document.querySelector('.git-actions button[aria-label=${JSON.stringify('Unstage ' + filename)}]'))`;
		// Git actions live in the details card in the title bar (T3).
		await run(`document.querySelector('.git-actions')||document.querySelector('[aria-label="Chat details"]').click()`);
		await wait(`Boolean(${stage})`);
		await run(`${stage}.click()`);
		await wait(`Boolean(${unstage})`);
		if (!git(["diff", "--cached"]).includes("First edit")) throw new Error("Git actions did not stage the file.");
		await run(`${unstage}.click()`);
		await wait(`Boolean(${stage})&&!${unstage}`);
		if (git(["diff", "--cached"]) || readFileSync(target, "utf8") !== edited) throw new Error("Unstaging changed the working file.");
		// Binary changes are left out of the viewer with a note; the text changes still show.
		const binary = path.join(repository, 'binary.dat'); writeFileSync(binary, Buffer.from([0, 1, 2])); git(['add', '--', 'binary.dat']); git(['commit', '-m', 'binary fixture']); writeFileSync(binary, Buffer.from([0, 3, 4]));
		// The button reads "Refreshing diff" while a refresh is under way; wait for it to settle.
		await wait(`Boolean(${surface}?.querySelector('[aria-label="Refresh diff"]'))`);
		await run(`${surface}.querySelector('[aria-label="Refresh diff"]').click()`);
		await wait(`${surface}.textContent.includes('1 binary or mode-only change is not shown')&&Boolean(${viewer}?.shadowRoot?.textContent.includes('Second edit'))`);
		console.log("GIT_HUNKS_SMOKE", JSON.stringify({ ...result, workingFilePreserved: true, renderer: true, splitAndUnified: true, literalMarkup: true, layoutPreference: true, binaryNotice: true, fullContext: true, staleContextRecovery: true, duplicateContextSuppression: true, keyboardExpansion: true, stickyHeaders: true, fileTree: true, gitActions: true }), "ISOLATED_DATA", data); app.exit(0);
	} catch (error) { console.error(error); app.exit(1); }
}).catch(error => { console.error(error); app.exit(1); });
