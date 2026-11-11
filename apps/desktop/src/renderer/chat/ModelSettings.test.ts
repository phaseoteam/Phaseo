import { describe, expect, it } from "vitest";
import type { ModelOptionDescriptor } from "../../shared/workspace";
import { settingsLabel, withSetting } from "./ModelSettings";

const reasoning: ModelOptionDescriptor = { id: "reasoningEffort", label: "Reasoning", type: "select", options: [{ id: "low", label: "Low" }, { id: "medium", label: "Medium", isDefault: true }, { id: "high", label: "High" }] };
const speed: ModelOptionDescriptor = { id: "serviceTier", label: "Speed", type: "select", options: [{ id: "default", label: "Standard", isDefault: true }, { id: "priority", label: "Fast" }] };
const thinking: ModelOptionDescriptor = { id: "thinking", label: "Thinking", type: "boolean", default: false };

describe("model settings beside the model name", () => {
	it("names the effort and other settings, leaving speed to the bolt", () => {
		const selection = { harness: "codex" as const, model: "gpt" };
		expect(settingsLabel(selection, [reasoning, speed])).toBe("Medium");
		const high = withSetting(withSetting(selection, reasoning, "high"), speed, "priority");
		expect(high).toMatchObject({ reasoningEffort: "high", serviceTier: "priority" });
		expect(settingsLabel(high, [reasoning, speed])).toBe("High");
		expect(settingsLabel({ harness: "claude", model: "x" }, [thinking])).toBe("Thinking Off");
		expect(settingsLabel(selection, [])).toBe("");
	});
	it("stores a default choice as unset, so the chat keeps following the model's default", () => {
		expect(withSetting({ harness: "codex", model: "gpt", reasoningEffort: "high" }, reasoning, "medium").reasoningEffort).toBeUndefined();
	});
});
