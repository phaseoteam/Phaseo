import { canonicalOutputGroup, modelGroupModalities } from "./modelGroupModalities";

describe("canonicalOutputGroup", () => {
	it.each([
		["ocr", "documents"],
		["parse", "documents"],
		[" OCR ", "documents"],
		["documents", "documents"],
		["audio_stt", "audio_stt"],
		["Text", "text"],
	])("turns %j from a link into %s", (value, group) => {
		expect(canonicalOutputGroup(value)).toBe(group);
	});

	it("lets an old ?outputModalities=ocr link still match Documents models", () => {
		const groups = modelGroupModalities(new Set(["text"]), ["ocr"]);
		expect(groups.has(canonicalOutputGroup("ocr"))).toBe(true);
		expect(groups.has(canonicalOutputGroup("parse"))).toBe(true);
	});
});

describe("modelGroupModalities", () => {
	it.each([
		["audio.speech", ["audio_tts", "audio"]],
		["audio.realtime", ["realtime", "audio"]],
		["realtime", ["realtime", "audio"]],
		["audio.music", ["audio_music", "audio"]],
		["music.generate", ["audio_music", "audio"]],
		["audio.translations", ["translation", "audio"]],
		["text.embed", ["embeddings"]],
		["text.rerank", ["rerank"]],
		["text.moderate", ["moderations"]],
		["image.generate", ["image"]],
		["image.edit", ["image"]],
		["video.generate", ["video"]],
		["text.generate", ["text"]],
		["ocr", ["documents"]],
		["parse", ["documents"]],
	])("groups %s models with missing output metadata", (endpoint, groups) => {
		expect([...modelGroupModalities(new Set(), [endpoint])]).toEqual(groups);
	});

	it("supports several capability groups while preserving actual outputs", () => {
		expect([...modelGroupModalities(new Set(["text", "audio"]), ["audio.speech", "audio.realtime"])]).toEqual(["text", "audio", "audio_tts", "realtime"]);
	});

	it.each(["audio.transcription", "audio.transcribe", "/v1/audio/transcriptions"])(
		"counts text-output transcription models using %s as Audio",
		(endpoint) => {
			const outputs = new Set(["text"]);
			expect([...modelGroupModalities(outputs, [endpoint])]).toEqual(["text", "audio_stt", "audio"]);
			expect([...outputs]).toEqual(["text"]);
		},
	);

	it.each(["audio.translate", "audio.translation", "/v1/audio/translations"])(
		"groups %s models as translation without classifying them as transcription",
		(endpoint) => {
			expect([...modelGroupModalities(new Set(["text"]), ["responses", endpoint])]).toEqual(["text", "translation", "audio"]);
		},
	);

	it("puts OCR and parsing models in one Documents group while preserving text output", () => {
		expect([...modelGroupModalities(new Set(["text"]), ["ocr"])]).toEqual(["text", "documents"]);
		expect([...modelGroupModalities(new Set(["text"]), ["parse"])]).toEqual(["text", "documents"]);
		expect([...modelGroupModalities(new Set(["text"]), ["ocr", "parse"])]).toEqual(["text", "documents"]);
	});

	it("keeps plain text models out of Audio", () => {
		expect([...modelGroupModalities(new Set(["text"]), ["text.generate", "text.embed"])]).toEqual(["text", "embeddings"]);
	});

	it("preserves existing groups without duplicating transcription or audio", () => {
		expect([...modelGroupModalities(new Set(["text", "audio_stt"]), ["audio.transcription"])]).toEqual(["text", "audio_stt", "audio"]);
		expect([...modelGroupModalities(new Set(["audio_tts"]), undefined)]).toEqual(["audio_tts", "audio"]);
	});
});
