import assert from "node:assert/strict";
import { test } from "node:test";
import { extractPublicModels } from "./public-page";

const source = "https://artificialanalysis.ai/models";
const model = { id: "source-1", name: "Model (high)", slug: "model-high", effort: "high", intelligenceIndex: 0, canonicalIntelligenceIndexTokenCount: { input: 10, output: 0, reasoning: null }, intelligenceIndexEvaluations: [{ slug: "omniscience", score: -3, outputTokensPerTask: 0 }] };
const html = (stream: string) => `<title>Intelligence Index v4.3.2</title><script>self.__next_f.push(${JSON.stringify([1, stream])})</script>`;

test("extracts public scores and token counts without conflating null and zero", () => {
	const result = extractPublicModels(html(`a:${JSON.stringify([model])}\n`), source, "2026-10-18T00:00:00Z");
	assert.equal(result.models.length, 1);
	assert.deepEqual(result.models[0].totalTokens, { input: 10, output: 0, reasoning: null });
	assert.equal(result.models[0].intelligenceIndex, 0);
	assert.deepEqual(result.methodologyVersions, ["4.3.2"]);
	assert.equal(result.coverage, "page_selection_only");
	assert.equal(result.sha256.length, 64);
});
test("reassembles split chunks and resolves referenced JSON records", () => {
	const stream = `a:${JSON.stringify([{ ...model, canonicalIntelligenceIndexTokenCount: "$b" }])}\nb:{"output":123}\n`;
	const page = html(stream.slice(0, 45)) + html(stream.slice(45));
	assert.deepEqual(extractPublicModels(page, source, "now").models[0].totalTokens, { output: 123 });
});
test("rejects changed pages, invalid counts, conflicting identities and missing references", () => {
	assert.throws(() => extractPublicModels("<html>Blocked</html>", source, "now"), /No model data/);
	for (const bad of [{ ...model, canonicalIntelligenceIndexTokenCount: { output: -1 } }, { ...model, canonicalIntelligenceIndexTokenCount: "$f" }]) {
		assert.throws(() => extractPublicModels(html(`a:${JSON.stringify([bad])}\n`), source, "now"));
	}
	assert.throws(() => extractPublicModels(html(`a:${JSON.stringify([model, { ...model, intelligenceIndex: 2 }])}\n`), source, "now"), /Conflicting/);
});
test("does not execute downloaded JavaScript", () => {
	assert.throws(() => extractPublicModels('<script>self.__next_f.push([1, globalThis.process.exit(0)])</script>', source, "now"));
});
test("ignores lightweight navigation entries and retains missing metrics as null", () => {
	const navigation = { slug: "model-high", name: "Model", intelligenceIndex: 50 };
	const result = extractPublicModels(html(`a:${JSON.stringify([navigation, { ...model, canonicalIntelligenceIndexTokenCount: null }])}\n`), source, null);
	assert.equal(result.models.length, 1);
	assert.equal(result.models[0].totalTokens, null);
	assert.equal(result.fetchedAt, null);
});
