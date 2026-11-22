import assert from "node:assert/strict";
import { createCipheriv, createHash } from "node:crypto";
import { describe, it } from "node:test";
import { gzipSync } from "node:zlib";
import { decryptPublicData, publicDataManifest } from "../../artificial-analysis/public-page";
import type { SourceContext } from "../types";
import { aaLabel, artificialAnalysis, parseAaConfigs, parseAaErrorRates, type AaConfig } from "./artificial-analysis";
import { designArena, parseDesignArena, DESIGN_ARENA_BOARDS } from "./design-arena";
import { ARENA_BOARDS, arenaLabel, lmarena, parseArenaRows } from "./lmarena";

const byId = <T extends { benchmarkId: string }>(rows: T[], id: string) => rows.filter((row) => row.benchmarkId === id);

describe("Artificial Analysis", () => {
	const evalRow: AaConfig = {
		id: "c1",
		name: "Claude Sonnet 5.5 (Medium, Default Fallback)",
		effort: { slug: "medium" },
		gpqa: 0.82,
		cweBench: 0.5,
		cweBenchRefusalRate: 0.1,
		cyberIndex: 41.2,
		briefcaseElo: 1436.15,
		briefcaseBreakdown: { lower95ci: 1420, upper95ci: 1450 },
		omniscience: 18.6,
		omniscienceBreakdown: { accuracy: 0.45, hallucinationRate: 0.5, byDomain: { Law: 57.1, "Software Engineering (SWE)": 92.6 } },
	};

	it("labels configs without AA's fallback note and with the config's effort", () => {
		assert.deepEqual(aaLabel(evalRow), { label: "Claude Sonnet 5.5 (Medium)", effort: "medium" });
		assert.deepEqual(aaLabel({ id: "c2", name: "Gemma 4 31B (Reasoning)" }), { label: "Gemma 4 31B", effort: undefined });
		assert.deepEqual(aaLabel({ id: "c3", name: "Gemma 4 31B (Non-reasoning)" }), { label: "Gemma 4 31B (Non-reasoning)", effort: undefined });
	});

	it("stores shares as percentages, keeps index scales and reads Elo intervals", () => {
		const rows = parseAaConfigs([evalRow, { id: "c9", name: "Unscored" }], "evals");
		assert.equal(byId(rows, "aa-gpqa-diamond")[0].value, 82);
		assert.equal(byId(rows, "aa-cwe-bench-refusal-rate")[0].value, 10);
		assert.equal(byId(rows, "aa-cyber-index")[0].value, 41.2);
		assert.deepEqual(byId(rows, "aa-briefcase").map(({ value, ciLow, ciHigh }) => ({ value, ciLow, ciHigh })), [{ value: 1436.15, ciLow: 1420, ciHigh: 1450 }]);
		assert.equal(byId(rows, "aa-omniscience-v1-1-software-engineering")[0].value, 92.6);
		assert.equal(byId(rows, "aa-omniscience-v1-1-hallucination-rate")[0].value, 50);
		assert.equal(byId(rows, "aa-omniscience-v1-1-business").length, 0);
		assert.ok(rows.every((row) => row.label === "Claude Sonnet 5.5 (Medium)" && row.effort === "medium"));
	});

	it("takes speed and price only from the lab's own API and personality from the models dataset", () => {
		const firstParty: AaConfig = {
			id: "m1", name: "GPT-6.2 Astra (Max)", effort: { slug: "max" },
			performanceDataSource: { type: "firstParty", providerName: "OpenAI" }, priceDataSource: { type: "firstParty", providerName: "OpenAI" },
			headline: { outputSpeed: 120, timeToFirstToken: 3.5 }, price1mBlended0To3To1: 4.5,
			intelligenceIndexCostPerTask: { cost: { total: 0.78 } }, personalityBench: { indexScores: { slop: 21.7, warmth: 85.6 } },
		};
		const median: AaConfig = { id: "m2", name: "Open Model", performanceDataSource: { type: "median" }, priceDataSource: { type: "median" }, headline: { outputSpeed: 300, timeToFirstToken: 0.4 }, price1mBlended0To3To1: 0.2 };
		const rows = parseAaConfigs([firstParty, median], "models");
		assert.deepEqual(byId(rows, "aa-output-speed").map((row) => [row.label, row.value, row.note]), [["GPT-6.2 Astra (Max)", 120, "measured on OpenAI's API"]]);
		assert.equal(byId(rows, "aa-blended-price").length, 1);
		assert.equal(byId(rows, "aa-intelligence-index-cost-per-task-v5")[0].value, 0.78);
		assert.equal(byId(rows, "aa-personalitybench-slop")[0].value, 21.7);
		const slop = artificialAnalysis.benchmarks.find((benchmark) => benchmark.id === "aa-personalitybench-slop")!;
		assert.equal(slop.higherIsBetter, false);
	});

	it("reads the error rate of the endpoint the headline figures came from", () => {
		const config: AaConfig = { id: "m1", name: "Claude Sonnet 5.5 (Max, Default Fallback)", effort: { slug: "max" }, release: { slug: "claude-sonnet-5-5" }, performanceDataSource: { type: "firstParty", providerName: "Anthropic" }, headline: { outputSpeed: 151.06, timeToFirstToken: 246.6 } };
		const endpoints = [
			{ host: { name: "Anthropic" }, model: { release: { slug: "claude-sonnet-5-5" } }, performance: { outputSpeed: 151.06, timeToFirstToken: 246.6, endpointErrorRate: 0.025 } },
			{ host: { name: "Amazon Bedrock" }, model: { release: { slug: "claude-sonnet-5-5" } }, performance: { outputSpeed: 153.2, timeToFirstToken: 237.4, endpointErrorRate: 0.049 } },
		];
		assert.deepEqual(parseAaErrorRates([config], endpoints).map(({ benchmarkId, value, note, effort }) => ({ benchmarkId, value, note, effort })), [{ benchmarkId: "aa-endpoint-error-rate", value: 2.5, note: "measured on Anthropic's API", effort: "max" }]);
		// No unique endpoint with the headline figures: no row rather than a guess.
		assert.equal(parseAaErrorRates([config], [...endpoints, endpoints[0]]).length, 0);
	});

	it("finds the data file owned by a given component and decrypts it", () => {
		const key = createHash("sha256").update("fixture").digest();
		const cipher = createCipheriv("aes-256-gcm", key, createHash("sha256").update(key).digest().subarray(0, 12));
		const payload = [{ host: { name: "Anthropic" } }];
		const sealed = Buffer.concat([cipher.update(gzipSync(JSON.stringify(payload))), cipher.final(), cipher.getAuthTag()]);
		assert.deepEqual(decryptPublicData(new Uint8Array(sealed), key.toString("hex")), payload);
		const flight = (value: unknown) => `<script>self.__next_f.push(${JSON.stringify([1, `5:${JSON.stringify(value)}\n`])})</script>`;
		const html = flight({ other: { manifest: { path: "/data/aaaa.txt", key: "a".repeat(64) }, children: [] }, rows: { initialRows: [], manifest: { path: "/data/bbbb.txt", key: key.toString("hex") } } });
		assert.deepEqual(publicDataManifest(html, "initialRows"), { path: "/data/bbbb.txt", key: key.toString("hex") });
	});

	it("defines unique aa-* ids with cost, latency, refusal and error rates lower-is-better", () => {
		const ids = artificialAnalysis.benchmarks.map((benchmark) => benchmark.id);
		assert.equal(new Set(ids).size, ids.length);
		assert.ok(ids.every((id) => id.startsWith("aa-")));
		for (const id of ["aa-ttft", "aa-blended-price", "aa-endpoint-error-rate", "aa-intelligence-index-cost-per-task-v5", "aa-deepsecbench-refusal-rate"]) {
			assert.equal(artificialAnalysis.benchmarks.find((benchmark) => benchmark.id === id)!.higherIsBetter, false, id);
		}
	});
});

