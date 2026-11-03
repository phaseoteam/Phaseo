import { describe, expect, it } from "vitest";
import { modelLabel, shortModelName } from "./ModelPicker";

describe("a model's name before any catalogue has named it", () => {
	it("keeps the version's dot", () => {
		expect(modelLabel("claude-opus-5-5")).toBe("Claude Opus 5.5");
		expect(modelLabel("claude-haiku-5-5-20261001")).toBe("Claude Haiku 5.5");
		expect(modelLabel("anthropic/claude-3-5-sonnet")).toBe("Claude 3.5 Sonnet");
		expect(modelLabel("gpt-6.1-sol")).toBe("GPT 6.1 Sol");
		expect(modelLabel("gpt-4-1106-preview")).toBe("GPT 4 1106 Preview");
	});
});

describe("the composer's model button", () => {
	it("drops the family for a local agent's model and keeps the full name for a Phaseo one", () => {
		expect(shortModelName({ harness: "claude", model: "claude-opus-5-5" })).toBe("Opus 5.5");
		expect(shortModelName({ harness: "phaseo", model: "anthropic/claude-opus-5.5" })).toBe("Claude Opus 5.5");
		expect(shortModelName({ harness: "codex", model: "gpt-6.1-sol" })).toBe("GPT 6.1 Sol");
	});
});
