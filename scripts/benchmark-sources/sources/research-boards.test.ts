import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { describe, it } from "node:test";
import { xlsxRows } from "../xlsx";
import { parseBlueprintBench2, parseButterBench, parseCorpoBench, parseDeepFinance, parseExploitBench, parseFrontierBreach, parseFrontierDesign, parseFrontierMemory, parseFrontierPhysics, gdpxModels, parseGdpx, parseRweBench, parseSolidworksBench, parseVendingBench2 } from "./agent-boards";
import { parseCursorBench, parseDeepSwe, parseFrontierCode, parseFrontierCs, parseFrontierRsi, parseFrontierSwe, parseKernelBench, parseLongTail, parsePostTrainBench } from "./coding-boards";
import { epochEffort, epochLabel, parseEpochRuns } from "./epoch";
import { epochTasks, frontierMath } from "./epoch";
import { latestCompetition, parseMathArenaOverall, parseMathArenaTable } from "./matharena";
import { metrLabel, parseMetr } from "./metr";
import { parseOsworld2, parseOsworldVerified } from "./osworld";
import { hfRows, lisanModel, parseBabyVision, parseHoneyBench, parseKaggleLeaderboard, parseLisanBench, parsePenaltyBench, parseShadowBench, parseSimpleBench, parseZeroBench } from "./reasoning-boards";
import { hubActionResult, hubLeaderboardId, parseHubLeaderboard } from "./terminal-bench";

const flight = (payload: string) => `<script>self.__next_f.push([1,${JSON.stringify(payload)}])</script>`;

describe("Epoch AI", () => {
	const csv = [
		"id_runs,task,model,Best score (across scorers),started_at,Status,Display name,mean_score,stderr",
		"r1,Chess Puzzles,gpt-6_high,0.5,2026-10-01T00:00:00Z,Success,GPT-6 (high),0.5,0.05",
		"r2,Chess Puzzles,gpt-6_high,0.6,2026-11-01T00:00:00Z,Success,GPT-6 (high),0.6,0.05",
		"r3,Chess Puzzles,kimi_max,0.4,2026-11-01T00:00:00Z,Success,\"Kimi K3.1 Pro (Together, max)\",0.4,",
		"r4,Chess Puzzles,broken,0.9,2026-11-01T00:00:00Z,Failed,Broken,0.9,",
		"r5,FrontierMath-Tier-4-v2-Private,gpt-6_high,0.25,2026-11-01T00:00:00Z,Success,GPT-6 (high),0.25,0.1",
	].join("\n");

	it("keeps the latest successful run per task and model", () => {
		const rows = parseEpochRuns(csv, [{ task: "Chess Puzzles", definition: epochTasks.benchmarks[0] }]);
		assert.equal(rows.length, 2);
		assert.equal(rows[0].label, "GPT-6 (high)");
		assert.equal(rows[0].value, 60);
		assert.ok(Math.abs(rows[0].ciLow! - 50.2) < 1e-9);
		assert.equal(rows[0].observedOn, "2026-11-01");
		assert.equal(rows[1].label, "Kimi K3.1 Pro (max)");
		assert.equal(rows[1].config, undefined);
	});

	it("keeps configurations Epoch runs separately apart from the standalone run", () => {
		assert.deepEqual(epochLabel("Claude Opus 5.5 (with fallback, max)"), { label: "Claude Opus 5.5 (max)", config: "with fallback" });
		assert.deepEqual(epochLabel("GPT-6 Astra (pro, max)"), { label: "GPT-6 Astra (max)", config: "pro" });
		assert.deepEqual(epochLabel("Kimi K3.1 Pro (Together, max)"), { label: "Kimi K3.1 Pro (max)" });
		const pair = [
			"id_runs,task,model,Best score (across scorers),started_at,Status,Display name,mean_score,stderr",
			"r1,GPQA diamond,claude-opus-5-5_max,0.86,2026-11-01T00:00:00Z,Success,Claude Opus 5.5 (max),0.86,",
			"r2,GPQA diamond,claude-opus-5-5-fallback_max,0.9,2026-11-01T00:00:00Z,Success,\"Claude Opus 5.5 (with fallback, max)\",0.9,",
		].join("\n");
		const task = epochTasks.benchmarks.find((definition) => definition.id.startsWith("gpqa"));
		if (!task) throw new Error("Epoch GPQA definition missing");
		const rows = parseEpochRuns(pair, [{ task: "GPQA diamond", definition: task }]);
		assert.deepEqual(rows.map((row) => [row.label, row.config, row.value]), [["Claude Opus 5.5 (max)", undefined, 86], ["Claude Opus 5.5 (max)", "with fallback", 90]]);
	});

	it("keeps each run's effort from its model id when the display name leaves it out", () => {
		// Live export rows: the GLM-5.2 runs share one display name; the effort is only in the model id.
		const runs = [
			"id_runs,task,model,Best score (across scorers),started_at,Status,Display name,Unique display name,mean_score,stderr",
			"r1,GPQA diamond,glm-5.2_max,0.8,2026-11-01T00:00:00Z,Success,GLM-5.2,GLM-5.2 (max),0.8,",
			"r2,GPQA diamond,glm-5.2_none,0.6,2026-11-01T00:00:00Z,Success,GLM-5.2,GLM-5.2 (none),0.6,",
			"r3,GPQA diamond,gpt-5-mini-2025-08-07_low,0.7,2026-11-01T00:00:00Z,Success,GPT-5 mini (low),GPT-5 mini (medium),0.7,",
			"r4,GPQA diamond,claude-haiku-4-5-20251001_32K,0.65,2026-11-01T00:00:00Z,Success,,,0.65,",
			"r5,GPQA diamond,gpt-4o,0.5,2026-11-01T00:00:00Z,Success,GPT-4o,GPT-4o,0.5,",
		].join("\n");
		const task = epochTasks.benchmarks.find((definition) => definition.id.startsWith("gpqa"));
		if (!task) throw new Error("Epoch GPQA definition missing");
		const rows = parseEpochRuns(runs, [{ task: "GPQA diamond", definition: task }]);
		assert.deepEqual(rows.map((row) => [row.label, row.effort, Math.round(row.value)]), [
			["GLM-5.2", "max", 80],
			["GLM-5.2", "none", 60],
			["GPT-5 mini (low)", "low", 70],
			["claude-haiku-4-5-20251001", "32k thinking", 65],
			["GPT-4o", undefined, 50],
		]);
		assert.equal(epochEffort("gpt-5.2-pro-2025-12-11_xhigh"), "xhigh");
		assert.equal(epochEffort("gemini-3.5-flash_minimal"), "minimal");
	});

	it("reads FrontierMath tiers from the same export", () => {
		const rows = parseEpochRuns(csv, frontierMath.benchmarks.map((definition, index) => ({ task: ["FrontierMath-Tiers-1-3-v2-Private", "FrontierMath-Tier-4-v2-Private", "FrontierMath-Erdos"][index], definition })));
		assert.deepEqual(rows.map((row) => [row.benchmarkId, row.value]), [["frontiermath-tier-4", 25]]);
	});
});

