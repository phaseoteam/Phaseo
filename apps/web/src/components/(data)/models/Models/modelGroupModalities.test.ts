import { modelGroupModalities } from "./modelGroupModalities";

describe("modelGroupModalities", () => {
	it.each([
		["audio.speech", "audio_tts"],
		["audio.realtime", "realtime"],
		["audio.music", "audio_music"],
		["text.embed", "embeddings"],
		["text.rerank", "rerank"],
		["text.moderate", "moderations"],
		["image.generate", "image"],
		["image.edit", "image"],
		["video.generate", "video"],
		["text.generate", "text"],
	])("groups %s models with missing output metadata", (endpoint, group) => {
		expect([...modelGroupModalities(new Set(), [endpoint])]).toEqual([group]);
	});

	it("supports several capability groups while preserving actual outputs", () => {
		expect([...modelGroupModalities(new Set(["text", "audio"]), ["audio.speech", "audio.realtime"])]).toEqual(["text", "audio", "audio_tts", "realtime"]);
	});
	it.each(["audio.transcription", "audio.transcribe", "/v1/audio/transcriptions"])(
		"includes text-output transcription models using %s",
		(endpoint) => {
			const outputs = new Set(["text"]);
			expect([...modelGroupModalities(outputs, [endpoint])]).toEqual(["text", "audio_stt"]);
			expect([...outputs]).toEqual(["text"]);
		},
	);

	it("does not classify general audio understanding or translation as transcription", () => {
		expect([...modelGroupModalities(new Set(["text"]), ["responses", "audio.translations"])]).toEqual(["text"]);
	});

	it("preserves existing groups without duplicating transcription", () => {
		expect([...modelGroupModalities(new Set(["text", "audio_stt"]), ["audio.transcription"])]).toEqual(["text", "audio_stt"]);
		expect([...modelGroupModalities(new Set(["audio_tts"]), undefined)]).toEqual(["audio_tts"]);
	});
});
