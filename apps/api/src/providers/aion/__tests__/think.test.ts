// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import { describe, it, expect } from "vitest";
import { createAionThinkStreamState, extractAionThinkBlocks, processAionThinkStreamDelta } from "../think";

describe("Aion think parsing", () => {
	it("extracts think blocks from text", () => {
		const input = "Hello <think>step 1</think> world <think>step 2</think>!";
		const parsed = extractAionThinkBlocks(input);

		expect(parsed.main).toBe("Hello  world !");
		expect(parsed.reasoning).toEqual(["step 1", "step 2"]);
	});

	it("streams think blocks across chunks", () => {
		const state = createAionThinkStreamState();
		const first = processAionThinkStreamDelta(state, "<think>abc");
		const second = processAionThinkStreamDelta(state, "def</think>hi");

		expect(first.mainDelta).toBe("");
		expect(first.reasoningDelta).toBe("abc");
		expect(second.reasoningDelta).toBe("def");
		expect(second.mainDelta).toBe("hi");
		expect(state.reasoningChunks).toEqual(["abc", "def"]);
	});
});

