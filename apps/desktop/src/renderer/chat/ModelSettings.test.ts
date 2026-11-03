import { describe, expect, it } from "vitest";
import type { ModelOptionDescriptor } from "../../shared/workspace";
import { settingsLabel } from "./ModelSettings";

const effort: ModelOptionDescriptor = { id: "reasoningEffort", label: "Reasoning", type: "select", options: [{ id: "medium", label: "Medium", isDefault: true }, { id: "high", label: "High" }] };
const tiers: ModelOptionDescriptor = { id: "serviceTier", label: "Speed", type: "select", options: [{ id: "default", label: "Standard", isDefault: true }, { id: "fast", label: "Fast" }, { id: "ultrafast", label: "Ultrafast" }] };
const fastMode: ModelOptionDescriptor = { id: "fastMode", label: "Fast mode", type: "boolean", default: false };

describe("the model settings button", () => {
	it("names the speed in words, so Fast and Ultrafast read differently", () => {
		expect(settingsLabel({ harness: "codex", model: "m", reasoningEffort: "high", serviceTier: "fast" }, [effort, tiers])).toBe("High · Fast");
		expect(settingsLabel({ harness: "codex", model: "m", reasoningEffort: "high", serviceTier: "ultrafast" }, [effort, tiers])).toBe("High · Ultrafast");
		expect(settingsLabel({ harness: "claude", model: "m", options: { fastMode: true } }, [fastMode])).toBe("Fast");
	});
	it("leaves the standard speed unsaid", () => {
		expect(settingsLabel({ harness: "codex", model: "m" }, [effort, tiers])).toBe("Medium");
		expect(settingsLabel({ harness: "claude", model: "m" }, [fastMode])).toBe("Normal");
	});
});
