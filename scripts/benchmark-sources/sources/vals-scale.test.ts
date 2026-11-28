import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRampAccounting, parseRampSwe } from "./ramp";
import { parseScaleBoard, splitScaleLabel } from "./scale";
import { parseAle, runtimeSeconds, tokenCount } from "./snorkel";
import { parseSurgeBoard } from "./surge";
import { parseValsView, parseValsViewModule, valsLabel, valsSource, valsViewUrl, type ValsBoard, type ValsView } from "./vals";
import { parseZapierModule, zapierObservations } from "./zapier";

/** An App Router page whose flight payload is `text`. */
function flightPage(text: string): string {
	return `<html><script>self.__next_f.push([1,${JSON.stringify(text)}])</script></html>`;
}

describe("Vals AI", () => {
	const board: ValsBoard = {
		slug: "demo_bench",
		version: "1.1",
		name: "Demo",
		minRows: 1,
		skip: /router/,
		benchmarks: [
			{ task: "overall", id: "demo-vals", name: "Demo", category: "coding", description: "Demo." },
			{ task: "wer", id: "demo-vals-wer", name: "Demo WER", category: "speech", higherIsBetter: false, description: "Demo." },
		],
	};
	const view: ValsView = {
		metadata: { slug: "demo_bench", version: "1.1", updated: "2026-11-19" },
		tasks: {
			overall: {
				"anthropic/claude-opus-5-5-parallel-fast": { accuracy: 57.5, stderr: 1, cost_per_test: 0.5, latency: 30, avg_output_tokens: 1200.4, reasoning_effort: "max", harness: "Parallel Fast" },
				"google/gemini-4-argon": { accuracy: 52.1, reasoning_effort: "0.99", compute_effort: "high", harness: null },
				"openrouter/auto-router": { accuracy: 50 },
				"openai/gpt-6-astra": { accuracy: null },
			},
			wer: { "google/gemini-4-argon": { accuracy: 9.2 } },
		},
	};

	it("reads every configured task, splits the harness off the id and skips non-model rows", () => {
		const source = valsSource(board);
		assert.equal(source.id, "vals-demo-bench");
		assert.equal(source.benchmarks[1].higherIsBetter, false);
		const rows = parseValsView(board, view, source.benchmarks);
		assert.equal(rows.length, 3);
		const [opus, argon, wer] = rows;
		assert.equal(opus.label, "anthropic/claude-opus-5-5");
		assert.equal(opus.harness, "Parallel Fast");
		assert.equal(opus.effort, "max");
		assert.equal(opus.costUsd, 0.5);
		assert.equal(opus.durationSeconds, 30);
		assert.equal(opus.outputTokens, 1200.4);
		assert.ok(Math.abs(opus.ciLow! - 55.54) < 1e-9 && Math.abs(opus.ciHigh! - 59.46) < 1e-9);
		assert.equal(opus.observedOn, "2026-11-19");
		assert.equal(opus.url, "https://www.vals.ai/benchmarks/demo_bench");
		// A non-standard reasoning_effort falls back to compute_effort.
		assert.equal(argon.effort, "high");
		assert.deepEqual([wer.benchmarkId, wer.value], ["demo-vals-wer", 9.2]);
	});

	it("refuses a new version or a payload for another board", () => {
		const source = valsSource(board);
		assert.throws(() => parseValsView(board, { ...view, metadata: { ...view.metadata, version: "1.2" } }, source.benchmarks), /now v1\.2/);
		assert.throws(() => parseValsView(board, { ...view, metadata: { ...view.metadata, slug: "other" } }, source.benchmarks), /belongs to other/);
		assert.throws(() => parseValsView({ ...board, benchmarks: [{ ...board.benchmarks[0], task: "missing" }] }, view, source.benchmarks), /task "missing" missing/);
	});

	it("finds the view URL in Astro island props and parses bundled view modules", () => {
		const html = `<astro-island props="{&quot;urlState&quot;:[0,true],&quot;benchmarkViewUrl&quot;:[0,&quot;/_astro/benchmark_view_demo.AbC1.json&quot;]}"></astro-island>`;
		assert.equal(valsViewUrl(html), "https://www.vals.ai/_astro/benchmark_view_demo.AbC1.json");
		assert.equal(valsViewUrl("<html></html>"), null);
		const module = 'var n={benchmark:`Demo`,slug:`rsi_index`,version:`1.1`,updated:`2026-11-19`},r=JSON.parse(`{"overall":{"openai/gpt-6-astra":{"accuracy":61.5,"note":"a \\`tick\\`"}}}`);';
		const parsed = parseValsViewModule(module);
		assert.deepEqual(parsed.metadata, { slug: "rsi_index", version: "1.1", updated: "2026-11-19" });
		assert.equal(parsed.tasks.overall["openai/gpt-6-astra"].accuracy, 61.5);
		assert.equal((parsed.tasks.overall["openai/gpt-6-astra"] as { note?: string }).note, "a `tick`");
	});

	it("leaves ids alone when the harness isn't a suffix", () => {
		assert.equal(valsLabel("openai/gpt-6-astra", "codex"), "openai/gpt-6-astra");
		assert.equal(valsLabel("openai/gpt-5.6-sol-exa", "Exa"), "openai/gpt-5.6-sol");
		assert.equal(valsLabel("openai/gpt-5.6-sol", undefined), "openai/gpt-5.6-sol");
	});
});

