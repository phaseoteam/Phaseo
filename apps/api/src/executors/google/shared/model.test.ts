import { describe, expect, it } from "vitest";
import { normalizeGoogleModelSlug, resolveGoogleModelCandidates } from "./model";

describe("google model normalization", () => {
	it("normalizes gateway model ids to Gemini slugs", () => {
		expect(normalizeGoogleModelSlug("google/gemini-2-5-flash-image-preview")).toBe(
			"gemini-2.5-flash-image"
		);
		expect(normalizeGoogleModelSlug("google/gemini-2.5-flash-image-preview")).toBe(
			"gemini-2.5-flash-image"
		);
		expect(normalizeGoogleModelSlug("google/gemini-2-5-flash-image")).toBe(
			"gemini-2.5-flash-image"
		);
		expect(normalizeGoogleModelSlug("gemini-2.5-flash-image")).toBe(
			"gemini-2.5-flash-image"
		);
		expect(normalizeGoogleModelSlug("google/gemini-3-pro-image-preview")).toBe(
			"gemini-3-pro-image-preview"
		);
	});

	it("returns one normalized candidate for nano banana v2.5", () => {
		expect(resolveGoogleModelCandidates("google/gemini-2-5-flash-image-preview")).toEqual([
			"gemini-2.5-flash-image",
		]);
	});
});
