import { pairPath, parsePairSlug, sortPair } from "./comparePairs";

describe("compare pair URLs", () => {
	it("writes one URL per pair, whichever model comes first", () => {
		expect(pairPath(["openai/gpt-6-astra", "anthropic/claude-opus-5.5"])).toBe("/compare/anthropic_claude-opus-5.5-vs-openai_gpt-6-astra");
		expect(pairPath(["anthropic/claude-opus-5.5", "openai/gpt-6-astra"])).toBe("/compare/anthropic_claude-opus-5.5-vs-openai_gpt-6-astra");
		expect(sortPair(["b/x", "a/y"])).toEqual(["a/y", "b/x"]);
	});

	it("reads a pair slug back in the order written", () => {
		expect(parsePairSlug("openai_gpt-6-astra-vs-anthropic_claude-opus-5.5")).toEqual(["openai/gpt-6-astra", "anthropic/claude-opus-5.5"]);
		expect(parsePairSlug("google_gemma-4-26b-a4b%3Afree-vs-google_gemma-4-31b%3Afree")).toEqual(["google/gemma-4-26b-a4b:free", "google/gemma-4-31b:free"]);
	});

	it("leaves gateway pages and malformed slugs alone", () => {
		expect(parsePairSlug("some-gateway")).toBeNull();
		expect(parsePairSlug("another-ai-gateway")).toBeNull();
		expect(parsePairSlug("openai_gpt-5-vs-openai_gpt-5")).toBeNull();
		expect(parsePairSlug("gpt-5-vs-claude")).toBeNull();
		expect(parsePairSlug("a-vs-b-vs-c")).toBeNull();
		expect(parsePairSlug("%E0%A4%A")).toBeNull();
	});
});