describe("Scale Labs", () => {
	it("splits harness and effort out of SEAL labels", () => {
		assert.deepEqual(splitScaleLabel("Claude Opus 5 (Claude Code) xHigh*"), { label: "Claude Opus 5", harness: "Claude Code", effort: "xhigh" });
		assert.deepEqual(splitScaleLabel("Gemini 4 Argon (mini-swe-agent) high"), { label: "Gemini 4 Argon", harness: "mini-swe-agent", effort: "high" });
		assert.deepEqual(splitScaleLabel("Grok 4.7 (one-pass-agent)"), { label: "Grok 4.7", harness: "one-pass-agent", effort: undefined });
		// Bracketed efforts and dates stay for the matcher.
		assert.deepEqual(splitScaleLabel("gemini-3.1-pro-preview (thinking high)"), { label: "gemini-3.1-pro-preview (thinking high)", harness: undefined, effort: undefined });
		assert.deepEqual(splitScaleLabel("o3 (high) (April 2025)"), { label: "o3 (high) (April 2025)", harness: undefined, effort: undefined });
	});

	it("reads tabbed and single tables from the flight payload", () => {
		const entry = (model: string, score: number, ci = 1.5) => ({ model, version: "", rank: 1, score, confidenceInterval_upper: ci, contaminationMessage: "", company: "x" });
		const tabbed = flightPage(`8:["$","$L20",null,{"leaderboardTitle":"SWE-Bench Pro V2","variants":[{"key":"full","label":"Full","entries":${JSON.stringify([entry("Claude Opus 5 (Claude Code) xhigh", 99.4)])}},{"key":"hard","label":"HARD","entries":${JSON.stringify([entry("Kimi K3 (mini-swe-agent) max", 90, 0)])}}]}]`);
		const definitions = new Map(["demo-full", "demo-hard", "demo-single"].map((id) => [id, { id, name: id, url: `https://labs.scale.com/leaderboard/${id}`, category: "coding", type: "percentage" as const, higherIsBetter: true, description: "" }]));
		const rows = parseScaleBoard({ slug: "swe_bench_pro_public_v2", variants: { full: "demo-full", hard: "demo-hard" } }, tabbed, definitions);
		assert.deepEqual(rows.map((row) => [row.benchmarkId, row.label, row.harness, row.effort, row.value]), [
			["demo-full", "Claude Opus 5", "Claude Code", "xhigh", 99.4],
			["demo-hard", "Kimi K3", "mini-swe-agent", "max", 90],
		]);
		assert.deepEqual([rows[0].ciLow, rows[0].ciHigh, rows[1].ciLow], [97.9, 100.9, undefined]);

		const single = flightPage(`1c:["$","div",null,{"children":["$","$L1e",null,{"entries":${JSON.stringify([{ ...entry("GPT 6 Astra", 54.17), contaminationMessage: "Potential contamination warning" }])}}]}]`);
		const [hle] = parseScaleBoard({ slug: "hle", variants: { "": "demo-single" } }, single, definitions);
		assert.equal(hle.note, "Potential contamination warning");
		assert.throws(() => parseScaleBoard({ slug: "hle", variants: { full: "demo-full" } }, single, definitions), /tab "full" not found/);
	});

	it("skips deprecated entries even when they outscore active ones", () => {
		const definitions = new Map([["distressbench", { id: "distressbench", name: "DistressBench", url: "https://labs.scale.com/leaderboard/distressbench", category: "safety", type: "percentage" as const, higherIsBetter: true, description: "" }]]);
		const entries = [
			{ model: "DeepSeek V4 Pro", score: 69.19, confidenceInterval_upper: 0, deprecated: true },
			{ model: "Claude Opus 5", score: 61.4, confidenceInterval_upper: 0, deprecated: false },
		];
		const html = flightPage(`1c:["$","div",null,{"children":["$","$L1e",null,{"entries":${JSON.stringify(entries)}}]}]`);
		const rows = parseScaleBoard({ slug: "distressbench", variants: { "": "distressbench" } }, html, definitions);
		assert.deepEqual(rows.map((row) => [row.label, row.value]), [["Claude Opus 5", 61.4]]);
	});
});