describe("Arena", () => {
	const text = ARENA_BOARDS.find((board) => board.config === "text_style_control")!;
	const agent = ARENA_BOARDS.find((board) => board.config === "agent")!;

	it("maps each category to its slice id with the Arena score and interval", () => {
		const rows = parseArenaRows(text, [
			{ model_name: "Gemini 4 Carbon (High)", category: "overall", rating: 1526.9, rating_lower: 1517.3, rating_upper: 1536.5, leaderboard_publish_date: "2026-11-19" },
			{ model_name: "Gemini 4 Carbon (High)", category: "industry_legal_and_government", rating: 1510, rating_lower: 1500, rating_upper: 1520 },
			{ model_name: "Gemini 4 Carbon (High)", category: "some_new_category", rating: 1400 },
		]);
		assert.deepEqual(rows.map(({ benchmarkId, value, ciLow, observedOn }) => ({ benchmarkId, value, ciLow, observedOn })), [
			{ benchmarkId: "lmarena-text", value: 1526.9, ciLow: 1517.3, observedOn: "2026-11-19" },
			{ benchmarkId: "lmarena-text-industry-legal-and-government", value: 1510, ciLow: 1500, observedOn: undefined },
		]);
	});

	it("scales Agent Arena IPS scores by 100 and reads Parquet bigints", () => {
		const [row] = parseArenaRows(agent, [{ model_name: "Claude Fable 5.2 (Max)", category: "overall", score: 0.2742, score_ci_lower: 0.2446, score_ci_upper: 0.3038, cost_per_task_p50: 9.16, output_tokens_per_task_p50: 127812n }]);
		assert.equal(row.benchmarkId, "agentarena-net-improvement");
		assert.ok(Math.abs(row.value - 27.42) < 1e-9);
		assert.equal(row.outputTokens, 127812);
		assert.equal(row.costUsd, 9.16);
	});

	it("splits search tools into the harness, reads bracketed dates and skips agents", () => {
		assert.deepEqual(arenaLabel("GPT-5.2 (Search, Non-Reasoning)"), { label: "GPT-5.2 (Non-Reasoning)", harness: "search" });
		assert.deepEqual(arenaLabel("Gemini 3 Pro (Grounding)"), { label: "Gemini 3 Pro", harness: "grounding" });
		assert.deepEqual(arenaLabel("o3 (2025-04-16)"), { label: "o3 2025-04-16", harness: undefined });
		assert.deepEqual(arenaLabel("Grok 4 (0709)"), { label: "Grok 4 0709", harness: undefined });
		const search = ARENA_BOARDS.find((board) => board.config === "search_style_control")!;
		assert.equal(parseArenaRows(search, [{ model_name: "Amazon-Web-Search-Agent", category: "overall", rating: 1266 }]).length, 0);
	});

	it("keeps the existing overall ids and unique slice ids", () => {
		const ids = lmarena.benchmarks.map((benchmark) => benchmark.id);
		assert.equal(new Set(ids).size, ids.length);
		for (const id of ["lmarena-text", "lmarena-webdev", "agentarena-net-improvement", "lmarena-text-hard-prompts-english", "lmarena-vision-ocr", "lmarena-webdev-html", "lmarena-image-to-webdev", "agentarena-steerability"]) assert.ok(ids.includes(id), id);
		assert.ok(ids.every((id) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)));
	});
});

