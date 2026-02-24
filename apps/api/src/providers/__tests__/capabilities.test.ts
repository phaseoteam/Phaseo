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
	it("marks AI21, Arcee, and Friendli as text-only", () => {
		expect(getProviderCapabilityProfile("ai21").textOnly).toBe(true);
		expect(getProviderCapabilityProfile("arcee").textOnly).toBe(true);
		expect(getProviderCapabilityProfile("arcee-ai").textOnly).toBe(true);
		expect(getProviderCapabilityProfile("friendli").textOnly).toBe(true);
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
			expect(
				supportsAdapterBackedCapability("friendli", capability),
				`friendli should not support ${capability}`,
			).toBe(false);
		}
	});

	it("enables full multimodal adapter capabilities for priority providers", () => {
		const providers = [
			"openai",
			"google",
			"google-ai-studio",
			"google-vertex",
			"amazon-bedrock",
			"x-ai",
			"xai",
			"deepseek",
			"minimax",
			"cerebras",
			"mistral",
			"moonshot-ai",
			"novitaai",
			"alibaba",
			"qwen",
			"xiaomi",
			"z-ai",
			"zai",
		];

		for (const provider of providers) {
			expect(supportsAdapterBackedCapability(provider, "image.generate")).toBe(true);
			expect(supportsAdapterBackedCapability(provider, "image.edit")).toBe(true);
			expect(supportsAdapterBackedCapability(provider, "audio.speech")).toBe(true);
			expect(supportsAdapterBackedCapability(provider, "audio.transcription")).toBe(true);
			expect(supportsAdapterBackedCapability(provider, "audio.translations")).toBe(true);
			expect(supportsAdapterBackedCapability(provider, "video.generate")).toBe(true);
		}
	});

	it("keeps known positive capabilities enabled", () => {
		expect(supportsAdapterBackedCapability("openai", "image.generate")).toBe(true);
		expect(supportsAdapterBackedCapability("openai", "audio.transcription")).toBe(true);
		expect(supportsAdapterBackedCapability("elevenlabs", "music.generate")).toBe(true);
	});
});
