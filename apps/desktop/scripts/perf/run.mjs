// The desktop performance suite: startup, interactions, parallel streaming, the store and the bundle, measured on the
// built app with fixture workspaces, written as report.json, report.md and report.html (charts).
//
//   pnpm --filter @phaseo/desktop perf [options]
//     --only=startup,interactions,load,store,bundle   sections to run (default: all)
//     --runs=5              launches per startup profile, each on a fresh copy and again on one reused profile
//     --baseline=<file>     an earlier report.json to compare with; worse metrics are marked and listed
//     --threshold=10        percent change that counts as worse or better
//     --skip-build          measure the current dist/ without building
//     --stress=2000         chats of history in the stress profile
//     --load=25,25,40       Chat chats, Code chats and seconds for the parallel streaming load
//     --out=<dir>           where the report goes (default output/perf/<time>)
//     --fail-on-regression  exit 1 when any metric is worse than the baseline
//     --strict              exit 1 when a section failed or a baseline metric is missing (CI: no incomplete baselines)
//     --real-home           let the app read this machine's home folder (Claude Code and Codex transcripts, agent
//                           settings); by default each launch gets an empty home, so runs compare across machines
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { compare, markdown, summary } from "./report.mjs";
import { html } from "./report-html.mjs";

const desktop = path.resolve(import.meta.dirname, "../..");
const argument = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const flag = name => process.argv.includes(`--${name}`);
const sections = argument("only", "startup,interactions,load,store,bundle").split(",");
const runs = Number(argument("runs", "5")), threshold = Number(argument("threshold", "10")), stressChats = Number(argument("stress", "2000"));
const [loadChats, loadCodes, loadSeconds] = argument("load", "25,25,40").split(",").map(Number);
const gatewayPort = 8797, gateway = `http://127.0.0.1:${gatewayPort}/v1`;
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const out = path.resolve(argument("out", path.join(desktop, "output", "perf", stamp)));
mkdirSync(out, { recursive: true });
const electron = createRequire(path.join(desktop, "package.json"))("electron");
const log = text => console.log(`[perf] ${text}`);
const startedAt = new Date().toISOString();

if (!flag("skip-build")) {
	log("building the app");
	const build = spawnSync("pnpm run build", { cwd: desktop, stdio: "inherit", shell: true });
	if (build.status !== 0) throw new Error("The build failed.");
}
if (!existsSync(path.join(desktop, "dist/main/index.mjs"))) throw new Error("dist/ is missing: build first or drop --skip-build.");

const metrics = [], notes = [], raw = {};
const add = (group, name, unit, values, better = "lower", note) => { const value = summary(Array.isArray(values) ? values : [values]); if (value) metrics.push({ group, name, unit, summary: value, better, ...(note ? { note } : {}) }); };

// Template profiles, seeded once and copied for each launch.
const templates = path.join(out, "templates");
const template = kind => {
	const directory = path.join(templates, kind);
	if (existsSync(directory)) return directory;
	const seeded = spawnSync(electron, [path.join(import.meta.dirname, "seed.mjs"), directory, kind, gateway, String(stressChats)], { cwd: desktop, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, encoding: "utf8" });
	if (seeded.status !== 0) throw new Error(`Seeding ${kind} failed:\n${seeded.stdout}\n${seeded.stderr}`);
	log(seeded.stdout.trim());
	return directory;
};
const copy = kind => { const directory = mkdtempSync(path.join(os.tmpdir(), `phaseo-perf-${kind}-`)); cpSync(template(kind), directory, { recursive: true }); return directory; };
const remove = directory => { try { rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows may still hold a file for a moment */ } };

