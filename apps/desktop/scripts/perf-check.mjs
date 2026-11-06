// Performance check, one launch of the built app: startup, a very long chat (opening it, paging back through it, a turn
// on it) and memory in both processes. Run through scripts/perf-budget.mjs, which launches this twice on one profile
// (the first launch fills caches as an installed app's would) and compares the second with scripts/perf-budgets.json.
//   electron scripts/perf-check.mjs --profile=<dir> --out=<file.json> [--seed]
import { app, BrowserWindow } from "electron";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { Session } from "node:inspector/promises";
import { openFixtureStore } from "./fixtures/workspaceFixture.mjs";

const processStart = Date.now() - process.uptime() * 1000;
const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const profile = path.resolve(argument("profile") ?? "perf-profile"), out = argument("out"), cpuProfiles = argument("cpu-profiles");
const turns = Number(process.env.PERF_TURNS ?? 2000), stepsPerTurn = 8, smallChats = 200;
const marks = {}, mark = name => { marks[name] ??= Math.round(Date.now() - processStart); };
setTimeout(() => { console.error("PERF timed out", JSON.stringify(marks)); app.exit(1); }, 5 * 60_000).unref();

// The gateway answers every model request with a short streamed reply and records how much the app sent.
const requests = [];
const gateway = createServer((request, response) => {
	let bytes = 0; request.on("data", chunk => { bytes += chunk.length; });
	request.on("end", () => {
		if (request.method === "GET" && request.url?.startsWith("/v1/models")) { response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ object: "list", data: [{ id: "perf/model", name: "Perf model" }] })); return; }
		requests.push({ url: request.url, bytes });
		response.writeHead(200, { "content-type": "text/event-stream" });
		if (request.url?.endsWith("/responses")) {
			response.write(`event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: "Done." })}\n\n`);
			response.end(`event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: { id: "resp_perf", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Done." }] }], usage: { input_tokens: 10, output_tokens: 2 } } })}\n\n`);
		} else {
			response.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "Done." } }] })}\n\n`);
			response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 2 } })}\n\ndata: [DONE]\n\n`);
		}
	});
});
await new Promise(resolve => gateway.listen(0, "127.0.0.1", resolve));
// Only the port reaches the window's script, as a number, so no text is built into code.
const gatewayPort = Number(gateway.address().port);

const at = minutes => new Date(Date.UTC(2026, 9, 16) - minutes * 60_000).toISOString();
const answer = n => `Here is part ${n}.\n\n1. **Inputs** – what arrives.\n2. **Processing** – retries per provider.\n\n| Step | Cost |\n| --- | --- |\n| Read | $0.002 |\n\n\`\`\`ts\nexport const handle${n} = (request: Request) => route(request, { attempt: ${n} });\n\`\`\`\n\n${"Detail ".repeat(120)}`;
const output = (n, step) => `{"file":"src/module-${n}-${step}.ts","lines":[${Array.from({ length: 60 }, (_, line) => `"line ${line} of a tool result for turn ${n}"`).join(",")}]}`;
function chat(id, count, steps, age, title = `Chat ${id}`) {
	const messages = [], activities = [];
	for (let n = 1; n <= count; n++) {
		const order = n * 20, user = `${id}-u${n}`;
		messages.push({ id: user, role: "user", text: `Question ${n} about the billing export.`, createdAt: at(age + count - n), completedAt: at(age + count - n), timelineOrder: order });
		for (let step = 0; step < steps; step++) activities.push({ id: `${user}:t${step}`, type: "tool", title: "read_project_file", text: `src/module-${n}-${step}.ts\n\n${output(n, step)}`, status: "completed", timelineOrder: order + 1 + step });
		messages.push({ id: `${id}-a${n}`, role: "assistant", text: answer(n), createdAt: at(age + count - n), completedAt: at(age + count - n), timelineOrder: order + 19 });
	}
	return { id, title, accountId: "perf", harness: "phaseo", model: "perf/model", mode: "chat", status: "completed", pinned: false, archived: false, queue: [], messages, activities, createdAt: at(age + count), updatedAt: at(age) };
}

