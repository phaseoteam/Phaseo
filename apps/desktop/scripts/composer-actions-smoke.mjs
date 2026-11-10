import assert from "node:assert/strict";
import { once, EventEmitter } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, ipcMain } from "electron";

app.setPath("userData", mkdtempSync(path.join(tmpdir(), "phaseo-composer-actions-")));
const entry = process.argv.find(value => value.startsWith("--app-entry="))?.slice(12);
const paletteOnly = process.argv.includes("--palette-only");
await import(entry ? pathToFileURL(path.resolve(entry)).href : "../dist/main/index.mjs");
const deadline = setTimeout(() => { console.error("Composer fixture deadline"); app.exit(1); }, 120_000);
deadline.unref();

app.whenReady().then(async () => { try {
	console.log("Composer fixture: app ready");
	const owner = BrowserWindow.getAllWindows()[0];
	owner.hide(); owner.setSize(1280, 900); owner.webContents.setBackgroundThrottling(false);
	if (owner.webContents.isLoading()) await once(owner.webContents, "did-finish-load");
	const run = code => owner.webContents.executeJavaScript(code).catch(error => { throw new Error(`Fixture renderer failed: ${code.slice(0, 240)}`, { cause: error }); });
	const ready = predicate => run(`new Promise((resolve,reject)=>{const check=()=>{if((${predicate})){observer.disconnect();clearTimeout(timer);resolve(true);}};const observer=new MutationObserver(check);observer.observe(document,{subtree:true,childList:true,characterData:true,attributes:true});const timer=setTimeout(()=>{observer.disconnect();reject(Error('Missing UI milestone: '+${JSON.stringify(predicate)}));},10000);check();})`);
	async function closeMenu() {
		// The menu library's test switch bypasses frame-based completion in hidden windows; SVG gestures remain enabled.
		await run("globalThis.BASE_UI_ANIMATIONS_DISABLED=true;document.querySelector('[role=menu]')?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true");
		await ready("!document.querySelector('[role=menu]')");
	}
	const originalPreferences = await run("window.phaseoDesktop.workspace.preferences()");
	console.log("Composer fixture: preferences ready");
	let preferences = originalPreferences.preferences;
	let tasks, revision = 0, projects = [];
	const commands = new EventEmitter();
	const calls = [];
	let pullWrites = 0;
	let factoryWrites = 0, openedItemThreads = 0;
	const now = new Date().toISOString();
	const playbook = { instructions: "", briefs: {}, stageAgents: {}, rules: [], requireProof: true, openPullRequest: true, postReports: false, askReporter: true };
	let factoryState = { settings: { repos: [], showRepo: "", independentReview: true, playbooks: { issue: playbook, pull: playbook }, pollMinutes: 5, agentEfforts: {} }, github: { version: null, attach: false }, repos: [], items: [], runs: [], agents: [], notes: {}, threads: {}, loadedAt: Date.now(), demo: false };
	const pullView = { id: "owned-pull", repository: "owned/fixture", number: 12, title: "Owned pull request", url: "https://example.invalid/pull/12", author: "fixture", draft: false, head: "feature", base: "main", updatedAt: now, createdAt: now, fetchedAt: now, review: "approved", checks: "passing", body: "Owned fixture pull request.", state: "OPEN", additions: 1, deletions: 0, changedFiles: 1, headOid: "a".repeat(40), baseOid: "b".repeat(40), mergeable: "MERGEABLE", mergeState: "CLEAN", authorActor: { login: "fixture" }, labels: [], reviewers: [], reviews: [], checkRuns: [], comments: [], commentCount: 0, commentsTruncated: false, commits: [], commitCount: 0, threads: [], mergeMethods: ["squash"], viewer: { canUpdate: true, canMerge: true, canDeleteBranch: false, canEnableAutoMerge: false, canDisableAutoMerge: false }, autoMergeAllowed: false, headRefExists: true, behind: false };
	const overview = () => ({ version: 1, projects, accounts: [], agents: [], mcpConnections: [], tasks: tasks.map(({ messages, queue, ...task }) => ({ ...task, queueCount: queue.length, approvalsCount: 0, answersCount: 0, steeringReviewCount: 0, attentionKey: "fixture" })) });
	const mock = (channel, handler) => { ipcMain.removeHandler(channel); ipcMain.handle(channel, handler); };
	mock("workspace:preferences", () => ({ ...originalPreferences, preferences }));
	mock("workspace:overview", overview);
	mock("workspace:task", (_event, id) => tasks.find(task => task.id === id));
	mock("workspace:conversation-page", (_event, query) => ({ kind: query.kind, entries: query.kind === "messages" ? tasks.find(task => task.id === query.taskId).messages : [], earlier: 0, later: 0, revision }));
	mock("workspace:models", () => []);
	mock("workspace:installations", () => []);
	mock("workspace:editors", () => [{ id: "vscode", name: "Owned editor", available: true }]);
	mock("workspace:background-commands", () => []);
	const missions = ["never", "running"].map((lastStatus, index) => ({ id: `owned-schedule-${index}`, title: `Owned schedule ${index}`, prompt: "Owned fixture", templateTaskId: "main", schedule: { type: "interval", minutes: 60 }, enabled: false, createdAt: now, updatedAt: now, lastStatus, runCount: index }));
	mock("workspace:missions", () => missions);
	mock("workspace:mission", () => { throw Error("Schedule writes are forbidden in this fixture"); });
	mock("workspace:usage-report", (_event, period, filter = {}) => ({ generatedAt: now, period, from: now, total: { tokens: 0, costNanos: 0, chargedNanos: 0, estimateNanos: 0, unpricedTokens: 0, cacheSavingsNanos: 0, chats: 0, types: { input: 0, cached: 0, cacheWrite: 0, output: 0, reasoning: 0 } }, harnesses: [], buckets: [], models: [], chats: [], projects: [], autopilot: { tokens: 0, costNanos: 0, chargedNanos: 0, estimateNanos: 0, unpricedTokens: 0, chats: 0 }, activity: { chatsStarted: 0, chatsFinished: 0, chatsSettled: 0, autopilotChats: 0 }, filter, filterOptions: [{ harness: "phaseo", model: "owned" }] }));
	mock("workspace:file-preview", () => ({ kind: "text", text: "Owned fixture text ".repeat(24), size: 456, truncated: false }));
	mock("workspace:list-files", () => []);
	mock("workspace:git-diff", () => ({ repository: true, patch: "", branch: "feature", baseRef: "main" }));
	mock("workspace:account-status", () => ({ checkedAt: new Date().toISOString(), authenticated: false, usage: [] }));
	mock("workspace:pull-request-view", () => pullView);
	mock("workspace:project-repository", () => "owned/fixture");
	mock("workspace:pull-request-stack", () => ({ stack: null, defaultBranch: "main" }));
	mock("workspace:branch-pull-request", () => ({ branch: "feature", pullRequest: null }));
	mock("workspace:pull-request-action", () => { pullWrites++; throw Error("Pull request writes are forbidden in this fixture"); });
	mock("factory:snapshot", () => factoryState);
	for (const channel of ["item-timeline", "item-comments", "similar-items", "repo-labels", "assignable", "mentions", "local-clones"]) mock(`factory:${channel}`, () => []);
	mock("factory:item-body", () => "Owned Factory fixture description.");
	mock("factory:item-checks", () => [{ name: "Owned failed check", state: "fail", link: "https://example.invalid/actions/runs/1" }]);
	mock("factory:merge-state", () => ({ checking: false, methods: [], blocker: "Owned fixture: no live merge" }));
	mock("factory:open-thread", () => { openedItemThreads++; return "main"; });
	for (const channel of ["change-on-github", "start-run", "act", "create-issue", "send-message"]) mock(`factory:${channel}`, () => { factoryWrites++; throw Error("Factory writes are forbidden in this fixture"); });
	// Browser chrome is exercised without creating a native page or opening a site.
	mock("desktop:browser", (_event, command) => ({ id: command.id, url: "https://example.invalid", title: "Owned page", loading: false, canGoBack: true, canGoForward: true, devToolsOpen: false, viewport: { mode: "fill" }, zoom: 1, colorScheme: "system", audible: false, muted: false, configured: true }));
	mock("desktop:browser-download", () => [{ id: "fixture", sourceId: "main", filename: "owned.txt", url: "https://example.invalid/owned.txt", path: "", received: 1, total: 1, status: "completed", resumable: false, finished: true }]);
	mock("workspace:command", (_event, command) => {
		// Delivery is observed at the IPC boundary; no adapter, account or inference is invoked.
		if (["send", "steer", "cancel", "queue-edit", "queue-remove", "answer"].includes(command.type)) {
			calls.push(command); commands.emit("delivery", command);
		}
		return overview();
	});
	const renderer = entry ? path.resolve(path.dirname(entry), "../renderer/index.html") : path.resolve(import.meta.dirname, "../dist/renderer/index.html");
	const output = process.argv.find(value => value.startsWith("--output="))?.slice(9);
	if (output) mkdirSync(output, { recursive: true });
	const makeTask = (id, status, harness = "phaseo") => ({ id, title: `Owned ${id}`, harness, model: "default", mode: "chat", status, pinned: false, archived: false, revision, queue: [], messages: [{ id: `${id}-assistant`, role: "assistant", text: "Owned fixture conversation.", createdAt: new Date().toISOString() }], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastCompletedAt: status === "completed" ? now : undefined, lastVisitedAt: now });
	async function configure({ surface = "main", status = "running", followUp = "queue", harness = "phaseo", draft = "Consider the smaller option.", queued = false, question = false, sendKey = "enter", project = false } = {}) {
		revision++;
		tasks = [makeTask("main", status, harness), makeTask("side", status, harness)];
		if (project) tasks[0].projectId = "fixture";
		tasks[1].delegation = { parentTaskId: "main", kind: "side" };
		if (queued) tasks[0].queue = [{ id: "queued", text: "An earlier follow-up.", createdAt: new Date().toISOString() }];
		if (question) tasks[0].questions = [{ id: "request", questions: [{ id: "direction", header: "Direction", question: "Which option should I use?", options: [] }] }];
		preferences = { ...originalPreferences.preferences, chat: { ...originalPreferences.preferences.chat, followUp } };
		await run(`localStorage.setItem('phaseo.desktop.selectedTask','"main"');localStorage.setItem('phaseo.desktop.workspaceMode','"chat"');localStorage.setItem('phaseo.desktop.theme','"dark"');localStorage.removeItem('phaseo.desktop.rightPanel');localStorage.removeItem('phaseo.desktop.selectedCompare');localStorage.setItem('phaseo.desktop.messageDrafts',${JSON.stringify(JSON.stringify({ main: draft, side: draft }))});localStorage.setItem('phaseo.desktop.compareGroups',${JSON.stringify(JSON.stringify([{ id: "pair", title: "Owned comparison", taskIds: ["main", "side"], createdAt: new Date().toISOString() }]))});localStorage.setItem('phaseo.desktop.compareDrafts',${JSON.stringify(JSON.stringify({ pair: draft }))});${surface === "compare" ? "localStorage.setItem('phaseo.desktop.selectedCompare','\"pair\"');" : ""}true`);
		await run(`localStorage.setItem('phaseo.desktop.sendKey',${JSON.stringify(sendKey)})`);
		if (surface !== "compare") await run("localStorage.removeItem('phaseo.desktop.compareGroups')");
		await owner.loadFile(renderer);
		await ready("!!document.querySelector('main form [data-composer-icon]')");
		if (surface === "side") {
			await run("window.dispatchEvent(new CustomEvent('phaseo:open-side-chat',{detail:{parentId:'main',id:'side'}}));true");
			await ready("!!document.querySelector('[data-side-chat-pane] form [data-composer-icon]')");
		}
		const root = surface === "side" ? "[data-side-chat-pane]" : "main";
		const action = question || status === "completed" ? "send" : followUp === "steer" && harness !== "grok" ? "steer" : "queue";
		await ready(`!!document.querySelector(${JSON.stringify(`${root} button[type=submit] [data-composer-icon="${action}"][data-on]`)})`);
		return root;
	}
	const capture = async name => { if (output) { await run("document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))"); writeFileSync(path.join(output, name + ".png"), (await owner.webContents.capturePage()).toPNG()); } };
	async function clickDelivery(root, label, type, count = 1) {
		const first = calls.length;
		const delivery = once(commands, "delivery");
		await run(`document.querySelector(${JSON.stringify(`${root} button[aria-label="${label}"]`)}).click()`);
		await delivery;
		await ready(`document.querySelector(${JSON.stringify(`${root} [contenteditable]`)}).value === ''`);
		assert.equal(calls.length - first, count);
		for (const call of calls.slice(first)) assert.equal(call.type, type);
	}
	async function configureFactory(kind = "issue", state = "open", page = renderer) {
		const stages = Object.fromEntries(["triage", "reproduce", "fix", "review", "verify"].map(id => [id, { status: "idle" }]));
		const item = { id: "owned/fixture#1", source: "github", repo: "owned/fixture", number: 1, kind, state, title: `Owned Factory ${kind}`, body: "", author: { login: "fixture" }, labels: [], url: "https://example.invalid/fixture/1", createdAt: Date.now(), updatedAt: Date.now(), comments: 0, priority: "normal", stages };
		factoryState = { ...factoryState, items: [item], loadedAt: Date.now() };
		await run(`localStorage.setItem('phaseo.desktop.workspaceMode','"code"');localStorage.setItem('phaseo.desktop.codeView','"factory"');localStorage.setItem('phaseo.desktop.factoryRoute',${JSON.stringify(JSON.stringify({ item: item.id }))});localStorage.removeItem('phaseo.desktop.selectedTask');localStorage.removeItem('phaseo.desktop.rightPanel');true`);
		await owner.loadFile(page);
		await ready(`Array.from(document.querySelectorAll('main button')).some(button=>button.textContent.includes('Open thread'))`);
		await ready(`Array.from(document.querySelectorAll('main button')).some(button=>button.textContent.includes('GitHub'))`);
	}
	const baseline = process.argv.find(value => value.startsWith("--baseline-renderer="))?.slice(20);
	owner.webContents.debugger.attach("1.3");
	const cdp = (method, params = {}) => owner.webContents.debugger.sendCommand(method, params);
	await cdp("DOM.enable"); await cdp("CSS.enable");
	const force = async (selector, pseudo) => { const { root } = await cdp("DOM.getDocument"); const { nodeId } = await cdp("DOM.querySelector", { nodeId: root.nodeId, selector }); assert(nodeId, selector); await cdp("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: pseudo ? [pseudo] : [] }); };
	const gestures = {};
	if (!paletteOnly) {
	if (baseline) {
		await configure(); await owner.loadFile(baseline);
		await ready("!!document.querySelector('main button[aria-label=Stop]')");
		await capture("before");
		await run("document.querySelector('aside button[aria-label=\"Actions for Owned main\"]').click()");
		await ready("!!document.querySelector('[role=menu]')");
		await run("document.querySelector('[role=menu]').getAnimations().forEach(animation=>animation.finish());true");
		await capture("before-actions");
		await closeMenu();
		await run("Array.from(document.querySelectorAll('header button')).find(button=>button.textContent.includes('Search chats and commands')).click()");
		await ready("!!document.querySelector('[role=option]')");
		await run("Array.from(document.querySelectorAll('[role=option]')).find(option=>option.textContent.includes('Open browser')).click()");
		await ready("!!document.querySelector('button[aria-label=\"Open in system browser\"]')");
		await capture("before-browser");
		await configure({ status: "completed", project: true }); await owner.loadFile(baseline);
		await ready("!!document.querySelector('main form [data-composer-icon]')");
		await run("window.dispatchEvent(new CustomEvent('phaseo:open-pull-request',{detail:{number:12}}));true");
		await ready("!!document.querySelector('[data-pull-request-surface] [data-merge-button]')");
		await capture("before-git-actions");
		await configureFactory("issue", "open", baseline);
		await capture("before-panels");
		await run("document.querySelector('header button[aria-label=\"Show panel\"]').click();true");
		await ready("!!document.querySelector('header button[aria-label=\"Hide panel\"]')");
		await capture("before-panels-open");
		await run("document.querySelector('header button[aria-label=\"Hide panel\"]').click();true");
		await ready("!!document.querySelector('header button[aria-label=\"Show panel\"]')");
		await capture("before-factory");
		await run("Array.from(document.querySelectorAll('main button')).find(button=>button.textContent.includes('GitHub')).click();true");
		await ready("!!document.querySelector('[role=menu]')");
		await run("document.querySelector('[role=menu]').getAnimations().forEach(animation=>animation.finish());true");
		await capture("before-factory-menu");
	}
	// The same visible actions submit the intended command in every composer surface, under either default.
	for (const surface of ["main", "side", "compare"]) for (const followUp of ["queue", "steer"]) {
		console.log("Composer fixture: delivery", surface, followUp);
		const root = await configure({ surface, followUp });
		const action = followUp === "queue" ? "Queue message" : "Steer message";
		await ready(`document.querySelector(${JSON.stringify(`${root} button[aria-label="${action}"]`)})?.disabled === false`);
		assert(await run(`!!document.querySelector(${JSON.stringify(`${root} button[aria-label="Stop"]`)})`));
		assert.equal(await run(`document.querySelector(${JSON.stringify(`${root} button[aria-label="${action}"] [data-composer-icon]`)}).dataset.composerIcon`), followUp);
		if (surface === "main") await capture(followUp);
		if (surface === "side" && followUp === "queue") {
			const bounds = await run("(()=>{const form=document.querySelector('[data-side-chat-pane] form').getBoundingClientRect(),buttons=Array.from(document.querySelectorAll('[data-side-chat-pane] form button')).map(button=>button.getBoundingClientRect());return {width:form.width,inside:buttons.every(button=>button.left>=form.left&&button.right<=form.right)};})()");
			assert(bounds.inside); assert(bounds.width > 250);
			await capture("side-chat");
		}
		await clickDelivery(root, action, followUp === "queue" ? "send" : "steer", surface === "compare" ? 2 : 1);
		// The menu exposes the other delivery method without changing the saved default.
		await configure({ surface, followUp });
		await run(`document.querySelector(${JSON.stringify(`${root} button[aria-label="Message actions"]`)}).click()`);
		const alternate = followUp === "queue" ? "Steer message" : "Queue message";
		await ready(`Array.from(document.querySelectorAll('[role="menuitem"]')).some(item=>item.textContent===${JSON.stringify(alternate)})`);
		const first = calls.length, delivery = once(commands, "delivery");
		await run(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(item=>item.textContent===${JSON.stringify(alternate)}).click()`);
		await delivery;
		await ready(`document.querySelector(${JSON.stringify(`${root} [contenteditable]`)}).value === ''`);
		assert.equal(calls.length - first, surface === "compare" ? 2 : 1);
		assert(calls.slice(first).every(call => call.type === (followUp === "queue" ? "steer" : "send")));
		assert.equal(preferences.chat.followUp, followUp);
	}
	await configure({ status: "completed" });
	console.log("Composer fixture: idle send");
	await capture("send");
	await clickDelivery("main", "Send", "send");
	await configure({ draft: "" });
	assert(await run("document.querySelector('main button[aria-label=\"Queue message\"]').disabled"));
	const stopped = once(commands, "delivery");
	await run("document.querySelector('main button[aria-label=Stop]').click()");
	assert.equal((await stopped)[0].type, "cancel");
	await configure({ harness: "grok", followUp: "steer" });
	assert(await run("!!document.querySelector('main button[aria-label=\"Queue message\"]')&&!document.querySelector('main button[aria-label=\"Message actions\"]')"));
	await clickDelivery("main", "Queue message", "send");
	await configure({ draft: "", queued: true });
	await run("document.querySelector('main button[aria-label=\"Edit queued message\"]').click()");
	await ready("!!document.querySelector('main button[aria-label=\"Update queued message\"]')");
	await capture("edit");
	const edit = once(commands, "delivery");
	await run("document.querySelector('main button[aria-label=\"Update queued message\"]').click()");
	assert.equal((await edit)[0].type, "queue-edit");
	await configure({ question: true, status: "waiting", followUp: "steer" });
	assert(await run("!document.querySelector('main button[aria-label=\"Message actions\"]')"));
	await clickDelivery("main", "Send", "answer");
	// Enter, the alternate shortcut and IME composition keep their existing semantics.
	console.log("Composer fixture: keyboard");
	const modifier = process.platform === "darwin" ? { metaKey: true } : { ctrlKey: true };
	for (const [modifiers, type, sendKey] of [[{}, "send", "enter"], [modifier, "steer", "enter"], [modifier, "send", "mod+enter"]]) {
		await configure({ sendKey });
		const delivery = once(commands, "delivery");
		await run(`document.querySelector('main [contenteditable]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,...${JSON.stringify(modifiers)}}))`);
		assert.equal((await delivery)[0].type, type);
	}
	await configure();
	const beforeComposition = calls.length;
	await run("document.querySelector('main [contenteditable]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}));true");
	assert.equal(calls.length, beforeComposition);
	// Force interaction states in this owned window; window controls and unrelated icons remain still.
	await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
	async function navigationGesture(selector) {
		for (const pseudo of ["hover", "focus-visible"]) {
			if (pseudo === "hover") {
				const point = await run(`(()=>{const box=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:box.x+box.width/2,y:box.y+box.height/2};})()`);
				await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
			} else {
				await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
				await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
				await run(`document.querySelector(${JSON.stringify(selector)}).focus({preventScroll:true});true`);
			}
			const held = await run(`(async()=>{const svg=document.querySelector(${JSON.stringify(selector)}+' svg');await Promise.all(svg.getAnimations({subtree:true}).map(animation=>animation.finished));return {direction:svg.dataset.iconGesture,offsets:Array.from(svg.children).map(part=>parseFloat(getComputedStyle(part).translate)||0)};})()`);
			assert(held.offsets.every(offset => Math.abs(offset - (held.direction === "back" ? -1.5 : 1.5)) < 0.001), `${selector} does not hold its ${pseudo} position`);
			await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
			await run(`document.querySelector(${JSON.stringify(selector)}).blur();true`);
			assert(await run(`(async()=>{const svg=document.querySelector(${JSON.stringify(selector)}+' svg');await Promise.all(svg.getAnimations({subtree:true}).map(animation=>animation.finished));return Array.from(svg.children).every(part=>Math.abs(parseFloat(getComputedStyle(part).translate)||0)<0.001);})()`), `${selector} does not return to rest`);
		}
	}
	const samples = {};
	for (const action of ["send", "queue", "steer"]) {
		await configure({ status: action === "send" ? "completed" : "running", followUp: action === "steer" ? "steer" : "queue" });
		await run("document.documentElement.dataset.animations='on'");
		const selector = `main button[type=submit]`;
		samples[action] = await run(`document.querySelector('${selector} [data-composer-icon][data-on]').outerHTML`);
		assert.equal(await run(`getComputedStyle(document.querySelector('${selector} [data-trace]')).animationName`), "none");
		for (const pseudo of ["hover", "focus-visible"]) {
			await force(selector, pseudo);
			assert.equal(await run(`getComputedStyle(document.querySelector('${selector} [data-trace]')).animationName`), "action-trace");
			const position = await run(`(()=>{const style=getComputedStyle(document.querySelector('${selector} svg'));return [style.transform,style.rotate,style.scale];})()`);
			assert.deepEqual(position, ["none", "none", "none"]);
		}
		for (const reduced of [false, true]) {
			await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }] });
			await run(`document.documentElement.dataset.animations='${reduced ? "on" : "off"}'`);
			assert.equal(await run(`getComputedStyle(document.querySelector('${selector} [data-trace]')).animationName`), "none");
		}
		await cdp("Emulation.setEmulatedMedia", { features: [] });
	}
	await run("document.documentElement.dataset.animations='on'");
	for (const label of ["Minimise", "Maximise", "Close", "Settings"]) {
		const selector = `button[aria-label="${label}"]`;
		await force(selector, "hover");
		assert.equal(await run(`getComputedStyle(document.querySelector(${JSON.stringify(selector)}+' svg')).animationName`), "none");
	}
	await force('button[aria-label="Close"]', null);
	await capture("window-controls");
	// Everyday actions have distinct, bounded gestures on their parts, without moving the control.
	await configure({ status: "completed" });
	await ready("!!document.querySelector('main button[aria-label=Copy]')");
	await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
	for (const name of ["signIn", "schedule", "inbox", "usage", "plus", "paperclip", "copy", "search", "settings", "refresh", "pin", "archive", "pencil", "mail", "link", "download", "branch", "terminal", "pullRequest", "external", "camera", "merge"]) {
		console.log("Composer fixture: gesture", name);
		if (name === "refresh") {
			await run("document.querySelector('aside button[aria-label=\"Actions for Owned main\"]').click()");
			await ready("!!document.querySelector('[role=menuitem] [data-icon-gesture=refresh]')");
			// A hidden window need not advance its compositor. Settle the entrance before measuring glyphs.
			await run("document.querySelector('[role=menu]').getAnimations().forEach(animation=>animation.finish());true");
		}
		if (name === "download" || name === "terminal") {
			await closeMenu();
			if (name === "download") {
				await run("document.querySelector('button[aria-label=\"Chat actions\"]').click()");
				await ready("!!document.querySelector('[role=menuitem] [data-icon-gesture=download]')");
				await run("document.querySelector('[role=menu]').getAnimations().forEach(animation=>animation.finish());true");
			} else {
				await run("Array.from(document.querySelectorAll('header button')).find(button=>button.textContent.includes('Search chats and commands')).click()");
				await ready("!!document.querySelector('[role=option] [data-icon-gesture=terminal]')");
				await run("document.querySelector('[role=dialog]').getAnimations().forEach(animation=>animation.finish());true");
			}
		}
		if (name === "external") {
			await run("Array.from(document.querySelectorAll('[role=option]')).find(option=>option.textContent.includes('Open browser')).click()");
			await ready("!!document.querySelector('button[aria-label=\"Open in system browser\"]')");
			await run("document.querySelector('[data-browser-surface]').parentElement.getAnimations().forEach(animation=>animation.finish());true");
			for (const direction of ["back", "forward"]) await navigationGesture(`.browser-toolbar button:has([data-icon-gesture="${direction}"])`);
		}
		if (name === "merge") {
			await configure({ status: "completed", project: true });
			await run("window.dispatchEvent(new CustomEvent('phaseo:open-pull-request',{detail:{number:12}}));true");
			await ready("!!document.querySelector('[data-pull-request-surface] button [data-icon-gesture=merge]')");
			await run("document.querySelector('[data-pull-request-surface]').parentElement.getAnimations().forEach(animation=>animation.finish());true");
		}
		const selector = `:is(button,[role=menuitem],[role=option]):has(> .gesture-icon[data-icon-gesture="${name}"]), button:has(.icon-swap > .gesture-icon[data-icon-gesture="${name}"])`;
		// The menu highlights Rename on open. Clear that owned-fixture state before testing each trigger separately.
		await run("document.querySelector('[role=menu]')?.focus();document.querySelectorAll('[role=menuitem][data-highlighted]').forEach(item=>item.removeAttribute('data-highlighted'));true");
		const state = () => run(`(()=>{const button=document.querySelector(${JSON.stringify(selector)}),svg=button.querySelector('[data-icon-gesture]');return {box:button.getBoundingClientRect().toJSON(),animations:svg.getAnimations({subtree:true}).map(animation=>({name:animation.animationName,iterations:animation.effect.getTiming().iterations})),parts:Array.from(svg.children).map(part=>({transform:getComputedStyle(part).transform,dash:getComputedStyle(part).strokeDashoffset})),lengths:Array.from(svg.children).map(part=>part.getAttribute('pathLength'))};})()`);
		await force(selector, null);
		const idle = await state();
		assert.equal(idle.animations.length, 0, `${name} moves at rest`);
		assert(idle.lengths.every(length => length === "1"));
		for (const pseudo of ["hover", "focus-visible"]) {
			await force(selector, pseudo);
			const active = await state();
			if (pseudo === "focus-visible" && (name === "inbox" || await run(`!!document.querySelector(${JSON.stringify(selector)}).closest('.desktop-command-palette')`))) {
				assert.equal(active.animations.length, 0, `${name} animates during keyboard selection`);
				await force(selector, null);
				continue;
			}
			assert(active.animations.length > 0, `${name} has no ${pseudo} gesture`);
			assert(active.animations.every(animation => animation.iterations === 1));
			await run(`document.querySelector(${JSON.stringify(selector)}).querySelector('[data-icon-gesture]').getAnimations({subtree:true}).forEach(animation=>{animation.pause();animation.currentTime=Number(animation.effect.getTiming().duration)/2;});true`);
			const middle = await state();
			assert.deepEqual(middle.box, idle.box, `${name} moved its control`);
			assert.notDeepEqual(middle.parts, idle.parts, `${name} has no visible part movement`);
			const frame = { download: 1, terminal: 2, external: 2, archive: 1, camera: 0 }[name];
			if (frame !== undefined) assert.deepEqual(middle.parts[frame], idle.parts[frame], `${name} moved its tray or frame`);
			for (const node of ({ pullRequest: [0, 1, 2], branch: [1, 2], merge: [0, 1] }[name] ?? [])) assert.deepEqual(middle.parts[node], idle.parts[node], `${name} moved its fixed node`);
			for (const node of ({ signIn: [2], schedule: [1, 2, 3, 4, 5], inbox: [1, 2], usage: [0] }[name] ?? [])) assert.deepEqual(middle.parts[node], idle.parts[node], `${name} moved its navigation frame`);
			gestures[name] = active.animations.map(animation => animation.name);
			await force(selector, null);
		}
		samples[name] = await run(`(()=>{const svg=document.querySelector(${JSON.stringify(selector)}).querySelector('[data-icon-gesture]'),copy=svg.cloneNode(true),box=svg.getBoundingClientRect();copy.setAttribute('style','width:'+box.width+'px;height:'+box.height+'px');return copy.outerHTML;})()`);
		await force(selector, "hover");
		await run(`(()=>{const control=document.querySelector(${JSON.stringify(selector)});if(control.tagName==='BUTTON')control.disabled=true;else control.setAttribute('aria-disabled','true');})()`);
		assert.equal((await state()).animations.length, 0, `${name} animates when disabled`);
		await run(`document.querySelector(${JSON.stringify(selector)}).removeAttribute('disabled');document.querySelector(${JSON.stringify(selector)}).removeAttribute('aria-disabled');true`);
		for (const reduced of [false, true]) {
			await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }] });
			await run(`document.documentElement.dataset.animations='${reduced ? "on" : "off"}'`);
			const quiet = await state();
			assert.equal(quiet.animations.filter(animation => animation.name).length, 0, `${name} ignores ${reduced ? "reduced motion" : "Animations off"}: ${JSON.stringify(quiet)}`);
			assert.deepEqual(quiet.parts, idle.parts, `${name} retains a gesture pose with motion disabled`);
		}
		await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
		await run("document.documentElement.dataset.animations='on'");
		await force(selector, null);
		if (name === "pin") await capture("after-actions");
		if (name === "external") await capture("after-browser");
		if (name === "merge") await capture("git-actions");
	}
	assert.equal(pullWrites, 0);
	console.log("GIT_ACTION_GESTURES", JSON.stringify({ fixedNodes: true, pullRequestWrites: pullWrites }));
	if (output) writeFileSync(path.join(output, "icon-gestures.json"), JSON.stringify({ samples, gestures }, null, 2));
	await closeMenu();
	// Copy feedback still changes to a check. The fixture never touches the person's clipboard.
	await run("Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async text=>{window.__fixtureCopied=text;}});document.querySelector('main button[aria-label=Copy]').click();true");
	await ready("!!document.querySelector('main button[aria-label=Copied]')");
	assert.equal(await run("window.__fixtureCopied"), "Owned fixture conversation.");
	owner.setSize(1040, 800);
	await run("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
	assert(await run("(()=>{const form=document.querySelector('main form').getBoundingClientRect();return form.left>=0&&form.right<=innerWidth&&form.bottom<=innerHeight;})()"));
	await capture("minimum-width");
	// Factory's real menus and open-thread controls use the shared gestures; no GitHub action is submitted.
	owner.setSize(1280, 900);
	for (const [kind, status, names] of [["issue", "open", ["complete", "notPlanned"]], ["issue", "closed", ["issue"]], ["pull", "open", ["draftPullRequest", "closePullRequest", "merge"]], ["pull", "draft", ["issue", "closePullRequest"]]]) {
		console.log("Composer fixture: Factory actions", kind, status);
		await configureFactory(kind, status);
		await run("document.documentElement.dataset.animations='on'");
		for (const name of ["thread", "open"]) {
			const selector = `main button:has(> [data-icon-gesture="${name}"])`;
			for (const pseudo of ["hover", "focus-visible"]) {
				await force(selector, pseudo);
				assert(await run(`document.querySelector(${JSON.stringify(selector)}).querySelector('svg').getAnimations({subtree:true}).length>0`), `Factory ${name} lacks ${pseudo}`);
			}
			await force(selector, null);
		}
		if (kind === "issue" && status === "open") await capture("after-factory");
		await run("Array.from(document.querySelectorAll('main button')).find(button=>button.textContent.includes('GitHub')).click();true");
		await ready("!!document.querySelector('[role=menu]')");
		await run("document.querySelector('[role=menu]').getAnimations().forEach(animation=>animation.finish());document.querySelector('[role=menu]').focus();document.querySelectorAll('[role=menuitem][data-highlighted]').forEach(item=>item.removeAttribute('data-highlighted'));true");
		for (const name of names) {
			const selector = `[role=menuitem]:has(> [data-icon-gesture="${name}"])`;
			for (const pseudo of ["hover", "focus-visible"]) {
				await force(selector, pseudo);
				assert(await run(`document.querySelector(${JSON.stringify(selector)}).querySelector('svg').getAnimations({subtree:true}).length>0`), `Factory ${name} lacks ${pseudo}`);
			}
			await force(selector, null);
		}
		if (kind === "issue" && status === "open") await capture("after-factory-menu");
		if (kind === "pull") {
			await closeMenu();
			await run("Array.from(document.querySelectorAll('main button,main a')).find(element=>element.textContent==='Activity').click();true");
			await ready("!!document.querySelector('main textarea[placeholder^=\"Leave a comment\"]')");
			await ready("!!document.querySelector('main button [data-icon-gesture=retry]')");
			const retry = 'main button:has(> [data-icon-gesture="retry"])';
			await force(retry, "hover");
			assert(await run(`document.querySelector(${JSON.stringify(retry)}).querySelector('svg').getAnimations({subtree:true}).length>0`), "Factory retry lacks a gesture");
			await force(retry, null);
			await run("(()=>{const area=document.querySelector('main textarea[placeholder^=\"Leave a comment\"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(area,'Owned review draft.');area.dispatchEvent(new Event('input',{bubbles:true}));Array.from(document.querySelectorAll('main button')).find(button=>button.textContent==='Review').click();})()");
			await ready("!!document.querySelector('[role=menuitem] [data-icon-gesture=approve]')");
			await run("document.querySelector('[role=menu]').getAnimations().forEach(animation=>animation.finish());document.querySelector('[role=menu]').focus();true");
			for (const name of ["approve", "requestChanges", "comment"]) {
				const selector = `[role=menuitem]:has(> [data-icon-gesture="${name}"])`;
				await force(selector, "hover");
				assert(await run(`document.querySelector(${JSON.stringify(selector)}).querySelector('svg').getAnimations({subtree:true}).length>0`), `Factory review ${name} lacks a gesture`);
				await force(selector, null);
			}
		}
	}
	await closeMenu();
	await run("Array.from(document.querySelectorAll('main button')).find(button=>button.textContent.includes('Open thread')).click();true");
	await ready("!!document.querySelector('main form [data-composer-icon]')");
	assert.equal(openedItemThreads, 1); assert.equal(factoryWrites, 0);
	console.log("FACTORY_ACTION_GESTURES", JSON.stringify({ states: 4, openedItemThreads, factoryWrites }));
	await configureFactory();
	await capture("after-panels");
	for (const [name, labels] of [["sidebarLeft", ["Hide sidebar", "Show sidebar"]], ["sidebarRight", ["Show panel", "Hide panel"]]]) {
		const selector = `header button:has([data-icon-gesture="${name}"])`;
		for (const label of labels) {
			await ready(`document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-label')===${JSON.stringify(label)}`);
			assert.equal(await run(`document.querySelector(${JSON.stringify(selector)}+' svg').dataset.open`), String(label.startsWith("Hide")));
			for (const pseudo of ["hover", "focus-visible"]) {
				await force(selector, pseudo);
				assert(await run(`document.querySelector(${JSON.stringify(selector)}+' svg').getAnimations({subtree:true}).some(animation=>animation.animationName==='icon-panel-nudge')`), `${name} lacks ${pseudo}`);
			}
			await force(selector, null);
			await run(`document.querySelector(${JSON.stringify(selector)}).click();true`);
		}
	}
	await run("document.querySelector('header button[aria-label=\"Show panel\"]').click();true");
	await ready("document.querySelector('header [data-icon-gesture=sidebarRight]')?.dataset.open==='true'");
	await run("document.querySelectorAll('header .gesture-icon').forEach(svg=>svg.getAnimations({subtree:true}).forEach(animation=>animation.finish()));true");
	await capture("after-panels-open");
	console.log("SIDEBAR_ICON_GESTURES", JSON.stringify({ sides: 2, states: 2, hoverAndFocus: true, toggles: true }));
	await configure({ status: "completed" });
	await ready("document.querySelector('header button[aria-label=Back]')?.disabled && document.querySelector('header button[aria-label=Forward]')?.disabled");
	await capture("after-navigation-disabled");
	for (const direction of ["back", "forward"]) {
		const selector = `header button:has([data-icon-gesture="${direction}"])`;
		await force(selector, "hover");
		assert.equal(await run(`document.querySelector(${JSON.stringify(selector)}+' svg').getAnimations({subtree:true}).length`), 0);
		await force(selector, null);
	}
	await run("Array.from(document.querySelectorAll('aside button')).find(button=>button.textContent.includes('New chat')).click();true");
	await ready("document.querySelector('header button[aria-label=Back]')?.disabled===false");
	await navigationGesture('header button:has([data-icon-gesture="back"])');
	await capture("after-navigation-back");
	await run("document.querySelector('header button[aria-label=Back]').click();true");
	await ready("document.querySelector('aside [aria-current=page]')?.textContent.includes('Owned main') && document.querySelector('header button[aria-label=Forward]')?.disabled===false");
	await navigationGesture('header button:has([data-icon-gesture="forward"])');
	await capture("after-navigation-forward");
	await run("document.querySelector('header button[aria-label=Forward]').click();true");
	await ready("!document.querySelector('aside [aria-current=page]') && document.querySelector('header button[aria-label=Forward]')?.disabled");
	console.log("NAVIGATION_ACTION_GESTURES", JSON.stringify({ surfaces: 2, directions: 2, hoverAndFocus: true, disabledStill: true, historyRoundTrip: true }));
	async function utilityIcons(page, prefix, verify) {
		console.log("Composer fixture: utility icons", prefix);
		await configure({ status: "completed", project: true });
		await run("localStorage.setItem('phaseo.desktop.usageView','\"cost\"');localStorage.setItem('phaseo.desktop.fileWrap','false');localStorage.setItem('phaseo.desktop.diffWrap','false');localStorage.setItem('phaseo.desktop.fileExplorerOpen','false');localStorage.removeItem('phaseo.desktop.rightPanelState');true");
		await owner.loadFile(page);
		await ready("!!document.querySelector('aside button[aria-label=\"Scheduled tasks\"]')");
		const pose = selector => run(`(async()=>{const svg=document.querySelector(${JSON.stringify(selector)}+' svg');await Promise.all(svg.getAnimations({subtree:true}).map(animation=>animation.finished));return Array.from(svg.children).map(part=>({x:parseFloat(getComputedStyle(part).translate)||0,scale:parseFloat(getComputedStyle(part).scale)||1,opacity:Number(getComputedStyle(part).opacity)}));})()`);
		async function hover(selector, expected) {
			const point = await run(`(()=>{const box=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:box.x+box.width/2,y:box.y+box.height/2};})()`);
			await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
			assert.deepEqual((await pose(selector)).map(part => part.x), expected);
			assert.deepEqual((await pose(selector)).map(part => part.x), expected, "Hover pose does not hold");
			await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
			assert((await pose(selector)).every(part => part.x === 0), "Hover pose does not return");
		}
		await run("document.querySelector('aside button[aria-label=\"Scheduled tasks\"]').click();true");
		await ready("!!document.querySelector('[data-scheduled-task]')");
		await capture(`${prefix}-run`);
		if (verify) {
			await hover('[data-scheduled-task="owned-schedule-0"] button:has([data-icon-gesture="play"])', [1]);
			await hover('[data-scheduled-task="owned-schedule-1"] button:has([data-icon-gesture="play"])', [0]);
		}
		await run("document.querySelector('aside button[aria-label=Usage]').click();true");
		await ready("!!document.querySelector('[data-usage-page] button[aria-label^=\"Filter:\"]')");
		await capture(`${prefix}-filter`);
		if (verify) {
			const selector = '[data-usage-page] button[aria-label^="Filter:"]';
			await hover(selector, [0, 1, -1]);
			for (const reduced of [false, true]) {
				await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }] });
				await run(`document.documentElement.dataset.animations='${reduced ? "on" : "off"}'`);
				await hover(selector, [0, 0, 0]);
			}
			await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
			await run("document.documentElement.dataset.animations='on'");
		}
		for (const surface of ["file", "diff"]) {
			await run(`localStorage.setItem('phaseo.desktop.selectedTask','"main"');localStorage.setItem('phaseo.desktop.workspaceMode','"code"');localStorage.setItem('phaseo.desktop.codeView','"threads"');localStorage.setItem('phaseo.desktop.rightPanelState',${JSON.stringify(JSON.stringify({ main: { tabs: [surface === "file" ? "file:owned.txt" : "diff"], active: surface === "file" ? "file:owned.txt" : "diff" } }))});localStorage.setItem('phaseo.desktop.rightPanel','"restore"');true`);
			await owner.loadFile(page);
			const selector = `button[aria-label="Enable ${surface === "file" ? "word wrap" : "line wrapping"}"]`;
			await ready(`!!document.querySelector(${JSON.stringify(selector)})`);
			await capture(`${prefix}-${surface}-straight`);
			const control = surface === "file" ? 'button[aria-label$="word wrap"]' : 'button[aria-label$="line wrapping"]';
			for (const preference of verify ? ["normal", "reduced", "off"] : ["normal"]) {
				await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: preference === "reduced" ? "reduce" : "no-preference" }] });
				await run(`document.documentElement.dataset.animations='${preference === "off" ? "off" : "on"}';document.querySelector(${JSON.stringify(control)}).click();true`);
				await ready(`document.querySelector(${JSON.stringify(control)})?.getAttribute('aria-pressed')==='true'`);
				if (verify) {
					const wrapped = await pose(control);
					assert(Math.abs(wrapped[1].scale - 0.5) < 0.001 && Math.abs(wrapped[2].scale - 1 / 3) < 0.001 && wrapped[3].opacity === 1);
					assert.equal(await run(`localStorage.getItem('phaseo.desktop.${surface}Wrap')`), "true");
				}
				if (preference === "normal") await capture(`${prefix}-${surface}-wrapped`);
				await run(`document.querySelector(${JSON.stringify(control)}).click();true`);
				await ready(`document.querySelector(${JSON.stringify(control)})?.getAttribute('aria-pressed')==='false'`);
				if (verify) { const straight = await pose(control); assert(straight[1].scale === 1 && straight[2].scale === 1 && straight[3].opacity === 0); }
			}
		}
		await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
		await run("document.documentElement.dataset.animations='on'");
	}
	if (baseline) await utilityIcons(baseline, "before-utility", false);
	await utilityIcons(renderer, "after-utility", true);
	console.log("UTILITY_ICON_GESTURES", JSON.stringify({ runAndFilterHold: true, disabledRunStill: true, wrapSurfaces: 2, reverseStates: true, motionPreferences: true }));
	}
	async function paletteIcons(page, prefix, verify) {
		console.log("Composer fixture: palette icons", prefix);
		projects = [{ id: "fixture", name: "Owned project", directory: path.join(app.getPath("userData"), "owned-project"), createdAt: now }];
		await configure({ status: "completed", project: true });
		tasks[0].operator = { subscriptions: [], held: [], paused: undefined };
		await run("localStorage.setItem('phaseo.desktop.workspaceMode','\"code\"');localStorage.setItem('phaseo.desktop.codeView','\"threads\"');true");
		await owner.loadFile(page);
		await ready("!!document.querySelector('main form')");
		const open = async () => { await run("Array.from(document.querySelectorAll('header button')).find(button=>button.textContent.includes('Search chats and commands')).click();true"); await ready("!!document.querySelector('[cmdk-list] [role=option]')"); await run("document.querySelector('[role=dialog]').getAnimations().forEach(animation=>animation.finish());true"); };
		await open(); await ready("!!document.querySelector('[cmdk-list] [role=option] [data-icon-gesture=editor], [cmdk-list] [role=option] .lucide-square-code')"); await capture(`${prefix}-palette`);
		if (!verify) return;
		const rows = await run(`Array.from(document.querySelectorAll('.desktop-command-palette [role=option]')).filter(row=>['Actions','This chat','Open project','Comparisons'].includes(row.closest('[cmdk-group]').querySelector('[cmdk-group-heading]')?.textContent)).map((row,index)=>{row.dataset.fixturePalette=String(index);return {index,label:row.textContent,name:row.querySelector('.gesture-icon')?.dataset.iconGesture,disabled:row.getAttribute('data-disabled')==='true'};})`);
		assert(rows.length >= 30, "Palette fixture is missing default/contextual actions");
		for (const row of rows) {
			assert(row.name, `Static palette action icon: ${row.label}`);
			const selector = `[data-fixture-palette="${row.index}"]`;
			await run(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'});true`);
			await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
			await force(selector, "focus-visible");
			await run(`document.querySelector(${JSON.stringify(selector)}).setAttribute('data-selected','true');true`);
			const state = () => run(`(()=>{const row=document.querySelector(${JSON.stringify(selector)}),svg=row.querySelector('.gesture-icon');return {box:row.getBoundingClientRect().toJSON(),transform:getComputedStyle(svg).transform,parts:Array.from(svg.children).map(part=>{const style=getComputedStyle(part);return [Array.from(new DOMMatrixReadOnly(style.transform).toFloat64Array()),style.translate,style.strokeDashoffset,style.opacity];}),animations:svg.getAnimations({subtree:true}).map(animation=>({name:animation.animationName??animation.transitionProperty,iterations:animation.effect.getTiming().iterations}))};})()`);
			const idle = await state();
			assert.equal(idle.animations.length, 0, `${row.label} animates during keyboard selection`);
			await force(selector, null);
			const point = await run(`(()=>{const box=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:box.x+box.width/2,y:box.y+box.height/2};})()`);
			await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
			if (row.disabled) { assert.equal((await state()).animations.length, 0); continue; }
			await run(`document.querySelector(${JSON.stringify(selector)}+' .gesture-icon').getAnimations({subtree:true}).forEach(animation=>{animation.pause();animation.currentTime=110;});true`);
			const active = await state();
			assert(active.animations.length > 0, `${row.label} has no hover gesture`);
			assert(active.animations.every(animation => animation.iterations === 1), `${row.label} repeats its gesture`);
			assert.notDeepEqual(active.parts, idle.parts, `${row.label} does not visibly animate`);
			assert.deepEqual(active.box, idle.box, `${row.label} moves its row`); assert.equal(active.transform, "none");
			if (row.name === "limits") {
				for (const [fraction, angle, dash] of [[0, 75, 0], [0.36, undefined, undefined], [0.7, -165, 1], [1, 0, 0]]) {
					const gauge = await run(`(()=>{const svg=document.querySelector(${JSON.stringify(selector)}+' svg');svg.getAnimations({subtree:true}).forEach(animation=>{if(Number(animation.effect.getTiming().duration)!==880)throw Error('Gauge sequence duration overridden');animation.currentTime=880*${fraction};});const matrix=new DOMMatrixReadOnly(getComputedStyle(svg.querySelector('[data-gauge-needle]')).transform),fill=getComputedStyle(svg.querySelector('[data-gauge-fill]'));return {angle:Math.atan2(matrix.b,matrix.a)*180/Math.PI,dash:parseFloat(fill.strokeDashoffset),opacity:Number(fill.opacity)};})()`);
					if (angle !== undefined) assert(Math.abs(gauge.angle - angle) < 0.01 && Math.abs(gauge.dash - dash) < 0.01, `Palette gauge misses its endpoint: ${JSON.stringify(gauge)}`);
					else assert(gauge.dash > 0 && gauge.dash < 1, "Palette gauge skips partial fill");
					if (fraction < 0.76) assert(Math.abs(gauge.angle - (75 - 240 * gauge.dash)) < 0.01, "Palette needle and arc disagree");
					if (fraction === 1) assert.equal(gauge.opacity, 0, "Palette gauge does not reset while hovered");
				}
			}
			if (["inbox", "keyboard"].includes(row.name)) {
				await run(`document.querySelector(${JSON.stringify(selector)}+' svg').getAnimations({subtree:true}).forEach(animation=>{const timing=animation.effect.getTiming();if(Number(timing.duration)!==${row.name === "inbox" ? 480 : 140})throw Error('Miniature sequence duration overridden');animation.currentTime=Number(timing.delay)+Number(timing.duration);});true`);
				assert.deepEqual((await state()).parts, idle.parts, `${row.label} does not return to rest while hovered`);
			}
			await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
			await run(`Promise.all(document.querySelector(${JSON.stringify(selector)}+' .gesture-icon').getAnimations({subtree:true}).map(animation=>animation.finished)).then(()=>true)`);
			assert.deepEqual((await state()).parts, idle.parts, `${row.label} does not return after hover`);
		}
		await run("document.querySelector('.desktop-command-palette [cmdk-input]').focus();true");
		await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 });
		await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 });
		assert.equal(await run("Array.from(document.querySelectorAll('.desktop-command-palette .gesture-icon')).flatMap(svg=>svg.getAnimations({subtree:true})).length"), 0, "Arrow-key selection animates palette icons");
		const selector = '.desktop-command-palette [role=option]:has([data-icon-gesture=bot])';
		for (const reduced of [false, true]) {
			await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }] });
			await run(`document.documentElement.dataset.animations='${reduced ? "on" : "off"}'`);
			await force(selector, "hover");
			assert.equal(await run(`document.querySelector(${JSON.stringify(selector)}+' .gesture-icon').getAnimations({subtree:true}).length`), 0);
			await force(selector, null);
		}
		await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
		await run("document.documentElement.dataset.animations='on'");
		await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
		await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
		await ready("!document.querySelector('.desktop-command-palette')");
		tasks[0].operator.paused = { reason: "manual", summary: "Owned fixture pause" };
		await owner.loadFile(page); await ready("!!document.querySelector('main form')"); await open();
		assert(await run("!!document.querySelector('.desktop-command-palette [role=option] [data-icon-gesture=play]')"), "Resume operator is missing its animated glyph");
		const resume = '.desktop-command-palette [role=option]:has([data-icon-gesture=play])';
		const point = await run(`(()=>{const row=document.querySelector(${JSON.stringify(resume)});row.scrollIntoView({block:'center'});const box=row.getBoundingClientRect();return {x:box.x+box.width/2,y:box.y+box.height/2};})()`);
		await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
		const resumeOffset = () => run(`(async()=>{const svg=document.querySelector(${JSON.stringify(resume)}+' svg');await Promise.all(svg.getAnimations({subtree:true}).map(animation=>animation.finished));return parseFloat(getComputedStyle(svg.firstElementChild).translate)||0;})()`);
		assert.equal(await resumeOffset(), 1);
		await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
		assert.equal(await resumeOffset(), 0);
		await run("localStorage.setItem('phaseo.desktop.workspaceMode','\"chat\"');true");
		await owner.loadFile(page); await ready("!!document.querySelector('main form')"); await open();
		const codeRow = '.desktop-command-palette [role=option]:has([data-icon-gesture=code])';
		await ready(`!!document.querySelector(${JSON.stringify(codeRow)})`);
		await run(`document.querySelector(${JSON.stringify(codeRow)}).scrollIntoView({block:'center'});true`);
		await force(codeRow, "hover");
		for (const [fraction, opacity] of [[0.05, [0, 0, 0, 1]], [0.25, [0, 1, 0, 1]], [0.55, [0, 1, 1, 1]], [1, [1, 1, 1, 0]]]) {
			const code = await run(`(()=>{const svg=document.querySelector(${JSON.stringify(codeRow)}+' svg');svg.getAnimations({subtree:true}).forEach(animation=>{if(Number(animation.effect.getTiming().duration)!==480)throw Error('Typing sequence duration overridden');animation.pause();animation.currentTime=480*${fraction};});return Array.from(svg.children).map(part=>({opacity:Number(getComputedStyle(part).opacity),stroke:getComputedStyle(part).stroke}));})()`);
			assert.deepEqual(code.map(part => part.opacity), opacity, "Palette Code does not type in order");
			assert(code.every(part => part.stroke === code[0].stroke), "Palette Code is not monochrome");
		}
		await force(codeRow, null);
		console.log("PALETTE_ICON_GESTURES", JSON.stringify({ rows: rows.length, allActionIcons: true, hover: true, keyboardStill: true, disabledStill: true, motionPreferences: true, resumeGlyph: true, fullToEmpty: true, typedCode: true }));
	}
	if (baseline) await paletteIcons(baseline, "before", false);
	await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
	await paletteIcons(renderer, "after", true);
	owner.webContents.debugger.detach();
	if (!paletteOnly) console.log("COMPOSER_ACTIONS_SMOKE", JSON.stringify({ surfaces: 3, deliveryDefaults: 2, primaryAndAlternate: true, idleSend: true, stopWithEmptyDraft: true, unsupportedSteeringQueues: true, queueEdit: true, questionAnswer: true, keyboardAndIME: true, svgTraces: true, actionGestures: gestures, boundedGestures: true, stationaryControls: true, copyFeedback: true, stationaryWindowControls: true, animationsOff: true, reducedMotion: true, minimumWidth: true, inferenceCalls: 0, packaged: Boolean(entry) }));
	clearTimeout(deadline); app.exit(0);
} catch (error) { console.error(error); app.exit(1); } });