/** Launches perf-app.mjs and resolves with its result. For "load" it resolves when the window is ready, with the child. */
function launch(profile, scenario, extra = []) {
	const file = path.join(out, `result-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.json`);
	const env = { ...process.env, PHASEO_PERF_SPAWNED_AT: String(Date.now()) };
	if (!flag("real-home")) {
		const home = path.join(profile, "home"), roaming = path.join(home, "AppData", "Roaming"), local = path.join(home, "AppData", "Local");
		mkdirSync(roaming, { recursive: true }); mkdirSync(local, { recursive: true });
		// Windows' own AppData folders, inside the empty home too: on CI runners Electron can't resolve them otherwise.
		env.HOME = env.USERPROFILE = home; env.APPDATA = roaming; env.LOCALAPPDATA = local;
	}
	delete env.ELECTRON_RUN_AS_NODE;
	const child = spawn(electron, [path.join(import.meta.dirname, "perf-app.mjs"), `--profile=${profile}`, `--scenario=${scenario}`, `--out=${file}`, ...extra], { cwd: desktop, env, stdio: ["ignore", "pipe", "pipe"] });
	let output = "";
	return new Promise((resolve, reject) => {
		child.stdout.on("data", chunk => {
			output += chunk;
			const ready = /PERF_READY (.*)/.exec(output);
			if (scenario === "load" && ready) resolve({ child, result: JSON.parse(ready[1]) });
		});
		child.stderr.on("data", chunk => { output += chunk; });
		child.on("exit", code => {
			if (scenario === "load") { reject(new Error(`The app exited (${code}) before it was ready:\n${output.slice(-3000)}`)); return; }
			if (!existsSync(file)) { reject(new Error(`perf-app exited ${code} without a result:\n${output.slice(-3000)}`)); return; }
			const result = JSON.parse(readFileSync(file, "utf8")); rmSync(file);
			if (result.error) reject(new Error(result.error)); else resolve(result);
		});
	});
}

const startupNames = [["electronBootMs", "Electron boot to the main script"], ["mainImportMs", "Main bundle load"], ["appReadyMs", "App ready"], ["windowCreatedMs", "Window created"], ["rendererProcessMs", "Renderer started"],
	["domContentLoadedMs", "Renderer HTML parsed"], ["firstPaintMs", "First paint"], ["renderStartMs", "React render starts"], ["workspaceReadyMs", "Workspace loaded"], ["readyToShowMs", "Window shown"], ["interactiveMs", "Interactive"]];
const memoryMetrics = (group, label, samples) => {
	add(group, `${label}: all processes`, "MB", samples.map(sample => sample.totalPrivateMb));
	for (const type of ["Browser", "Renderer", "GPU", "Utility"]) add(group, `${label}: ${type === "Browser" ? "main" : type.toLowerCase()} process${type === "Utility" ? "es" : ""}`, "MB", samples.map(sample => sample.byType[type]?.privateMb).filter(value => value !== undefined));
};

if (sections.includes("startup")) for (const kind of ["empty", "standard", "stress"]) {
	const label = { empty: "first launch, no chats", standard: "a few chats", stress: `${stressChats.toLocaleString("en-US")} chats` }[kind];
	const cold = [], warm = [];
	for (let run = 0; run < runs; run++) {
		const profile = copy(kind);
		log(`startup ${kind} fresh copy ${run + 1}/${runs}`);
		// Idle CPU is read on the first launch only; it takes ten seconds.
		try { cold.push(await launch(profile, "startup", [`--idle-ms=${run === 0 ? 10000 : 0}`])); } finally { remove(profile); }
	}
	// The same profile again and again: Chromium's code cache and the OS file cache are warm, as on most launches.
	const profile = copy(kind);
	try {
		for (let run = 0; run <= runs; run++) {
			log(`startup ${kind} reused profile ${run + 1}/${runs + 1}`);
			const result = await launch(profile, "startup", ["--idle-ms=0"]);
			if (run > 0) warm.push(result);
		}
	} finally { remove(profile); }
	raw[`startup.${kind}`] = { cold, warm };
	for (const [key, name] of startupNames) add(`Startup (${label}), new profile`, name, "ms", cold.map(result => result.startup[key]));
	for (const [key, name] of startupNames) add(`Startup (${label}), returning`, name, "ms", warm.map(result => result.startup[key]));
	add(`Startup (${label}), returning`, "Long tasks before interactive", "count", warm.map(result => result.startup.startupLongTasks));
	memoryMetrics(`Memory (${label})`, "3 s after startup", [...cold, ...warm].map(result => result.memoryAfterStartup));
	add(`Memory (${label})`, "Idle CPU, all processes, 10 s after startup", "%", cold[0].idleCpu.allProcessesPercent);
	add(`Memory (${label})`, "Idle CPU, main process", "%", cold[0].idleCpu.byType?.Browser ?? 0);
	add(`Memory (${label})`, "Idle CPU, renderer", "%", cold[0].idleCpu.byType?.Renderer ?? 0);
	add(`Memory (${label})`, "Idle CPU, GPU process", "%", cold[0].idleCpu.byType?.GPU ?? 0);
}