const database = path.join(profile, "workspace", "workspace.sqlite");
if (process.argv.includes("--seed")) {
	const started = Date.now();
	mkdirSync(path.dirname(database), { recursive: true });
	const raw = new DatabaseSync(database);
	raw.exec("CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
	raw.prepare("INSERT OR REPLACE INTO accounts VALUES (?, ?)").run("perf", JSON.stringify({ id: "perf", name: "Perf gateway", harness: "phaseo", kind: "api", configured: true, endpoint: "http://127.0.0.1:1/v1" }));
	raw.close();
	const store = await openFixtureStore(database);
	try {
		for (let index = 0; index < smallChats; index++) store.saveTask(chat(`small-${index}`, 2, 0, 60 + index), true);
		store.saveTask(chat("long", turns, stepsPerTurn, 1, "Very long chat"), true);
	} finally { store.close(); }
	console.log(`PERF seeded ${smallChats} chats and one of ${turns} turns in ${Date.now() - started} ms`);
}

app.setPath("userData", profile);
setFlagsFromString("--expose_gc");
const collect = runInNewContext("gc");
const mainHeapMb = () => { collect(); return Math.round(process.memoryUsage().heapUsed / 1024 / 1024); };
mark("harness start");
await import(new URL("../dist/main/start.mjs", import.meta.url).href);
mark("main loaded");
app.on("browser-window-created", () => mark("window created"));

app.whenReady().then(async () => {
	const window = BrowserWindow.getAllWindows()[0] ?? await new Promise(resolve => app.once("browser-window-created", (_event, created) => resolve(created)));
	try {
		window.setSize(1280, 860); window.webContents.setBackgroundThrottling(false);
		const run = code => window.webContents.executeJavaScript(code);
		const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
		const until = async (name, code, ms = 60_000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await run(code)) { if (name) mark(name); return true; } } catch { /* still loading */ } await pause(16); } throw new Error(`Never reached: ${name ?? code}`); };
		const debug = window.webContents.debugger; debug.attach("1.3");
		const rendererHeapMb = async () => { await debug.sendCommand("HeapProfiler.collectGarbage"); return Math.round((await debug.sendCommand("Runtime.getHeapUsage")).usedSize / 1024 / 1024); };
		const domNodes = () => run("document.getElementsByTagName('*').length");
		const row = title => `Array.from(document.querySelectorAll('[role=button][tabindex="0"]')).find(e=>e.textContent.trim()===${JSON.stringify(title)})`;

		await until("sidebar shows chats", `!!${row("Very long chat")}`);
		await until("composer ready", "!!document.querySelector('[contenteditable=true]')");
		await run(`(async()=>{await window.phaseoDesktop.workspace.command({type:'update-account',id:'perf',endpoint:'http://127.0.0.1:'+${gatewayPort}+'/v1',apiKey:'perf-key'})})()`);
		await pause(1500);
		const idle = { mainHeapMb: mainHeapMb(), rendererHeapMb: await rendererHeapMb(), domNodes: await domNodes() };

		// With --cpu-profiles=<dir>, both processes are profiled across a step, for finding what a regression spent.
		const inspector = new Session(); inspector.connect();
		const profiled = async (name, step) => {
			if (!cpuProfiles) return step();
			mkdirSync(cpuProfiles, { recursive: true });
			await inspector.post("Profiler.enable"); await inspector.post("Profiler.start"); await debug.sendCommand("Profiler.enable"); await debug.sendCommand("Profiler.start");
			try { return await step(); } finally {
				writeFileSync(path.join(cpuProfiles, `${name}-main.cpuprofile`), JSON.stringify((await inspector.post("Profiler.stop")).profile));
				writeFileSync(path.join(cpuProfiles, `${name}-window.cpuprofile`), JSON.stringify((await debug.sendCommand("Profiler.stop")).profile));
			}
		};

		// Opening the long chat: its latest page should cost the same as any chat's.
		let started = Date.now();
		await profiled("open-long", async () => {
			await run(`${row("Very long chat")}.click()`);
			await until(undefined, `(()=>{const v=document.querySelector('[data-conversation-viewport]');return !!v&&/Here is part ${turns}\\./.test(v.innerText)&&!/Loading (chat|messages)/.test(document.body.innerText)})()`);
		});
		const openMs = Date.now() - started;
		await pause(500);
		const opened = { mainHeapMb: mainHeapMb(), rendererHeapMb: await rendererHeapMb(), domNodes: await domNodes() };

		// Paging back through history: the window keeps a bounded slice, so memory and the page should stay flat.
		const pages = 30; started = Date.now(); let paged = 0;
		for (; paged < pages; paged++) {
			const clicked = await run(`(()=>{const b=Array.from(document.querySelectorAll('[data-conversation-viewport] button')).find(e=>/earlier messages/.test(e.textContent));if(!b||b.disabled)return false;b.click();return true})()`);
			if (!clicked) break;
			await until(undefined, `!Array.from(document.querySelectorAll('[data-conversation-viewport] button')).some(e=>/Loading earlier/.test(e.textContent))`);
		}
		const pageMs = paged ? Math.round((Date.now() - started) / paged) : 0;
		const pagedBack = { pages: paged, mainHeapMb: mainHeapMb(), rendererHeapMb: await rendererHeapMb(), domNodes: await domNodes() };

		// A turn on the long chat, through the gateway: how much the main process holds, and how much history it sends.
		let peakMainMb = 0; const sampler = setInterval(() => { peakMainMb = Math.max(peakMainMb, Math.round(process.memoryUsage().heapUsed / 1024 / 1024)); }, 20);
		started = Date.now();
		await profiled("turn-long", async () => {
			await run(`window.phaseoDesktop.workspace.command({type:'send',id:'long',text:'One more question.'})`);
			await until(undefined, `(async()=>{const t=(await window.phaseoDesktop.workspace.overview()).tasks.find(t=>t.id==='long');return t&&t.status!=='running'&&t.status!=='queued'&&t.status!=='starting'})()`, 120_000);
		});
		clearInterval(sampler);
		const turnStatus = await run(`(async()=>(await window.phaseoDesktop.workspace.overview()).tasks.find(t=>t.id==='long').status)()`);
		const turn = { status: turnStatus, ms: Date.now() - started, peakMainHeapMb: peakMainMb, mainHeapAfterMb: mainHeapMb(), requests: requests.length, requestKb: Math.round(requests.reduce((sum, request) => sum + request.bytes, 0) / 1024) };

		// Switching between ordinary chats after all that.
		const switches = [];
		for (const title of ["Chat small-0", "Chat small-1", "Chat small-2", "Very long chat", "Chat small-3"]) {
			started = Date.now(); await run(`${row(title)}.click()`);
			await until(undefined, `(()=>{const v=document.querySelector('[data-conversation-viewport]');return !!v&&v.innerText.trim().length>0&&!/Loading (chat|messages)/.test(document.body.innerText)})()`);
			switches.push(Date.now() - started);
		}
		const processes = app.getAppMetrics().map(metric => ({ type: metric.type, mb: Math.round(metric.memory.workingSetSize / 1024) }));
		const result = { turns, startup: marks, idle, long: { openMs, opened, pageMs, pagedBack, turn }, switchMs: switches, processes };
		if (out) { mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); writeFileSync(out, JSON.stringify(result, null, 1)); }
		console.log("PERF", JSON.stringify(result));
		app.exit(0);
	} catch (error) { console.error("PERF failed", String(error?.stack ?? error), JSON.stringify(marks)); app.exit(1); }
});
