// Grok 4.3+ effort levels from https://docs.x.ai/developers/models/grok-4.3 (none to xhigh)
// and the grok-4.6 / grok-4.7 model pages (low to xhigh).
import { describe, expect, it } from "vitest";
import { withNormalizedReasoning } from "./reasoning";

const ir = (model: string, effort: string) => ({ model, messages: [], reasoning: { effort } }) as any;

describe("xAI reasoning effort", () => {
	it.each([
		["grok-4.3", "xhigh", "xhigh"],
		["grok-4.3", "none", "none"],
		["grok-4.3-latest", "xhigh", "xhigh"],
		["grok-4.7", "xhigh", "xhigh"],
	])("keeps %s effort %s as %s", (model, effort, expected) => {
		expect(withNormalizedReasoning(ir(model, effort)).reasoning?.effort).toBe(expected);
	});

	it.each([
		["grok-4.20-multi-agent-beta", "xhigh", "high"],
		["grok-4.20-multi-agent-beta", "max", "high"],
		["grok-4.20-multi-agent-beta", "minimal", "low"],
		["grok-4.20-multi-agent-beta", "none", "low"],
		["grok-4.7", "minimal", "low"],
		["grok-4.7", "max", "xhigh"],
		["grok-4.3", "minimal", "low"],
	])("maps %s effort %s to the nearest supported level %s", (model, effort, expected) => {
		expect(withNormalizedReasoning(ir(model, effort)).reasoning?.effort).toBe(expected);
	});
});
