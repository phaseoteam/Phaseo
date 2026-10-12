import { getModalityTone } from "./modalityStyles";

const GROUPS = [
	"text",
	"image",
	"video",
	"audio",
	"realtime",
	"audio_tts",
	"audio_stt",
	"audio_music",
	"file",
	"moderations",
	"decisions",
	"rerank",
	"embeddings",
	"ocr",
	"parse",
	"translation",
] as const;

describe("getModalityTone", () => {
	it("gives every model group its own badge colours", () => {
		const badges = GROUPS.map((group) => getModalityTone(group).badgeClassName);
		expect(new Set(badges).size).toBe(GROUPS.length);
		expect(badges).not.toContain(getModalityTone("not-a-group").badgeClassName);
	});

	it.each([
		["ocr", "ocr"],
		["OCR", "ocr"],
		["parse", "parse"],
		["document.parse", "parse"],
		["parsing", "parse"],
		["translation", "translation"],
		["audio.translations", "translation"],
		["/v1/audio/translations", "translation"],
	])("maps %s to the %s tone", (value, group) => {
		expect(getModalityTone(value)).toEqual(getModalityTone(group));
	});

	it("keeps transcription and speech separate from translation", () => {
		expect(getModalityTone("audio.transcription")).toEqual(getModalityTone("audio_stt"));
		expect(getModalityTone("audio.speech")).toEqual(getModalityTone("audio_tts"));
		expect(getModalityTone("audio.translations")).not.toEqual(getModalityTone("audio_stt"));
	});
});
