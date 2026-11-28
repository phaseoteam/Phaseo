import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRows, protectedBenchmarks, refusalReason, stableUuid } from "./core";
import { ModelMatcher, splitEffort } from "./match";
import { htmlText, jsonAfter, nextFlight, parseCsv, parseNumber } from "./parse";
import { parseArcVersion } from "./sources/arc-prize";
import { parseWeirdmlV2, parseWeirdmlV3, weirdmlEffort } from "./sources/weirdml";
import type { BenchmarkSource } from "./types";

const models = [
	{ model_slug: "openai/gpt-6.2-astra", name: "GPT-6.2 Astra", status: "active", hidden: false },
	{ model_slug: "anthropic/claude-fable-5.2", name: "Claude Fable 5.2", status: "active", hidden: false },
	{ model_slug: "qwen/qwen4-max", name: "Qwen4 Max", status: "active", hidden: false },
	{ model_slug: "qwen/qwen3.8-max-0902", name: "Qwen 3.8 Max 0902", status: "active", hidden: false },
	{ model_slug: "google/gemini-4-neon", name: "Gemini 4 Neon", status: "active", hidden: false },
	{ model_slug: "google/gemini-4-neon-preview", name: "Gemini 4 Neon", status: "retired", hidden: true },
	{ model_slug: "acme/twin", name: "Twin", status: "active", hidden: false },
	{ model_slug: "other/twin", name: "Twin", status: "active", hidden: false },
];
const matcher = new ModelMatcher(models, [{ alias_slug: "openai/gpt-6.2-astra-latest", model_slug: "openai/gpt-6.2-astra" }], [
	{ source_id: "demo", label: "mystery model", model_slug: "qwen/qwen4-max", effort: null, ignored: false },
	{ source_id: null, label: "human panel", model_slug: null, effort: null, ignored: true },
]);

describe("splitEffort", () => {
	it("splits bracketed, suffixed and spelled-out efforts", () => {
		assert.deepEqual(splitEffort("GPT-6.2 Astra (high)"), { base: "GPT-6.2 Astra", effort: "high" });
		assert.deepEqual(splitEffort("openai/gpt-6.2-astra-xhigh"), { base: "gpt-6.2-astra", effort: "xhigh" });
		assert.deepEqual(splitEffort("Claude Fable 5.2 (no thinking)"), { base: "Claude Fable 5.2", effort: "none" });
		assert.deepEqual(splitEffort("Claude Fable 5.2, max effort"), { base: "Claude Fable 5.2", effort: "max" });
		assert.deepEqual(splitEffort("Gemini 4 Neon"), { base: "Gemini 4 Neon", effort: null });
		assert.deepEqual(splitEffort("GPT-6 Sol (None)"), { base: "GPT-6 Sol", effort: "none" });
		assert.deepEqual(splitEffort("Claude 3.7 (16K)"), { base: "Claude 3.7", effort: "16k thinking" });
		assert.deepEqual(splitEffort("accounts/fireworks/models/deepseek-v4-pro"), { base: "deepseek-v4-pro", effort: null });
	});
});