describe("METR", () => {
	it("reads 50% and 80% horizons in minutes", () => {
		const yaml = ["benchmark_name: METR-Horizon-v1.1", "results:", "  claude_3_7_sonnet_inspect:", "    metrics:", "      p50_horizon_length:", "        ci_high: 104.2", "        ci_low: 30.1", "        estimate: 56.5", "      p80_horizon_length:", "        estimate: 12.1"].join("\n");
		assert.deepEqual(parseMetr(yaml).map((row) => [row.benchmarkId, row.label, row.value, row.ciLow]), [
			["metr-time-horizon-50", "claude-3-7-sonnet", 56.5, 30.1],
			["metr-time-horizon-80", "claude-3-7-sonnet", 12.1, undefined],
		]);
		assert.equal(metrLabel("gpt_5_2025_08_07"), "gpt-5-2025-08-07");
	});
});

describe("MathArena", () => {
	const row = (name: string, predicted = "no", warning = "") => `<tr class="model-row" data-config="x"><td class="rank">1</td><td class="model-name"><a class="model-link" href="/models/x"> ${name} ${warning}</a></td><td class="left-row">Lab</td><td class="right-row metric-bar-cell metric-bar-cell--accuracy " style="--bar-width: 1%;" data-predicted="${predicted}"><span class="metric-bar-value"><span>81.25%</span> <span class="small-ci">± 7.81%</span></span></td><td class="right-row metric-bar-cell metric-bar-cell--cost" style=""><span class="metric-bar-value">$4.59</span></td><td class="right-row metric-bar-cell metric-bar-cell--tokens" style=""><span class="metric-bar-value">183562</span></td></tr>`;

	it("reads accuracy, interval, cost and tokens, and skips predicted rows", () => {
		const table = `<table><tr><th>Model</th></tr>${row("GPT-6.2 Sol (max)", "no", '<span class="contamination-warning" title="x">⚠️</span>')}${row("Future (max)", "yes")}</table>`;
		const [only, ...rest] = parseMathArenaTable({ table }, "matharena-apex");
		assert.equal(rest.length, 0);
		assert.equal(only.label, "GPT-6.2 Sol (max)");
		assert.equal(only.value, 81.25);
		assert.ok(Math.abs(only.ciLow! - 73.44) < 1e-9);
		assert.equal(only.costUsd, 4.59);
		assert.equal(only.outputTokens, 183562);
		assert.match(only.note!, /after the competition/);
	});

	it("reads the overall estimate and finds the latest Lean set", () => {
		const html = `<script>const releasePoints = [{"capability": 91.2, "name": "GPT-6.2 Sol (max)", "expected_cost": 0.86}];</script><a href="?comp=arxivlean--march"></a><a href="?comp=arxivlean--september"></a>`;
		assert.deepEqual(parseMathArenaOverall(html), [{ benchmarkId: "matharena", label: "GPT-6.2 Sol (max)", value: 91.2, costUsd: 0.86 }]);
		assert.equal(latestCompetition(html, /^arxivlean--/), "arxivlean--september");
	});
});

