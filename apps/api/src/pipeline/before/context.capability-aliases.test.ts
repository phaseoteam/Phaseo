import { describe, expect, it } from "vitest";
import { getContextCapabilityCandidates } from "./context";

describe("getContextCapabilityCandidates", () => {
	it("expands moderation capability aliases", () => {
		expect(getContextCapabilityCandidates("moderations")).toEqual([
			"moderations",
			"moderations.create",
			"text.moderate",
			"moderation",
		]);
		expect(getContextCapabilityCandidates("text.moderate")).toEqual([
			"text.moderate",
			"moderations",
			"moderations.create",
			"moderation",
		]);
	});

	it("expands embeddings capability aliases", () => {
		expect(getContextCapabilityCandidates("embeddings")).toEqual([
			"embeddings",
			"text.embed",
		]);
		expect(getContextCapabilityCandidates("text.embed")).toEqual([
			"text.embed",
			"embeddings",
		]);
	});

	it("expands rerank capability aliases", () => {
		expect(getContextCapabilityCandidates("rerank")).toEqual([
			"rerank",
			"rerank.create",
			"text.rerank",
		]);
		expect(getContextCapabilityCandidates("text.rerank")).toEqual([
			"text.rerank",
			"rerank",
			"rerank.create",
		]);
	});

	it("keeps unrelated capabilities unchanged", () => {
		expect(getContextCapabilityCandidates("text.generate")).toEqual([
			"text.generate",
		]);
	});

	it("adds text.generate fallback for google image generation models", () => {
		expect(
			getContextCapabilityCandidates(
				"image.generate",
				"google/gemini-3.1-flash-image-preview",
			),
		).toEqual([
			"image.generate",
			"images.generate",
			"images.generations",
			"text.generate",
		]);
	});

	it("does not add text.generate fallback for non-google image generation models", () => {
		expect(
			getContextCapabilityCandidates("image.generate", "openai/gpt-image-1"),
		).toEqual([
			"image.generate",
			"images.generate",
			"images.generations",
		]);
	});
});
