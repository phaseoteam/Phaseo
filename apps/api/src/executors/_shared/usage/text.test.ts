import { describe, expect, it } from "vitest";
import { normalizeTextUsageForPricing } from "./text";

describe("normalizeTextUsageForPricing", () => {
	it("maps Google thoughtsTokenCount to reasoning_tokens", () => {
		const usage = normalizeTextUsageForPricing({
			promptTokenCount: 100,
			candidatesTokenCount: 50,
			totalTokenCount: 150,
			thoughtsTokenCount: 12,
		});

		expect(usage?.input_tokens).toBe(100);
		expect(usage?.output_tokens).toBe(50);
		expect(usage?.total_tokens).toBe(150);
		expect(usage?.reasoning_tokens).toBe(12);
	});

	it("maps IR _ext multimodal usage to pricing meters", () => {
		const usage = normalizeTextUsageForPricing({
			inputTokens: 66,
			outputTokens: 1536,
			totalTokens: 2027,
			reasoningTokens: 425,
			_ext: {
				inputImageTokens: 10,
				outputImageTokens: 1120,
				outputAudioTokens: 7,
				outputVideoTokens: 3,
				cachedWriteTokens: 2,
			},
		});

		expect(usage?.input_tokens).toBe(66);
		expect(usage?.output_tokens).toBe(1536);
		expect(usage?.total_tokens).toBe(2027);
		expect(usage?.reasoning_tokens).toBe(425);
		expect(usage?.input_image_tokens).toBe(10);
		expect(usage?.output_image_tokens).toBe(1120);
		expect(usage?.output_audio_tokens).toBe(7);
		expect(usage?.output_video_tokens).toBe(3);
		expect(usage?.cached_write_text_tokens).toBe(2);
	});

	it("passes through request-count usage meters", () => {
		const usage = normalizeTextUsageForPricing({
			prompt_tokens: 10,
			completion_tokens: 3,
			total_tokens: 13,
			request_count: 1,
		});

		expect(usage?.requests).toBe(1);
	});

	it("infers missing token split from total-only usage payloads", () => {
		const usage = normalizeTextUsageForPricing({
			total_tokens: 21,
		});

		expect(usage?.input_tokens).toBe(21);
		expect(usage?.output_tokens).toBe(0);
		expect(usage?.total_tokens).toBe(21);
		expect(usage?.requests).toBe(1);
	});

	it("maps Anthropic cache usage fields to pricing meters", () => {
		const usage = normalizeTextUsageForPricing({
			input_tokens: 1200,
			output_tokens: 300,
			total_tokens: 1500,
			cache_read_input_tokens: 800,
			cache_creation_input_tokens: 500,
		});

		expect(usage?.input_text_tokens).toBe(1200);
		expect(usage?.cached_read_text_tokens).toBe(800);
		expect(usage?.cached_write_text_tokens).toBe(500);
		expect((usage as any)?.cached_read_tokens_are_subset_of_input).toBeUndefined();
	});

	it("can treat cached read tokens as subset of input tokens", () => {
		const usage = normalizeTextUsageForPricing(
			{
				input_tokens: 123,
				output_tokens: 8,
				total_tokens: 131,
				input_tokens_details: {
					cached_tokens: 64,
				},
			},
			{
				cachedReadTokensAreSubsetOfInput: true,
			},
		);

		expect(usage?.input_tokens).toBe(123);
		expect(usage?.input_text_tokens).toBe(59);
		expect(usage?.cached_read_text_tokens).toBe(64);
		expect((usage as any)?.cached_read_tokens_are_subset_of_input).toBe(true);
		expect(usage?.output_text_tokens).toBe(8);
		expect(usage?.total_tokens).toBe(131);
	});

	it("auto-detects OpenAI-style cached token details as subset of input", () => {
		const usage = normalizeTextUsageForPricing({
			input_tokens: 123,
			output_tokens: 8,
			total_tokens: 131,
			input_tokens_details: {
				cached_tokens: 64,
			},
		});

		expect(usage?.input_tokens).toBe(123);
		expect(usage?.input_text_tokens).toBe(59);
		expect(usage?.cached_read_text_tokens).toBe(64);
		expect((usage as any)?.cached_read_tokens_are_subset_of_input).toBe(true);
	});

	it("honors IR cachedReadTokensAreSubsetOfInput semantics", () => {
		const usage = normalizeTextUsageForPricing({
			inputTokens: 123,
			outputTokens: 8,
			totalTokens: 131,
			cachedInputTokens: 64,
			cachedReadTokensAreSubsetOfInput: true,
		});

		expect(usage?.input_tokens).toBe(123);
		expect(usage?.input_text_tokens).toBe(59);
		expect(usage?.cached_read_text_tokens).toBe(64);
		expect((usage as any)?.cached_read_tokens_are_subset_of_input).toBe(true);
	});

	it("allows explicit opt-out of subset behavior", () => {
		const usage = normalizeTextUsageForPricing(
			{
				input_tokens: 123,
				output_tokens: 8,
				total_tokens: 131,
				input_tokens_details: {
					cached_tokens: 64,
				},
			},
			{
				cachedReadTokensAreSubsetOfInput: false,
			},
		);

		expect(usage?.input_text_tokens).toBe(123);
		expect(usage?.cached_read_text_tokens).toBe(64);
		expect((usage as any)?.cached_read_tokens_are_subset_of_input).toBeUndefined();
	});
});
