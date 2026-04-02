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

	it("expands Lyria 3 aliases to pro/clip candidates", () => {
		expect(resolveGoogleModelCandidates("google/lyria-3")).toEqual([
			"lyria-3",
			"lyria-3-pro",
			"lyria-3-pro-preview",
			"lyria-3-clip",
			"lyria-3-clip-preview",
		]);
		expect(resolveGoogleModelCandidates("lyria-3-pro")).toEqual([
			"lyria-3-pro",
			"lyria-3-pro-preview",
		]);
		expect(resolveGoogleModelCandidates("lyria-3-clip-preview")).toEqual([
			"lyria-3-clip-preview",
		]);
	});
});
