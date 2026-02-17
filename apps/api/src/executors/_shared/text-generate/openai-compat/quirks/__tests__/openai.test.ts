import { describe, expect, it } from "vitest";
import { openAIQuirks } from "../../providers/openai/quirks";

describe("OpenAI quirks", () => {
	it("maps service_tier=standard to default", () => {
		const request: Record<string, any> = {
			service_tier: "standard",
		};

		openAIQuirks.transformRequest?.({ request, ir: {} as any });

		expect(request.service_tier).toBe("default");
	});

	it("preserves OpenAI-native service tier values", () => {
		const values = ["auto", "default", "flex", "priority"];

		for (const tier of values) {
			const request: Record<string, any> = { service_tier: tier };
			openAIQuirks.transformRequest?.({ request, ir: {} as any });
			expect(request.service_tier).toBe(tier);
		}
	});
});
