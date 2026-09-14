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
				providerId: "cohere",
				paramPathCandidates: ["stream_options"],
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
		expect(
			getTextProviderReasoningEffortFallback({
				providerId: "openai",
				model: "gpt-5.6-sol-pro",
			}),
		).toEqual(["none", "low", "medium", "high", "xhigh", "max"]);
	});

	it("allows gateway service tiers for Wafer", () => {
		expect(resolveTextProviderParamPolicyOverride({ providerId: "wafer", paramPathCandidates: ["service_tier"] })).toBe(true);
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
		expect(normalizeTextProviderServiceTier("morph", "standard")).toBe("default");
		expect(normalizeTextProviderServiceTier("morph", "flex")).toBe("standby");
	});
});
