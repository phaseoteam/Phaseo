import { describe, expect, it } from "vitest";

import {
	resolveBatchPricingModelCandidates,
	resolveBatchPricingProviderCandidates,
	toProviderNativeBatchModelId,
} from "./batch-model-aliases";

describe("batch-model-aliases", () => {
	it("maps public Anthropic batch models to native dated slugs", () => {
		expect(toProviderNativeBatchModelId("anthropic", "anthropic/claude-haiku-4.5"))
			.toBe("claude-haiku-4-5-20251001");
		expect(toProviderNativeBatchModelId("anthropic", "anthropic/claude-3.5-haiku"))
			.toBe("claude-3-5-haiku-20241022");
		expect(toProviderNativeBatchModelId("anthropic", "anthropic/claude-sonnet-4.5"))
			.toBe("claude-sonnet-4-5-20250929");
		expect(toProviderNativeBatchModelId("anthropic", "anthropic/claude-sonnet-4.6"))
			.toBe("claude-sonnet-4-6");
	});

	it("adds public Anthropic model ids when pricing native dated slugs", () => {
		expect(resolveBatchPricingModelCandidates("anthropic", "claude-haiku-4-5-20251001"))
			.toContain("anthropic/claude-haiku-4.5");
		expect(resolveBatchPricingModelCandidates("anthropic", "claude-3-5-haiku-20241022"))
			.toContain("anthropic/claude-3.5-haiku");
		expect(resolveBatchPricingModelCandidates("anthropic", "claude-sonnet-4-5-20250929"))
			.toContain("anthropic/claude-sonnet-4.5");
		expect(resolveBatchPricingModelCandidates("anthropic", "claude-sonnet-4-6"))
			.toContain("anthropic/claude-sonnet-4.6");
	});

	it("restores the public Google prefix after native batch normalization", () => {
		expect(resolveBatchPricingModelCandidates("google-ai-studio", "gemini-2.5-flash"))
			.toContain("google/gemini-2.5-flash");
		expect(resolveBatchPricingModelCandidates("google-ai-studio", "google/gemini-2.5-flash-lite"))
			.toContain("google/gemini-2.5-flash-lite");
	});

	it("maps Mistral Small 4 between the catalog and native batch identifiers", () => {
		expect(toProviderNativeBatchModelId("mistral", "mistral/mistral-small-4"))
			.toBe("mistral-small-2603");
		expect(resolveBatchPricingModelCandidates("mistral", "mistral-small-2603"))
			.toContain("mistral/mistral-small-4");
		expect(resolveBatchPricingModelCandidates("mistral", "mistral-small-2603-batch"))
			.toContain("mistral/mistral-small-4");
	});

	it("maps the current SpaceXAI catalog namespace to the native xAI model", () => {
		expect(toProviderNativeBatchModelId("x-ai", "spacex-ai/grok-4.3")).toBe("grok-4.3");
		expect(resolveBatchPricingProviderCandidates("x-ai")).toEqual(["spacex-ai", "x-ai"]);
		expect(resolveBatchPricingModelCandidates("x-ai", "grok-4.3"))
			.toContain("spacex-ai/grok-4.3");
		expect(resolveBatchPricingModelCandidates("x-ai", "x-ai/grok-4.3"))
			.toContain("spacex-ai/grok-4.3");
	});
});
