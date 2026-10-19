import { describe, expect, it } from "vitest";
import { googleUsageMetadataToIRUsage, normalizeGoogleUsage } from "./usage";

describe("googleUsageMetadataToIRUsage", () => {
	it.each([
		[{ serviceTier: "standard" }, "standard"],
		[{ serviceTier: "flex" }, "flex"],
		[{ service_tier: "priority" }, "priority"],
		[{ trafficType: "ON_DEMAND_PRIORITY" }, "priority"],
		[{ trafficType: "ON_DEMAND_FLEX" }, "flex"],
		[{ trafficType: "ON_DEMAND" }, "standard"],
	])("preserves the provider's reported tier %j", (metadata, tier) => {
		expect(googleUsageMetadataToIRUsage({ promptTokenCount: 5, candidatesTokenCount: 2, ...metadata })?.serviceTier).toBe(tier);
	});

	it("prefers a reported downgrade over the response header and ignores unknown tiers", () => {
		expect(googleUsageMetadataToIRUsage({ serviceTier: "standard" }, "priority")?.serviceTier).toBe("standard");
		expect(googleUsageMetadataToIRUsage({}, "flex")?.serviceTier).toBe("flex");
		expect(googleUsageMetadataToIRUsage({ serviceTier: "unknown" })?.serviceTier).toBeUndefined();
	});

	it("maps multimodal candidates token details into IR _ext usage fields", () => {
		const usage = googleUsageMetadataToIRUsage({
			promptTokenCount: 66,
			candidatesTokenCount: 1536,
			totalTokenCount: 2027,
			thoughtsTokenCount: 425,
			promptTokensDetails: [{ modality: "TEXT", tokenCount: 66 }],
			candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1120 }],
		});

		expect(usage?.inputTokens).toBe(66);
		// candidatesTokenCount excludes thoughts: 66 + 1536 + 425 = totalTokenCount.
		expect(usage?.outputTokens).toBe(1961);
		expect(usage?.totalTokens).toBe(2027);
		expect(usage?.reasoningTokens).toBe(425);
		expect(usage?._ext?.outputImageTokens).toBe(1120);
		expect(usage?.cachedReadTokensAreSubsetOfInput).toBeUndefined();
	});

	it("falls back to modality details when coarse token counts are absent", () => {
		const usage = googleUsageMetadataToIRUsage({
			promptTokensDetails: [
				{ modality: "TEXT", tokenCount: 5 },
				{ modality: "IMAGE", tokenCount: 3 },
			],
			candidatesTokensDetails: [
				{ modality: "IMAGE", tokenCount: 11 },
				{ modality: "TEXT", tokenCount: 2 },
			],
		});

		expect(usage?.inputTokens).toBe(8);
		expect(usage?.outputTokens).toBe(13);
		expect(usage?.totalTokens).toBe(21);
		expect(usage?._ext?.inputImageTokens).toBe(3);
		expect(usage?._ext?.outputImageTokens).toBe(11);
		expect(usage?.cachedReadTokensAreSubsetOfInput).toBeUndefined();
	});

	it("maps audio, video, and document modality token details", () => {
		const usage = googleUsageMetadataToIRUsage({
			promptTokensDetails: [
				{ modality: "AUDIO", tokenCount: 12 },
				{ modality: "VIDEO", tokenCount: 18 },
				{ modality: "DOCUMENT", tokenCount: 30 },
			],
			candidatesTokensDetails: [
				{ modality: "AUDIO", tokenCount: 7 },
				{ modality: "VIDEO", tokenCount: 9 },
			],
		});

		expect(usage?.inputTokens).toBe(60);
		expect(usage?.outputTokens).toBe(16);
		expect(usage?._ext?.inputAudioTokens).toBe(12);
		expect(usage?._ext?.inputVideoTokens).toBe(18);
		expect(usage?._ext?.outputAudioTokens).toBe(7);
		expect(usage?._ext?.outputVideoTokens).toBe(9);
	});

	it("marks cached tokens as subset-of-input in IR usage", () => {
		const usage = googleUsageMetadataToIRUsage({
			promptTokenCount: 120,
			cachedContentTokenCount: 30,
			candidatesTokenCount: 20,
			totalTokenCount: 140,
		});

		expect(usage?.cachedInputTokens).toBe(30);
		expect(usage?.cachedReadTokensAreSubsetOfInput).toBe(true);
	});

	it("counts thoughts as output and tool-use prompt tokens as input, as totalTokenCount does", () => {
		const usage = googleUsageMetadataToIRUsage({
			promptTokenCount: 100_003,
			cachedContentTokenCount: 20_011,
			candidatesTokenCount: 3_894,
			thoughtsTokenCount: 1_109,
			toolUsePromptTokenCount: 401,
			totalTokenCount: 105_407,
			promptTokensDetails: [
				{ modality: "TEXT", tokenCount: 99_485 },
				{ modality: "IMAGE", tokenCount: 307 },
				{ modality: "AUDIO", tokenCount: 211 },
			],
		});

		expect(usage).toMatchObject({
			inputTokens: 100_404,
			outputTokens: 5_003,
			totalTokens: 105_407,
			reasoningTokens: 1_109,
			cachedInputTokens: 20_011,
			_ext: { inputImageTokens: 307, inputAudioTokens: 211 },
		});
		expect(usage!.inputTokens + usage!.outputTokens).toBe(usage!.totalTokens);
	});

	it("reads the legacy thoughtTokenCount spelling and tool-use details without coarse counts", () => {
		const usage = googleUsageMetadataToIRUsage({
			promptTokenCount: 10,
			candidatesTokenCount: 4,
			thoughtTokenCount: 6,
			toolUsePromptTokensDetails: [{ modality: "TEXT", tokenCount: 3 }],
		});

		expect(usage).toMatchObject({ inputTokens: 13, outputTokens: 10, totalTokens: 23, reasoningTokens: 6 });
	});
});

