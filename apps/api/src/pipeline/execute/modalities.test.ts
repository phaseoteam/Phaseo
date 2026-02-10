import { describe, expect, it } from "vitest";
import { filterCandidatesByModalities } from "./modalities";
import type { IRChatRequest } from "@core/ir";
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
});
