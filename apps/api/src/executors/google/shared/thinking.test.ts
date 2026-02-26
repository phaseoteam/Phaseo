import { describe, expect, it } from "vitest";
import {
	getSupportedGoogleThinkingLevels,
	modelSupportsGoogleThinkingLevels,
	resolveGoogleThinkingLevelForEffort,
} from "./thinking";

describe("google thinking level support", () => {
	it("returns explicit levels for known Gemini 3.1 models", () => {
		expect(getSupportedGoogleThinkingLevels("google/gemini-3.1-flash-image-preview")).toEqual([
			"MINIMAL",
			"LOW",
			"MEDIUM",
			"HIGH",
		]);
		expect(getSupportedGoogleThinkingLevels("gemini-3.1-pro-preview")).toEqual([
			"MINIMAL",
			"LOW",
			"MEDIUM",
			"HIGH",
		]);
	});

	it("supports dated slugs via prefix matching", () => {
		expect(
			getSupportedGoogleThinkingLevels("google/gemini-3.1-flash-image-preview-2026-02-26")
		).toEqual(["MINIMAL", "LOW", "MEDIUM", "HIGH"]);
	});

	it("maps effort values to Google thinking levels", () => {
		const model = "google/gemini-3.1-flash-image-preview";
		expect(resolveGoogleThinkingLevelForEffort(model, "minimal")).toBe("MINIMAL");
		expect(resolveGoogleThinkingLevelForEffort(model, "low")).toBe("LOW");
		expect(resolveGoogleThinkingLevelForEffort(model, "medium")).toBe("MEDIUM");
		expect(resolveGoogleThinkingLevelForEffort(model, "high")).toBe("HIGH");
		expect(resolveGoogleThinkingLevelForEffort(model, "xhigh")).toBe("HIGH");
		expect(resolveGoogleThinkingLevelForEffort(model, "max")).toBe("HIGH");
	});

	it("does not use thinking levels for non-Gemini-3 models", () => {
		expect(modelSupportsGoogleThinkingLevels("gemini-2.5-flash")).toBe(false);
		expect(resolveGoogleThinkingLevelForEffort("gemini-2.5-flash", "medium")).toBeUndefined();
	});
});