if (sections.includes("interactions")) {
	const profile = copy("stress");
	log("interactions on the stress profile");
	let result;
	try { result = await launch(profile, "interactions", ["--idle-ms=0"]); } finally { remove(profile); }
	raw.interactions = result.interactions;
	const i = result.interactions, group = `Interactions (${stressChats.toLocaleString("en-US")} chats)`;
	const ms = name => (i[name] ?? []).map(value => value.ms);
	for (const [key, name] of [["small", "small chat"], ["long2000Turns", "2,000-turn chat"], ["code600Turns", "600-turn Code chat"], ["answer400Kb", "chat with a 400 KB answer"], ["pasted300Turns", "300 turns of pasted files"]]) {
		add(group, `Open ${name}, first time`, "ms", ms(`openChat.${key}.cold`));
		add(group, `Open ${name}, again`, "ms", ms(`openChat.${key}.warm`));
	}
	add(group, "Switch between two chats", "ms", ms("switchChat"));
	add(group, "Longest task while opening the 400 KB answer", "ms", [...i["openChat.answer400Kb.cold"] ?? [], ...i["openChat.answer400Kb.warm"] ?? []].map(value => value.longestTaskMs));
	add(group, "Switch to Code", "ms", ms("switchToCode"), "lower", `${i.codeRowsMounted} Code rows mounted`);
	add(group, "Switch to Chat", "ms", ms("switchToChat"));
	add(group, "Open the command palette", "ms", ms("openPalette"));
	add(group, "Palette: message results after typing", "ms", ms("paletteMessageSearch"));
	const scroll = i.scrollLongChat;
	add(group, "Scroll the long chat: frame time", "ms", scroll.gaps, "lower", `${scroll.gaps.length} frames, ${scroll.turnsMounted} turns mounted after`);
	add(group, "Scroll the long chat: frames over 33 ms", "frames", scroll.gaps.filter(gap => gap > 33).length);
	add(group, "Scroll the long chat: long-task time", "ms", scroll.longTaskMs);
	add(group, "Typing: key to next frame", "ms", i.typing.keyLatencies, "lower", `${i.typing.keyLatencies.length} keys, long chat open`);
	add(group, "Typing: frames over 33 ms", "frames", i.typing.gaps.filter(gap => gap > 33).length);
	for (const [key, name] of [["overview", "Chat list (overview)"], ["taskHistoryAll", "History page"], ["taskHistorySearch", "History search, matching"], ["taskHistoryNoMatch", "History search, no match"], ["searchMessages", "Message search, matching"], ["searchMessagesNoMatch", "Message search, no match"], ["conversationPage", "Conversation page (50 messages)"], ["task", "Whole 600-turn Code chat"]]) add("Main process reads (IPC round trip)", name, "ms", i.ipc[key]);
	memoryMetrics(group, "after the interactions", [i.memoryAfterInteractions]);
}

