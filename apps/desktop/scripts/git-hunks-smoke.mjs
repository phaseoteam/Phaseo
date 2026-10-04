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
ipcMain.handle = function (channel, listener) { return originalHandle.call(this, channel, channel === 'workspace:git-diff-contents' ? async (event, ...args) => { contextRequests++; if (delayContext) { delayContext = false; await new Promise(resolve => setTimeout(resolve, 250)); } return listener(event, ...args); } : listener); };
await import(entry ? pathToFileURL(path.resolve(entry)).href : "../dist/main/index.mjs");
ipcMain.handle = originalHandle;
app.whenReady().then(async () => {
	try {
		const window = BrowserWindow.getAllWindows()[0];
		if (window.webContents.isLoading()) await new Promise(resolve => window.webContents.once("did-finish-load", resolve));
		const run = expression => window.webContents.executeJavaScript(expression);
		async function wait(expression) { for (let attempt = 0; attempt < 100; attempt++) { if (await run(expression)) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error("Hunk UI did not settle: " + expression); }
		const captures = path.resolve('output/playwright/git-hunks', entry ? 'packaged' : 'source'); mkdirSync(captures, { recursive: true });
		const result = await window.webContents.executeJavaScript(`(async()=>{const api=window.phaseoDesktop.workspace,filename=${JSON.stringify(filename)};const review=await api.gitHunks('fixture',filename,false);if(review.hunks.length!==2)throw Error('Missing hunks');await api.gitCommand('fixture',{type:'stage-hunk',filename,index:1,hash:review.hash});const staged=(await api.gitReview('fixture')).stagedDiff;let stale=false;try{await api.gitCommand('fixture',{type:'stage-hunk',filename,index:0,hash:review.hash})}catch(error){stale=String(error).includes('diff changed')}const confirmed=await api.gitHunks('fixture',filename,true);await api.gitCommand('fixture',{type:'unstage-hunk',filename,index:0,hash:confirmed.hash});let outside=false;try{await api.gitHunks('fixture','../outside',false)}catch{outside=true}return {partial:staged.includes('Second edit')&&!staged.includes('First edit'),stale,outside,unstaged:!(await api.gitReview('fixture')).stagedDiff}})()`);
		if (Object.values(result).some(value => !value) || readFileSync(target, "utf8") !== edited) throw new Error("Hunk workflow failed: " + JSON.stringify(result));
		const full = await run(`(async()=>{const api=window.phaseoDesktop.workspace,review=await api.gitReview('fixture');return api.gitDiffContents('fixture',{filename:${JSON.stringify(filename)},staged:false,hash:review.diffHash})})()`);
		if (full.oldFile.contents !== original || full.newFile.contents !== edited) throw Error('Bridge returned incorrect full file versions');
		await run(`Array.from(document.querySelectorAll('.sidebar-item')).find(button=>button.textContent.trim()==='Projects').click()`);
		await wait(`Boolean(document.querySelector('select[aria-label="Project"] option[value="fixture"]'))`);
		await run(`(()=>{const select=document.querySelector('select[aria-label="Project"]');select.value='fixture';select.dispatchEvent(new Event('change',{bubbles:true}));Array.from(document.querySelectorAll('.project-toolbar button')).find(button=>button.textContent==='Git review').click()})()`);
		await wait(`Boolean(document.querySelector('.git-file-list button[aria-pressed]'))`);
		await wait(`Boolean(document.querySelector('.project-review diffs-container')?.shadowRoot?.querySelector('[data-expand-index="1"] [data-expand-button]'))`);
		edited = edited.replace('Line 1\n', 'Refreshed context\n'); writeFileSync(target, edited);
		await run(`document.querySelector('.project-review diffs-container').shadowRoot.querySelector('[data-expand-index="1"] [data-expand-button]').click()`);
		await wait(`document.querySelector('.review-diff-feedback [role="alert"]')?.textContent.includes('diff changed')`);
		await run(`Array.from(document.querySelectorAll('.review-diff-feedback button')).find(button=>button.textContent==='Refresh review').click()`);
		await wait(`!document.querySelector('.review-diff-feedback [role="alert"]')&&document.querySelector('.project-review diffs-container')?.shadowRoot?.querySelector('pre')?.textContent.includes('Refreshed context')`);
		const beforeContext = contextRequests; delayContext = true;
		await run(`(()=>{const button=document.querySelector('.project-review diffs-container').shadowRoot.querySelector('[data-expand-index="1"] [data-expand-button]');if(button.tabIndex!==0||!button.getAttribute('aria-label')?.includes('unchanged'))throw Error('Expansion control is not named or keyboard-focusable');button.focus();button.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,composed:true,cancelable:true}));button.click()})()`);
		await wait(`document.querySelector('.review-diff-feedback[role="status"]')?.textContent.includes('Loading context')`);
		await wait(`document.querySelector('.project-review diffs-container')?.shadowRoot?.querySelector('code[data-additions] [data-line="11"]')?.textContent==='Line 10'&&!document.querySelector('.review-diff-feedback[role="status"]')`);
		if (contextRequests !== beforeContext + 1) throw Error('Repeated expansion duplicated full file requests');
		for (const [width, height] of [[1440, 920], [1040, 680]]) {
			window.setSize(width, height);
			for (const theme of ['light', 'dark']) {
				await run(`(()=>{const theme=${JSON.stringify(theme)};if(document.documentElement.dataset.theme!==theme)document.querySelector('[aria-label="Use '+theme+' theme"]').click()})()`);
				for (const layout of ['unified', 'split']) {
					await run(`document.querySelector('[aria-label="Diff layout"] button:nth-child(${layout === 'unified' ? 1 : 2})').click();document.querySelector('.review-diff').scrollIntoView({block:'start'})`);
					await wait(`Boolean(document.querySelector('.project-review diffs-container')?.shadowRoot?.querySelector('pre[data-diff-type="${layout === 'split' ? 'split' : 'single'}"] code[data-${layout === 'split' ? 'additions' : 'unified'}] [data-line="11"]'))`);
					await new Promise(resolve => setTimeout(resolve, 150));
					if (await run(`document.documentElement.scrollWidth>innerWidth`)) throw Error('Expanded context overflowed the window');
					await run(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
					writeFileSync(path.join(captures, width+'-'+theme+'-'+layout+'-context.png'), (await window.webContents.capturePage()).toPNG());
				}
			}
		}
		await run(`Array.from(document.querySelectorAll('.git-file-list button')).find(button=>button.textContent==='Review changes').click()`);
		await wait(`document.querySelectorAll('.git-hunk-panel .git-hunk').length===2&&!document.querySelector('.git-hunk-panel').getAttribute('aria-busy').includes('true')`);
		await wait(`Array.from(document.querySelectorAll('.git-hunk-panel diffs-container')).every(node=>node.shadowRoot?.querySelector('pre[data-diff-type="split"]'))&&document.querySelectorAll('.git-hunk-panel diffs-container').length===2`);
		await run(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.hunkCopied=text}}})`);
		const expectedCopy = await run(`window.phaseoDesktop.workspace.gitHunks('fixture',${JSON.stringify(filename)},false).then(review=>review.hunks[0].text)`);
		await run(`document.querySelector('.git-hunk-panel button[aria-label="Copy code"]').click()`);
		await wait(`window.hunkCopied===${JSON.stringify(expectedCopy)}`);
		await run(`navigator.clipboard.writeText=async()=>{throw Error('Owned copy failure')};document.querySelector('.git-hunk-panel .review-diff > .message-code-actions button').click()`);
		await wait(`document.querySelector('.git-hunk-panel .review-diff > .message-code-actions').textContent.includes('Copy failed')`);
		await run(`navigator.clipboard.writeText=async text=>{window.hunkCopied=text};document.querySelector('.git-hunk-panel .review-diff > .message-code-actions button').click()`);
		await wait(`Boolean(document.querySelector('.git-hunk-panel button[aria-label="Copied"]'))`);
		for (const [width, height] of [[1440, 920], [1040, 680]]) {
			window.setSize(width, height);
			for (const theme of ['light', 'dark']) {
				await run(`(()=>{const theme=${JSON.stringify(theme)};if(document.documentElement.dataset.theme!==theme)document.querySelector('[aria-label="Use '+theme+' theme"]').click();document.querySelector('.git-hunk-panel').scrollIntoView({block:'start'})})()`);
				await new Promise(resolve => setTimeout(resolve, 150));
				const layout = await run(`(()=>{const panel=document.querySelector('.git-hunk-panel'),style=getComputedStyle(panel);return {padding:style.paddingLeft,font:getComputedStyle(panel.querySelector('h2')).fontFamily,overflow:document.documentElement.scrollWidth>innerWidth}})()`);
				if (layout.padding !== '20px' || !layout.font.includes('Montserrat') || layout.overflow) throw Error('Hunk layout failed: '+JSON.stringify(layout));
				for (const layout of ['unified', 'split']) {
					await run(`document.querySelector('[aria-label="Diff layout"] button:nth-child(${layout === 'unified' ? 1 : 2})').click()`);
					await wait(`Array.from(document.querySelectorAll('.git-hunk-panel diffs-container')).every(node=>node.shadowRoot?.querySelector('pre[data-diff-type="${layout === 'split' ? 'split' : 'single'}"]'))&&document.querySelectorAll('.git-hunk-panel diffs-container').length===2`);
					const text = await run(`document.querySelector('.git-hunk-panel diffs-container').shadowRoot.querySelector('pre').textContent`);
					if (!text.includes('Line 2') || !text.includes('First edit')) throw Error('Diff omitted a side of the change');
					if (await run(`Boolean(document.querySelector('.git-hunk-panel diffs-container').shadowRoot.querySelector('img,script'))`)) throw Error('Diff interpreted source markup');
					if (layout === 'split') {
						const columns = await run(`(()=>{const root=document.querySelector('.git-hunk-panel diffs-container').shadowRoot,left=root.querySelector('code[data-deletions] [data-line="4"]'),right=root.querySelector('code[data-additions] [data-line="4"]');return {left:left?.textContent,right:right?.textContent,aligned:Math.abs(left.getBoundingClientRect().top-right.getBoundingClientRect().top)<1,overflow:document.documentElement.scrollWidth>innerWidth}})()`);
						if (columns.left !== columns.right || !columns.aligned || columns.overflow) throw Error('Split columns did not align: '+JSON.stringify(columns));
					}
					writeFileSync(path.join(captures, width+'-'+theme+'-'+layout+'.png'), (await window.webContents.capturePage()).toPNG());
				}
			}
		}
		await run(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='All changes').click()`);
		await wait(`!document.querySelector('.git-hunk-panel')`);
		await run(`document.querySelector('[aria-label="Diff layout"] button:first-child').click()`);
		await wait(`localStorage.getItem('phaseo.desktop.diffLayout')==='"unified"'`);
		await run(`Array.from(document.querySelectorAll('.sidebar-item')).find(button=>button.textContent.trim()==='Home').click()`);
		await wait(`!document.querySelector('.project-review')`);
		await run(`Array.from(document.querySelectorAll('.sidebar-item')).find(button=>button.textContent.trim()==='Projects').click()`);
		await wait(`Boolean(document.querySelector('select[aria-label="Project"] option[value="fixture"]'))`);
		await run(`(()=>{const select=document.querySelector('select[aria-label="Project"]');select.value='fixture';select.dispatchEvent(new Event('change',{bubbles:true}));Array.from(document.querySelectorAll('.project-toolbar button')).find(button=>button.textContent==='Git review').click()})()`);
		await wait(`Boolean(document.querySelector('[aria-label="Diff layout"] button:first-child[aria-pressed="true"]'))`);
		await run(`Array.from(document.querySelectorAll('.git-file-list button')).find(button=>button.textContent==='Review changes').click()`);
		await wait(`document.querySelectorAll('.git-hunk-panel .git-hunk').length===2&&!document.querySelector('.git-hunk-panel').getAttribute('aria-busy').includes('true')`);
		await run(`(()=>{const button=document.querySelectorAll('.git-hunk-panel .git-hunk > .project-toolbar button')[1];button.click();button.click()})()`);
		await wait(`document.querySelectorAll('.git-hunk-panel .git-hunk').length===2&&Boolean(Array.from(document.querySelectorAll('.git-hunk-panel button')).find(button=>button.textContent==='Unstage change'))&&!document.querySelector('.git-hunk-panel').getAttribute('aria-busy').includes('true')`);
		if (!git(["diff", "--cached"]).includes("Second edit") || git(["diff", "--cached"]).includes("First edit")) throw new Error("UI staged the wrong hunk.");
		await run(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='All changes').click()`);
		await wait(`Boolean(document.querySelectorAll('.project-review .review-diff diffs-container')[1]?.shadowRoot?.querySelector('[data-expand-index="0"] [data-expand-button]'))`);
		await run(`document.querySelectorAll('.project-review .review-diff diffs-container')[1].shadowRoot.querySelector('[data-expand-index="0"] [data-expand-button]').dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true,composed:true,cancelable:true}))`);
		await wait(`document.querySelectorAll('.project-review .review-diff diffs-container')[1]?.shadowRoot?.querySelector('code[data-unified] [data-line="3"]')?.textContent==='Line 2'`);
		await run(`Array.from(document.querySelectorAll('.git-file-list button')).find(button=>button.textContent==='Review changes').click()`);
		await wait(`document.querySelectorAll('.git-hunk-panel .git-hunk').length===2&&!document.querySelector('.git-hunk-panel').getAttribute('aria-busy').includes('true')`);
		await run(`Array.from(document.querySelectorAll('.git-hunk-panel button')).find(button=>button.textContent==='Unstage change').click()`);
		await wait(`!Array.from(document.querySelectorAll('.git-hunk-panel button')).some(button=>button.textContent==='Unstage change')&&!document.querySelector('.git-hunk-panel').getAttribute('aria-busy').includes('true')`);
		if (git(["diff", "--cached"]) || readFileSync(target, "utf8") !== edited) throw new Error("UI unstage changed the working file.");
		const binary = path.join(repository, 'binary.dat'); writeFileSync(binary, Buffer.from([0, 1, 2])); git(['add', '--', 'binary.dat']); git(['commit', '-m', 'binary fixture']); writeFileSync(binary, Buffer.from([0, 3, 4]));
		await run(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='All changes').click();document.querySelector('[aria-label="Refresh Git review"]').click()`);
		await wait(`document.querySelector('.project-review .message-code-block pre')?.textContent.includes('Binary files')`);
		const raw = await run(`window.phaseoDesktop.workspace.gitReview('fixture').then(review=>review.diff)`);
		await run(`document.querySelector('.project-review .message-code-block button[aria-label="Copy code"]').click()`);
		await wait(`window.hunkCopied===${JSON.stringify(raw)}`);
		if (!raw.includes('First edit') || !raw.includes('Second edit')) throw Error('Binary fallback omitted text changes');
		console.log("GIT_HUNKS_SMOKE", JSON.stringify({ ...result, workingFilePreserved: true, renderer: true, splitAndUnified: true, literalMarkup: true, copyRecovery: true, layoutPreference: true, binaryFallback: true, fullContext: true, stagedContext: true, staleContextRecovery: true, duplicateContextSuppression: true, keyboardExpansion: true }), "ISOLATED_DATA", data); app.exit(0);
	} catch (error) { console.error(error); app.exit(1); }
}).catch(error => { console.error(error); app.exit(1); });
