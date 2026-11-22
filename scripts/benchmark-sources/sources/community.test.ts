import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAgiPilled } from "./agi-pilled";
import { parseBoardbench } from "./boardbench";
import { parseBsbench } from "./bsbench";
import { parseBughunt } from "./bughunt";
import { parseChessLlmBenchmark } from "./chess-llm-benchmark";
import { parseChessbench } from "./chessbench";
import { parseClockbench } from "./clockbench";
import { parseClutterbench } from "./clutterbench";
import { parseDubesorChess } from "./dubesor-chess";
import { duelLabEffort, parseDuelLab } from "./duellab";
import { gamefeel, gamefeelIds, parseGamefeel } from "./gamefeel";
import { parseHearingbench } from "./hearingbench";
import { parseKhalilbench } from "./khalilbench";
import { withClaudePrefix } from "./labels";
import { latestDataset, parseLlm2014Logic } from "./llm2014";
import { parseLlmChess } from "./llm-chess";
import { parseMinebench } from "./minebench";
import { parseOpenttd } from "./openttd";
import { parseSlopalytics } from "./slopalytics";
import { parseThreejsEval } from "./threejseval";
import { parseVoxelbench } from "./voxelbench";
import { parseWebsitebench } from "./websitebench";

describe("chess boards", () => {
	it("reads Dubesor's mixed-mode Elo and puzzle tables, dropping baselines", () => {
		const text = [
			"Last updated: 2026-11-22 02:05 CET",
			"## Detailed Player Statistics: 5+ games, Mixed Modes (3 models)",
			"| # | Model | Elo | Cost | Games | W-D-L | Acc | Blunder | WR | Mat | Turns | Tok | Spd | Legal |",
			"| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
			"| 1 | gemini-4-neon | 1924 ±141 | $1.66 | 26 | 24-0-2 | 93.9% | 1.2% | 92.3% | +10.3 | 46.7 | 4616 | 45s | 100% |",
			"| 2 | gemini-3-pro-preview ˟ | 1834 ±99 | ~$1.65 | 75 | 64-7-4 | 90.7% | 2.2% | 90% | +12.1 | 40.2 | 3319 | 40s | 100% |",
			"| 3 | maia5-1500 | 1511 ±77 | - | 64 | 27-10-27 | 83.1% | 3.6% | 50% | +4.1 | 38.3 | - | - | 100% |",
			"| 4 | hy4 | - | $6.53 | 5 | 3-0-2 | 89.8% | 1.9% | 60% | +6.8 | 31.8 | 164399 | 396s | 100% |",
			"## Puzzle Rating: 100+ puzzles",
			"| # | Model | Puzzle Elo | Puzzles | 1st Try | Recover | Failed | Partial | Legal | Tok | Cost | Spd |",
			"| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
			"| 1 | gemini-4-neon | 2448 ±98 | 200/500 | 89.5% | 81% | 2% | 96.6% | 100% | 8835 | 17.16¢ | 80s |",
			"## Detailed Player Statistics: 5+ games, Reasoning (1 models)",
			"| # | Model | Elo | Cost | Games | W-D-L | Acc | Blunder | WR | Mat | Turns | Tok | Spd | Legal |",
			"| 1 | other | 1 ±1 | $1 | 5 | 1-0-0 | 1% | 1% | 1% | 0 | 1 | 1 | 1s | 100% |",
		].join("\n");
		const rows = parseDubesorChess(text);
		assert.deepEqual(rows.map((row) => [row.benchmarkId, row.label, row.value]), [
			["dubesor-chess", "gemini-4-neon", 1924],
			["dubesor-chess", "gemini-3-pro-preview", 1834],
			["dubesor-chess-puzzles", "gemini-4-neon", 2448],
		]);
		assert.equal(rows[0].ciLow, 1783);
		assert.equal(rows[1].costUsd, 1.65);
		assert.ok(Math.abs(rows[2].costUsd! - 0.1716) < 1e-9);
		assert.equal(rows[2].durationSeconds, 80);
		assert.equal(rows[0].observedOn, "2026-11-22");
	});

	it("reads LLM Chess's embedded CSV and skips players without an anchored Elo", () => {
		const js = "const data = `\nPlayer,total_games,average_game_cost,average_time_per_game_seconds,elo,elo_moe_95\nqwen3.8-27b@q4_k_m,30,0.0,100.5,-557.7,248.6\ngpt-6-astra-high,20,1.5,200,1210,90\nrandom-guy,10,0,1,,\n`;";
		const rows = parseLlmChess(js);
		assert.deepEqual(rows.map((row) => [row.label, row.value]), [["qwen3.8-27b", -557.7], ["gpt-6-astra-high", 1210]]);
		assert.equal(rows[0].costUsd, undefined);
		assert.match(rows[0].note!, /quantisation q4_k_m/);
		assert.equal(rows[1].ciHigh, 1300);
	});

	it("drops anchors, engines and retired players from the Chess LLM Benchmark", () => {
		const rows = parseChessLlmBenchmark([
			{ player_id: "eubos", rating: 2357, is_anchor: true, is_engine: true },
			{ player_id: "gemini-4-carbon (medium)", rating: 2243, confidence_low: 2036, confidence_high: 2450, avg_cost_per_game: 0.35, games_played: 13 },
			{ player_id: "old-model", rating: 1500, retired: true },
		]);
		assert.deepEqual(rows.map((row) => [row.label, row.value, row.ciLow, row.costUsd]), [["gemini-4-carbon (medium)", 2243, 2036, 0.35]]);
	});

	it("keeps each ChessBench setup with its effort", () => {
		const rows = parseChessbench({
			updatedAt: "2026-10-26T23:44:16Z",
			models: [{ name: "Gemini 4 Argon", url: "https://chessbench.org/models/gemini-4-argon", setups: [
				{ name: "Gemini 4 Argon", effort: "medium", rating: 2170.4, deviation: 89.5, qualified: true, status: "active", avgCost: 0.41, avgOutputTokens: 11854.7 },
				{ name: "Gemini 4 Argon", effort: "high", rating: 1900, provisional: true },
			] }],
		});
		assert.equal(rows.length, 1);
		assert.equal(rows[0].effort, "medium");
		assert.equal(rows[0].outputTokens, 11855);
		assert.equal(rows[0].observedOn, "2026-10-26");
	});
});