describe("Surge AI", () => {
	it("joins brand and name and keeps only the primary board's rows", () => {
		const row = (brand: string, name: string, score: string) => `<div data-leaderboard-row="" class="r"><div class="head-rank-table-brand"><div class="txt">${brand}</div></div><div class="head-rank-table-name"><div class="txt">${name}</div></div><div data-score="${score}" class="txt">${score || "52.2"}</div><div>%</div></div>`;
		const html = `<section>${row("GPT", "6.2 Astra (Max reasoning)", "90.7")}${row("Claude", "Fable 5.2 (Adaptive/Max)", "")}${row("Hy", "Hy4 Preview (High reasoning)", "59.4")}${row("Mistral", "Large 3", "7.3")}</section>`;
		assert.deepEqual(parseSurgeBoard("chartography", html), [
			{ benchmarkId: "chartography", label: "GPT 6.2 Astra", effort: "max", value: 90.7 },
			{ benchmarkId: "chartography", label: "Claude Fable 5.2", effort: "max", value: 52.2 },
			{ benchmarkId: "chartography", label: "Hy4 Preview", effort: "high", value: 59.4 },
			{ benchmarkId: "chartography", label: "Mistral Large 3", effort: undefined, value: 7.3 },
		]);
		assert.throws(() => parseSurgeBoard("chartography", "<div></div>"), /no data-leaderboard-row/);
	});
});

describe("Snorkel Agents' Last Exam", () => {
	it("emits pass rate and score for every effort and strips footnote markers", () => {
		const rows = parseAle({
			as_of: "2026-11-18",
			splits: [{ key: "v1_1", rows: [
				{ model: "GPT-6.2 Astra", harness: "Codex", best_effort: "XHigh", efforts: [
					{ effort: "XHigh", pass_rate_pct: 47.5, score_pct: 78.3, total_runtime: "29h 7m", total_output_tokens: "2.6M" },
					{ effort: "Low", pass_rate_pct: 37.7, score_pct: 65.8, total_runtime: "13h 43m", total_output_tokens: "362.9K" },
				] },
				{ model: "Qwen 4†", harness: "Codex", best_effort: "XHigh", pass_rate_pct: 46.7, score_pct: 74.4, total_runtime: "185h 6m", total_output_tokens: "13.6M" },
			] }],
		});
		assert.equal(rows.length, 6);
		assert.deepEqual(rows.map((row) => [row.benchmarkId, row.label, row.effort, row.value]), [
			["agents-last-exam-v1-1", "GPT-6.2 Astra", "xhigh", 47.5],
			["agents-last-exam-v1-1-score", "GPT-6.2 Astra", "xhigh", 78.3],
			["agents-last-exam-v1-1", "GPT-6.2 Astra", "low", 37.7],
			["agents-last-exam-v1-1-score", "GPT-6.2 Astra", "low", 65.8],
			["agents-last-exam-v1-1", "Qwen 4", "xhigh", 46.7],
			["agents-last-exam-v1-1-score", "Qwen 4", "xhigh", 74.4],
		]);
		assert.equal(rows[0].harness, "Codex");
		assert.equal(rows[0].durationSeconds, 29 * 3600 + 7 * 60);
		assert.equal(rows[0].outputTokens, 2_600_000);
		assert.equal(rows[4].note, "Evaluated by an external team");
		assert.throws(() => parseAle({ splits: [] }), /format changed/);
	});

	it("parses runtimes and token counts", () => {
		assert.equal(runtimeSeconds("227h 20m"), 818_400);
		assert.equal(runtimeSeconds("n/a"), undefined);
		assert.equal(tokenCount("850.3K"), 850_300);
		assert.equal(tokenCount(null), undefined);
	});
});

