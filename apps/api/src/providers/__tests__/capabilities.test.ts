import { describe, expect, it } from "vitest";
import {
	getProviderCapabilityProfile,
	supportsAdapterBackedCapability,
	type AdapterBackedCapability,
} from "../capabilities";

const NON_TEXT_CAPABILITIES: AdapterBackedCapability[] = [
	"image.generate",
	"image.edit",
	"audio.speech",
	"audio.transcription",
	"audio.translations",
	"video.generate",
	"ocr",
	"music.generate",
];

describe("provider capability profiles", () => {
	it("marks AI21 and Arcee as text-only", () => {
		expect(getProviderCapabilityProfile("ai21").textOnly).toBe(true);
		expect(getProviderCapabilityProfile("arcee").textOnly).toBe(true);
		expect(getProviderCapabilityProfile("arcee-ai").textOnly).toBe(true);
		expect(getProviderCapabilityProfile("friendli").textOnly).not.toBe(true);
		expect(getProviderCapabilityProfile("ambient").textOnly).not.toBe(true);
		expect(getProviderCapabilityProfile("baidu").textOnly).not.toBe(true);
		expect(getProviderCapabilityProfile("google-vertex").textOnly).not.toBe(true);
		expect(getProviderCapabilityProfile("xiaomi").textOnly).not.toBe(true);
	});

	it("keeps text-only providers disabled for all adapter-backed non-text capabilities", () => {
		for (const capability of NON_TEXT_CAPABILITIES) {
			expect(
				supportsAdapterBackedCapability("ai21", capability),
				`ai21 should not support ${capability}`,
			).toBe(false);
			expect(
				supportsAdapterBackedCapability("arcee", capability),
				`arcee should not support ${capability}`,
			).toBe(false);
			expect(
				supportsAdapterBackedCapability("arcee-ai", capability),
				`arcee-ai should not support ${capability}`,
			).toBe(false);
		}
	});

	it("does not advertise nonexistent Perplexity media adapters", () => {
		expect(getProviderCapabilityProfile("perplexity").textOnly).toBe(true);
		for (const capability of NON_TEXT_CAPABILITIES) {
			expect(
				supportsAdapterBackedCapability("perplexity", capability),
				`perplexity should not support ${capability}`,
			).toBe(false);
		}
	});

	it("reflects Friendli's documented dedicated media endpoints", () => {
		expect(supportsAdapterBackedCapability("friendli", "image.generate")).toBe(true);
		expect(supportsAdapterBackedCapability("friendli", "image.edit")).toBe(true);
		expect(supportsAdapterBackedCapability("friendli", "audio.transcription")).toBe(true);
		expect(supportsAdapterBackedCapability("friendli", "audio.speech")).toBe(false);
		expect(supportsAdapterBackedCapability("friendli", "audio.translations")).toBe(false);
		expect(supportsAdapterBackedCapability("friendli", "video.generate")).toBe(false);
	});

	it("does not expose GMI request-queue modalities through the generic OpenAI adapter", () => {
		for (const capability of NON_TEXT_CAPABILITIES) {
			expect(
				supportsAdapterBackedCapability("gmicloud", capability),
				`gmicloud requires a dedicated executor for ${capability}`,
			).toBe(false);
		}
	});

	it("matches IonRouter's OpenAI-shaped and async media endpoints", () => {
		expect(supportsAdapterBackedCapability("ionrouter", "image.generate")).toBe(true);
		expect(supportsAdapterBackedCapability("ionrouter", "audio.speech")).toBe(true);
		expect(supportsAdapterBackedCapability("ionrouter", "image.edit")).toBe(false);
		expect(supportsAdapterBackedCapability("ionrouter", "audio.transcription")).toBe(false);
		expect(supportsAdapterBackedCapability("ionrouter", "video.generate")).toBe(false);
	});

	it("exposes native MiniMax images only on the standard provider offer", () => {
		expect(supportsAdapterBackedCapability("minimax", "image.generate")).toBe(true);
		expect(supportsAdapterBackedCapability("minimax", "image.edit")).toBe(true);
		expect(supportsAdapterBackedCapability("minimax", "audio.speech")).toBe(true);
		expect(supportsAdapterBackedCapability("minimax", "audio.transcription")).toBe(false);
		expect(supportsAdapterBackedCapability("minimax", "audio.translations")).toBe(false);
		expect(supportsAdapterBackedCapability("minimax-lightning", "image.generate")).toBe(false);
		expect(supportsAdapterBackedCapability("minimax-lightning", "image.edit")).toBe(false);
		expect(supportsAdapterBackedCapability("minimax-lightning", "audio.speech")).toBe(false);
		expect(supportsAdapterBackedCapability("minimax-lightning", "audio.transcription")).toBe(false);
		expect(supportsAdapterBackedCapability("minimax-lightning", "audio.translations")).toBe(false);
	});

	it("enables full multimodal adapter capabilities for priority providers", () => {
		const providers = [
			"openai",
		];

		for (const provider of providers) {
			expect(supportsAdapterBackedCapability(provider, "image.generate")).toBe(true);
			expect(supportsAdapterBackedCapability(provider, "image.edit")).toBe(true);
			expect(supportsAdapterBackedCapability(provider, "audio.speech")).toBe(true);
			expect(supportsAdapterBackedCapability(provider, "audio.transcription")).toBe(true);
			expect(supportsAdapterBackedCapability(provider, "audio.translations")).toBe(true);
			expect(supportsAdapterBackedCapability(provider, "video.generate")).toBe(true);
		}
		for (const provider of ["atlas-cloud", "atlascloud"]) {
			expect(supportsAdapterBackedCapability(provider, "image.generate")).toBe(false);
			expect(supportsAdapterBackedCapability(provider, "image.edit")).toBe(false);
			expect(supportsAdapterBackedCapability(provider, "audio.speech")).toBe(false);
			expect(supportsAdapterBackedCapability(provider, "audio.transcription")).toBe(false);
			expect(supportsAdapterBackedCapability(provider, "audio.translations")).toBe(false);
			expect(supportsAdapterBackedCapability(provider, "video.generate")).toBe(true);
		}
		expect(supportsAdapterBackedCapability("google-ai-studio", "image.generate")).toBe(true);
		expect(supportsAdapterBackedCapability("google-ai-studio", "image.edit")).toBe(false);
		expect(supportsAdapterBackedCapability("google-ai-studio", "audio.speech")).toBe(true);
		expect(supportsAdapterBackedCapability("google-ai-studio", "audio.transcription")).toBe(true);
		expect(supportsAdapterBackedCapability("google-ai-studio", "audio.translations")).toBe(false);
		expect(supportsAdapterBackedCapability("google-ai-studio", "video.generate")).toBe(true);
		expect(supportsAdapterBackedCapability("google-vertex", "image.generate")).toBe(false);
		expect(supportsAdapterBackedCapability("google-vertex", "image.edit")).toBe(false);
		expect(supportsAdapterBackedCapability("google-vertex", "audio.speech")).toBe(false);
		expect(supportsAdapterBackedCapability("google-vertex", "audio.transcription")).toBe(true);
		expect(supportsAdapterBackedCapability("google-vertex", "audio.translations")).toBe(false);
		expect(supportsAdapterBackedCapability("google-vertex", "video.generate")).toBe(true);
		expect(supportsAdapterBackedCapability("google-vertex-eu", "video.generate")).toBe(false);
	});

	it.each(["x-ai", "xai", "spacex-ai"])("exposes only documented xAI standalone media APIs for %s", (provider) => {
		expect(supportsAdapterBackedCapability(provider, "image.generate")).toBe(true);
		expect(supportsAdapterBackedCapability(provider, "image.edit")).toBe(true);
		expect(supportsAdapterBackedCapability(provider, "audio.speech")).toBe(true);
		expect(supportsAdapterBackedCapability(provider, "audio.transcription")).toBe(true);
		expect(supportsAdapterBackedCapability(provider, "audio.translations")).toBe(false);
		expect(supportsAdapterBackedCapability(provider, "video.generate")).toBe(true);
	});

	it("does not route Novita's native media APIs through OpenAI media adapters", () => {
		for (const provider of ["novita", "novitaai", "novita-ai"]) {
			expect(supportsAdapterBackedCapability(provider, "image.generate")).toBe(false);
			expect(supportsAdapterBackedCapability(provider, "image.edit")).toBe(false);
			expect(supportsAdapterBackedCapability(provider, "audio.speech")).toBe(false);
			expect(supportsAdapterBackedCapability(provider, "audio.transcription")).toBe(false);
			expect(supportsAdapterBackedCapability(provider, "audio.translations")).toBe(false);
			expect(supportsAdapterBackedCapability(provider, "video.generate")).toBe(true);
		}
	});

	it("keeps Parasail speech blocked until its binary and billing contract is complete", () => {
		expect(supportsAdapterBackedCapability("parasail", "audio.speech")).toBe(false);
		expect(supportsAdapterBackedCapability("parasail", "audio.transcription")).toBe(false);
		expect(supportsAdapterBackedCapability("parasail", "audio.translations")).toBe(false);
		expect(supportsAdapterBackedCapability("parasail", "image.generate")).toBe(false);
		expect(supportsAdapterBackedCapability("parasail", "image.edit")).toBe(false);
		expect(supportsAdapterBackedCapability("parasail", "video.generate")).toBe(false);
	});

	it("does not infer Phala output-media APIs from OpenAI chat compatibility", () => {
		for (const capability of [
			"image.generate", "image.edit", "audio.speech", "audio.transcription",
			"audio.translations", "video.generate",
		] as const) {
			expect(supportsAdapterBackedCapability("phala", capability)).toBe(false);
		}
	});

	it("keeps known positive capabilities enabled", () => {
		expect(supportsAdapterBackedCapability("openai", "image.generate")).toBe(true);
		expect(supportsAdapterBackedCapability("openai", "audio.transcription")).toBe(true);
		expect(supportsAdapterBackedCapability("elevenlabs", "music.generate")).toBe(true);
		expect(supportsAdapterBackedCapability("suno", "music.generate")).toBe(false);
	});
});
