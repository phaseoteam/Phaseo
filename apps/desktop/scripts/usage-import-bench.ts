// Times the Usage page's first transcript import against this computer's real Claude Code and Codex history, then a
// second scan (which should read only what changed), with where each spent its time. Uses the built worker: run
// `pnpm run build:main` first.
//   pnpm exec tsx scripts/usage-import-bench.ts [--claude=<folder>] [--codex=<folder>]
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TranscriptReaders, TranscriptScanner, transcriptFolders, type TranscriptFolder } from "../src/main/usageTranscripts";
import { WorkspaceStore } from "../src/main/workspaceStore";

const flag = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const directory = mkdtempSync(path.join(tmpdir(), "phaseo-usage-bench-")), store = new WorkspaceStore(path.join(directory, "workspace.db"));
const added: TranscriptFolder[] = [...flag("claude") ? [{ harness: "claude" as const, directory: flag("claude")! }] : [], ...flag("codex") ? [{ harness: "codex" as const, directory: flag("codex")! }] : []];
const worker = path.resolve(import.meta.dirname, "../dist/main/usageWorker.mjs");
let firstRead = 0, writing = 0, summing = 0, longest = 0, files = 0, lastToday = 0, started = 0;
const slowest: [number, string][] = [];
const readers = () => {
	const pool = new TranscriptReaders(worker);
	return { size: pool.size, close: () => pool.close(), sessions: (files: readonly string[]) => pool.sessions(files), read: async (...args: Parameters<TranscriptReaders["read"]>) => {
		firstRead ||= performance.now(); files++;
		const started = performance.now();
		try { return await pool.read(...args); } finally { slowest.push([performance.now() - started, args[0].path]); if (Date.now() - args[0].mtimeMs < 86_400_000) lastToday = performance.now(); }
	} };
};
const record = store.recordTranscriptUsage.bind(store);
store.recordTranscriptUsage = (...args) => { const started = performance.now(); if (!process.env.NO_WRITES) record(...args); writing += performance.now() - started; };
const sum = store.sumStaleQuarters.bind(store);
store.sumStaleQuarters = (...args) => { const started = performance.now(); try { return sum(...args); } finally { const took = performance.now() - started; summing += took; longest = Math.max(longest, took); } };
const scanner = new TranscriptScanner(store, () => {}, { folders: () => transcriptFolders([], added), readers });
try {
	for (const label of ["first", "second"]) {
		firstRead = 0; writing = 0; summing = 0; longest = 0; files = 0; slowest.length = 0;
		started = performance.now(); lastToday = 0;
		const rows = await scanner.scan(true), seconds = (value: number) => `${(value / 1000).toFixed(1)}s`;
		console.log(`${label} scan: ${rows.toLocaleString()} rows from ${files} files in ${seconds(performance.now() - started)}; before reading ${seconds((firstRead || performance.now()) - started)}, files from the last day read by ${seconds((lastToday || started) - started)}, writing ${seconds(writing)}, summing ${seconds(summing)} (longest ${Math.round(longest)}ms)`);
		for (const [ms, file] of slowest.sort((a, b) => b[0] - a[0]).slice(0, 3)) console.log(`  ${seconds(ms)} ${file}`);
	}
	for (const period of ["today", "7d", "90d", "90d"] as const) {
		const started = performance.now(), report = store.usageReport(period, () => undefined);
		console.log(`${period} report in ${Math.round(performance.now() - started)}ms: ${report.harnesses.map(harness => `${harness.harness} ${harness.tokens.toLocaleString()}`).join(", ")}`);
	}
} finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