describe("Zapier AutomationBench", () => {
	it("reads the table from a Framer module and skips two-model rows", () => {
		const module = "var j,M;function x(){j=`1.0.6`,M=[[1,`Gemini 4 Neon (XHigh)`,`56.32%`,`$1.69`],[2,`Claude Fable 5.2 (default fallbacks, Max)`,`51.45%`,`$4.64`],[3,`Gemini 4 Argon (High)`,`51.29%`,`$1.70*`],[4,`Claude Sonnet 5.5 (default fallbacks, Between tools)`,`18.57%`,`$0.04‡`],[5,`Claude Fable 5.1 (with Opus 5 Fallback)`,`31.4%`,`$3.10`],[6,`Mistral Large 4`,`9.1%`,``],[7,`Claude Haiku 5.5 (default fallbacks, Low)§`,`8.2%`,`$0.10`]]}";
		const board = parseZapierModule(module)!;
		assert.equal(board.version, "1.0.6");
		assert.equal(board.rows.length, 7);
		assert.equal(parseZapierModule("var a=[1,2,3]"), null);
		const rows = zapierObservations(board);
		assert.deepEqual(rows.map((row) => [row.label, row.effort, row.value, row.costUsd]), [
			["Gemini 4 Neon", "xhigh", 56.32, 1.69],
			["Claude Fable 5.2", "max", 51.45, 4.64],
			["Gemini 4 Argon", "high", 51.29, 1.7],
			["Claude Sonnet 5.5", "between tools", 18.57, 0.04],
			["Mistral Large 4", undefined, 9.1, undefined],
			["Claude Haiku 5.5", "low", 8.2, 0.1],
		]);
		assert.match(rows[1].note!, /default fallback/);
	});
});

describe("Ramp Labs", () => {
	it("aggregates per-task SWE-Bench rows into a resolve rate per model and harness", () => {
		const csv = [
			"key,result_key,instance_id,model,harness,agent_status,agent_elapsed,agent_completion_tokens,agent_reasoning_tokens,agent_cost_usd,eval_status,resolved,timestamp",
			"a,a,ramp__task-1,openai/gpt-6.2-astra-high,codex,done,100,1000,500,0.5,done,true,2026-11-18T10:00:00Z",
			"b,b,ramp__task-2,openai/gpt-6.2-astra-high,codex,done,300,3001,0,1.5,done,false,2026-11-19T10:00:00Z",
			"c,c,ramp__task-1,anthropic/claude-opus-5-5-high,claude-code,failed,50,,,,done,0,2026-11-17T10:00:00Z",
			"d,d,ramp__task-1,anthropic/claude-fable-5-2-max,claude-code,done,90,30618,13565,0.9,done,true,2026-11-17T10:00:00Z",
		].join("\n");
		const rows = parseRampSwe("ramp-swe-bench-v2", csv);
		assert.deepEqual(rows.map((row) => [row.label, row.effort, row.harness, row.value]), [
			["gpt-6.2-astra", "high", "codex", 50],
			["claude-opus-5-5", "high", "claude-code", 0],
			["claude-fable-5-2", "max", "claude-code", 100],
		]);
		// Output tokens are the completion count alone, which already includes reasoning tokens, and the mean is not rounded.
		assert.deepEqual([rows[0].costUsd, rows[0].durationSeconds, rows[0].outputTokens, rows[0].observedOn], [1, 200, 2000.5, "2026-11-19"]);
		assert.equal(rows[2].outputTokens, 30618);
		assert.throws(() => parseRampSwe("ramp-swe-bench-v2", "a,b\n1,2"), /format changed/);
	});

	it("reads Pass@3 and Mean@3 from the accounting chunk", () => {
		const chunk = 'pt={name:"APEX Accounting",version:"Benchmark 137",taskCount:137,latestCompletedAt:"2026-11-19T21:36:27Z"},ht=[{id:"gemini_4_argon",displayName:"Gemini 4 Argon",provider:"Google",sourceModel:"gemini/gemini-4-argon",color:"#0f9d58",metrics:{taskCount:137,passAt1:.2335,passAt3:.26277,meanCriteriaAt3:.61117,costPerTask:9.0997,attemptMeanScores:[.44,.43]},completedAt:"2026-09-25"},{id:"qwen_3_8_max",displayName:"Qwen 3.8 Max",provider:"Alibaba",sourceModel:"accounts/fireworks/models/qwen3p8-max",color:"#1677c8",metrics:{passAt3:.19708,meanCriteriaAt3:1.2e-1}}]';
		const rows = parseRampAccounting(chunk);
		assert.deepEqual(rows.map((row) => [row.benchmarkId, row.label, Math.round(row.value * 100) / 100]), [
			["ramp-accounting-bench", "Gemini 4 Argon", 26.28],
			["ramp-accounting-bench-mean", "Gemini 4 Argon", 61.12],
			["ramp-accounting-bench", "Qwen 3.8 Max", 19.71],
			["ramp-accounting-bench-mean", "Qwen 3.8 Max", 12],
		]);
		assert.equal(rows[0].costUsd, 9.0997);
		assert.equal(rows[0].observedOn, "2026-11-19");
		assert.throws(() => parseRampAccounting("nothing here"), /metadata not found/);
	});
});