describe("games and 3D boards", () => {
	it("reads ranked DuelLab reasoning-variant rows and normalises its reasoning levels", () => {
		const csv = [
			"row_kind,track_id,ranking_status,model_display_name,reasoning_level,score,codegen_cost_usd_mean,last_measured_at",
			"track,full_freedom/mixed,ranked,Claude Fable 5.2,XHigh,99.394217,4.579,2026-11-21T16:33:07Z",
			"track,full_freedom/mixed,ranked,Pareto 26.10,Reasoning controls unavailable,90,,2026-11-21T00:00:00Z",
			"track,full_freedom/mixed,provisional,New Model,High,80,,",
			"track,overall/models,ranked,Claude Fable 5.2,Overall Models,95,,",
			"game,full_freedom/mixed,not_applicable,Claude Fable 5.2,XHigh,70,,",
		].join("\n");
		const rows = parseDuelLab(csv);
		assert.deepEqual(rows.map((row) => [row.label, row.effort, row.value]), [["Claude Fable 5.2", "xhigh", 99.394217], ["Pareto 26.10", undefined, 90]]);
		assert.equal(rows[1].note, "Reasoning controls unavailable");
		assert.equal(duelLabEffort("Reasoning disabled (historical request variant 2)"), "none");
		assert.equal(duelLabEffort("High effort + 32,000 thinking tokens"), "high");
		assert.equal(duelLabEffort("Enabled"), undefined);
	});

	it("reads MineBench, VoxelBench and threejseval ratings", () => {
		const mine = parseMinebench({ models: [{ slug: "gpt-6-astra", displayName: "GPT 6 Astra Pro", eloRating: 2169, ciLower: 2155, ciUpper: 2183, benchmark: { averageCostUsd: 2.3, averageTimeMs: 1_553_517 } }] });
		assert.deepEqual([mine[0].label, mine[0].value, mine[0].ciLow, mine[0].costUsd], ["GPT 6 Astra Pro", 2169, 2155, 2.3]);
		assert.equal(Math.round(mine[0].durationSeconds!), 1554);

		const voxel = parseVoxelbench("voxelbench-text", { totalModels: 1, leaderboard: [{ modelName: "GPT-6.1 Sol (Max)", rating: 2602, deviation: 100, gamesPlayed: 2387 }] });
		assert.deepEqual([voxel[0].label, voxel[0].value, voxel[0].ciLow], ["GPT-6.1 Sol (Max)", 2602, 2406]);
		assert.throws(() => parseVoxelbench("voxelbench-text", { totalModels: 57, leaderboard: [] }), /raise the limit/);

		const three = parseThreejsEval({ computedAt: "2026-11-22T06:02:02Z", models: [{ modelId: "claude-fable-5-2-high", label: "Fable 5.2 High", rating: 2244.7, battles: 54 }] });
		assert.deepEqual([three[0].label, three[0].value, three[0].observedOn], ["claude-fable-5-2-high", 2244.7, "2026-11-22"]);
	});

	it("files every GameFeel standard as its own benchmark", () => {
		assert.deepEqual(gamefeelIds("v1.5.2"), { overall: "gamefeel-v1-5-2", re: "gamefeel-re-v1-5-2" });
		const csv = "model,effort,price_per_task_usd,minutes_per_task,re_combined,avg\nOpus-5.5,XHigh,2.5,90,17.93,44.8\nGpt-6.1-Sol,XHigh,,,3.27,\n";
		const rows = parseGamefeel("v1.5.2", csv, "2026-11-21");
		assert.deepEqual(rows.map((row) => [row.benchmarkId, row.label, row.effort, row.value]), [
			["gamefeel-v1-5-2", "Claude Opus-5.5", "xhigh", 44.8],
			["gamefeel-re-v1-5-2", "Claude Opus-5.5", "xhigh", 17.93],
			["gamefeel-re-v1-5-2", "Gpt-6.1-Sol", "xhigh", 3.27],
		]);
		assert.equal(rows[0].durationSeconds, 5400);
		const ids = new Set(gamefeel.benchmarks.map((benchmark) => benchmark.id));
		assert.ok(ids.has("gamefeel-v1-2") && !ids.has("gamefeel-re-v1-2") && ids.has("gamefeel-re-v1-5-2"));
	});

	it("reads BoardBench's chart points and refuses an unknown release", () => {
		const flight = JSON.stringify('1:["$","section",null,{"points":[{"slug":"gpt-6-astra-high","className":"GPT-6 Astra","effort":"high","label":"GPT-6 Astra High","costUsd":0.56,"qualityPct":67.2}]}]');
		const html = (version: string) => `<span aria-current="true">boardbench-${version}</span><script>self.__next_f.push([1,${flight}])</script>`;
		assert.deepEqual(parseBoardbench(html("0.2")).map((row) => [row.label, row.effort, row.value]), [["GPT-6 Astra", "high", 67.2]]);
		assert.throws(() => parseBoardbench(html("0.3")), /current release is 0.3/);
	});

	it("reads OpenTTD-Bench medians with the coding client as harness, without the human player", () => {
		const rows = parseOpenttd({ schema: 1, updated: "2026-09-23", arms: [
			{ key: "opus55", model: "Claude Opus 5.5", client: "Claude Code", effort: "xhigh", status: "current", medians: { profit: 415300, value: 855343, cost_usd: 12.1 }, games: [{}, {}] },
			{ key: "human", model: "Human player", client: "OpenTTD game client", effort: null, status: "reference", medians: { profit: 147615, value: 297742 } },
		] });
		assert.deepEqual(rows.map((row) => [row.benchmarkId, row.label, row.harness, row.value]), [
			["openttd-bench-profit", "Claude Opus 5.5", "Claude Code", 415300],
			["openttd-bench-value", "Claude Opus 5.5", "Claude Code", 855343],
		]);
		assert.equal(rows[0].note, "median of 2 games");
	});

	it("reads WebsiteBench's leaderboard CSV", () => {
		const rows = parseWebsitebench("model,overall,request,browser,system,cost,tokens_millions,turns\nClaude Opus 5.5,26.19,71.1,21.7,35.3,305.09,1095.5,2234.8\n");
		assert.deepEqual([rows[0].label, rows[0].value, rows[0].costUsd], ["Claude Opus 5.5", 26.19, 305.09]);
	});
});