describe("normalizeGoogleUsage", () => {
	it("subtracts non-text modalities from coarse input, output and cache counts", () => {
		const usage = normalizeGoogleUsage({
			promptTokenCount: 12, candidatesTokenCount: 10, cachedContentTokenCount: 4,
			promptTokensDetails: [{ modality: "IMAGE", tokenCount: 12 }],
			candidatesTokensDetails: [{ modality: "AUDIO", tokenCount: 8 }],
			cacheTokensDetails: [{ modality: "IMAGE", tokenCount: 4 }],
		});
		expect(usage).toMatchObject({ input_text_tokens: 0, input_image_tokens: 12, output_text_tokens: 2, output_audio_tokens: 8, cached_read_text_tokens: 0, cached_read_image_tokens: 4 });
	});

	it("does not add coarse tool tokens to detailed tool tokens twice", () => {
		const usage = normalizeGoogleUsage({
			promptTokensDetails: [{ modality: "TEXT", tokenCount: 2 }],
			toolUsePromptTokenCount: 3,
			toolUsePromptTokensDetails: [{ modality: "TEXT", tokenCount: 3 }],
		});
		expect(usage?.input_text_tokens).toBe(5);
	});

	it("maps cached token details to cached_read meters and flags subset semantics", () => {
		const usage = normalizeGoogleUsage({
			promptTokenCount: 120,
			cachedContentTokenCount: 30,
			promptTokensDetails: [{ modality: "TEXT", tokenCount: 120 }],
			cacheTokensDetails: [{ modality: "TEXT", tokenCount: 30 }],
		});

		expect(usage?.input_text_tokens).toBe(120);
		expect(usage?.cached_read_text_tokens).toBe(30);
		expect((usage as any)?.cached_read_tokens_are_subset_of_input).toBe(true);
	});

	it("maps cached image token details to cached_read_image_tokens", () => {
		const usage = normalizeGoogleUsage({
			promptTokenCount: 20,
			cacheTokensDetails: [{ modality: "IMAGE", tokenCount: 7 }],
		});

		expect(usage?.cached_read_image_tokens).toBe(7);
	});

	it("bills thoughts on the output text meter and keeps them as reasoning tokens", () => {
		const usage = normalizeGoogleUsage({
			promptTokenCount: 50,
			candidatesTokenCount: 1_536,
			thoughtsTokenCount: 425,
			candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1_120 }],
		});

		expect(usage).toMatchObject({ output_image_tokens: 1_120, output_text_tokens: 416 + 425, reasoning_tokens: 425 });
	});
});
