import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAider } from "./aider";
import { parseBenchmarkHeaven, splitHeavenLabel } from "./benchmarkheaven";
import { parseBoggs } from "./boggs";
import { parseCompanyAgentBench } from "./company-agent-bench";
import { parseEqbench4, parseEqbenchCsv } from "./eqbench";
import { latestRelease, parseLivebench } from "./livebench";
import { cleanMarkdownLabel, markdownTable, parseMazurBoard } from "./mazur";
import { parseMercorApex } from "./mercor-apex";
import { headlineWindow, parseSweRebench } from "./swe-rebench";
import { parseUgi, splitUgiName } from "./ugi";
import { parseWojakBench } from "./wojak-bench-3d";

describe("boggs", () => {
	const dashboard = {
		generated_at: "2026-11-14T08:21:17Z",
		benchmarks: [{ id: "halluhard", name: "HalluHard" }, { id: "ale-bench", name: "ALE-Bench" }, { id: "gpqa-diamond", name: "GPQA Diamond" }],
		results: [
			{ benchmark_id: "halluhard", model: "Claude Fable 5", source_model: "claude-fable-5", raw_score: 0.43275, reported_score: 0.43275, source_url: "https://halluhard.com/" },
			{ benchmark_id: "ale-bench", model: "GPT-6 Astra", source_model: "GPT-6 astra Max", raw_score: 3164.375, reported_score: 1 },
			{ benchmark_id: "ale-bench", model: "Human expert", raw_score: 2000, reported_score: 0.6 },
			{ benchmark_id: "gpqa-diamond", model: "GPT-6 Astra", raw_score: 0.9, reported_score: 0.9 },
			{ benchmark_id: "halluhard", model: "Grok 4.7", raw_score: 0.5, reported_score: 0.5, reasoning_effort: "high", agent_harness: "Grok Build" },
		],
	};
	it("reads only mapped boards, keeps the publisher's label and scale, and skips people", () => {
		const rows = parseBoggs(dashboard);
		assert.equal(rows.length, 3);
		assert.deepEqual(rows.map((row) => row.benchmarkId), ["halluhard", "ale-bench", "halluhard"]);
		assert.equal(rows[0].label, "claude-fable-5");
		assert.ok(Math.abs(rows[0].value - 43.275) < 1e-9);
		assert.equal(rows[0].url, "https://halluhard.com/");
		assert.equal(rows[1].value, 3164.375);
		assert.equal(rows[2].effort, "high");
		assert.equal(rows[2].harness, "Grok Build");
		assert.equal(rows[0].observedOn, "2026-11-14");
	});
	it("rejects a changed format", () => {
		assert.throws(() => parseBoggs({} as never), /format changed/);
	});
});

