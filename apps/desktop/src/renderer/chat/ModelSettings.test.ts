import { describe, expect, it } from "vitest";
import type { ModelOptionDescriptor } from "../../shared/workspace";
import { settingsLabel, settingsSummary } from "./ModelSettings";

const effort: ModelOptionDescriptor = { id: "reasoningEffort", label: "Reasoning", type: "select", options: [{ id: "medium", label: "Medium", isDefault: true }, { id: "high", label: "High" }] };
const tiers: ModelOptionDescriptor = { id: "serviceTier", label: "Speed", type: "select", options: [{ id: "default", label: "Standard", isDefault: true }, { id: "fast", label: "Fast" }, { id: "ultrafast", label: "Ultrafast" }] };
const fastMode: ModelOptionDescriptor = { id: "fastMode", label: "Fast mode", type: "boolean", default: false };
const context: ModelOptionDescriptor = { id: "contextWindow", label: "Context Window", type: "select", options: [{ id: "200k", label: "200k" }, { id: "1m", label: "1M", isDefault: true }] };

describe("the model button's settings", () => {
	it("tells Fast from Ultrafast, so each gets its own mark", () => {
		expect(settingsSummary({ harness: "codex", model: "m", reasoningEffort: "high", serviceTier: "fast" }, [effort, tiers])).toEqual({ effort: "High", speed: "fast", context: undefined });
		expect(settingsSummary({ harness: "codex", model: "m", reasoningEffort: "high", serviceTier: "ultrafast" }, [effort, tiers]).speed).toBe("ultrafast");
		expect(settingsSummary({ harness: "claude", model: "m", options: { fastMode: true } }, [effort, fastMode, context])).toEqual({ effort: "Medium", speed: "fast", context: "1M" });
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
