import { describe, expect, it } from "vitest";
import { claudeModelsFor } from "./claudeModels";

const aliases = [
	{ id: "default", name: "Default (recommended)", description: "Use the default model (currently Opus 5.5) · $4/$20 per Mtok" },
	{ id: "opus", name: "Opus", description: "Opus 5.5 · Best for everyday, complex tasks · $4/$20 per Mtok" },
	{ id: "fable", name: "Fable", description: "Fable 5.1 · Most capable for your hardest and longest-running tasks · $10/$50 per Mtok" },
	{ id: "haiku", name: "Haiku", description: "Haiku 5.5 · Fastest for quick answers · $0.10/$0.50 per Mtok" },
];

describe("claude models", () => {
	it("names each alias's model and pins its exact ID", () => {
		const models = claudeModelsFor(aliases, "2.1.296 (Claude Code)");
		expect(models.slice(0, 3)).toEqual([
			{ id: "claude-opus-5-5", name: "Claude Opus 5.5", description: "Best for everyday, complex tasks" },
			{ id: "claude-fable-5-1", name: "Claude Fable 5.1", description: "Most capable for your hardest and longest-running tasks" },
			{ id: "claude-haiku-5-5", name: "Claude Haiku 5.5", description: "Fastest for quick answers" },
		]);
		expect(models.find(model => model.id === "claude-sonnet-5-5")).toMatchObject({ legacy: true });
		expect(models.some(model => model.id === "default")).toBe(false);
	});

	it("keeps older models the installed Claude Code cannot run out of the list", () => {
		const ids = claudeModelsFor(aliases, "2.1.200").map(model => model.id);
		expect(ids).not.toContain("claude-opus-5");
		expect(ids).toContain("claude-fable-5");
	});

	it("keeps an alias it cannot parse", () => {
		expect(claudeModelsFor([{ id: "custom", name: "Custom", description: "Something new" }], "2.1.296")[0]).toEqual({ id: "custom", name: "Custom", description: "Something new" });
	});
});