describe("Benchmark Heaven", () => {
	it("splits settings out of labels", () => {
		assert.deepEqual(splitHeavenLabel("claude-fable-5-1 · Claude Code · max", "Claude Code"), { label: "claude-fable-5-1", effort: "max" });
		assert.deepEqual(splitHeavenLabel("Fable 5.1 [claude code · max]", "claude code"), { label: "Fable 5.1", effort: "max" });
		assert.deepEqual(splitHeavenLabel("google/gemini-3.7-flash@reasoning=high"), { label: "google/gemini-3.7-flash", effort: "high" });
		assert.deepEqual(splitHeavenLabel("Claude Opus 4.8 · xhigh · OpenHands", "OpenHands"), { label: "Claude Opus 4.8", effort: "xhigh" });
	});
	it("reads the newest snapshot, skips self-reports and baselines, and converts fractions", () => {
		const observation = (benchmark_id: string, name: string, value: number, extra: object = {}) => ({ benchmark_id, value, unit: "percent", basis: "measured", subject: { name }, ...extra });
		const rows = parseBenchmarkHeaven({
			generated_at: "2026-11-21T18:05:36Z",
			benchmark_results: {
				observations: [
					observation("slopbench::snapshot-2026-08-01", "old-model", 9),
					observation("slopbench::snapshot-2026-09-10", "openai/gpt-5.4", 4.3),
					observation("longbench::2", "Gemini-2.5-Pro 🧠 Google", 63.3),
					observation("longbench::2", "Human", 53.7),
					observation("longbench::2", "Vendor Model", 70, { basis: "self_reported" }),
					observation("bu-bench-v1::snapshot-2026-09-09", "gpt-5.5", 0.66, { unit: "fraction", subject: { name: "gpt-5.5", harness: "BrowserUse 0.13.7" } }),
					observation("swe-bench-verified::snapshot-2026-09-10", "anything", 80),
					observation("ruler::snapshot-2026-09-10", "Qwen2.5-14B-Instruct-1M* (14B)", 95.7),
					observation("vitabench::2026-01-22", "Thinking Models|o3 (high)", 26.3),
				],
			},
		});
		assert.deepEqual(rows.map((row) => [row.benchmarkId, row.label, row.value]), [
			["slopbench", "openai/gpt-5.4", 4.3],
			["longbench-v2", "Gemini-2.5-Pro", 63.3],
			["bu-bench-v1", "gpt-5.5", 66],
			["ruler", "Qwen2.5-14B-Instruct-1M", 95.7],
			["vitabench", "o3 (high)", 26.3],
		]);
		assert.equal(rows[2].harness, "BrowserUse 0.13.7");
	});
	it("keeps reasoning settings and published configurations apart", () => {
		assert.deepEqual(splitHeavenLabel("qwen/qwen3.7-flash@reasoning=enabled"), { label: "qwen/qwen3.7-flash", effort: undefined, config: "reasoning enabled" });
		// LongBench v2 lists the same model with and without chain of thought; the source row names the column.
		const longbench = (value: number, configuration: string, column: number) => ({
			benchmark_id: "longbench::2", value, unit: "percent", basis: "measured",
			protocol: `LongBench 2; 503 questions; overall without CoT (column 5) and with CoT (column 6) are separate observations, never merged.; source row: {"cells":[],"configuration":"${configuration}","value_column":${column}}`,
			subject: { name: "Qwen3-235B-A22B-Instruct-2507 Alibaba" },
		});
		const rows = parseBenchmarkHeaven({
			benchmark_results: {
				observations: [
					longbench(46.7, "without CoT", 5),
					longbench(58.3, "with CoT", 6),
					{ benchmark_id: "context-arena-mrcr-v2::8-needle", value: 81.2, unit: "percent", basis: "measured", subject: { name: "qwen/qwen3.7-flash@reasoning=enabled" } },
					{ benchmark_id: "context-arena-mrcr-v2::8-needle", value: 60.1, unit: "percent", basis: "measured", subject: { name: "qwen/qwen3.7-flash" } },
				],
			},
		});
		assert.deepEqual(rows.map((row) => [row.benchmarkId, row.label, row.config, row.value]), [
			["longbench-v2", "Qwen3-235B-A22B-Instruct-2507", "without CoT", 46.7],
			["longbench-v2", "Qwen3-235B-A22B-Instruct-2507", "with CoT", 58.3],
			["context-arena-mrcr-v2-8-needle", "qwen/qwen3.7-flash", "reasoning enabled", 81.2],
			["context-arena-mrcr-v2-8-needle", "qwen/qwen3.7-flash", undefined, 60.1],
		]);
	});
});

describe("EQ-Bench", () => {
	it("reads template-literal CSVs and strips flags", () => {
		const script = "let leaderboardDataCreativeWritingV3 = `\nmodel_name,elo_score,creative_writing_score\ngpt-6-astra,2176.9,15.94\n*kimi-k3.1-pro,2172.6,16.63\n!broken,n/a,1\n`;";
		const rows = parseEqbenchCsv({ id: "creative-writing-v3", script: "creative_writing.js", variable: "leaderboardDataCreativeWritingV3", column: "elo_score" }, script);
		assert.deepEqual(rows.map((row) => [row.label, row.value]), [["gpt-6-astra", 2176.9], ["kimi-k3.1-pro", 2172.6]]);
	});
	it("scales Judgemark to 100 and keeps intervals and cost", () => {
		const script = "const leaderboardDataJudgemarkV4 = `\nmodel,score,ci_low,ci_high,cost,chart\nclaude-opus-4-6,0.907256,0.867410,0.967750,$39.37,x.png\n`;";
		const [row] = parseEqbenchCsv({ id: "judgemark-v4", script: "judgemark-v4.js", variable: "leaderboardDataJudgemarkV4", column: "score", ciLow: "ci_low", ciHigh: "ci_high", cost: "cost", factor: 100, nameColumn: "model" }, script);
		assert.ok(Math.abs(row.value - 90.7256) < 1e-9);
		assert.ok(Math.abs((row.ciLow ?? 0) - 86.741) < 1e-9);
		assert.equal(row.costUsd, 39.37);
	});
	it("reads the EQ-Bench 4 data object", () => {
		const rows = parseEqbench4('const EQBENCH4_DATA = {"generated_at":"2026-10-24T00:56:35+00:00","models":[{"model":"claude-opus-5","elo":1364.9,"ci_low":1349.5,"ci_high":1378.4}]};');
		assert.deepEqual(rows, [{ benchmarkId: "eqbench-4", label: "claude-opus-5", value: 1364.9, ciLow: 1349.5, ciHigh: 1378.4, observedOn: "2026-10-24" }]);
	});
});

