// Load test: many chats streaming at once in the demo, driven over DevTools. Start the gateway and the demo first:
//   node scripts/fixtures/load-gateway.mjs --port=8787 --seconds=40
//   pnpm exec electron scripts/ui-preview.mjs --demo --gateway=http://127.0.0.1:8787/v1
// then: node scripts/parallel-load.mjs <chat count> <code count> [seconds]. It reports how many ran at once, the
// main process's response time, the window's frame times and memory.
import { execFileSync } from "node:child_process";
const [chats = 50, codes = 50, seconds = 55] = process.argv.slice(2, 5).map(Number), statsUrl = process.argv[5] ?? "http://127.0.0.1:8787/stats";
const port = process.env.CDP_PORT ?? "9333";
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find(target => target.type === "page" && !target.url.startsWith("devtools"));
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener("open", resolve, { once: true }));
let next = 0; const pending = new Map();
socket.addEventListener("message", event => { const message = JSON.parse(event.data); pending.get(message.id)?.(message); pending.delete(message.id); });
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++next; pending.set(id, message => message.error ? reject(new Error(message.error.message)) : resolve(message.result)); socket.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => { const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text); return result.result.value; };
const memory = () => { try { return JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-Command", "Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | Where-Object { $_.CommandLine -like '*ui-preview*' -or $_.CommandLine -like '*phaseo-ui-preview*' } | ForEach-Object { $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; [pscustomobject]@{ type = ([regex]::Match($_.CommandLine,'--type=(\\S+)').Groups[1].Value); mb = [int]($p.WorkingSet64/1MB); cpu = [math]::Round($p.CPU,1) } } | ConvertTo-Json -Compress"]).toString()); } catch { return []; } };

const setup = await evaluate(`(async () => {
	const api = window.phaseoDesktop.workspace, known = new Set((await api.overview()).tasks.map(task => task.id)), ids = [];
	const create = async command => { const state = await api.command(command); const id = state.tasks.find(task => !known.has(task.id)).id; known.add(id); ids.push(id); };
	for (let i = 0; i < ${chats}; i++) await create({ type: "create-task", harness: "phaseo", accountId: "phaseo-account", model: "openai/gpt-6.1-sol", mode: "chat" });
	for (let i = 0; i < ${codes}; i++) await create({ type: "create-task", harness: "phaseo", accountId: "phaseo-account", model: "openai/gpt-6.1-sol", mode: "code", projectId: "phaseo", permissionMode: "full-access" });
	window.__loadIds = ids;
	// Watch the most recent Chat chat stream, as a person would.
	window.__frames = []; let last = performance.now(); const frame = () => { const now = performance.now(); window.__frames.push(now - last); last = now; if (!window.__loadDone) requestAnimationFrame(frame); }; requestAnimationFrame(frame);
	return ids.length;
})()`);
console.log(`created ${setup} chats`);
const memoryBefore = memory();
const sent = await evaluate(`(async () => { const api = window.phaseoDesktop.workspace, t = performance.now(); await Promise.all(window.__loadIds.map(id => api.command({ type: "send", id, text: "Write a long answer about streaming." }))); return Math.round(performance.now() - t); })()`);
console.log(`sent to all in ${sent} ms`);
await evaluate(`(() => { const row = [...document.querySelectorAll("aside [role=button]")].find(node => /Write a long answer/.test(node.textContent)); row?.click(); return Boolean(row); })()`);

const samples = [], gateway = [], started = Date.now();
let peakMemory = memoryBefore;
while (Date.now() - started < seconds * 1000) {
	const sample = await evaluate(`(async () => { const t = performance.now(); const overview = await window.phaseoDesktop.workspace.overview(); const rtt = performance.now() - t; const mine = overview.tasks.filter(task => window.__loadIds.includes(task.id)); return { rtt, running: mine.filter(task => task.status === "running").length, done: mine.filter(task => task.status === "completed").length, failed: mine.filter(task => task.status === "failed" || task.error).length }; })()`);
	samples.push({ at: Date.now() - started, ...sample });
	try { gateway.push(await (await fetch(statsUrl)).json()); } catch { /* the gateway may not be running */ }
	if (samples.length % 20 === 10) { const now = memory(); if (now.reduce((sum, row) => sum + row.mb, 0) > peakMemory.reduce((sum, row) => sum + row.mb, 0)) peakMemory = now; }
	await new Promise(resolve => setTimeout(resolve, 250));
}
const frames = await evaluate(`(() => { window.__loadDone = true; return window.__frames.slice(1); })()`);
const failures = await evaluate(`(async () => (await window.phaseoDesktop.workspace.overview()).tasks.filter(task => window.__loadIds.includes(task.id) && task.status !== "completed").map(task => task.status).reduce((counts, status) => ({ ...counts, [status]: (counts[status] ?? 0) + 1 }), {}))()`);
const pick = (values, q) => { const sorted = [...values].sort((a, b) => a - b); return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0); };
const rtts = samples.map(sample => sample.rtt), last = gateway.at(-1) ?? {};
console.log(JSON.stringify({
	chats: setup, sentMs: sent,
	peakRunning: Math.max(...samples.map(sample => sample.running)), finished: samples.at(-1)?.done, notFinished: failures,
	gateway: { peakOpenStreams: last.peak, started: last.started, finished: last.finished, firstByteMedianMs: pick(last.firstByteMs ?? [0], 0.5) },
	mainProcessResponse: { p50: pick(rtts, 0.5), p95: pick(rtts, 0.95), max: pick(rtts, 1) },
	windowFrames: { count: frames.length, p50: pick(frames, 0.5), p95: pick(frames, 0.95), max: pick(frames, 1), over50ms: frames.filter(frame => frame > 50).length },
	memoryMb: { before: memoryBefore.reduce((sum, row) => sum + row.mb, 0), peak: peakMemory.reduce((sum, row) => sum + row.mb, 0), byProcess: peakMemory },
	timeline: samples.filter((_, index) => index % 8 === 0).map(sample => `${(sample.at / 1000).toFixed(0)}s running ${sample.running} done ${sample.done} rtt ${Math.round(sample.rtt)}`),
}, null, 1));
socket.close();