describe("Terminal-Bench", () => {
	it("reads hub rows, skipping multi-model and hidden rows", () => {
		const reply = `0:{"a":"$@1"}\n1:${JSON.stringify({ rows: [
			{ status: "display", metadata: { model_display: { label: "Opus 5.5" }, model_org: { label: "Anthropic" }, agent_display: { label: "Claude Code" }, reasoning_effort: "max", date: "2026-09-22" }, metrics: { accuracy: 64.85, accuracy_ci95_half_width: 3.11, n_trials: 330, total_cost_usd: 3300, output_tokens: 3300000, avg_trial_duration_sec: 4790.4 } },
			{ status: "display", metadata: { model_display: "Multiple", model_org: "Multiple", model_names: ["a", "b"] }, metrics: { accuracy: 84 } },
			{ status: "hide", metadata: { model_display: "GPT-5.5" }, metrics: { accuracy: 80 } },
		] })}`;
		const [row, ...rest] = parseHubLeaderboard(hubActionResult(reply), "terminal-bench-4.0");
		assert.equal(rest.length, 0);
		assert.deepEqual([row.label, row.effort, row.harness, row.value, row.costUsd, row.outputTokens], ["Claude Opus 5.5", "max", "Claude Code", 64.85, 10, 10000]);
	});

	it("keeps a fractional mean of output tokens per trial", () => {
		const [row] = parseHubLeaderboard({ rows: [{ status: "display", metadata: { model_display: "GPT-6 Astra" }, metrics: { accuracy: 50, n_trials: 2, output_tokens: 3 } }] }, "terminal-bench-4.0");
		assert.equal(row.outputTokens, 1.5);
	});

	it("finds the leaderboard id in the page payload", () => {
		assert.equal(hubLeaderboardId(flight('72:["$","$L74",null,{"leaderboards":[{"id":"f58e955f-4db5-48a0-87ec-1c324a4a9414","name":"2-0"}]}]')), "f58e955f-4db5-48a0-87ec-1c324a4a9414");
	});
});