describe("other boards", () => {
	it("puts Claude back in front of tier-only Claude names", () => {
		assert.equal(withClaudePrefix("Opus-5.5"), "Claude Opus-5.5");
		assert.equal(withClaudePrefix("Fable 5.2 (xhigh)"), "Claude Fable 5.2 (xhigh)");
		assert.equal(withClaudePrefix("Claude Opus 5.5"), "Claude Opus 5.5");
		assert.equal(withClaudePrefix("Opus Magnum"), "Opus Magnum");
	});

	it("reads both ClutterBench prompts, where lower clutter is better", () => {
		const rows = parseClutterbench({ builtAt: "2026-11-19T03:50:29Z", board: [
			{ model: "sol62-xhigh", name: "GPT-6.2 Sol (xhigh)", effort: "xhigh", raw: { n: 6, clutter: 16.3 }, simple: { n: 6, clutter: 0 } },
			{ model: "wonder", name: "Muse Wonder", raw: { n: 6, clutter: 62.1 }, simple: null },
		], models: { wonder: { name: "Muse Wonder", effort: "low" } } });
		assert.deepEqual(rows.map((row) => [row.benchmarkId, row.label, row.effort, row.value]), [
			["clutterbench", "GPT-6.2 Sol (xhigh)", "xhigh", 16.3],
			["clutterbench-simple", "GPT-6.2 Sol (xhigh)", "xhigh", 0],
			["clutterbench", "Muse Wonder", "low", 62.1],
		]);
	});

	it("reads BullshitBench's clear-pushback rate per model and reasoning level", () => {
		const rows = parseBsbench("rank,model,org,reasoning,avg_score,green_rate\n1,anthropic/claude-opus-4.8@reasoning=xhigh,anthropic,xhigh,1.92,0.94\n2,openai/gpt-x@reasoning=default,openai,default,1.1,0.5\n");
		assert.deepEqual(rows.map((row) => [row.label, row.effort, row.value]), [["anthropic/claude-opus-4.8", "xhigh", 94], ["openai/gpt-x", undefined, 50]]);
		assert.equal(rows[1].note, "reasoning: default");
	});

	it("reads Bug Hunt Bench runs and skips superseded receipts", () => {
		const rows = parseBughunt({ meta: { bug_count: 105 }, runs: [
			{ model: "Gemini 4 Neon", harness: "Antigravity CLI", effort: "xhigh", n_runs: 3, date: "2026-11-19", fixed: 63, cost_usd: 46.34, cost_kind: "list", wall_min: 75.9 },
			{ model: "Gemini 4 Neon", harness: "Antigravity CLI", effort: "xhigh", fixed: 60, superseded: "Superseded by the mean of 5 runs" },
			{ model: "Muse Spark", harness: "Muse Code", effort: "default", fixed: 20, cost_usd: 1, cost_kind: "unknown" },
		] });
		assert.deepEqual(rows.map((row) => [row.label, row.effort, row.harness, row.value, row.costUsd]), [
			["Gemini 4 Neon", "xhigh", "Antigravity CLI", 63, 46.34],
			["Muse Spark", undefined, "Muse Code", 20, undefined],
		]);
		assert.equal(rows[0].note, "mean of 3 runs");
		assert.equal(Math.round(rows[0].durationSeconds!), 4554);
	});

	it("reads ClockBench's table and drops the human rows", () => {
		const html = "<table><tr><th>Rank</th><th>Model</th><th>Accuracy</th><th>Lab</th></tr><tr><td></td><td>Average Human Performance</td><td>90.7%</td><td></td></tr><tr><td>1</td><td>Claude Fable 5.2 Max</td><td>87.8%</td><td>Anthropic</td></tr></table>";
		assert.deepEqual(parseClockbench(html).map((row) => [row.label, row.value]), [["Claude Fable 5.2 Max", 87.8]]);
	});

	it("reads Hearing Bench as a share of clips", () => {
		const rows = parseHearingbench({ clips: 100, updated: "2026-11-18", models: [{ model: "Gemini 4 Carbon", harness: "Antigravity", effort: "medium", correct: 46, near_misses: 2, api_model_id: "google/gemini-4-carbon", cost_usd_per_run: 27.98, seconds_per_clip: 311, output_tokens_per_clip: 25491 }] });
		assert.deepEqual([rows[0].label, rows[0].effort, rows[0].harness, rows[0].value, rows[0].outputTokens], ["google/gemini-4-carbon", "medium", "Antigravity", 46, 25491]);
	});

	it("reads Khalil Bench and AGI-Pilled Bench", () => {
		const khalil = parseKhalilbench({ meta: { built_at_et: "2026-11-17 16:38 ET" }, board: [{ model: "Claude Fable 5.2", n: 5, score: 83 }] });
		assert.deepEqual([khalil[0].label, khalil[0].value, khalil[0].note, khalil[0].observedOn], ["Claude Fable 5.2", 83, "5 verdicts", "2026-11-17"]);
		const agi = parseAgiPilled({ models: [{ id: "cli:fable-xhigh", name: "Claude Fable 5.2", effort: "xhigh", harness: "Claude Code", family: "anthropic/claude-fable-5.2", score: 6.5, ci: [4, 9.5] }] });
		assert.deepEqual([agi[0].label, agi[0].effort, agi[0].harness, agi[0].value, agi[0].ciHigh], ["anthropic/claude-fable-5.2", "xhigh", "Claude Code", 6.5, 9.5]);
	});

	it("reads the newest llm2014 logic month and strips the estimate marker", () => {
		const latest = latestDataset([
			{ category: "logic", reportDate: "2026-10", tableIndex: 0, csv: "data/logic/2026-10.csv" },
			{ category: "logic", reportDate: "2026-11", tableIndex: 0, csv: "data/logic/2026-11.csv" },
			{ category: "code", reportDate: "2026-12", tableIndex: 0, csv: "data/code/2026-12.csv" },
		], "logic");
		assert.equal(latest.reportDate, "2026-11");
		const csv = '"模型","极限分数","中位分数","平均耗时(秒)"\n"GPT-6 Astra (xhigh)","89.81","86.35","419"\n"Opus 5.5 (xhigh ~Estimated)","74.69","71.08","295"\n';
		const rows = parseLlm2014Logic(csv, "2026-11");
		assert.deepEqual(rows.map((row) => [row.label, row.value]), [["GPT-6 Astra (xhigh)", 89.81], ["Claude Opus 5.5 (xhigh)", 74.69]]);
		assert.equal(rows[1].note, "median 71.08, estimated by the author");
		assert.equal(rows[0].observedOn, "2026-11-01");
	});

	it("turns Slopalytics' daily T3 Code telemetry into usage share and per-turn figures", () => {
		const rows = parseSlopalytics({
			schemaVersion: 4,
			start: "2026-10-23",
			endExclusive: "2026-11-22",
			models: [
				{ day: "2026-10-23", harness: "codex", model: "GPT-6.1 Sol", turns: 30_000 },
				{ day: "2026-10-23", harness: "claudeAgent", model: "Opus 5.5", turns: 60_000 },
				{ day: "2026-10-23", harness: "other", model: "Unreported model", turns: 10_000 },
			],
			metrics: [
				{ day: "2026-10-23", harness: "claudeAgent", model: "Opus 5.5", timedTurns: 600, durationMs: 600 * 4 * 60_000, tokenTurns: 600, output: 600 * 9_500, pricedTurns: 600, estimatedCost: 600 },
				{ day: "2026-10-23", harness: "codex", model: "GPT-6.1 Sol", timedTurns: 50, durationMs: 50 * 60_000, tokenTurns: 50, output: 5_000, pricedTurns: 0, estimatedCost: 0 },
			],
		});
		const value = (benchmarkId: string, label: string) => rows.find((row) => row.benchmarkId === benchmarkId && row.label === label)?.value;
		assert.equal(value("t3-code-usage-share", "Claude Opus 5.5"), 60);
		assert.equal(value("t3-code-usage-share", "GPT-6.1 Sol"), 30);
		assert.equal(value("t3-code-minutes-per-turn", "Claude Opus 5.5"), 4);
		assert.equal(value("t3-code-output-tokens-per-turn", "Claude Opus 5.5"), 9_500);
		assert.equal(value("t3-code-cost-per-turn", "Claude Opus 5.5"), 1);
		// Too few turns for a per-turn average, and the unreported bucket isn't a model.
		assert.equal(value("t3-code-minutes-per-turn", "GPT-6.1 Sol"), undefined);
		assert.ok(!rows.some((row) => row.label === "Unreported model"));
		assert.equal(rows[0].observedOn, "2026-11-21");
	});
});