describe("Design Arena", () => {
	const website = DESIGN_ARENA_BOARDS.find((board) => board.category === "website")!;

	it("reads Bradley-Terry ratings with a 95% interval and skips the human reference", () => {
		const rows = parseDesignArena(website, { success: true, data: [
			{ modelId: "gpt-6.2-sol", elo: 1349, btStdErr: 10, battles: 502, avgCostUsd: 0.18, avgGenerationTimeMs: 206998 },
			{ modelId: "human", elo: 1500, btStdErr: 5 },
		] });
		assert.deepEqual(rows, [{ benchmarkId: "design-arena-website", label: "gpt-6.2-sol", value: 1349, ciLow: 1329.4, ciHigh: 1368.6, costUsd: 0.18, durationSeconds: 206.998, note: "502 battles" }]);
		assert.throws(() => parseDesignArena(website, { success: false }), /format changed/);
	});

	it("fetches every board from the leaderboard API", async () => {
		const urls: string[] = [];
		const ctx: SourceContext = {
			fetchText: async () => "",
			fetchJson: async <T>(url: string) => { urls.push(url); return { success: true, data: [{ modelId: "claude-fable-5-2", elo: 1300, btStdErr: 4 }] } as T; },
		};
		const rows = await designArena.fetch(ctx);
		assert.equal(rows.length, DESIGN_ARENA_BOARDS.length);
		assert.ok(urls.includes("https://www.designarena.ai/api/leaderboard?arenaType=agents&category=agon_blender"));
	});
});