describe("OSWorld", () => {
	it("keeps the newest dated release and v2.1 at the default budget", () => {
		const rows = parseOsworld2({
			defaultStepBudget: 500, defaultResultReleaseVersion: "v2026.06.24", defaultResultDatasetScope: "full", releaseVersions: ["v2026.06.24", "v2026.08.08", "v2.1"],
			results: [
				{ model: "Claude Opus 5", reasoning: "max", toolSetting: "batch tool", stepBudget: 500, releaseVersion: "v2026.08.08", datasetScope: "full", binaryAccuracy: 31.43, outputTokensPerTask: 123.4, official: true, modelType: "e2e" },
				{ model: "Claude Opus 5", reasoning: "max", stepBudget: 500, releaseVersion: "v2026.08.08", datasetScope: "offline", binaryAccuracy: 34.7, official: true },
				{ model: "Old", stepBudget: 500, binaryAccuracy: 10, official: true },
				{ model: "Darwinx w/ Claude Opus 4.8", stepBudget: 500, releaseVersion: "v2.1", datasetScope: "full", binaryAccuracy: 44, modelType: "agent" },
				{ model: "MuseSpark 1.3", reasoning: "max", stepBudget: 500, releaseVersion: "v2.1", datasetScope: "full", binaryAccuracy: 39.25, official: true },
			],
		});
		assert.deepEqual(rows.map((row) => [row.benchmarkId, row.label, row.value, row.harness, row.outputTokens]), [["osworld-2.0", "Claude Opus 5", 31.43, "batch tool", 123.4], ["osworld-2.1", "MuseSpark 1.3", 39.25, undefined, undefined]]);
	});

	it("reads the Verified workbook's general and specialised models", () => {
		const rows = parseOsworldVerified([["Model", "Approach type", "Max steps", "Success rate"], ["claude-opus-5[1m]", "General model", "100", "72.1"], ["claude-opus-5", "General model", "100", "70.4"], ["agent-s3", "Agentic framework", "100", "80"], ["UI-TARS-2", "Specialized model", "50", "47.5"]]);
		// The 1M-context run keeps its setting as the configuration, so it stays apart from the standard run.
		assert.deepEqual(rows.map((row) => [row.label, row.config, row.value]), [["claude-opus-5", "1M context", 72.1], ["claude-opus-5", undefined, 70.4], ["UI-TARS-2", undefined, 47.5]]);
	});

	it("reads cells from a minimal xlsx workbook", () => {
		const entry = (name: string, text: string) => ({ name, data: deflateRawSync(Buffer.from(text)) });
		// B1 lists t before r, and C1 is an inline string split into rich-text runs.
		const files = [
			entry("xl/sharedStrings.xml", "<sst><si><t>Model</t></si><si><r><t>o</t></r><r><t>3</t></r></si></sst>"),
			entry("xl/worksheets/sheet1.xml", '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c t="inlineStr" r="B1"><is><t>Approach type</t></is></c><c r="C1" s="2" t="inlineStr"><is><r><t>Ra</t></r><r><rPr><b/></rPr><t xml:space="preserve">te</t></r></is></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="C2"><v>23</v></c></row></sheetData></worksheet>'),
		];
		const locals: Buffer[] = [];
		const central: Buffer[] = [];
		let offset = 0;
		for (const file of files) {
			const name = Buffer.from(file.name);
			const local = Buffer.alloc(30);
			local.writeUInt32LE(0x04034b50, 0);
			local.writeUInt16LE(8, 8);
			local.writeUInt32LE(file.data.length, 18);
			local.writeUInt16LE(name.length, 26);
			const header = Buffer.alloc(46);
			header.writeUInt32LE(0x02014b50, 0);
			header.writeUInt16LE(8, 10);
			header.writeUInt32LE(file.data.length, 20);
			header.writeUInt16LE(name.length, 28);
			header.writeUInt32LE(offset, 42);
			locals.push(local, name, file.data);
			central.push(header, name);
			offset += 30 + name.length + file.data.length;
		}
		const directory = Buffer.concat(central);
		const end = Buffer.alloc(22);
		end.writeUInt32LE(0x06054b50, 0);
		end.writeUInt16LE(files.length, 10);
		end.writeUInt32LE(directory.length, 12);
		end.writeUInt32LE(offset, 16);
		assert.deepEqual(xlsxRows(Buffer.concat([...locals, directory, end])), [["Model", "Approach type", "Rate"], ["o3", "", "23"]]);
	});
});

