import { describe, expect, it } from "vitest";
import { getSupportedEfforts, validateOpenAIReasoningEffort } from "./openai-quirks";

function expectSupports(model: string, efforts: string[]) {
	const supported = getSupportedEfforts(model);
	for (const effort of efforts) {
		expect(supported).toContain(effort);
	}
	expect(supported).toHaveLength(efforts.length);
}

describe("openai reasoning effort quirks", () => {
	it("supports minimal/low/medium/high for gpt-5 base series", () => {
		expectSupports("gpt-5", ["minimal", "low", "medium", "high"]);
		expect(validateOpenAIReasoningEffort("gpt-5", "none")).toContain("does not support");
	});

	it("adds none for gpt-5.1", () => {
		expectSupports("gpt-5.1", ["none", "minimal", "low", "medium", "high"]);
		expect(validateOpenAIReasoningEffort("gpt-5.1", "none")).toBeNull();
	});

	it("adds xhigh for gpt-5.1-codex-max and later gpt-5.x codex", () => {
		expectSupports("gpt-5.1-codex-max", ["none", "minimal", "low", "medium", "high", "xhigh"]);
		expectSupports("gpt-5.2-codex", ["none", "minimal", "low", "medium", "high", "xhigh"]);
		expectSupports("gpt-5.3-codex", ["none", "minimal", "low", "medium", "high", "xhigh"]);
		expect(validateOpenAIReasoningEffort("gpt-5.3-codex", "xhigh")).toBeNull();
	});

	it("supports gpt-5.3 base with xhigh and normalizes provider-prefixed model ids", () => {
		expectSupports("gpt-5.3", ["none", "minimal", "low", "medium", "high", "xhigh"]);
		expectSupports("openai/gpt-5.3", ["none", "minimal", "low", "medium", "high", "xhigh"]);
		expect(validateOpenAIReasoningEffort("openai/gpt-5.3", "xhigh")).toBeNull();
	});
});
