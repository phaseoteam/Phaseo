import { describe, expect, it } from "vitest";
import { computeStaticTtl, supportsEndpointViaModalities } from "./context.shared";

describe("supportsEndpointViaModalities", () => {
	it("treats audio subtypes as audio output for audio.speech", () => {
		expect(
			supportsEndpointViaModalities({
				endpoint: "audio.speech",
				inputModalities: new Set(["text"]),
				outputModalities: new Set(["audio_tts"]),
			}),
		).toBe(true);
	});

	it("treats audio subtypes as audio output for music.generate", () => {
		expect(
			supportsEndpointViaModalities({
				endpoint: "music.generate",
				inputModalities: new Set(["text"]),
				outputModalities: new Set(["audio_music"]),
			}),
		).toBe(true);
	});

	it("does not treat transcription audio subtypes as generated audio output", () => {
		expect(
			supportsEndpointViaModalities({
				endpoint: "audio.speech",
				inputModalities: new Set(["text"]),
				outputModalities: new Set(["audio_stt"]),
			}),
		).toBe(false);
	});
});

describe("computeStaticTtl", () => {
	const nowMs = Date.parse("2026-07-20T05:00:00Z");
	const contextWithBoundary = (effectiveTo: string | null) => ({
		pricing: {
			deepseek: {
				provider: "deepseek",
				model: "deepseek/deepseek-v4-pro",
				endpoint: "text.generate",
				effective_from: null,
				effective_to: effectiveTo,
				currency: "USD" as const,
				version: null,
				rules: [],
			},
		},
	});

	it("uses the normal static TTL when no pricing boundary is pending", () => {
		expect(computeStaticTtl(contextWithBoundary(null), nowMs)).toBe(600);
	});

	it("expires static pricing at the next effective boundary", () => {
		expect(
			computeStaticTtl(contextWithBoundary("2026-07-20T05:05:00Z"), nowMs),
		).toBe(300);
	});

	it("bypasses static caching inside the Workers KV minimum TTL", () => {
		expect(
			computeStaticTtl(contextWithBoundary("2026-07-20T05:00:30Z"), nowMs),
		).toBeNull();
	});
});
