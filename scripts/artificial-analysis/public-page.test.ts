import assert from "node:assert/strict";
import { test } from "node:test";
import { createCipheriv, createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { decodePublicData, extractFullPublicModels, extractPublicModels, publicDataManifest } from "./public-page";

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

const key = Buffer.alloc(32, 7);
const manifest = { path: "/data/abc123.txt", key: key.toString("hex") };
const encrypt = (data: unknown) => {
	const cipher = createCipheriv("aes-256-gcm", key, createHash("sha256").update(key).digest().subarray(0, 12));
	return Buffer.concat([cipher.update(gzipSync(JSON.stringify(data))), cipher.final(), cipher.getAuthTag()]);
};
test("discovers the model manifest rather than another page dataset", () => {
	const page = html(`a:${JSON.stringify([{ manifest: { path: "/data/other.txt", key: "other" }, promptType: "long" }, { initialModels: [model], manifest }])}\n`);
	assert.deepEqual(publicDataManifest(page), manifest);
	assert.throws(() => publicDataManifest(html(`a:${JSON.stringify({ initialModels: [], manifest: { ...manifest, path: "https://other.example/data.txt" } })}\n`)), /Invalid/);
});
test("extracts all frontend models, including ones absent from the default page selection", () => {
	const page = html(`a:${JSON.stringify({ initialModels: [model], manifest })}\n`);
	const models = [model, { ...model, id: "source-2", name: "Other model", slug: "other-model", canonicalIntelligenceIndexTokenCount: null, gpqa: 0.87 }];
	const result = extractFullPublicModels(page, encrypt({ models }), source, "now");
	assert.equal(result.models.length, 2);
	assert.equal(result.coverage, "full_frontend_dataset");
	assert.equal((result.models[1].benchmarkScores as Record<string, number>).gpqa, 0.87);
	assert.equal(result.dataUrl, "https://artificialanalysis.ai/data/abc123.txt");
	assert.throws(() => extractFullPublicModels(page, encrypt({ models: [model, model] }), source, "now"), /duplicate/);
});
test("rejects corrupt data and malformed full datasets", () => {
	const data = encrypt({ models: [model] });
	data[0] ^= 1;
	assert.throws(() => decodePublicData(data, manifest.key));
	assert.throws(() => decodePublicData(encrypt({ models: [] }), manifest.key), /empty/);
});
