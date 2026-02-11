import { describe, expect, it } from "vitest";
import { googleUsageMetadataToIRUsage } from "./usage";

describe("googleUsageMetadataToIRUsage", () => {
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
		expect(usage?.outputTokens).toBe(1536);
		expect(usage?.totalTokens).toBe(2027);
		expect(usage?.reasoningTokens).toBe(425);
		expect(usage?._ext?.outputImageTokens).toBe(1120);
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
	});
});