describe("reasoning boards", () => {
	it("SimpleBench skips human baselines", () => {
		const js = 'const leaderboardData = [\n  { rank: "-", model: "Human Baseline*", score: "83.7%", organization: "", dateAdded: null },\n  { rank: "1st", model: "Claude Fable 5.2", score: "94.9%", organization: "Anthropic", dateAdded: "2026-11-10" },\n];';
		assert.deepEqual(parseSimpleBench(js), [{ benchmarkId: "simplebench", label: "Claude Fable 5.2", value: 94.9, observedOn: "2026-11-10" }]);
	});

	it("Kaggle leaderboard rows become percentages with an interval", () => {
		const [row] = parseKaggleLeaderboard({ rows: [{ modelVersionName: "Gemini 3.1 Pro Preview", candidateClass: "modelVersion", taskResults: [{ result: { numericResult: { value: 0.775, confidenceInterval: 0.025, hasConfidenceInterval: true }, evaluationDate: "2026-03-10T00:00:00Z" } }] }] }, "simpleqa-verified");
		assert.equal(row.value, 77.5);
		assert.equal(row.ciHigh, 80);
		assert.equal(row.observedOn, "2026-03-10");
	});

	it("LisanBench splits the thinking setting from the model id", () => {
		assert.deepEqual(lisanModel("google/gemini-3.1-pro-preview:thinking-high"), { label: "google/gemini-3.1-pro-preview", effort: "high" });
		assert.deepEqual(lisanModel("anthropic/claude-opus-4.5:thinking-16k"), { label: "anthropic/claude-opus-4.5", effort: "16k thinking" });
		// LisanBench publishes both "deepseek-v3.2" and "deepseek-v3.2:thinking"; they must not share an identity.
		assert.deepEqual(lisanModel("deepseek-v3.2:thinking"), { label: "deepseek-v3.2", effort: "thinking" });
		assert.deepEqual(lisanModel("deepseek-v3.2"), { label: "deepseek-v3.2" });
		const rows = parseLisanBench({ metadata: { num_words: 50 }, models: [{ id: "a", full: "x/a", label: "A" }, { id: "b", label: "B" }], aggregated: [{ model: "a", sum_chain_avg: 6445, sum_chain_avg_ci: [5619, 7266] }, { model: "b", sum_chain_avg: 10, coverage: { words: 40 } }] });
		assert.deepEqual(rows.map((row) => [row.label, row.value, row.ciLow]), [["x/a", 6445, 5619]]);
	});

	it("ShadowBench, Penalty Bench and HoneyBench skip references", () => {
		assert.deepEqual(parseShadowBench({ rows: [{ row: { kind: "model", model_name: "GPT-6 Luna", effort: "high", score: 35, ci_low: 32, ci_high: 37, minutes_per_episode: 2 } }, { row: { kind: "reference", model_name: "Featureless blob", score: 56 } }] }).map((row) => [row.label, row.effort, row.durationSeconds]), [["GPT-6 Luna", "high", 120]]);
		const penalty = 'const LEADER=[{"name": "Opus 5.5 (medium)", "vendor": "anthropic", "harness": "Claude Code", "acc": 54.6, "ci": [45, 64]}, {"name": "Referee with VAR", "vendor": "referee", "harness": "", "acc": 62.3}, {"name": "Inkling 2 Mini (default)", "vendor": "tm", "harness": "Claude Code", "acc": 51.4}];';
		assert.deepEqual(parsePenaltyBench(penalty).map((row) => row.label), ["Claude Opus 5.5 (medium)", "Inkling 2 Mini"]);
		const honey = '<summary aria-label="Opus 5.5, overall hack rate 31.6% of scored runs (0.0% attacking the infrastructure), 39.7% counting 11.7% of runs refused as hacks, 80% confidence interval 27.1–36.6%, environment breakdown">';
		assert.deepEqual(parseHoneyBench(honey).map((row) => [row.label, row.value, row.ciLow, row.ciHigh]), [["Claude Opus 5.5", 31.6, 27.1, 36.6]]);
	});

	it("ShadowBench reads every page of the Hugging Face split and refuses a short read", async () => {
		const all = Array.from({ length: 130 }, (_, index) => ({ row: { kind: "model", model_name: `M${index}`, score: index } }));
		const offsets: number[] = [];
		const { rows } = await hfRows(async (offset, length) => {
			offsets.push(offset);
			return { rows: all.slice(offset, offset + length), num_rows_total: all.length, partial: false };
		});
		assert.deepEqual(offsets, [0, 100]);
		assert.equal(parseShadowBench({ rows }).length, 130);
		// A server that stops at the 100-row preview no longer passes silently.
		await assert.rejects(hfRows(async (offset) => ({ rows: offset ? [] : all.slice(0, 100), num_rows_total: 130 })), /100 of 130/);
		await assert.rejects(hfRows(async () => ({ rows: all.slice(0, 10), num_rows_total: 10, partial: true })), /partial/);
	});

	it("ZeroBench and BabyVision read their tables", () => {
		const zero = '<table id="sortableTable"><tr><th>x</th></tr><tr> <td>GPT-6 Astra (max)</td> <td class="metric-cell bar-pass1" data-sort="43.2"><b>43.2</b></td> <td>52</td> <td>35</td> <td data-sort="0.558">$0.56</td> </tr></table>';
		assert.deepEqual(parseZeroBench(zero), [{ benchmarkId: "zerobench", label: "GPT-6 Astra (max)", value: 43.2, costUsd: 0.558 }]);
		const baby = '<tr> <td class="bv-lb-rank">-</td> <td class="bv-lb-model-name">Human<span class="bv-lb-model-type bv-lb-type-human">BASELINE</span></td> <td>Human</td> <td>-</td> <td>-</td> <td class="bv-lb-score">94.1%</td> </tr><tr> <td class="bv-lb-rank bv-lb-rank-2">2</td> <td class="bv-lb-model-name">Fable 5 (max) (with Python tools)</td> <td>Proprietary</td> <td>Anthropic</td> <td>Jun 9, 2026</td> <td class="bv-lb-score">90.5%</td> </tr>';
		assert.deepEqual(parseBabyVision(baby), [{ benchmarkId: "babyvision", label: "Claude Fable 5 (max)", harness: "with python tools", value: 90.5, observedOn: "2026-06-09" }]);
	});
});

