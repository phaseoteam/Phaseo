import { describe, expect, it } from "vitest";
import { latestHint, modelLabel, phaseoLabGroups, shortModelName } from "./ModelPicker";

describe("a model's name before any catalogue has named it", () => {
	it("keeps the version's dot", () => {
		expect(modelLabel("claude-opus-5-5")).toBe("Claude Opus 5.5");
		expect(modelLabel("claude-haiku-5-5-20261001")).toBe("Claude Haiku 5.5");
		expect(modelLabel("anthropic/claude-3-5-sonnet")).toBe("Claude 3.5 Sonnet");
		expect(modelLabel("gpt-6.1-sol")).toBe("GPT 6.1 Sol");
		expect(modelLabel("gpt-4-1106-preview")).toBe("GPT 4 1106 Preview");
	});
});

describe("the picker's left column", () => {
	it("gives each Phaseo lab its own place, the biggest first", () => {
		const models = [
			{ id: "openai/gpt-6.1-sol", organisationId: "openai", organisationName: "OpenAI" },
			{ id: "anthropic/claude-opus-5.5", organisationId: "anthropic", organisationName: "Anthropic" },
			{ id: "openai/gpt-6-luna", organisationId: "openai", organisationName: "OpenAI" },
			{ id: "mistral/large-4" },
		];
		expect(phaseoLabGroups(models)).toEqual([
			{ id: "lab:openai", label: "OpenAI", lab: "openai" },
			{ id: "lab:anthropic", label: "Anthropic", lab: "anthropic" },
			{ id: "lab:mistral", label: "mistral", lab: "mistral" },
		]);
		// This week's use comes first: one busy Mistral model outranks OpenAI's two quiet ones.
		expect(phaseoLabGroups(models, new Map([["mistral/large-4", 900_000], ["openai/gpt-6-luna", 10]])).map(group => group.lab)).toEqual(["mistral", "openai", "anthropic"]);
	});
});

describe("a Latest row's hint", () => {
	it("says what the alias runs now, without the words its name already has", () => {
		expect(latestHint({ name: "Claude Haiku Latest", latestOf: "Claude Haiku 5.5" })).toBe("5.5");
		expect(latestHint({ name: "GPT Astra Latest", latestOf: "GPT 6 Astra" })).toBe("6");
	});
});

describe("the composer's model button", () => {
	it("drops the family for a local agent's model and keeps the full name for a Phaseo one", () => {
		expect(shortModelName({ harness: "claude", model: "claude-opus-5-5" })).toBe("Opus 5.5");
		expect(shortModelName({ harness: "phaseo", model: "anthropic/claude-opus-5.5" })).toBe("Claude Opus 5.5");
		expect(shortModelName({ harness: "codex", model: "gpt-6.1-sol" })).toBe("GPT 6.1 Sol");
	});
});