if (sections.includes("load")) {
	const profile = copy("standard");
	log(`parallel load: ${loadChats} Chat + ${loadCodes} Code chats streaming for ${loadSeconds} s`);
	const gatewayProcess = spawn(process.execPath, [path.join(desktop, "scripts/fixtures/load-gateway.mjs"), `--port=${gatewayPort}`, `--seconds=${Math.max(10, loadSeconds - 10)}`], { cwd: desktop, stdio: "ignore" });
	let app;
	try {
		// A port nothing else answers on, so parallel-load drives this window and not another app's.
		const port = await new Promise(resolve => { const server = createServer().listen(0, "127.0.0.1", () => { const value = server.address().port; server.close(() => resolve(value)); }); });
		app = await launch(profile, "load", ["--idle-ms=0", `--port=${port}`]);
		const load = spawnSync(process.execPath, [path.join(desktop, "scripts/parallel-load.mjs"), String(loadChats), String(loadCodes), String(loadSeconds), `http://127.0.0.1:${gatewayPort}/stats`], { cwd: desktop, env: { ...process.env, CDP_PORT: String(port) }, encoding: "utf8", timeout: (loadSeconds + 180) * 1000 });
		const start = load.stdout.indexOf("\n{");
		if (start < 0) throw new Error(`parallel-load printed no result (exit ${load.status}): ${(load.stdout + load.stderr).slice(-1500)}`);
		const result = JSON.parse(load.stdout.slice(start + 1));
		raw.load = result;
		const group = `Parallel streaming (${loadChats} Chat + ${loadCodes} Code chats)`;
		add(group, "Chats finished", "count", result.finished ?? 0, "higher", `of ${result.chats}`);
		add(group, "Peak running at once", "count", result.peakRunning, "higher");
		add(group, "Send to every chat", "ms", result.sentMs);
		add(group, "Main process response: p50", "ms", result.mainProcessResponse.p50);
		add(group, "Main process response: p95", "ms", result.mainProcessResponse.p95);
		add(group, "Window frame time: p95", "ms", result.windowFrames.p95);
		add(group, "Window frames over 50 ms", "frames", result.windowFrames.over50ms);
		add(group, "Main process memory before (working set)", "MB", result.memoryMb.before);
		add(group, "Main process memory at peak (working set)", "MB", result.memoryMb.peak);
	} catch (error) { notes.push(`Parallel load failed: ${String(error.message ?? error).slice(-1200)}`); }
	finally { app?.child.kill(); gatewayProcess.kill(); await new Promise(resolve => setTimeout(resolve, 1500)); remove(profile); }
}

if (sections.includes("store")) {
	log("store load test (vitest)");
	const file = path.join(out, "store-bench.json");
	const bench = spawnSync("pnpm exec vitest run src/main/storeLoad.bench.test.ts", { cwd: desktop, env: { ...process.env, STORE_BENCH: "1", STORE_BENCH_JSON: file }, encoding: "utf8", shell: true, timeout: 1_800_000 });
	if (existsSync(file)) {
		const result = JSON.parse(readFileSync(file, "utf8"));
		raw.store = result;
		const group = "Store under load (8 streams into long chats, history of 2,000)";
		// "seed" is setting the history up, not something the app does while used.
		// The bench writes its file even when it fails: the workload (no operations) or a later check (operations).
		if (!result.operations || bench.status !== 0 || bench.error) notes.push(`Store load test ${result.operations ? "failed a check" : "did not finish"} (exit ${bench.status}${bench.error ? `, ${bench.error.message}` : ""}): ${(bench.stderr || bench.stdout || "").slice(-400)}`);
		for (const [name, stats] of Object.entries(result.operations ?? {})) if (name !== "seed") add(group, name, "ms", stats.p50, "lower", `p95 ${stats.p95} ms, ${stats.n} calls`);
		add(group, "Main-thread share for 8 streams", "%", result.mainThreadPercent);
		add(group, "WAL written per flush", "KB", result.walKbPerFlush);
		add(group, "Database on disk", "MB", result.diskMb);
	} else notes.push(`Store load test wrote no results (exit ${bench.status}): ${(bench.stderr || bench.stdout).slice(-400)}`);
}

