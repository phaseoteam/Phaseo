import {
	isAudioFamilyGroup,
	isAudioFamilyOpen,
	toggleOutputModality,
} from "./audioFamily";

describe("audio family", () => {
	it("knows which groups sit under Audio", () => {
		for (const group of ["audio_tts", "audio_stt", "translation", "realtime", "audio_music"]) {
			expect(isAudioFamilyGroup(group)).toBe(true);
		}
		for (const group of ["audio", "text", "documents", "embeddings"]) {
			expect(isAudioFamilyGroup(group)).toBe(false);
		}
	});

	it("is open while Audio or a sub-type is selected", () => {
		expect(isAudioFamilyOpen([])).toBe(false);
		expect(isAudioFamilyOpen(["text", "image"])).toBe(false);
		expect(isAudioFamilyOpen(["audio"])).toBe(true);
		expect(isAudioFamilyOpen(["text", "audio_stt"])).toBe(true);
	});

	it("opens the family when Audio is pressed and closes it again", () => {
		expect(toggleOutputModality(["text"], "audio")).toEqual(["text", "audio"]);
		expect(toggleOutputModality(["text", "audio"], "audio")).toEqual(["text"]);
	});

	it("clears the sub-type when Audio is pressed to go back", () => {
		expect(toggleOutputModality(["text", "audio_stt"], "audio")).toEqual(["text"]);
	});

	it("narrows to one sub-type at a time", () => {
		expect(toggleOutputModality(["audio"], "audio_stt")).toEqual(["audio_stt"]);
		expect(toggleOutputModality(["audio_stt"], "audio_tts")).toEqual(["audio_tts"]);
		expect(toggleOutputModality(["embeddings", "audio"], "translation")).toEqual([
			"embeddings",
			"translation",
		]);
	});

	it("returns to all audio when the chosen sub-type is pressed again", () => {
		expect(toggleOutputModality(["audio_stt"], "audio_stt")).toEqual(["audio"]);
		expect(toggleOutputModality(["embeddings", "audio_music"], "audio_music")).toEqual([
			"embeddings",
			"audio",
		]);
	});

	it("toggles every other chip as before", () => {
		expect(toggleOutputModality([], "text")).toEqual(["text"]);
		expect(toggleOutputModality(["text", "image"], "text")).toEqual(["image"]);
	});
});
