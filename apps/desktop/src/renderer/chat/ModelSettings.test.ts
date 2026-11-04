import { describe, expect, it } from "vitest";
import type { ModelOptionDescriptor } from "../../shared/workspace";
import { effortDots, settingsLabel, settingsSummary } from "./ModelSettings";

const effort: ModelOptionDescriptor = { id: "reasoningEffort", label: "Reasoning", type: "select", options: [{ id: "medium", label: "Medium", isDefault: true }, { id: "high", label: "High" }] };
const tiers: ModelOptionDescriptor = { id: "serviceTier", label: "Speed", type: "select", options: [{ id: "default", label: "Standard", isDefault: true }, { id: "fast", label: "Fast" }, { id: "ultrafast", label: "Ultrafast" }] };
const fastMode: ModelOptionDescriptor = { id: "fastMode", label: "Fast mode", type: "boolean", default: false };
const context: ModelOptionDescriptor = { id: "contextWindow", label: "Context Window", type: "select", options: [{ id: "200k", label: "200k" }, { id: "1m", label: "1M", isDefault: true }] };

describe("the model button's settings", () => {
	it("tells Fast from Ultrafast, so each gets its own mark", () => {
		expect(settingsSummary({ harness: "codex", model: "m", reasoningEffort: "high", serviceTier: "fast" }, [effort, tiers])).toMatchObject({ effort: "High", speed: "fast", dots: { count: 2, filled: 2 } });
		expect(settingsSummary({ harness: "codex", model: "m", reasoningEffort: "high", serviceTier: "ultrafast" }, [effort, tiers]).speed).toBe("ultrafast");
		expect(settingsSummary({ harness: "claude", model: "m", options: { fastMode: true } }, [effort, fastMode, context])).toMatchObject({ effort: "Medium", speed: "fast" });
	});
	it("marks Flex too, on the slower side of Standard", () => {
		const flexTiers: ModelOptionDescriptor = { id: "speed", label: "Speed", type: "select", options: [{ id: "flex", label: "Flex" }, { id: "standard", label: "Standard", isDefault: true }, { id: "priority", label: "Fast" }] };
		expect(settingsSummary({ harness: "phaseo", model: "m", options: { speed: "flex" } }, [flexTiers]).speed).toBe("flex");
	});
	it("shows no speed at the standard speed", () => {
		expect(settingsSummary({ harness: "codex", model: "m" }, [effort, tiers]).speed).toBeUndefined();
		expect(settingsLabel({ harness: "codex", model: "m" }, [effort, tiers])).toBe("Medium");
	});
	it("names the speed in words for screen readers", () => {
		expect(settingsLabel({ harness: "codex", model: "m", reasoningEffort: "high", serviceTier: "ultrafast" }, [effort, tiers])).toBe("High · Ultrafast");
	});
});

describe("the reasoning level as dots", () => {
	const claude: ModelOptionDescriptor = { id: "effort", label: "Reasoning", type: "select", options: ["low", "medium", "high", "xhigh", "max"].map(id => ({ id, label: id })) };
	it("fills one dot per level up to the chosen one", () => {
		expect(effortDots(claude, "low")).toEqual({ count: 5, filled: 1 });
		expect(effortDots(claude, "max")).toEqual({ count: 5, filled: 5 });
	});
	it("shows Ultracode as a word beside the level, on at any level", () => {
		const ultracode: ModelOptionDescriptor = { id: "ultracode", label: "Ultracode", type: "boolean", default: false };
		expect(settingsSummary({ harness: "claude", model: "m", options: { ultracode: true } }, [claude, ultracode])).toMatchObject({ ultracode: true });
		expect(settingsLabel({ harness: "claude", model: "m", options: { effort: "high", ultracode: true } }, [claude, ultracode])).toBe("high · Ultracode");
		expect(settingsLabel({ harness: "claude", model: "m", options: { effort: "high" } }, [claude, ultracode])).toBe("high");
	});
	it("leaves every dot empty for an off level", () => {
		const terra: ModelOptionDescriptor = { id: "effort", label: "Reasoning", type: "select", options: ["none", "low", "medium", "high"].map(id => ({ id, label: id })) };
		expect(effortDots(terra, "none")).toEqual({ count: 3, filled: 0 });
		expect(effortDots(terra, "high")).toEqual({ count: 3, filled: 3 });
	});
	it("draws nothing for a single level or a yes-or-no setting", () => {
		expect(effortDots({ id: "effort", label: "Reasoning", type: "select", options: [{ id: "high", label: "High" }] }, "high")).toBeUndefined();
		expect(effortDots({ id: "thinking", label: "Thinking", type: "boolean" }, true)).toBeUndefined();
	});
});
