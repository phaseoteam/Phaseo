// The app under measurement: the built desktop app on a copied fixture profile, timed from the moment run.mjs spawned
// it. Started by run.mjs, never by hand: electron scripts/perf/perf-app.mjs --profile=<dir> --scenario=<name> --out=<file>
//   startup       launch marks, first paint, interactive, memory and idle CPU, then quit
//   interactions  startup, then opening chats, scrolling, typing, switching modes, searching and IPC reads
//   load          startup, then stays open with DevTools on --port for parallel-load.mjs
// --cpu-profile=<dir> saves main-startup.cpuprofile and renderer-startup.cpuprofile (spawn to interactive); open them in
// DevTools Performance, or summarise them with scripts/perf/profile-summary.mjs.
// Input goes through webContents.sendInputEvent, so the window sees trusted events, as it would from a person.
import { app, BrowserWindow, ipcMain } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import inspector from "node:inspector/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { demoId, fixtureModels } from "../fixtures/previewWorkspace.mjs";
import { javascriptLiteral } from "../javascript-literal.mjs";

const entered = Date.now();
const argument = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const profile = path.resolve(argument("profile", "")), scenario = argument("scenario", "startup"), out = argument("out", "");
const spawned = Number(process.env.PHASEO_PERF_SPAWNED_AT) || entered;
if (!argument("profile", "")) throw new Error("--profile is required");
app.setPath("userData", profile);
// Covered windows still render, so frame timings don't depend on what else is on screen.
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
if (scenario === "load") app.commandLine.appendSwitch("remote-debugging-port", argument("port", "9333"));

// Profiling starts before the main bundle loads, so its own evaluation is in the profile.
const profiles = argument("cpu-profile", "") && path.resolve(argument("cpu-profile", ""));
const mainProfiler = profiles ? new inspector.Session() : undefined;
if (mainProfiler) { mainProfiler.connect(); await mainProfiler.post("Profiler.enable"); await mainProfiler.post("Profiler.setSamplingInterval", { interval: 250 }); await mainProfiler.post("Profiler.start"); }

const marks = { spawned, entered };
const mark = name => { marks[name] ??= Date.now(); };
app.once("ready", () => mark("appReady"));
app.on("browser-window-created", (_event, window) => {
	mark("windowCreated");
	window.once("ready-to-show", () => mark("readyToShow"));
	window.once("show", () => mark("shown"));
	window.webContents.once("did-finish-load", () => mark("didFinishLoad"));
	if (profiles && !window.webContents.debugger.isAttached()) {
		window.webContents.debugger.attach("1.3");
		void window.webContents.debugger.sendCommand("Profiler.enable").then(() => window.webContents.debugger.sendCommand("Profiler.setSamplingInterval", { interval: 250 })).then(() => window.webContents.debugger.sendCommand("Profiler.start"));
	}
});
const fail = error => { console.error(error); if (out) writeFileSync(out, JSON.stringify({ scenario, error: String(error?.stack ?? error) })); app.exit(1); };
process.on("unhandledRejection", fail);
setTimeout(() => fail(new Error(`The ${scenario} scenario did not finish in 10 minutes.`)), 600_000).unref();

// The app's own entry (package.json "main"), or another build's with PHASEO_PERF_ENTRY (A/B runs of two builds).
const entry = process.env.PHASEO_PERF_ENTRY ? path.resolve(process.env.PHASEO_PERF_ENTRY) : path.join(import.meta.dirname, "../..", JSON.parse(readFileSync(path.join(import.meta.dirname, "../../package.json"), "utf8")).main);
const imported = Date.now();
await import(pathToFileURL(entry).href);
marks.mainImportMs = Date.now() - imported;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const replace = (channel, handler) => { ipcMain.removeHandler(channel); ipcMain.handle(channel, handler); };
// Fixed models and no local agents: nothing reads the network or starts other programs, so runs compare.
const models = fixtureModels();
// Electron opens no window until this script has finished loading, so the measuring waits for ready.
app.whenReady().then(measure).catch(fail);

