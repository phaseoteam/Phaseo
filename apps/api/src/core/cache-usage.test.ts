import { describe, expect, it } from "vitest";
import {
	irUsageToOpenAIStyle,
	reportedCacheTokens,
	resolveCacheTokenUsage,
	totalInputTokens,
	uncachedInputTokens,
} from "./cache-usage";

describe("resolveCacheTokenUsage", () => {
	it("reads Anthropic cache fields as additive to input_tokens", () => {
		const usage = { input_tokens: 50, cache_read_input_tokens: 30_000, cache_creation_input_tokens: 2_000, cache_creation: { ephemeral_5m_input_tokens: 1_500, ephemeral_1h_input_tokens: 500 } };
		const cache = resolveCacheTokenUsage(usage, 50);
		expect(cache).toMatchObject({ readTokens: 30_000, writeTokens: 2_000, write5mTokens: 1_500, write1hTokens: 500, readSubset: false, writeSubset: false });
		expect(uncachedInputTokens(50, cache)).toBe(50);
		expect(totalInputTokens(50, cache)).toBe(32_050);
	});

	it.each([
		["OpenAI Responses", { input_tokens: 10_000, input_tokens_details: { cached_tokens: 6_000, cache_write_tokens: 3_000 } }],
		["Kimi chat", { prompt_tokens: 10_000, prompt_tokens_details: { cached_tokens: 6_000, cache_write_tokens: 3_000 } }],
		["Alibaba chat", { prompt_tokens: 10_000, prompt_tokens_details: { cached_tokens: 6_000, cache_creation_input_tokens: 3_000 } }],
	])("reads %s cache counts as part of input", (_name, usage) => {
		const cache = resolveCacheTokenUsage(usage, 10_000);
		expect(cache).toMatchObject({ readTokens: 6_000, writeTokens: 3_000, readSubset: true, writeSubset: true });
		expect(uncachedInputTokens(10_000, cache)).toBe(1_000);
		expect(totalInputTokens(10_000, cache)).toBe(10_000);
	});

	it("lets explicit hints override the payload shape", () => {
		const cache = resolveCacheTokenUsage({
			input_tokens: 50,
			input_tokens_details: { cached_tokens: 30 },
			cached_read_tokens_are_subset_of_input: false,
		}, 50);
		expect(cache.readSubset).toBe(false);
	});

	it("treats an impossible subset reading as additive", () => {
		const cache = resolveCacheTokenUsage({ input_tokens: 50, input_tokens_details: { cached_tokens: 30_000 } }, 50);
		expect(cache.readSubset).toBe(false);
		expect(totalInputTokens(50, cache)).toBe(30_050);
	});
});

describe("irUsageToOpenAIStyle", () => {
	it("restates Anthropic IR usage with input including reads and writes", () => {
		expect(irUsageToOpenAIStyle({
			inputTokens: 50,
			outputTokens: 400,
			totalTokens: 450,
			cachedInputTokens: 30_000,
			cachedReadTokensAreSubsetOfInput: false,
			cachedWriteTokensAreSubsetOfInput: false,
			_ext: { cachedWriteTokens: 2_000, cachedWriteTokens5m: 2_000 },
		})).toEqual({ inputTokens: 32_050, totalTokens: 32_450, readTokens: 30_000, writeTokens: 2_000, write5mTokens: 2_000, write1hTokens: undefined });
	});

	it("leaves OpenAI-style IR usage unchanged", () => {
		expect(irUsageToOpenAIStyle({
			inputTokens: 10_000,
			outputTokens: 10,
			totalTokens: 10_010,
			cachedInputTokens: 6_000,
			cachedReadTokensAreSubsetOfInput: true,
			cachedWriteTokensAreSubsetOfInput: true,
			_ext: { cachedWriteTokens: 3_000 },
		})).toMatchObject({ inputTokens: 10_000, totalTokens: 10_010 });
	});
});

describe("reportedCacheTokens", () => {
	it("reports the priced cache meters", () => {
		expect(reportedCacheTokens({
			input_tokens: 32_050,
			input_tokens_details: { cached_tokens: 1 },
			pricing: { lines: [
				{ dimension: "input_text_tokens", quantity: 50 },
				{ dimension: "cached_read_text_tokens", quantity: 30_000 },
				{ dimension: "cached_write_text_tokens_5m", quantity: 1_500 },
				{ dimension: "cached_write_text_tokens_1h", quantity: 500 },
			] },
		})).toEqual({ readTokens: 30_000, writeTokens: 2_000, write5mTokens: 1_500, write1hTokens: 500 });
	});

	it("falls back to usage fields when there is no pricing breakdown", () => {
		expect(reportedCacheTokens({ prompt_tokens: 10_000, prompt_tokens_details: { cached_tokens: 6_000, cache_write_tokens: 3_000 } }))
			.toMatchObject({ readTokens: 6_000, writeTokens: 3_000 });
	});
});
