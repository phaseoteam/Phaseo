// Performance budgets for the built desktop app, run in CI on every pull request that changes it:
//   node scripts/perf-budget.mjs [--runs=3] [--out=perf-results]
// Launches the app once to seed a profile (200 chats and one of 2,000 turns) and fill its caches, then --runs more times
// on that profile, and compares the median of each measurement with scripts/perf-budgets.mjs. Fails on any breach.
// --out keeps each run's results, and CPU profiles of the last run for finding what a regression spent.
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { budgets, deferredPackages } from "./perf-budgets.mjs";

const desktop = path.resolve(import.meta.dirname, "..");
const argument = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const runs = Number(argument("runs", "3")), out = path.resolve(argument("out", path.join(tmpdir(), "phaseo-perf-results")));
mkdirSync(out, { recursive: true });
const electron = createRequire(path.join(desktop, "package.json"))("electron");

// Measured from the build itself: these do not vary between runs.
const html = readFileSync(path.join(desktop, "dist/renderer/index.html"), "utf8");
const upfront = [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.js)"/g)].reduce((sum, [, file]) => sum + statSync(path.join(desktop, "dist/renderer", file)).size, 0);
const mainBundle = readFileSync(path.join(desktop, "dist/main/index.mjs"), "utf8");
const eager = deferredPackages.filter(name => new RegExp(`^import [^;]*from "${name.replace(/[/.]/g, "\\$&")}`, "m").test(mainBundle));

const profile = mkdtempSync(path.join(tmpdir(), "phaseo-perf-profile-"));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const launch = (name, extra = []) => {
	const file = path.join(out, `${name}.json`);
	const result = spawnSync(electron, [path.join(desktop, "scripts/perf-check.mjs"), `--profile=${profile}`, `--out=${file}`, ...extra], { cwd: desktop, env, encoding: "utf8", timeout: 6 * 60_000, windowsHide: true });
	if (result.status !== 0) { console.error(result.stdout, result.stderr); throw new Error(`The ${name} launch failed (exit ${result.status ?? result.signal}).`); }
	return JSON.parse(readFileSync(file, "utf8"));
};
const results = [];
try {
	console.log("Seeding the profile and warming caches…");
	launch("warm-up", ["--seed"]);
	for (let run = 1; run <= runs; run++) { console.log(`Run ${run} of ${runs}…`); results.push(launch(`run-${run}`, run === runs ? [`--cpu-profiles=${path.join(out, "cpu-profiles")}`] : [])); }
} finally { rmSync(profile, { recursive: true, force: true }); }

const median = values => { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : NaN; };
const each = pick => median(results.map(pick));
const measured = {
	"Scripts loaded before the first paint (KB)": Math.round(upfront / 1024),
	"Main process packages loaded at launch": eager.length,
	"Launch to sidebar showing chats (ms)": each(r => r.startup["sidebar shows chats"]),
	"Launch to composer ready (ms)": each(r => r.startup["composer ready"]),
	"Main process heap, idle (MB)": each(r => r.idle.mainHeapMb),
	"Window heap, idle (MB)": each(r => r.idle.rendererHeapMb),
	"Open the 2,000-turn chat (ms)": each(r => r.long.openMs),
	"Window heap with it open (MB)": each(r => r.long.opened.rendererHeapMb),
	"DOM nodes with it open": each(r => r.long.opened.domNodes),
	"One page further back (ms)": each(r => r.long.pageMs),
	"Window heap after 30 pages back (MB)": each(r => r.long.pagedBack.rendererHeapMb),
	"DOM nodes after 30 pages back": each(r => r.long.pagedBack.domNodes),
	"Main process heap after 30 pages back (MB)": each(r => r.long.pagedBack.mainHeapMb),
	"Turn on the long chat (ms)": each(r => r.long.turn.ms),
	"Main process heap during that turn, peak (MB)": each(r => r.long.turn.peakMainHeapMb),
	"Main process heap after that turn (MB)": each(r => r.long.turn.mainHeapAfterMb),
	"History sent to the model for that turn (KB)": each(r => r.long.turn.requestKb),
	"Switch between chats, median (ms)": each(r => median(r.switchMs)),
};
const failures = [];
if (results.some(r => r.long.pagedBack.pages < 30)) failures.push("Paging back stopped before 30 pages.");
if (results.some(r => r.long.turn.status !== "completed")) failures.push(`The turn on the long chat ended as ${results.map(r => r.long.turn.status).join(", ")}.`);
if (eager.length) failures.push(`The main bundle imports ${eager.join(", ")} at launch; load them on first use.`);
const rows = Object.entries(budgets).map(([name, budget]) => {
	const value = measured[name], over = !Number.isFinite(value) || value > budget;
	if (over) failures.push(`${name}: ${value} over the budget of ${budget}.`);
	return { name, value, budget, over };
});

const table = ["| Measurement | Median | Budget | |", "| --- | ---: | ---: | --- |", ...rows.map(row => `| ${row.name} | ${row.value} | ${row.budget} | ${row.over ? "over" : "ok"} |`)].join("\n");
const summary = `### Desktop performance budgets\n\n${runs} runs after a warm-up launch, with 200 chats and one of 2,000 turns.\n\n${table}\n${failures.length ? `\n${failures.map(failure => `- ${failure}`).join("\n")}\n` : ""}`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
if (failures.length) { console.error(`\n${failures.length} performance budget${failures.length === 1 ? "" : "s"} failed. Results and CPU profiles: ${out}`); process.exit(1); }