describe("coding boards", () => {
	it("DeepSWE, FrontierSWE and FrontierCode", () => {
		assert.deepEqual(parseDeepSwe({ generated_at: "2026-11-20T00:00:00Z", rows: [{ model: "gpt-6-astra", harness: "mini-swe-agent", reasoning_effort: "xhigh", pass_at_1: 0.741, ci_lo: 0.712, ci_hi: 0.77, mean_output_tokens: 123.4 }] }).map((row) => [row.label, row.effort, Math.round(row.value * 10) / 10, row.outputTokens]), [["gpt-6-astra", "xhigh", 74.1, 123.4]]);
		const swe = flight('18:["$","$L27",null,{"entries":{"abs":{"best":[],"mean":[{"model":"Claude Fable 5.2","harness":"proximus","overall":69.9,"avgCostUsd":168.7}]}}}]');
		assert.deepEqual(parseFrontierSwe(swe).map((row) => [row.label, row.harness, row.value]), [["Claude Fable 5.2", "proximus", 69.9]]);
		const code = parseFrontierCode({ harness: { "SWE-1.6": "devin-cli" }, data: { "SWE-1.6": { na: { main: { new_score: 0.4, cost: 1.2 } } } } }, { main: "frontiercode-2.0" });
		assert.deepEqual(code.map((row) => [row.label, row.effort, row.harness, row.value]), [["SWE-1.6", undefined, "devin-cli", 40]]);
	});

	it("FrontierCS, CursorBench and KernelBench", () => {
		const cs = 'x=[{id:"astra",name:"GPT-6 Astra",short:"GPT-6 Astra",h:"Codex CLI",lab:"OpenAI"},{id:"new",name:"New",short:"New",h:"",lab:"X"}];PASS={astra:[45.8,22,48]};';
		assert.deepEqual(parseFrontierCs(cs).map((row) => [row.label, row.harness, row.value]), [["GPT-6 Astra", "Codex CLI", 45.8]]);
		const cursor = '<h1 class="t">CursorBench 4.1</h1><table><tr><th></th><th>Model</th><th>Score</th><th>Cost Cost / task</th><th>Tokens Tokens / task</th></tr><tr><td>1</td><td>Gemini 4 Neon Extra High</td><td>65.4 %</td><td>$ 10.67</td><td>136,273</td></tr></table>';
		assert.deepEqual(parseCursorBench(cursor).map((row) => [row.label, row.value, row.costUsd, row.outputTokens]), [["Gemini 4 Neon Extra High", 65.4, 10.67, 136273]]);
		assert.throws(() => parseCursorBench("<h1>CursorBench 5.0</h1>"), /version 5.0/);
		const kernel = parseKernelBench({ models: [{ slug: "a", name: "Claude Fable 5", benches: { hard: { harness: "or-fable", passed: 5, total_problems: 6, perf: 0.629 }, mega: { harness: null, perf: 0 } } }, { slug: "legacy-only", name: "Old", benches: {} }] });
		assert.deepEqual(kernel.map((row) => [row.benchmarkId, row.value]), [["kernelbench-com-hard", 62.9]]);
	});

	it("LongTail-SWE overall and per language", () => {
		const html = '<table id="leaderboard"><tr data-p1="82.01" data-p3="89.6" class="top"><td class="l rk">1</td><td class="l m">Opus 5.5<small>high</small></td><td class="mono">1M</td><td class="sc">82.0<span class="pm"> ±1.2</span></td></tr></table><table id="languages"><tr><th class="l">Language</th><th>N</th><th>Opus 5.5<small>high</small></th></tr><tr><td class="l m">F#</td><td class="n">16</td><td class="best">82.1</td></tr><tr><td class="l m">Overall</td><td class="n">202</td><td>82.0</td></tr></table>';
		assert.deepEqual(parseLongTail(html).map((row) => [row.benchmarkId, row.label, row.effort, row.value]), [["longtail-swe", "Claude Opus 5.5", "high", 82.01], ["longtail-swe-fsharp", "Claude Opus 5.5", "high", 82.1]]);
	});

	it("LongTail-SWE keeps a published thinking setting", () => {
		const html = '<table id="leaderboard"><tr data-p1="61.5"><td class="l m">DeepSeek V4<small>thinking</small></td></tr><tr data-p1="55"><td class="l m">DeepSeek V4</td></tr></table><table id="languages"><tr><th class="l">Language</th><th>N</th><th>DeepSeek V4<small>thinking</small></th></tr><tr><td class="l m">Lua</td><td class="n">10</td><td>60</td></tr></table>';
		assert.deepEqual(parseLongTail(html).map((row) => [row.benchmarkId, row.label, row.effort, row.value]), [["longtail-swe", "DeepSeek V4", "thinking", 61.5], ["longtail-swe", "DeepSeek V4", undefined, 55], ["longtail-swe-lua", "DeepSeek V4", "thinking", 60]]);
	});

	it("PostTrainBench and FrontierRSI", () => {
		assert.deepEqual(parsePostTrainBench({ resultsVersion: "v1.1", aggregatedScores: { "opus-4.8-max": { avg: 32.9, n: 2 }, "kimi-k3": { avg: 31.96 } } }).map((row) => [row.label, row.effort, row.value]), [["Claude opus-4.8", "max", 32.9], ["kimi-k3", undefined, 31.96]]);
		const rsi = 'window.FRSI = {"tasks":[{"id":"a","models":[{"model":"M","harness":"Codex","effort":"max","avg":0.5},{"model":"Partial","avg":1}]},{"id":"b","models":[{"model":"M","avg":1}]}]};';
		assert.deepEqual(parseFrontierRsi(rsi).map((row) => [row.label, row.harness, row.value]), [["M", "Codex", 75]]);
	});
});

