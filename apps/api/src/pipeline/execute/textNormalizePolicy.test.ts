import { describe, expect, it } from "vitest";
import {
	DEFAULT_ANTHROPIC_MAX_TOKENS,
	fallbackReasoningEfforts,
	isReasoningEffort,
	protocolTemperatureMax,
	providerTemperatureMax,
} from "./textNormalizePolicy";

describe("textNormalizePolicy", () => {
	it("exposes stable anthropic defaults", () => {
		expect(DEFAULT_ANTHROPIC_MAX_TOKENS).toBe(4096);
		expect(protocolTemperatureMax("anthropic.messages")).toBe(1);
		expect(providerTemperatureMax("anthropic")).toBe(1);
	});

	it("keeps non-anthropic temperature ceilings at 2", () => {
		expect(protocolTemperatureMax("openai.responses")).toBe(2);
		expect(providerTemperatureMax("openai")).toBe(2);
	});

	it("returns model-aware fallback reasoning efforts", () => {
		expect(fallbackReasoningEfforts("anthropic", "claude-3-5-sonnet")).toEqual([
			"low",
			"medium",
			"high",
			"xhigh",
		]);
		expect(fallbackReasoningEfforts("openai", "gpt-5-nano")).toEqual([
			"minimal",
			"low",
			"medium",
			"high",
		]);
	});

	it("validates reasoning effort enum values", () => {
		expect(isReasoningEffort("medium")).toBe(true);
		expect(isReasoningEffort("max")).toBe(false);
	});
});