if (sections.includes("bundle")) {
	const files = (directory, pattern) => existsSync(directory) ? readdirSync(directory, { recursive: true }).map(name => path.join(directory, String(name))).filter(name => pattern.test(name) && statSync(name).isFile()) : [];
	const size = list => list.reduce((sum, name) => { const data = readFileSync(name); return { raw: sum.raw + data.length, gzip: sum.gzip + gzipSync(data).length, brotli: sum.brotli + brotliCompressSync(data).length }; }, { raw: 0, gzip: 0, brotli: 0 });
	const renderer = path.join(desktop, "dist/renderer"), html = readFileSync(path.join(renderer, "index.html"), "utf8");
	// What the window loads before it can draw: the entry script, its preloaded chunks and the stylesheets.
	const initial = [...html.matchAll(/(?:src|href)="\.?\/?([^"]+\.(?:js|css))"/g)].map(match => path.join(renderer, match[1])).filter(existsSync);
	const js = files(renderer, /\.js$/), css = files(renderer, /\.css$/), main = files(path.join(desktop, "dist/main"), /\.m?js$/);
	const kb = value => Math.round(value / 1024);
	const group = "Bundle";
	const all = size(js), first = size(initial), styles = size(css), mainSize = size(main);
	add(group, "Renderer JavaScript, all chunks", "KB", kb(all.raw), "lower", `${js.length} files, ${kb(all.gzip)} KB gzip`);
	add(group, "Loaded before first paint", "KB", kb(first.raw), "lower", `${initial.length} files, ${kb(first.gzip)} KB gzip`);
	add(group, "Stylesheets", "KB", kb(styles.raw), "lower", `${kb(styles.gzip)} KB gzip`);
	add(group, "Main process bundle", "KB", kb(mainSize.raw), "lower", `${main.length} files`);
	raw.bundle = { renderer: all, initial: first, initialFiles: initial.map(name => path.relative(renderer, name)), css: styles, main: mainSize };
}

const commit = (() => { try { return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: desktop, encoding: "utf8" }).trim() + (execFileSync("git", ["status", "--porcelain", "--", "."], { cwd: desktop, encoding: "utf8" }).trim() ? " (with local changes)" : ""); } catch { return "unknown"; } })();
const machine = `${os.cpus()[0]?.model.trim()} (${os.cpus().length} threads), ${Math.round(os.totalmem() / 1024 ** 3)} GB RAM, ${os.platform()} ${os.release()}, Electron ${JSON.parse(readFileSync(path.join(path.dirname(createRequire(path.join(desktop, "package.json")).resolve("electron/package.json")), "package.json"), "utf8")).version}`;
const baselineFile = argument("baseline", "");
const report = { version: 1, startedAt, finishedAt: new Date().toISOString(), commit, machine, options: { runs, threshold, stressChats, sections, load: [loadChats, loadCodes, loadSeconds], realHome: flag("real-home") }, metrics, notes, raw, ...(baselineFile ? { baselineFile } : {}) };
const baseline = baselineFile ? JSON.parse(readFileSync(path.resolve(baselineFile), "utf8")) : undefined;
const compared = baseline ? compare(report, baseline, threshold) : undefined;
const text = markdown(report, compared);
writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 1));
writeFileSync(path.join(out, "report.md"), text);
writeFileSync(path.join(out, "report.html"), html(report, compared, baseline));
rmSync(templates, { recursive: true, force: true });
console.log(`\n${text}\n`);
log(`report: ${path.join(out, "report.md")} and report.html`);
// --strict (CI): an incomplete report fails, so it never becomes the next baseline. A section that failed leaves a
// note, and a metric the baseline had but this run lacks would otherwise never be compared again.
if (flag("strict")) {
	const measured = new Set(metrics.map(metric => `${metric.group}\0${metric.name}`));
	const missing = (baseline?.metrics ?? []).filter(metric => !measured.has(`${metric.group}\0${metric.name}`)).map(metric => `${metric.group}: ${metric.name}`);
	const problems = [...notes, ...missing.length ? [`Missing from this run but in the baseline: ${missing.join("; ")}`] : []];
	if (problems.length) { console.error(`\n[perf] incomplete run (--strict):\n${problems.map(problem => `- ${problem}`).join("\n")}`); process.exit(1); }
}
if (flag("fail-on-regression") && compared?.some(metric => metric.verdict === "worse")) process.exit(1);