describe("Aider", () => {
	it("reads runs and skips architect pairs", () => {
		const yaml = [
			"- dirname: a", "  model: gpt-5 (high)", "  edit_format: diff", "  pass_rate_2: 88.0", "  reasoning_effort: high", "  seconds_per_case: 194.0", "  date: 2025-08-23", "",
			"- dirname: b", "  model: o3 (high) + gpt-4.1", "  editor_model: gpt-4.1", "  pass_rate_2: 82.7", "",
		].join("\n");
		assert.deepEqual(parseAider(yaml), [{ benchmarkId: "aider-polyglot", label: "gpt-5 (high)", effort: "high", harness: "aider (diff)", value: 88, durationSeconds: 194, observedOn: "2025-08-23" }]);
	});
});

describe("LiveBench", () => {
	it("finds the newest release and computes the weighted overall", () => {
		assert.equal(latestRelease('x=["20261014","20261025","20261106"],y=1'), "20261106");
		const rows = parseLivebench("model,coding,reasoning,design\nm1,80,60,90\nm2,,50,\n", { Coding: ["coding"], Reasoning: ["reasoning"], Design: ["design"], _overall_weights: { Coding: 2 } }, "20261106");
		// (80×2 + 60 + 90) / 4 = 77.5; m2 has only reasoning.
		assert.deepEqual(rows.map((row) => [row.label, row.value, row.observedOn]), [["m1", 77.5, "2026-11-06"], ["m2", 50, "2026-11-06"]]);
	});
});

describe("UGI", () => {
	it("splits reasoning settings", () => {
		assert.deepEqual(splitUgiName("openai/gpt-oss-20b (reasoning=low)"), { label: "openai/gpt-oss-20b", effort: "low" });
		assert.deepEqual(splitUgiName("anthropic/claude-opus-4-20250514 (thinking=disabled)"), { label: "anthropic/claude-opus-4-20250514", effort: "none" });
	});
	it("reads foundation models only, one row per measure", () => {
		const csv = "﻿author/model_name,Model Link,Test Date,Is Foundation,Writing ✍️,UGI 🏆,W/10 👍,NatInt 💡\nmoonshotai/Kimi-K2-Instruct,https://hf.co/k,9/6/2025,TRUE,52.5,56.55,3.2,48.87\nsomeone/finetune,https://hf.co/f,9/6/2025,FALSE,1,2,3,4\nQwen/Qwen3-0.6B,,9/6/2025,True,NA,20.85,5.0,4.83\n";
		const rows = parseUgi(csv);
		assert.equal(rows.length, 7);
		assert.deepEqual(rows.slice(0, 4).map((row) => [row.benchmarkId, row.value]), [["ugi", 56.55], ["ugi-willingness", 3.2], ["ugi-natint", 48.87], ["ugi-writing", 52.5]]);
		assert.equal(rows[0].observedOn, "2025-09-06");
		// The model card is not evidence for the score; the leaderboard link is used instead.
		assert.ok(rows.every((row) => row.url === undefined));
	});
});