describe("agent boards", () => {
	it("Andon Labs tables and Butter-Bench chart data", () => {
		assert.deepEqual(parseVendingBench2("<table><tr><th></th><th>Model</th><th>Money Balance</th></tr><tr><td>1</td><td>Gemini 4 Neon New</td><td>$16,843.41 ± $972</td></tr></table>").map((row) => [row.label, row.value]), [["Gemini 4 Neon", 16843.41]]);
		assert.deepEqual(parseBlueprintBench2("<table><tr><th></th><th>Model</th><th>Score</th></tr><tr><td>T2</td><td>Human*</td><td>0.586</td></tr><tr><td>37</td><td>Gemini 3 Flash</td><td>0.000**</td></tr></table>").map((row) => [row.label, row.value]), [["Gemini 3 Flash", 0]]);
		assert.deepEqual(parseButterBench("[{model:`Gemini 2.5 Pro`,score:.4,color:`var(--color-gemini-pro)`},{model:`Human`,score:.95,color:`var(--color-human)`}]").map((row) => [row.label, row.value]), [["Gemini 2.5 Pro", 40]]);
	});

	it("FrontierMemory, FrontierPhysics, FrontierBreach and Frontier Design", () => {
		// Shape of the live row: rank, model (task model in data-tip-task), score, score bar, cost.
		const memory = '<table class="unified-leaderboard"><tr data-harness="Letta Dream" data-dream-model="Gemini 4 Neon"><td class="index">1</td><td class="wide"><span class="entry-name" data-tip="" data-tip-mem="Gemini 4 Neon (xhigh)" data-tip-task="Opus 5.5 (max)" data-tip-meta="Task harness: Letta Code (0.34.15)">Gemini 4 Neon</span> <span class="lb-effort">[xhigh]</span></td><td class="score-cell"><span class="score">75.6%</span></td><td class="bar"><div class="bar-track" aria-label="Mean 75.6%" data-tip="75.6% ± 7.7%"></div></td><td class="num cost-col">$4.47</td></tr></table>';
		assert.deepEqual(parseFrontierMemory(memory), [{ benchmarkId: "frontiermemory", label: "Gemini 4 Neon", effort: "xhigh", harness: "Letta Dream", config: "task model Opus 5.5 (max)", value: 75.6, costUsd: 4.47 }]);
		const physics = 'e.exports=JSON.parse(\'x\');const d={"agents":[{"rank":1,"baseModel":"Claude Fable 5.2","harness":"Claude Code","effort":"max","overall":{"avg3":40,"ci":5},"minutes":{"perRollout":10}}]}';
		assert.deepEqual(parseFrontierPhysics(physics).map((row) => [row.label, row.value, row.ciLow, row.durationSeconds]), [["Claude Fable 5.2", 40, 35, 600]]);
		const breach = '<li aria-label="GPT-6 Astra, OpenAI: 7.6% attack success rate, plus or minus 3.8"></li><li aria-label="GPT-6 Astra, OpenAI: 9% attack success rate, plus or minus 1"></li>';
		assert.deepEqual(parseFrontierBreach(breach).map((row) => [row.label, row.value]), [["GPT-6 Astra", 7.6]]);
		const design = 'standings:[{name:"Human designers",org:"Contra",golden:!0,games:5,ranked:!0,elo:1739,ci:56,eloLo:1687,eloHi:1798},{name:"Claude Fable 5.2",org:"Anthropic",golden:!1,games:683,wins:498,rate:.73,interval:[.69,.76],ranked:!0,elo:1720,ci:40,eloLo:1680,eloHi:1760}]';
		assert.deepEqual(parseFrontierDesign(design).map((row) => [row.label, row.value]), [["Claude Fable 5.2", 1720]]);
	});

	it("Corpo-Bench, GDPx and DeepFinance", () => {
		const corpo = '<section data-board="corpo"><a class="row" href="/models/opus-4-6/" style=""><span class="nm">Opus 4.6 (max effort)</span><span class="cst">$71</span><span class="hrs">7<span class="u"> h</span></span><span class="num">49.1</span></a><a class="row" href="/models/q/"><span class="nm">Qwen3.8-27B · omp local: RTX 5090, 4-bit</span><span class="num">42.6</span></a></section>';
		assert.deepEqual(parseCorpoBench(corpo), [{ benchmarkId: "corpo-bench", label: "Claude Opus 4.6", effort: "max", harness: undefined, value: 49.1, costUsd: 71, durationSeconds: 25200 }]);
		const gdpxHtml = '<span class="text-[15px] font-medium">Claude Fable 5.2</span><span>16.4<!-- -->%</span>';
		assert.deepEqual(parseGdpx(gdpxHtml, [{ name: "Claude Fable 5.2", harness: "Claude Code", reasoning: "Max" }]), [{ benchmarkId: "gdpx", label: "Claude Fable 5.2", effort: "max", harness: "Claude Code", value: 16.4 }]);
		// November 2026 markup adds classes after font-medium.
		const gdpxNov = '<span class="min-w-0 text-[15px] font-medium leading-snug">GPT 6.2 Astra</span></span><span class="block text-sm font-semibold">19.3<!-- -->%</span>';
		assert.deepEqual(parseGdpx(gdpxNov).map((row) => [row.label, row.value]), [["GPT 6.2 Astra", 19.3]]);
		assert.deepEqual(gdpxModels(`x=JSON.parse('{"updatedAt":"2026-11-20","models":[{"name":"Claude Fable 5.2","harness":"Claude Code","reasoning":"Max"}]}')`), [{ name: "Claude Fable 5.2", harness: "Claude Code", reasoning: "Max" }]);
		// Without the metadata the rows would lose harness and effort and replace the stored ones, so the run fails.
		assert.throws(() => gdpxModels(undefined), /metadata script not found/);
		assert.throws(() => gdpxModels(`JSON.parse('{"updatedAt":"2026-11-20"}')`), /expected models/);
		const finance = flight('9:["$","$L1e",null,{"results":[{"rank":1,"model":"Claude Fable 5.2","reasoning":"max","score":62,"ciLow":51.5,"ciHigh":72.7,"costPerTask":37.8}]}]');
		assert.deepEqual(parseDeepFinance(finance).map((row) => [row.label, row.effort, row.value, row.costUsd]), [["Claude Fable 5.2", "max", 62, 37.8]]);
	});

	it("ExploitBench, RWE-Bench and SolidWorks-Bench", () => {
		const exploit = "<table><tr><th>Model</th><th>Tier reach</th><th>Cap coverage</th><th>Mean cap</th><th>Envs</th><th>Episodes</th><th>Spend</th></tr><tr><td>02 GPT 5.5 (Codex) AutoNudge 3000 t openai openai/gpt-5.5</td><td>T1</td><td>72%</td><td>9.8</td><td>41</td><td>100</td><td>$300</td></tr></table>";
		assert.deepEqual(parseExploitBench(exploit), [{ benchmarkId: "exploitbench-cap", label: "openai/gpt-5.5", harness: "Codex CLI + AutoNudge", value: 72, costUsd: 3 }]);
		const rwe = "  models: [\n    { name: 'GPT-6.2 Astra', lab: 'OpenAI', harness: 'Codex', effort: 'max', pass1: 40, lo: 33.7, hi: 46.6, cost: 13.68, time: 0.5, reported: null },\n  ],";
		assert.deepEqual(parseRweBench(rwe).map((row) => [row.label, row.harness, row.value, row.durationSeconds]), [["GPT-6.2 Astra", "Codex", 40, 1800]]);
		const solid = "<p>We used reasoning effort high for every model.</p><table><tr><th>Model</th><th>$ / machine</th><th>Median time</th><th>Reward</th></tr><tr><td>Fable 5.2</td><td>$69.10</td><td>3.6 h</td><td>0.573</td></tr></table>";
		assert.deepEqual(parseSolidworksBench(solid), [{ benchmarkId: "solidworks-bench", label: "Claude Fable 5.2", effort: "high", value: 0.573, costUsd: 69.1, durationSeconds: 12960 }]);
	});
});
