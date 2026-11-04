import { describe, expect, it } from "vitest";
import { claudeModelsFor, claudeRunOptions } from "./claudeModels";

const aliases = [
	{ id: "default", name: "Default (recommended)", description: "Use the default model (currently Opus 5.5) · $4/$20 per Mtok" },
	{ id: "opus", name: "Opus", description: "Opus 5.5 · Best for everyday, complex tasks · $4/$20 per Mtok", resolvedModel: "claude-opus-5-5" },
	{ id: "fable", name: "Fable", description: "Fable 5.1 · Most capable for your hardest and longest-running tasks · $10/$50 per Mtok" },
	{ id: "haiku", name: "Haiku", description: "Haiku 5.5 · Fastest for quick answers · $0.10/$0.50 per Mtok", supportsEffort: true, supportedEffortLevels: ["low", "medium", "high"] },
];

describe("claude models", () => {
	it("names each alias's model, pins its exact ID and attaches its settings", () => {
		const models = claudeModelsFor(aliases, "2.1.296 (Claude Code)");
		expect(models.slice(0, 3).map(({ id, name, description }) => ({ id, name, description }))).toEqual([
			{ id: "claude-opus-5-5", name: "Claude Opus 5.5", description: "Best for everyday, complex tasks" },
			{ id: "claude-fable-5-1", name: "Claude Fable 5.1", description: "Most capable for your hardest and longest-running tasks" },
			{ id: "claude-haiku-5-5", name: "Claude Haiku 5.5", description: "Fastest for quick answers" },
		]);
		expect(models[0].options?.map(option => option.id)).toEqual(["effort", "ultracode", "fastMode", "contextWindow"]);
		expect(models[1].options?.map(option => option.id)).toEqual(["effort", "ultracode", "contextWindow"]);
		expect(models[2].options).toEqual([{ id: "effort", label: "Reasoning", type: "select", options: [{ id: "low", label: "Low" }, { id: "medium", label: "Medium", isDefault: true }, { id: "high", label: "High" }] }]);
		expect(models.find(model => model.id === "claude-sonnet-5-5")).toMatchObject({ legacy: true });
		expect(models.some(model => model.id === "default")).toBe(false);
	});

	it("keeps older models the installed Claude Code cannot run out of the list", () => {
		const ids = claudeModelsFor(aliases, "2.1.200").map(model => model.id);
		expect(ids).not.toContain("claude-opus-5");
		expect(ids).toContain("claude-fable-5");
	});

	it("offers only the levels and Fast mode Claude Code reports for a known model", () => {
		const reported = { id: "opus", name: "Opus", description: "Opus 5.5 · Best for everyday, complex tasks", resolvedModel: "claude-opus-5-5", supportsEffort: true, supportedEffortLevels: ["low", "medium", "high"], supportsFastMode: false };
		const [opus] = claudeModelsFor([reported], "2.1.296");
		const effort = opus.options?.find(option => option.id === "effort");
		expect(effort?.type === "select" && effort.options.map(option => option.id)).toEqual(["low", "medium", "high"]);
		expect(opus.options?.some(option => option.id === "fastMode")).toBe(false);
		const [unreported] = claudeModelsFor([{ ...reported, supportedEffortLevels: undefined, supportsEffort: undefined, supportsFastMode: undefined }], "2.1.296");
		expect(unreported.options?.map(option => option.id)).toEqual(["effort", "ultracode", "fastMode", "contextWindow"]);
	});

	it("keeps an alias it cannot parse", () => {
		expect(claudeModelsFor([{ id: "custom", name: "Custom", description: "Something new" }], "2.1.296")[0]).toEqual({ id: "custom", name: "Custom", description: "Something new" });
	});
});

describe("claude run options", () => {
	it("uses the model's default context window and leaves effort to Claude Code", () => {
		expect(claudeRunOptions("claude-opus-5-5", undefined)).toEqual({ model: "claude-opus-5-5[1m]", effort: undefined, settings: { fastMode: false } });
		expect(claudeRunOptions("claude-sonnet-5-5", undefined)).toMatchObject({ model: "claude-sonnet-5-5", settings: undefined });
	});

	it("passes effort, fast mode and a 200k window", () => {
		expect(claudeRunOptions("claude-opus-5-5", { effort: "high", fastMode: true, contextWindow: "200k" })).toEqual({ model: "claude-opus-5-5", effort: "high", settings: { fastMode: true } });
	});

	it("runs Ultracode as a switch at whichever level is chosen, as Claude Code does", () => {
		expect(claudeRunOptions("claude-opus-5-5", { effort: "high", ultracode: true })).toMatchObject({ effort: "high", settings: { ultracode: true } });
		expect(claudeRunOptions("claude-opus-4-7", { effort: "xhigh" })).toMatchObject({ effort: "max" });
	});

	it("raises a turn that types ultrathink to Extra High, leaving Max alone", () => {
		expect(claudeRunOptions("claude-opus-5-5", { effort: "low" }, "Please ultrathink about this.")).toMatchObject({ effort: "xhigh" });
		expect(claudeRunOptions("claude-opus-5-5", { effort: "max" }, "ultrathink")).toMatchObject({ effort: "max" });
		expect(claudeRunOptions("claude-opus-5-5", { effort: "low" }, "ultrathinking aloud")).toMatchObject({ effort: "low" });
	});

	it("keeps chats saved with Ultracode or Ultrathink as levels working", () => {
		expect(claudeRunOptions("claude-fable-5-1", { effort: "ultracode" })).toMatchObject({ effort: "xhigh", settings: { ultracode: true } });
		expect(claudeRunOptions("claude-opus-5-5", { effort: "ultrathink" })).toMatchObject({ effort: "xhigh" });
	});

	it("ignores settings the model does not offer", () => {
		expect(claudeRunOptions("claude-sonnet-5-5", { ultracode: true, fastMode: true })).toEqual({ model: "claude-sonnet-5-5", effort: undefined, settings: undefined });
		expect(claudeRunOptions("claude-haiku-4-5", { thinking: true })).toEqual({ model: "claude-haiku-4-5", effort: undefined, settings: { alwaysThinkingEnabled: true } });
	});
});