describe("ModelMatcher", () => {
	it("matches names, slugs and aliases regardless of punctuation", () => {
		assert.deepEqual(matcher.match("demo", "GPT-6.2 Astra (high)"), { kind: "matched", modelSlug: "openai/gpt-6.2-astra", effort: "high", via: "base" });
		assert.equal(matcher.match("demo", "openai/gpt-6.2-astra").kind, "matched");
		assert.equal((matcher.match("demo", "gpt-6.2-astra-latest") as { modelSlug: string }).modelSlug, "openai/gpt-6.2-astra");
		assert.equal((matcher.match("demo", "claude_fable_5_2") as { modelSlug: string }).modelSlug, "anthropic/claude-fable-5.2");
	});
	it("keeps a name that only looks like an effort when the catalogue has it whole", () => {
		assert.deepEqual(matcher.match("demo", "Qwen4 Max"), { kind: "matched", modelSlug: "qwen/qwen4-max", effort: null, via: "exact" });
	});
	it("takes an explicit effort over the label", () => {
		assert.equal((matcher.match("demo", "GPT-6.2 Astra", "low") as { effort: string }).effort, "low");
	});
	it("prefers the live model when names collide, and reports true ambiguity", () => {
		assert.equal((matcher.match("demo", "Gemini 4 Neon") as { modelSlug: string }).modelSlug, "google/gemini-4-neon");
		assert.deepEqual(matcher.match("demo", "Twin"), { kind: "unmatched", candidates: ["acme/twin", "other/twin"] });
		assert.equal((matcher.match("demo", "acme/twin") as { modelSlug: string }).modelSlug, "acme/twin");
	});
	it("handles release dates without crossing them", () => {
		assert.equal((matcher.match("demo", "qwen3.8-max-0902") as { modelSlug: string }).modelSlug, "qwen/qwen3.8-max-0902");
		assert.equal((matcher.match("demo", "Qwen 3.8 Max") as { modelSlug: string }).modelSlug, "qwen/qwen3.8-max-0902");
		assert.equal((matcher.match("demo", "Gemini 4 Neon 2026-11-18") as { modelSlug: string }).modelSlug, "google/gemini-4-neon");
		assert.equal(matcher.match("demo", "Qwen 3.8 Max-20260101").kind, "unmatched");
	});
	it("applies source and global pins first", () => {
		assert.equal((matcher.match("demo", "Mystery Model") as { modelSlug: string }).modelSlug, "qwen/qwen4-max");
		assert.equal(matcher.match("other", "Mystery Model").kind, "unmatched");
		assert.deepEqual(matcher.match("anything", "Human Panel"), { kind: "ignored" });
	});
});

const source: BenchmarkSource = {
	id: "demo",
	name: "Demo",
	publisher: "Demo Lab",
	url: "https://example.com",
	attribution: "Demo Lab",
	minRows: 2,
	benchmarks: [
		{ id: "demo-score", name: "Demo", url: "https://example.com/board", category: "general", type: "percentage", higherIsBetter: true, description: "d" },
		{ id: "demo-time", name: "Demo time", url: "https://example.com/time", category: "general", type: "numerical", higherIsBetter: false, description: "t" },
	],
	fetch: async () => [],
};

describe("buildRows", () => {
	const { rows, report } = buildRows(source, [
		{ benchmarkId: "demo-score", label: "GPT-6.2 Astra (high)", value: 70 },
		{ benchmarkId: "demo-score", label: "GPT-6.2 Astra (high)", value: 72, ciLow: 70, ciHigh: 74 },
		{ benchmarkId: "demo-score", label: "Claude Fable 5.2", value: 72 },
		{ benchmarkId: "demo-score", label: "GPT-6.2 Astra (low)", value: 50 },
		{ benchmarkId: "demo-score", label: "Unknown Model 9", value: 10 },
		{ benchmarkId: "demo-score", label: "Human Panel", value: 100 },
		{ benchmarkId: "demo-time", label: "Claude Fable 5.2", value: 30 },
		{ benchmarkId: "demo-time", label: "GPT-6.2 Astra (high)", value: 20 },
		{ benchmarkId: "nope", label: "Claude Fable 5.2", value: 1 },
	], matcher, "2026-11-21T00:00:00.000Z");

	it("keeps the best duplicate and one row per effort", () => {
		const scores = rows.filter((row) => row.benchmark_id === "demo-score");
		assert.equal(scores.length, 3);
		const high = scores.find((row) => row.effort === "high")!;
		assert.equal(high.score_numeric, 72);
		assert.equal(high.ci_low, 70);
		assert.equal(high.variant, "High");
	});
	it("gives ties the same competition rank and honours lower-is-better", () => {
		assert.deepEqual(rows.filter((row) => row.benchmark_id === "demo-score").map((row) => row.rank), [1, 1, 3]);
		assert.equal(rows.find((row) => row.benchmark_id === "demo-time" && row.rank === 1)!.model_slug, "openai/gpt-6.2-astra");
	});
	it("uses stable ids and tags every row with its source", () => {
		const row = rows.find((item) => item.model_slug === "anthropic/claude-fable-5.2" && item.benchmark_id === "demo-score")!;
		assert.equal(row.result_id, stableUuid("benchmark-source:demo:demo-score:anthropic/claude-fable-5.2::"));
		assert.ok(rows.every((item) => item.source_id === "demo" && !item.is_self_reported));
	});
	it("reports unmatched labels, ignored labels and unknown benchmarks", () => {
		assert.deepEqual(report.unmatched, [{ label: "Unknown Model 9", rows: 1, candidates: [] }]);
		assert.equal(report.ignoredLabels, 1);
		assert.deepEqual(report.unknownBenchmarks, ["nope"]);
	});
});

