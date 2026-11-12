import { describe, expect, it } from "vitest";
import { modelLabel } from "./ModelPicker";

describe("modelLabel", () => {
	it("reads version pairs in an id as a version, before any catalog has named the model", () => {
		expect(modelLabel("claude-haiku-5-5")).toBe("Claude Haiku 5.5");
		expect(modelLabel("claude-3-5-sonnet")).toBe("Claude 3.5 Sonnet");
		expect(modelLabel("openai/gpt-6.1-sol")).toBe("GPT 6.1 Sol");
	});
	it("keeps dates and multi-digit numbers apart", () => {
		expect(modelLabel("gpt-4o-2024-08-06")).toBe("GPT 4o 2024 08 06");
		expect(modelLabel("claude-opus-4-5-20251101")).toBe("Claude Opus 4.5 20251101");
		expect(modelLabel("fixture-model")).toBe("Fixture Model");
	});
});