describe("SWE-rebench", () => {
	const window = (from: string, to: string) => `${Date.parse(from)}:${Date.parse(to)}`;
	const items = [
		{ modelName: "old-model", agentVersion: "tools", meta: { instance_type: "model" }, rangeStats: { all: { [window("2026-01-01", "2026-03-01")]: { resolvedRate: 30 } } } },
		{ modelName: "GLM-5.2 [high]", agentVersion: "tools", meta: { instance_type: "model" }, rangeStats: { all: { [window("2026-05-15", "2026-07-01")]: { resolvedRate: 40, sem: 1, instanceCosts: 0.5 }, [window("2026-06-15", "2026-07-01")]: { resolvedRate: 42 }, [window("2026-05-01", "2026-07-01")]: { resolvedRate: 41 } } } },
		{ modelName: "Fable 5 [high]", agentVersion: "tools", meta: { instance_type: "model" }, rangeStats: { all: { [window("2026-05-15", "2026-07-01")]: { resolvedRate: 50 }, [window("2026-06-15", "2026-07-01")]: { resolvedRate: 52 } } } },
		{ modelName: "Claude Code", agentVersion: "tools", meta: { instance_type: "agent" }, rangeStats: { all: { [window("2026-05-15", "2026-07-01")]: { resolvedRate: 60 } } } },
	];
	it("widens the newest window while every model is still in it", () => {
		assert.equal(headlineWindow(items), window("2026-05-15", "2026-07-01"));
	});
	it("stops widening when a model drops out, even if an agent fills its place", () => {
		// The old count-based check saw two entries in both windows and widened past Fable 5.
		const swapped = [
			{ modelName: "GLM-5.2 [high]", meta: { instance_type: "model" }, rangeStats: { all: { [window("2026-06-15", "2026-07-01")]: { resolvedRate: 42 }, [window("2026-05-15", "2026-07-01")]: { resolvedRate: 40 } } } },
			{ modelName: "Fable 5 [high]", meta: { instance_type: "model" }, rangeStats: { all: { [window("2026-06-15", "2026-07-01")]: { resolvedRate: 52 } } } },
			{ modelName: "Claude Code", meta: { instance_type: "agent" }, rangeStats: { all: { [window("2026-05-15", "2026-07-01")]: { resolvedRate: 60 } } } },
		];
		assert.equal(headlineWindow(swapped), window("2026-06-15", "2026-07-01"));
	});
	it("reads plain models in that window", () => {
		const rows = parseSweRebench(items);
		assert.deepEqual(rows.map((row) => [row.label, row.value]), [["GLM-5.2 [high]", 40], ["Fable 5 [high]", 50]]);
		assert.ok(Math.abs((rows[0].ciLow ?? 0) - 38.04) < 1e-9);
		assert.equal(rows[0].costUsd, 0.5);
	});
});