describe("refusalReason", () => {
	it("refuses thin runs and big drops, allows growth", () => {
		assert.match(refusalReason(source, 1, 1, 0)!, /fewer than/);
		assert.match(refusalReason(source, 30, 10, 40)!, /would replace 40/);
		assert.equal(refusalReason(source, 30, 25, 40), null);
		assert.equal(refusalReason(source, 3, 3, 10), null);
	});
});

describe("parsers", () => {
	it("parses quoted CSV and leaderboard numbers", () => {
		assert.deepEqual(parseCsv('a,b\n"x, y","he said ""hi"""\r\n1,2\n'), [{ a: "x, y", b: 'he said "hi"' }, { a: "1", b: "2" }]);
		assert.equal(parseNumber("72.4%"), 72.4);
		assert.equal(parseNumber("1,234"), 1234);
		assert.equal(parseNumber("−3.5"), -3.5);
		assert.equal(parseNumber("n/a"), null);
	});
	it("reads Next.js flight payloads", () => {
		const html = `<script>self.__next_f.push([1,"0:[\\"rows\\",{\\"data\\":[{\\"m\\":\\"A\\",\\"s\\":1}]}]"])</script>`;
		assert.deepEqual(jsonAfter(nextFlight(html), '"data"'), [{ m: "A", s: 1 }]);
	});
	it("reads WeirdML v2 CSV and v3 JSON", () => {
		const v2 = parseWeirdmlV2("internal_model_name,display_name,model_slug,avg_acc,avg_acc_standard_error,cost_per_run_usd,mean_total_output_tokens,release_date\ngpt-6-astra:max,gpt-6-astra (max),gpt-6-astra,0.93,0.001,7.7,21940,2026-10-01\n");
		assert.equal(v2[0].effort, "max");
		assert.equal(v2[0].label, "gpt-6-astra");
		assert.ok(Math.abs(v2[0].value - 93) < 1e-9);
		const v3 = parseWeirdmlV3({ schema_version: 1, mode: "real", generated: "2026-11-13T07:56:05Z", models: [
			{ id: "a", name: "Claude Fable 5.2 (xhigh)", slug: "anthropic/claude-fable-5.2", agent: "claude_code", reasoning_effort: "xhigh", score: 0.43, interval: [0.41, 0.44] },
			{ id: "b", name: "Synthetic", synthetic: true, score: 0.9 },
		] });
		assert.equal(v3.length, 1);
		assert.equal(v3[0].harness, "claude code");
		assert.equal(v3[0].observedOn, "2026-11-13");
		assert.throws(() => parseWeirdmlV3({ schema_version: 2, models: [] }), /format changed/);
	});
	it("keeps only plain models from ARC Prize", () => {
		const rows = parseArcVersion("arc-agi-2", /^v2_semi_private$/i, { generatedAt: "2026-11-20T16:14:09.211Z", evaluations: [
			{ datasetId: "v2_Semi_Private", modelId: "h", modelDisplayName: "Human Panel", modelType: null, score: 1 },
			{ datasetId: "v2_Semi_Private", modelId: "g", modelDisplayName: "GPT-6.2 Astra (High)", modelType: "CoT", score: 0.5, costPerTask: 2.1 },
			{ datasetId: "v2_Semi_Private", modelId: "k", modelDisplayName: "Kaggle ensemble", modelType: "Refinement", score: 0.6 },
			{ datasetId: "v2_Public_Eval", modelId: "g", modelDisplayName: "GPT-6.2 Astra (High)", modelType: "CoT", score: 0.7 },
		] });
		assert.deepEqual(rows, [{ benchmarkId: "arc-agi-2", label: "GPT-6.2 Astra (High)", value: 50, costUsd: 2.1, observedOn: "2026-11-20" }]);
	});
});

