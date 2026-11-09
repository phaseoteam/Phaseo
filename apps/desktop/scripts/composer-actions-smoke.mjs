import assert from "node:assert/strict";
import { once, EventEmitter } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, ipcMain } from "electron";

app.setPath("userData", mkdtempSync(path.join(tmpdir(), "phaseo-composer-actions-")));
const entry = process.argv.find(value => value.startsWith("--app-entry="))?.slice(12);
await import(entry ? pathToFileURL(path.resolve(entry)).href : "../dist/main/index.mjs");
const deadline = setTimeout(() => { console.error("Composer fixture deadline"); app.exit(1); }, 90_000);
deadline.unref();

app.whenReady().then(async () => { try {
	console.log("Composer fixture: app ready");
	const owner = BrowserWindow.getAllWindows()[0];
	owner.hide(); owner.setSize(1280, 900); owner.webContents.setBackgroundThrottling(false);
	if (owner.webContents.isLoading()) await once(owner.webContents, "did-finish-load");
	const run = code => owner.webContents.executeJavaScript(code);
	const ready = predicate => run(`new Promise((resolve,reject)=>{const check=()=>{if((${predicate})){observer.disconnect();clearTimeout(timer);resolve(true);}};const observer=new MutationObserver(check);observer.observe(document,{subtree:true,childList:true,characterData:true,attributes:true});const timer=setTimeout(()=>{observer.disconnect();reject(Error('Missing UI milestone: '+${JSON.stringify(predicate)}));},10000);check();})`);
	const originalPreferences = await run("window.phaseoDesktop.workspace.preferences()");
	console.log("Composer fixture: preferences ready");
	let preferences = originalPreferences.preferences;
	let tasks, revision = 0;
	const commands = new EventEmitter();
	const calls = [];
	const overview = () => ({ version: 1, projects: [], accounts: [], agents: [], mcpConnections: [], tasks: tasks.map(({ messages, queue, ...task }) => ({ ...task, queueCount: queue.length, approvalsCount: 0, answersCount: 0, steeringReviewCount: 0, attentionKey: "fixture" })) });
	const mock = (channel, handler) => { ipcMain.removeHandler(channel); ipcMain.handle(channel, handler); };
	mock("workspace:preferences", () => ({ ...originalPreferences, preferences }));
	mock("workspace:overview", overview);
	mock("workspace:task", (_event, id) => tasks.find(task => task.id === id));
	mock("workspace:conversation-page", (_event, query) => ({ kind: query.kind, entries: query.kind === "messages" ? tasks.find(task => task.id === query.taskId).messages : [], earlier: 0, later: 0, revision }));
	mock("workspace:models", () => []);
	mock("workspace:background-commands", () => []);
	mock("workspace:account-status", () => ({ checkedAt: new Date().toISOString(), authenticated: false, usage: [] }));
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
	const makeTask = (id, status, harness = "phaseo") => ({ id, title: `Owned ${id}`, harness, model: "default", mode: "chat", status, pinned: false, archived: false, revision, queue: [], messages: [{ id: `${id}-assistant`, role: "assistant", text: "Owned fixture conversation.", createdAt: new Date().toISOString() }], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
	async function configure({ surface = "main", status = "running", followUp = "queue", harness = "phaseo", draft = "Consider the smaller option.", queued = false, question = false, sendKey = "enter" } = {}) {
		revision++;
		tasks = [makeTask("main", status, harness), makeTask("side", status, harness)];
		tasks[1].delegation = { parentTaskId: "main", kind: "side" };
		if (queued) tasks[0].queue = [{ id: "queued", text: "An earlier follow-up.", createdAt: new Date().toISOString() }];
		if (question) tasks[0].questions = [{ id: "request", questions: [{ id: "direction", header: "Direction", question: "Which option should I use?", options: [] }] }];
		preferences = { ...originalPreferences.preferences, chat: { ...originalPreferences.preferences.chat, followUp } };
		await run(`localStorage.setItem('phaseo.desktop.selectedTask','"main"');localStorage.setItem('phaseo.desktop.workspaceMode','"chat"');localStorage.setItem('phaseo.desktop.theme','"dark"');localStorage.removeItem('phaseo.desktop.rightPanel');localStorage.removeItem('phaseo.desktop.selectedCompare');localStorage.setItem('phaseo.desktop.messageDrafts',${JSON.stringify(JSON.stringify({ main: draft, side: draft }))});localStorage.setItem('phaseo.desktop.compareGroups',${JSON.stringify(JSON.stringify([{ id: "pair", title: "Owned comparison", taskIds: ["main", "side"], createdAt: new Date().toISOString() }]))});localStorage.setItem('phaseo.desktop.compareDrafts',${JSON.stringify(JSON.stringify({ pair: draft }))});${surface === "compare" ? "localStorage.setItem('phaseo.desktop.selectedCompare','\"pair\"');" : ""}true`);
		await run(`localStorage.setItem('phaseo.desktop.sendKey',${JSON.stringify(sendKey)})`);
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
	const capture = async name => { if (output) { await run("document.fonts.ready"); writeFileSync(path.join(output, name + ".png"), (await owner.webContents.capturePage()).toPNG()); } };
	async function clickDelivery(root, label, type, count = 1) {
		const first = calls.length;
		const delivery = once(commands, "delivery");
		await run(`document.querySelector(${JSON.stringify(`${root} button[aria-label="${label}"]`)}).click()`);
		await delivery;
		await ready(`document.querySelector(${JSON.stringify(`${root} [contenteditable]`)}).value === ''`);
		assert.equal(calls.length - first, count);
		for (const call of calls.slice(first)) assert.equal(call.type, type);
	}
	const baseline = process.argv.find(value => value.startsWith("--baseline-renderer="))?.slice(20);
	if (baseline) {
		await configure(); await owner.loadFile(baseline);
		await ready("!!document.querySelector('main button[aria-label=Stop]')");
		await capture("before");
	}
	// The same visible actions submit the intended command in every composer surface, under either default.
	for (const surface of ["main", "side", "compare"]) for (const followUp of ["queue", "steer"]) {
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
	owner.webContents.debugger.attach("1.3");
	const cdp = (method, params = {}) => owner.webContents.debugger.sendCommand(method, params);
	await cdp("DOM.enable"); await cdp("CSS.enable");
	await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
	const force = async (selector, pseudo) => { const { root } = await cdp("DOM.getDocument"); const { nodeId } = await cdp("DOM.querySelector", { nodeId: root.nodeId, selector }); assert(nodeId, selector); await cdp("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: pseudo ? [pseudo] : [] }); };
	for (const action of ["send", "queue", "steer"]) {
		await configure({ status: action === "send" ? "completed" : "running", followUp: action === "steer" ? "steer" : "queue" });
		await run("document.documentElement.dataset.animations='on'");
		const selector = `main button[type=submit]`;
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
	owner.setSize(1040, 800);
	await run("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
	assert(await run("(()=>{const form=document.querySelector('main form').getBoundingClientRect();return form.left>=0&&form.right<=innerWidth&&form.bottom<=innerHeight;})()"));
	await capture("minimum-width");
	owner.webContents.debugger.detach();
	console.log("COMPOSER_ACTIONS_SMOKE", JSON.stringify({ surfaces: 3, deliveryDefaults: 2, primaryAndAlternate: true, idleSend: true, stopWithEmptyDraft: true, unsupportedSteeringQueues: true, queueEdit: true, questionAnswer: true, keyboardAndIME: true, svgTraces: true, stationaryWindowControls: true, animationsOff: true, reducedMotion: true, minimumWidth: true, inferenceCalls: 0, packaged: Boolean(entry) }));
	clearTimeout(deadline); app.exit(0);
} catch (error) { console.error(error); app.exit(1); } });
