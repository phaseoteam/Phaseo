import { describe, expect, it } from "vitest";
import { filterCandidatesByModalities, filterEmbeddingCandidatesByModalities } from "./modalities";
import type { IRChatRequest, IREmbeddingsRequest } from "@core/ir";
import type { ProviderCandidate } from "../before/types";

function buildTextImageRequest(model: string): IRChatRequest {
	return {
		model,
		stream: false,
		messages: [
			{
				role: "user",
				content: [{ type: "text", text: "Generate a small blue square image." }],
			},
		],
		modalities: ["text", "image"],
	};
}

function candidate(partial: Partial<ProviderCandidate>): ProviderCandidate {
	return {
		providerId: partial.providerId ?? "openai",
		providerStatus: partial.providerStatus ?? "active",
		adapter: partial.adapter as any,
		baseWeight: partial.baseWeight ?? 1,
		byokMeta: partial.byokMeta ?? [],
		pricingCard: partial.pricingCard ?? null,
		providerModelSlug: partial.providerModelSlug ?? null,
		inputModalities: partial.inputModalities,
		outputModalities: partial.outputModalities,
		capabilityParams: partial.capabilityParams,
		maxInputTokens: partial.maxInputTokens ?? null,
		maxOutputTokens: partial.maxOutputTokens ?? null,
	};
}

function buildImageEmbeddingRequest(model: string): IREmbeddingsRequest {
	return {
		model,
		input: [
			{ type: "text", text: "classify this product image" },
			{
				type: "image",
				source: "url",
				data: "https://example.com/image.jpg",
			},
		],
	};
}

describe("filterCandidatesByModalities", () => {
	it("keeps google image-preview candidates when modality metadata is missing", () => {
		const ir = buildTextImageRequest("google/gemini-2-5-flash-image");
		const filtered = filterCandidatesByModalities(
			[
				candidate({
					providerId: "google-ai-studio",
					providerModelSlug: "gemini-2.5-flash-image",
					inputModalities: null,
					outputModalities: null,
				}),
			],
			ir,
		);

		expect(filtered).toHaveLength(1);
		expect(filtered[0].providerId).toBe("google-ai-studio");
	});

	it("still filters unknown-modality non-google providers for image output requests", () => {
		const ir = buildTextImageRequest("openai/gpt-4o-mini");
		const filtered = filterCandidatesByModalities(
			[
				candidate({
					providerId: "openai",
					inputModalities: null,
					outputModalities: null,
				}),
			],
			ir,
		);

		expect(filtered).toHaveLength(0);
	});

	it("keeps audio-output candidates that use audio subtype modalities", () => {
		const filtered = filterCandidatesByModalities(
			[
				candidate({
					providerId: "google-ai-studio",
					inputModalities: ["text"],
					outputModalities: ["audio_tts"],
				}),
			],
			{
				model: "google/gemini-3.1-flash-tts-preview",
				stream: false,
				messages: [{ role: "user", content: [{ type: "text", text: "Say hello" }] }],
				modalities: ["audio"],
			},
		);

		expect(filtered).toHaveLength(1);
	});
});

describe("filterEmbeddingCandidatesByModalities", () => {
	it("keeps google gemini embeddings when modality metadata is missing", () => {
		const ir = buildImageEmbeddingRequest("google/gemini-embedding-001");
		const filtered = filterEmbeddingCandidatesByModalities(
			[
				candidate({
					providerId: "google-ai-studio",
					providerModelSlug: "gemini-embedding-001",
					inputModalities: null,
				}),
			],
			ir,
		);

		expect(filtered).toHaveLength(1);
		expect(filtered[0].providerId).toBe("google-ai-studio");
	});

	it("filters text-only providers for image embedding inputs", () => {
		const ir = buildImageEmbeddingRequest("openai/text-embedding-3-large");
		const filtered = filterEmbeddingCandidatesByModalities(
			[
				candidate({
					providerId: "openai",
					inputModalities: ["text"],
				}),
			],
			ir,
		);

		expect(filtered).toHaveLength(0);
	});
});