/** Per-process memory and CPU from Electron, summed by process type. Private bytes on Windows, working set elsewhere. */
const memory = () => {
	const rows = app.getAppMetrics().map(row => ({ type: row.type === "Tab" ? "Renderer" : row.type, privateMb: (row.memory.privateBytes ?? row.memory.workingSetSize) / 1024, workingSetMb: row.memory.workingSetSize / 1024, cpu: row.cpu.percentCPUUsage }));
	const byType = {};
	for (const row of rows) { const entry = byType[row.type] ??= { count: 0, privateMb: 0, workingSetMb: 0 }; entry.count++; entry.privateMb += row.privateMb; entry.workingSetMb += row.workingSetMb; }
	for (const entry of Object.values(byType)) { entry.privateMb = Math.round(entry.privateMb); entry.workingSetMb = Math.round(entry.workingSetMb); }
	return { totalPrivateMb: Math.round(rows.reduce((sum, row) => sum + row.privateMb, 0)), totalWorkingSetMb: Math.round(rows.reduce((sum, row) => sum + row.workingSetMb, 0)), byType };
};
/** CPU over a quiet stretch, as a share of one core, summed over every process of the app. */
const idleCpu = async ms => {
	app.getAppMetrics();
	const started = process.cpuUsage(), from = Date.now();
	await sleep(ms);
	const rows = app.getAppMetrics(), main = process.cpuUsage(started), byType = {};
	for (const row of rows) { const type = row.type === "Tab" ? "Renderer" : row.type; byType[type] = +((byType[type] ?? 0) + row.cpu.percentCPUUsage).toFixed(2); }
	// percentCPUUsage is since the previous getAppMetrics call. process.cpuUsage covers every thread of the main process
	// (Chromium's browser threads too), so it can pass 100% of one core.
	return { allProcessesPercent: +rows.reduce((sum, row) => sum + row.cpu.percentCPUUsage, 0).toFixed(2), byType, mainProcessThreadsPercent: +((main.user + main.system) / 1000 / (Date.now() - from) * 100).toFixed(2) };
};

