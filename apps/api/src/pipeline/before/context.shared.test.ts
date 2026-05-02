import { describe, expect, it } from "vitest";
import { supportsEndpointViaModalities } from "./context.shared";

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
});
