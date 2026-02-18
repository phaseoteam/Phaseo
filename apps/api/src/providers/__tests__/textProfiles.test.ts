import { describe, expect, it } from "vitest";
import {
	getTextProviderDefaultMaxTokens,
	getTextProviderProfile,
	getTextProviderReasoningEffortFallback,
	getTextProviderTemperatureMax,
	normalizeTextProviderServiceTier,
	resolveTextProviderParamPolicyOverride,
} from "../textProfiles";

describe("text provider profiles", () => {
	it("resolves provider aliases to same profile", () => {
		expect(getTextProviderProfile("openai")?.id).toBe("openai");
		expect(getTextProviderProfile("azure")?.id).toBe("openai");
	});

	it("returns param policy overrides for known unsupported params", () => {
		expect(
			resolveTextProviderParamPolicyOverride({
				providerId: "cerebras",
				paramPathCandidates: ["presence_penalty"],
			}),
		).toBe(false);
	});

	it("provides normalize hints used by execute path", () => {
		expect(getTextProviderTemperatureMax("anthropic")).toBe(1);
		expect(getTextProviderDefaultMaxTokens("anthropic")).toBe(4096);
		expect(
			getTextProviderReasoningEffortFallback({
				providerId: "openai",
				model: "gpt-5-nano",
			}),
		).toEqual(["minimal", "low", "medium", "high"]);
	});

	it("normalizes service tier aliases by provider", () => {
		expect(normalizeTextProviderServiceTier("openai", "standard")).toBe(
			"default",
		);
		expect(normalizeTextProviderServiceTier("cerebras", "standard")).toBe(
			"default",
		);
		expect(normalizeTextProviderServiceTier("anthropic", "standard")).toBe(
			"standard",
		);
	});
});