describe("Mazur", () => {
	const readme = [
		"# Benchmark", "", "Intro | not a table", "", "### Leaderboard", "",
		"| Rank | Model | Comparison score | 95% bootstrap interval |",
		"| ---: | --- | ---: | --- |",
		"| 1 | **GPT-6.2 Astra (high)** | 4.302 | 4.223 to 4.379 |",
		"| 2 | Qwen 4 Max (high)⁂ | 3.548 | 3.469 to 3.625 |",
		"| 3 | Human baseline | 1.0 | 0.9 to 1.1 |",
		"", "After.",
	].join("\n");
	it("finds the table after a heading", () => {
		assert.equal(markdownTable(readme, /^### Leaderboard/).length, 3);
		assert.equal(cleanMarkdownLabel("**Qwen 4 Max (high)⁂**"), "Qwen 4 Max (high)");
	});
	it("reads the score column and interval and skips baselines", () => {
		const rows = parseMazurBoard({ id: "creative-story-writing", after: /^### Leaderboard/, column: /^Comparison score/, ciColumn: /bootstrap/ }, readme);
		assert.deepEqual(rows, [
			{ benchmarkId: "creative-story-writing", label: "GPT-6.2 Astra (high)", value: 4.302, ciLow: 4.223, ciHigh: 4.379 },
			{ benchmarkId: "creative-story-writing", label: "Qwen 4 Max (high)", value: 3.548, ciLow: 3.469, ciHigh: 3.625 },
		]);
	});
	it("reads intervals with thousands separators", () => {
		const buyout = ["## Main Leaderboard", "", "| Rank | Model | BT rating | 95% rating interval | Games |", "| ---: | --- | ---: | ---: | ---: |", "| 1 | Gemini 4 Neon (high) | 2175.7 | 2,035–2,316 | 52 |"].join("\n");
		assert.deepEqual(parseMazurBoard({ id: "buyout-game", after: /^##\s+Main Leaderboard/i, column: /^BT( rating)?$/i, ciColumn: /^95% rating interval$/i }, buyout), [
			{ benchmarkId: "buyout-game", label: "Gemini 4 Neon (high)", value: 2175.7, ciLow: 2035, ciHigh: 2316 },
		]);
	});
	it("fails loudly when the column disappears", () => {
		assert.throws(() => parseMazurBoard({ id: "x", column: /^Missing$/ }, readme), /format changed/);
	});
});

describe("Mercor APEX", () => {
	const row = (modelName: string, provider: string, effort: string, passScores: unknown[]) => ({ model: { modelName, effort, provider: { name: provider } }, passScores });
	const board = (benchmarkId: string, passes: string[] | null, globalLeaderboard: unknown[], harnesses: Array<{ label: string; value: string }> | null = null) => ({ benchmarkId, availablePasses: passes?.map((value) => ({ value })) ?? null, availableHarnesses: harnesses, globalLeaderboard });
	const page = {
		props: {
			pageProps: {
				benchmarks: [
					board("ace", null, [row("GPT-5", "OpenAI", "high", [{ pass: "pass-1", score: 56.1, error: 3.3 }])]),
					board("apex-accounting", ["mean-score", "pass-1"], []),
					board("apex-agents", ["pass-1", "mean-score"], [row("Fable 5.1", "Anthropic", "max", [{ pass: "pass-1", score: null, harnessScores: [{ harness: "loop_truncated_tools_agent", score: 68.6, error: 4.9 }] }])], [{ label: "Loop", value: "loop_truncated_tools_agent" }]),
					board("apex-swe", ["pass-1"], [row("Fable 5", "Anthropic", "auto", [{ pass: "pass-1", score: null, harnessScores: [{ harness: "inspect", score: 54.83 }, { harness: "terminus-2", score: 58.9 }] }])]),
					board("apex-v1", ["mean-score"], []),
					board("open-world-engineer", ["mean-8", "best-8", "elo"], [row("Opus 5.5", "Anthropic", "max", [{ pass: "mean-8", score: 41.6, error: 5.6 }, { pass: "elo", score: 2020 }])]),
				],
			},
		},
	};
	it("reads each board's headline pass, per harness, with the Claude family restored", () => {
		const rows = parseMercorApex(page as unknown as Parameters<typeof parseMercorApex>[0]);
		assert.deepEqual(rows.map((entry) => [entry.benchmarkId, entry.label, entry.effort, entry.harness, entry.value]), [
			["mercor-ace", "GPT-5", "high", undefined, 56.1],
			["apex-agents", "Claude Fable 5.1", "max", "Loop", 68.6],
			["mercor-apex-swe", "Claude Fable 5", undefined, "inspect", 54.83],
			["mercor-apex-swe", "Claude Fable 5", undefined, "terminus-2", 58.9],
			["owe-bench", "Claude Opus 5.5", "max", undefined, 41.6],
		]);
		assert.ok(Math.abs((rows[0].ciLow ?? 0) - 52.8) < 1e-9);
	});
	it("skips a board Mercor stops listing, but fails when none is left", () => {
		const withoutAce = { props: { pageProps: { benchmarks: page.props.pageProps.benchmarks.filter((entry) => entry.benchmarkId !== "ace") } } };
		const rows = parseMercorApex(withoutAce as unknown as Parameters<typeof parseMercorApex>[0]);
		assert.ok(rows.length === 4 && rows.every((entry) => entry.benchmarkId !== "mercor-ace"));
		assert.throws(() => parseMercorApex({ props: { pageProps: { benchmarks: [] } } }), /format changed/);
	});
});

describe("Company Agent Bench", () => {
	it("reads models from the chart label and skips agent products", () => {
		const html = `<svg aria-label="Accuracy across all 205 questions against cost per question, on a log scale from $0.008 to $1.50, at low, medium and high reasoning effort. Dashed lines mark the agent products: Dots 75.9%, Devin 66.1%. Gemini Neon: low 85.3% at $0.181 per question, high 87.4% at $1.056 per question; Opus 5.5: medium 72.5% at $0.267 per question"></svg>`;
		assert.deepEqual(parseCompanyAgentBench(html).map((row) => [row.label, row.effort, row.value, row.costUsd]), [
			["Gemini Neon", "low", 85.3, 0.181],
			["Gemini Neon", "high", 87.4, 1.056],
			["Claude Opus 5.5", "medium", 72.5, 0.267],
		]);
	});
});

describe("Wojak-Bench 3D", () => {
	it("reads the rating table", () => {
		const html = `<table><thead><tr><th>#</th><th>model</th><th>rating</th><th>votes</th></tr></thead><tbody><tr><td>1</td><th><span><img src="x.svg" alt=""/>GPT-6.2 Astra</span></th><td>1276</td><td>534</td></tr></tbody></table>`;
		assert.deepEqual(parseWojakBench(html), [{ benchmarkId: "wojak-bench-3d", label: "GPT-6.2 Astra", value: 1276 }]);
	});
});
