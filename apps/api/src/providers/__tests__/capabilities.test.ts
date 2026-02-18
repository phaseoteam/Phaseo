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
	it("marks AI21, Arcee, and Xiaomi as text-only", () => {
		expect(getProviderCapabilityProfile("ai21").textOnly).toBe(true);
		expect(getProviderCapabilityProfile("arcee").textOnly).toBe(true);
		expect(getProviderCapabilityProfile("arcee-ai").textOnly).toBe(true);
		expect(getProviderCapabilityProfile("xiaomi").textOnly).toBe(true);
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
				supportsAdapterBackedCapability("xiaomi", capability),
				`xiaomi should not support ${capability}`,
			).toBe(false);
		}
	});

	it("keeps known positive capabilities enabled", () => {
		expect(supportsAdapterBackedCapability("openai", "image.generate")).toBe(true);
		expect(supportsAdapterBackedCapability("openai", "audio.transcription")).toBe(true);
		expect(supportsAdapterBackedCapability("elevenlabs", "music.generate")).toBe(true);
	});
});
