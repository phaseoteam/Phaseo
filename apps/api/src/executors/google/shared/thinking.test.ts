import { describe, expect, it } from "vitest";
import {
	getDefaultGoogleThinkingLevel,
	getLowestGoogleThinkingLevel,
	modelRejectsGoogleThinkingBudget,
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
		// https://ai.google.dev/gemini-api/docs/thinking: 3.1 Pro has no minimal level.
		expect(getSupportedGoogleThinkingLevels("gemini-3.1-pro-preview")).toEqual([
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

	it("uses Gemma 4's supported on/off thinking levels", () => {
		expect(getSupportedGoogleThinkingLevels("google/gemma-4-26b-a4b:free")).toEqual([
			"MINIMAL",
			"HIGH",
		]);
		expect(getSupportedGoogleThinkingLevels("gemma-4-31b-it")).toEqual([
			"MINIMAL",
			"HIGH",
		]);
		expect(resolveGoogleThinkingLevelForEffort("gemma-4-26b-a4b-it", "minimal")).toBe("MINIMAL");
		expect(resolveGoogleThinkingLevelForEffort("gemma-4-26b-a4b-it", "low")).toBe("MINIMAL");
		expect(resolveGoogleThinkingLevelForEffort("gemma-4-26b-a4b-it", "medium")).toBe("HIGH");
		expect(resolveGoogleThinkingLevelForEffort("gemma-4-31b-it", "high")).toBe("HIGH");
	});

	it("defaults hosted Gemma 4 generation to minimal thinking", () => {
		expect(getDefaultGoogleThinkingLevel("google/gemma-4-26b-a4b:free")).toBe("MINIMAL");
		expect(getDefaultGoogleThinkingLevel("gemma-4-31b-it")).toBe("MINIMAL");
		expect(getDefaultGoogleThinkingLevel("gemini-3.1-pro-preview")).toBeUndefined();
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

	it("does not use thinking levels for unsupported models", () => {
		expect(modelSupportsGoogleThinkingLevels("gemini-2.5-flash")).toBe(false);
		expect(resolveGoogleThinkingLevelForEffort("gemini-2.5-flash", "medium")).toBeUndefined();
	});

	it("gives Gemini 4 Argon low, medium and high only, and no thinking budget", () => {
		for (const model of ["gemini-4-argon", "google/gemini-4-argon", "gemini-4-argon-cyber-permissive"]) {
			expect(getSupportedGoogleThinkingLevels(model)).toEqual(["LOW", "MEDIUM", "HIGH"]);
			expect(modelRejectsGoogleThinkingBudget(model)).toBe(true);
			expect(getLowestGoogleThinkingLevel(model)).toBe("LOW");
		}
		expect(resolveGoogleThinkingLevelForEffort("gemini-4-argon", "minimal")).toBe("LOW");
		expect(resolveGoogleThinkingLevelForEffort("gemini-4-argon", "medium")).toBe("MEDIUM");
		expect(resolveGoogleThinkingLevelForEffort("gemini-4-argon", "max")).toBe("HIGH");
		expect(modelRejectsGoogleThinkingBudget("gemini-3.6-flash")).toBe(false);
	});

	it("gives Gemini 3.7 Flash no minimal level", () => {
		expect(getSupportedGoogleThinkingLevels("gemini-3.7-flash")).toEqual(["LOW", "MEDIUM", "HIGH"]);
		expect(resolveGoogleThinkingLevelForEffort("gemini-3.7-flash", "minimal")).toBe("LOW");
		expect(getLowestGoogleThinkingLevel("gemini-3.6-flash")).toBe("MINIMAL");
		expect(getLowestGoogleThinkingLevel("gemini-2.5-flash")).toBeUndefined();
	});
});
