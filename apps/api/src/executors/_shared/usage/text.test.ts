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
});