describe("result details", () => {
	it("keeps fractional published token means", () => {
		const { rows } = buildRows(source, [{ benchmarkId: "demo-score", label: "Claude Fable 5.2", value: 50, outputTokens: 31644.2 }], matcher, "2026-11-21T00:00:00.000Z");
		assert.equal(rows[0].output_tokens, 31644.2);
		const v2 = parseWeirdmlV2("internal_model_name,display_name,model_slug,avg_acc,mean_total_output_tokens\nm,m,m,0.5,33674.5\n");
		assert.equal(v2[0].outputTokens, 33674.5);
		const v3 = parseWeirdmlV3({ schema_version: 1, models: [{ id: "a", name: "A", score: 0.5, mean_output_tokens: 31644.2 }] });
		assert.equal(v3[0].outputTokens, 31644.2);
	});

	it("keeps distinct configurations apart and labels them", () => {
		const { rows } = buildRows(source, [
			{ benchmarkId: "demo-score", label: "GPT-6.2 Astra (high)", value: 60 },
			{ benchmarkId: "demo-score", label: "GPT-6.2 Astra (high)", value: 65, config: "with fallback" },
			{ benchmarkId: "demo-score", label: "GPT-6.2 Astra (high)", value: 55, config: "  " },
		], matcher, "2026-11-21T00:00:00.000Z");
		assert.equal(rows.length, 2);
		const plain = rows.find((row) => row.config === null)!;
		const fallback = rows.find((row) => row.config === "with fallback")!;
		assert.equal(plain.score_numeric, 60);
		assert.equal(plain.variant, "High");
		// A row without config keeps the key it had before config existed.
		assert.equal(plain.result_key, "demo:demo-score:openai/gpt-6.2-astra:high:");
		assert.equal(fallback.variant, "High, with fallback");
		assert.equal(fallback.result_key, "demo:demo-score:openai/gpt-6.2-astra:high::with fallback");
		assert.notEqual(fallback.result_id, plain.result_id);
		assert.match(fallback.other_info!, /configuration: with fallback/);
	});
});

describe("protectedBenchmarks", () => {
	const rowsFor = (benchmark_id: string, count: number) => Array.from({ length: count }, () => ({ benchmark_id }));
	it("keeps an empty board next to healthy ones and lets the healthy ones sync", () => {
		const stored = [...rowsFor("arc-agi-1", 80), ...rowsFor("arc-agi-2", 70), ...rowsFor("arc-agi-3", 30)];
		const incoming = [...rowsFor("arc-agi-1", 82), ...rowsFor("arc-agi-2", 69)];
		assert.equal(refusalReason({ ...source, minRows: 100 }, 151, incoming.length, stored.length), null, "source-wide totals look healthy");
		assert.deepEqual(protectedBenchmarks(incoming, stored), [{ benchmarkId: "arc-agi-3", stored: 30, incoming: 0, reason: "returned no results; kept 30 stored" }]);
	});
	it("keeps a board that shrank below half, even a small one", () => {
		assert.deepEqual(protectedBenchmarks(rowsFor("a", 4), rowsFor("a", 10)).map((item) => item.benchmarkId), ["a"]);
		assert.deepEqual(protectedBenchmarks(rowsFor("a", 0), rowsFor("a", 1)).map((item) => item.incoming), [0]);
		assert.deepEqual(protectedBenchmarks(rowsFor("a", 5), rowsFor("a", 10)), []);
		assert.deepEqual(protectedBenchmarks(rowsFor("new", 3), []), []);
	});
});

describe("WeirdML effort", () => {
	it("reads effort from the display label, never a provider suffix", () => {
		assert.equal(weirdmlEffort("gpt-oss-120b (medium)", "gpt-oss-120b:fireworks"), "medium");
		assert.equal(weirdmlEffort("gpt-oss-120b", "gpt-oss-120b:fireworks"), null);
		assert.equal(weirdmlEffort("qwen4 (local)", "qwen4:ollama"), null);
		assert.equal(weirdmlEffort("deepseek-v4", "deepseek-v4:novita"), null);
		assert.equal(weirdmlEffort("gpt-6-astra", "gpt-6-astra:xhigh"), "xhigh");
		assert.equal(weirdmlEffort("Qwen4 Max", "qwen4-max"), null);
		const rows = parseWeirdmlV2("internal_model_name,display_name,model_slug,avg_acc\ngpt-oss-120b:fireworks,gpt-oss-120b (medium),gpt-oss-120b,0.5\n");
		assert.equal(rows[0].effort, "medium");
	});
});

describe("htmlText", () => {
	it("decodes each entity once", () => {
		assert.equal(htmlText("<td>&amp;lt;b&amp;gt; &lt;i&gt; A&amp;B &#65;&#x42; &nbsp;x</td>"), "&lt;b&gt; <i> A&B AB x");
		assert.equal(htmlText("&bogus; &#9999999999;"), "&bogus; &#9999999999;");
	});
});
