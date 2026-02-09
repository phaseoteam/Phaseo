import { describe, expect, it } from "vitest";
import { resolveCapabilityFromEndpoint } from "./capabilityToEndpoints";

describe("resolveCapabilityFromEndpoint", () => {
	it("keeps media endpoint capabilities stable", () => {
		expect(resolveCapabilityFromEndpoint("images.generations")).toBe("images.generations");
		expect(resolveCapabilityFromEndpoint("audio.speech")).toBe("audio.speech");
		expect(resolveCapabilityFromEndpoint("audio.transcription")).toBe("audio.transcription");
		expect(resolveCapabilityFromEndpoint("audio.translations")).toBe("audio.translations");
		expect(resolveCapabilityFromEndpoint("video.generation")).toBe("video.generation");
		expect(resolveCapabilityFromEndpoint("ocr")).toBe("ocr");
		expect(resolveCapabilityFromEndpoint("music.generate")).toBe("music.generate");
	});

	it("maps canonical path aliases", () => {
		expect(resolveCapabilityFromEndpoint("/videos")).toBe("video.generation");
		expect(resolveCapabilityFromEndpoint("/video/generations")).toBe("video.generation");
		expect(resolveCapabilityFromEndpoint("/music/generate")).toBe("music.generate");
		expect(resolveCapabilityFromEndpoint("/music/generations")).toBe("music.generate");
		expect(resolveCapabilityFromEndpoint("/audio/transcriptions")).toBe("audio.transcription");
	});
});