async function measure() {
	replace("workspace:models", () => models); replace("workspace:refresh-models", () => models);
	replace("workspace:installations", () => []); replace("workspace:connected-harnesses", () => []);
	let window;
	for (let attempt = 0; attempt < 600 && !(window = BrowserWindow.getAllWindows()[0]); attempt++) await sleep(25);
	if (!window) throw new Error("The desktop window did not open.");
	const contents = window.webContents;
	if (contents.isLoading()) await new Promise(resolve => contents.once("did-finish-load", resolve));
	const run = code => contents.executeJavaScript(code, true);

	// The page's side of the measurements: renderer marks, long tasks, frames and input timestamps.
	const probe = `(() => {
		if (window.__perf) return;
		const longTasks = [], inputs = [];
		try { new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push({ start: entry.startTime, duration: entry.duration }); }).observe({ type: "longtask", buffered: true }); } catch {}
		for (const type of ["pointerdown", "keydown", "wheel"]) addEventListener(type, event => inputs.push({ type, at: event.timeStamp }), { capture: true, passive: true });
		const frame = () => new Promise(resolve => requestAnimationFrame(() => resolve(performance.now())));
		window.__perf = {
			frame,
			begin() { this.t0 = performance.now(); this.inputFrom = inputs.length; },
			// Resolves on the first frame after predicate() holds: from the input's own timestamp when there was one.
			async until(predicate, timeout = 30000) {
				const deadline = performance.now() + timeout;
				while (!predicate()) { if (performance.now() > deadline) throw new Error("timed out waiting for " + predicate); await frame(); }
				await frame(); const done = await frame();
				const input = inputs.slice(this.inputFrom)[0], start = input ? Math.min(input.at, this.t0) : this.t0;
				const tasks = longTasks.filter(task => task.start + task.duration >= start && task.start <= done);
				return { ms: +(done - start).toFixed(1), longTasks: tasks.length, longestTaskMs: Math.round(Math.max(0, ...tasks.map(task => task.duration))) };
			},
			// Frame gaps and long tasks while run() drives the page.
			async frames(run) {
				const gaps = [], from = performance.now(); let last, going = true;
				// The first callback only sets the clock: its timestamp is the frame start, which can be before from.
				const tick = now => { if (last !== undefined) gaps.push(now - last); last = now; if (going) requestAnimationFrame(tick); };
				requestAnimationFrame(tick);
				await run(); going = false; await frame();
				const tasks = longTasks.filter(task => task.start >= from);
				return { gaps, longTasks: tasks.length, longTaskMs: Math.round(tasks.reduce((sum, task) => sum + task.duration, 0)) };
			},
			keyLatencies: [],
			watchKeys() { this.keyLatencies = []; this.offKeys?.(); const onKey = event => { const at = event.timeStamp; requestAnimationFrame(() => setTimeout(() => this.keyLatencies.push(performance.now() - at))); }; addEventListener("keydown", onKey, true); this.offKeys = () => removeEventListener("keydown", onKey, true); },
		};
	})()`;
	await run(probe);

	// Interactive: the workspace has loaded and the sidebar and the main pane have drawn.
	const interactive = await run(`(async () => {
		const ready = () => performance.getEntriesByName("phaseo:workspace-ready").length > 0 && document.querySelector("aside") && document.querySelector("main");
		await window.__perf.until(ready, 60000);
		const nav = performance.getEntriesByType("navigation")[0], paint = name => performance.getEntriesByName(name)[0]?.startTime, at = value => value === undefined ? undefined : performance.timeOrigin + value;
		return { timeOrigin: performance.timeOrigin, domContentLoaded: at(nav?.domContentLoadedEventEnd), loadEvent: at(nav?.loadEventEnd), firstPaint: at(paint("first-paint")), firstContentfulPaint: at(paint("first-contentful-paint")),
			renderStart: at(performance.getEntriesByName("phaseo:render-start")[0]?.startTime), workspaceReady: at(performance.getEntriesByName("phaseo:workspace-ready")[0]?.startTime), interactive: performance.timeOrigin + performance.now(),
			longTasks: performance.getEntriesByType("longtask").length };
	})()`);
	// Every launch mark as milliseconds after the spawn.
	const since = value => value === undefined ? undefined : Math.round(value - spawned);
	const startup = {
		electronBootMs: since(marks.entered), mainImportMs: marks.mainImportMs, appReadyMs: since(marks.appReady), windowCreatedMs: since(marks.windowCreated),
		rendererProcessMs: since(interactive.timeOrigin), domContentLoadedMs: since(interactive.domContentLoaded), firstPaintMs: since(interactive.firstPaint), firstContentfulPaintMs: since(interactive.firstContentfulPaint),
		readyToShowMs: since(marks.readyToShow), shownMs: since(marks.shown), renderStartMs: since(interactive.renderStart), workspaceReadyMs: since(interactive.workspaceReady), interactiveMs: since(interactive.interactive),
		startupLongTasks: interactive.longTasks,
	};
	if (profiles) {
		mkdirSync(profiles, { recursive: true });
		writeFileSync(path.join(profiles, "main-startup.cpuprofile"), JSON.stringify((await mainProfiler.post("Profiler.stop")).profile));
		writeFileSync(path.join(profiles, "renderer-startup.cpuprofile"), JSON.stringify((await contents.debugger.sendCommand("Profiler.stop")).profile));
	}
	await sleep(3000);
	const result = { scenario, startup, memoryAfterStartup: memory() };
	// With --cpu-profile the quiet stretch is profiled too (main-idle.cpuprofile): what runs when nobody does anything.
	if (profiles) await mainProfiler.post("Profiler.start");
	result.idleCpu = await idleCpu(Number(argument("idle-ms", "10000")));
	if (profiles) writeFileSync(path.join(profiles, "main-idle.cpuprofile"), JSON.stringify((await mainProfiler.post("Profiler.stop")).profile));

	if (scenario === "load") {
		contents.setBackgroundThrottling(false);
		console.log(`PERF_READY ${JSON.stringify(result)}`);
	} else {
		if (scenario === "interactions") result.interactions = await interactions();
		result.memoryAtEnd = memory();
		if (out) writeFileSync(out, JSON.stringify(result));
		app.exit(0);
	}

	async function interactions() {
		const results = {};
		const lit = javascriptLiteral;
		const measure = async (name, action, predicate, timeout) => {
			await run("window.__perf.begin()");
			await action();
			const value = await run(`window.__perf.until(() => (${predicate}), ${timeout ?? 30000})`);
			(results[name] ??= []).push(value);
			return value;
		};
		const center = async selector => run(`(() => { const node = document.querySelector(${lit(selector)}); if (!node) return null; const box = node.getBoundingClientRect(); return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + Math.min(box.height / 2, 200)) }; })()`);
		const click = async selector => { const point = await center(selector); if (!point) throw new Error(`nothing matches ${selector}`); contents.sendInputEvent({ type: "mouseDown", ...point, button: "left", clickCount: 1 }); contents.sendInputEvent({ type: "mouseUp", ...point, button: "left", clickCount: 1 }); };
		const key = (keyCode, modifiers = []) => { contents.sendInputEvent({ type: "keyDown", keyCode, modifiers }); contents.sendInputEvent({ type: "keyUp", keyCode, modifiers }); };
		const type = async (text, gap = 35) => { for (const char of text) { contents.sendInputEvent({ type: "keyDown", keyCode: char }); contents.sendInputEvent({ type: "char", keyCode: char }); contents.sendInputEvent({ type: "keyUp", keyCode: char }); await sleep(gap); } };
		const open = id => () => contents.send("workspace:open-task", id);
		// A chat has opened when its last turn has drawn its reply.
		const opened = lastUserId => `document.querySelector('[data-conversation-id="turn:${lastUserId}"]')`;
		window.focus(); contents.focus();

		// Opening chats, small to huge; each twice, from another chat, so the second is the warm path.
		const chats = [["small", "stress-5", "s5-u8"], ["long2000Turns", "stress-long-chat", "long-u2000"], ["code600Turns", "stress-long-code", "code-u600"], ["answer400Kb", "stress-huge-answer", "huge-u"], ["pasted300Turns", "stress-pasted", "paste-u300"]];
		for (let round = 0; round < 2; round++) for (const [label, name, last] of chats) {
			// From another small chat: opening "no chat" isn't a thing the window does, so it would only wait out its timeout.
			await measure("openOther", open(demoId("stress-7")), opened("s7-u10"));
			await measure(`openChat.${label}.${round ? "warm" : "cold"}`, open(demoId(name)), opened(last), 60_000);
			await sleep(300);
		}
		// Switching between two chats back and forth, as when comparing answers.
		for (let index = 0; index < 10; index++) {
			const [name, last] = index % 2 ? ["stress-long-chat", "long-u2000"] : ["stress-7", "s7-u10"];
			await measure("switchChat", open(demoId(name)), opened(last));
		}

		// Scrolling up through the 2,000-turn chat (pages load as it goes) and back down.
		await measure("openChat.forScroll", open(demoId("stress-long-chat")), opened("long-u2000"));
		await sleep(500);
		const viewport = await center("[data-conversation-viewport]");
		const wheel = async (deltaY, ms) => { const end = Date.now() + ms; while (Date.now() < end) { contents.sendInputEvent({ type: "mouseWheel", ...viewport, deltaX: 0, deltaY, wheelTicksY: Math.sign(deltaY), canScroll: true }); await sleep(16); } };
		await run("window.__scrollRun = window.__perf.frames(() => new Promise(resolve => window.__scrollDone = resolve)); true");
		await wheel(240, 4000); await wheel(-240, 2000);
		await run("window.__scrollDone(); true");
		results.scrollLongChat = await run("window.__scrollRun.then(value => ({ ...value, turnsMounted: document.querySelectorAll('[data-turn-id]').length }))");

		// Typing in the composer with the long chat open: key to next frame for each key.
		await click("[contenteditable=true]");
		await sleep(300);
		// Stored on the page and not returned, so executeJavaScript doesn't wait for the run to end.
		await run("window.__perf.watchKeys(); window.__typingRun = window.__perf.frames(() => new Promise(resolve => window.__typingDone = resolve)); true");
		await type("The quick brown fox jumps over the lazy dog while the model streams its answer");
		await run("window.__typingDone(); true");
		results.typing = { ...await run("window.__typingRun"), keyLatencies: await run("window.__perf.keyLatencies") };
		for (let index = 0; index < 90; index++) key("Backspace");
		await sleep(300);

		// Switching to Code (the Code sidebar draws every active Code chat) and back to Chat.
		for (let round = 0; round < 3; round++) {
			await measure("switchToCode", () => key("2", ["control", "alt"]), `document.querySelector("aside [data-row-id]")`);
			results.codeRowsMounted = await run(`document.querySelectorAll("aside [data-row-id]").length`);
			await sleep(300);
			await measure("switchToChat", () => key("1", ["control", "alt"]), `document.querySelector("aside [data-chat-count]")`);
			await sleep(300);
		}

		// The command palette, then message search across the whole history.
		for (let round = 0; round < 3; round++) {
			await measure("openPalette", () => key("K", ["control"]), `document.querySelector("[cmdk-input]")`);
			await measure("paletteMessageSearch", () => type("failover", 25), `document.querySelector('[cmdk-item][data-value^="message "]')`);
			key("Escape"); await sleep(400);
		}

		// What the window asks the main process for, timed from the page.
		results.ipc = await run(`(async () => {
			const api = window.phaseoDesktop.workspace, time = async (count, call) => { const values = []; for (let index = 0; index < count; index++) { const started = performance.now(); await call(); values.push(performance.now() - started); } return values; };
			return {
				overview: await time(20, () => api.overview()),
				taskHistoryAll: await time(5, () => api.taskHistory({ query: "", archived: false, offset: 0, limit: 50 })),
				taskHistorySearch: await time(5, () => api.taskHistory({ query: "failover", archived: false, offset: 0, limit: 50 })),
				taskHistoryNoMatch: await time(5, () => api.taskHistory({ query: "zzqx-no-such-text", archived: false, offset: 0, limit: 50 })),
				searchMessages: await time(5, () => api.searchMessages({ query: "failover", limit: 20 })),
				searchMessagesNoMatch: await time(5, () => api.searchMessages({ query: "zzqx-no-such-text", limit: 20 })),
				conversationPage: await time(10, () => api.conversationPage({ taskId: ${lit(demoId("stress-long-chat"))}, kind: "messages", limit: 50 })),
				task: await time(5, () => api.task(${lit(demoId("stress-long-code"))})),
			};
		})()`);
		results.memoryAfterInteractions = memory();
		return results;
	}
}
