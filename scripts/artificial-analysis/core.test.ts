import { strict as assert } from "node:assert";
import { test } from "node:test";
import { fetchModels, matchModel, mergeResults, resultsFor, type SourceModel } from "./core";

const source = (overrides: Partial<SourceModel> = {}): SourceModel => ({
	id: "aa-1", name: "Example 1", slug: "example-1", model_creator: { id: "creator-1", name: "OpenAI" },
	evaluations: { artificial_analysis_intelligence_index: 42, artificial_analysis_coding_index: 0, artificial_analysis_agentic_index: null },
	artificial_analysis_intelligence_index_cost: { total_cost: 12.34, cost_per_task: { total_cost: 0.05 } }, ...overrides,
});
const model = { model_id: "openai/example-1", organisation_id: "openai", name: "Example 1" };
const config = { models: {}, creators: {} };
const page = (models: SourceModel[], number = 1, more = false, version = 4.3) => Response.json({ intelligence_index_version: version, pagination: { page: number, has_more: more }, data: models });

test("fetches all free endpoint pages once and forwards server-side authentication", async () => {
	let calls = 0;
	const fetched = await fetchModels("test-key", async (url, init) => {
		calls++;
		assert.equal(String(url), `https://artificialanalysis.ai/api/v2/language/models/free?page=${calls}`);
		assert.equal((init?.headers as Record<string, string>)["x-api-key"], "test-key");
		return page([source({ id: `aa-${calls}` })], calls, calls === 1);
	});
	assert.equal(calls, 2);
	assert.equal(fetched.models.length, 2);
	assert.equal(fetched.version, 4.3);
});
test("fails on later-page errors instead of accepting a partial snapshot", async () => {
	let calls = 0;
	await assert.rejects(fetchModels("key", async () => ++calls === 1 ? page([source()], 1, true) : new Response(null, { status: 429 })), /429/);
});
test("accepts unavailable evaluation-cost and evaluation objects from the live free API", async () => {
	const withoutCost = source({ artificial_analysis_intelligence_index_cost: null });
	const withoutEvaluations = source({ id: "aa-2", evaluations: null });
	const snapshot = await fetchModels("key", async () => page([withoutCost, withoutEvaluations]));
	assert.equal(snapshot.models.length, 2);
	assert.equal(resultsFor(withoutCost, 4.3, snapshot.models).some((result) => result.benchmark_id === "aa-intelligence-index-cost-v4"), false);
	assert.equal(resultsFor(withoutEvaluations, 4.3, snapshot.models).length, 1);
});
test("rejects unknown major versions, empty data, duplicate IDs and broken metrics", async () => {
	for (const response of [page([source()], 1, false, 5), page([]), page([source(), source()]), page([source({ evaluations: {} })]), page([source({ artificial_analysis_intelligence_index_cost: { total_cost: -1 } })])]) {
		await assert.rejects(fetchModels("key", async () => response));
	}
});
test("rejects a changing index version or repeated page during pagination", async () => {
	for (const nextPage of [page([source({ id: "aa-2" })], 2, false, 4.4), page([source({ id: "aa-2" })], 1)]) {
		let calls = 0;
		await assert.rejects(fetchModels("key", async () => ++calls === 1 ? page([source()], 1, true) : nextPage), /inconsistent/);
	}
});
test("matches creator-scoped identifiers but never a different creator", () => {
	assert.equal(matchModel(model, [source()], config).source?.id, "aa-1");
	assert.equal(matchModel({ ...model, organisation_id: "other" }, [source()], config).status, "unmatched");
});
test("does not strip date, quantization or effort variants", () => {
	for (const suffix of ["-high", "-2026-01-01", "-int4", "-thinking"]) {
		assert.equal(matchModel(model, [source({ slug: `example-1${suffix}`, name: `Example 1${suffix}` })], config).status, "unmatched");
	}
});
test("keeps plus model families distinct", () => {
	const plus = source({ name: "Command R+", slug: "command-r-plus" });
	assert.equal(matchModel({ ...model, name: "Command R", model_id: "openai/command-r" }, [plus], config).status, "unmatched");
	assert.equal(matchModel({ ...model, name: "Command R+", model_id: "openai/command-r-plus" }, [plus], config).status, "matched");
});
test("ambiguous source variants require a stable ID mapping, not the highest score", () => {
	const sources = [source(), source({ id: "aa-2", name: "Example 1 (high)" })];
	assert.equal(matchModel(model, sources, config).status, "ambiguous");
	assert.equal(matchModel(model, sources, { ...config, models: { [model.model_id]: "aa-2" } }).source?.id, "aa-2");
	assert.throws(() => matchModel(model, sources, { ...config, models: { [model.model_id]: "missing" } }), /missing/);
	assert.equal(matchModel(model, sources, { ...config, models: { [model.model_id]: null } }).status, "excluded");
});
test("creator aliases support catalog naming differences", () => {
	assert.equal(matchModel({ ...model, organisation_id: "open-ai" }, [source()], { ...config, creators: { "open-ai": "creator-1" } }).source?.id, "aa-1");
});
test("imports zero, skips null, preserves exact cost and records evaluation provenance", () => {
	const results = resultsFor(source(), 4.3, [source()]);
	assert.equal(results.length, 3);
	assert.equal(results.find((row) => row.benchmark_id === "aa-coding-index-v4")?.score, 0);
	const cost = results.find((row) => row.benchmark_id === "aa-intelligence-index-cost-v4")!;
	assert.equal(cost.score, 12.34);
	assert.match(cost.other_info, /aa-1; Intelligence Index v4.3; USD 0.05 per task/);
});
test("ranks costs lower-first, intelligence higher-first, and ties equally", () => {
	const cheaper = source({ id: "aa-2", artificial_analysis_intelligence_index_cost: { total_cost: 1 } });
	const rows = resultsFor(source(), 4.3, [source(), cheaper]);
	assert.equal(rows.find((row) => row.benchmark_id === "aa-intelligence-index-cost-v4")?.rank, 2);
	assert.equal(rows.find((row) => row.benchmark_id === "aa-intelligence-index-v4")?.rank, 1);
});
test("repeated sync is idempotent, clears null managed scores and preserves other benchmarks", () => {
	const other = { benchmark_id: "mmlu", score: 89, source_link: "https://example.com" };
	const existing = { ...model, benchmarks: [other, { benchmark_id: "aa-agentic-index-v4", score: 99 }] };
	const rows = resultsFor(source(), 4.3, [source()]);
	const merged = mergeResults(existing, rows);
	assert.deepEqual(merged, [other, ...rows]);
	assert.deepEqual(mergeResults({ ...model, benchmarks: merged }, rows), merged);
});
