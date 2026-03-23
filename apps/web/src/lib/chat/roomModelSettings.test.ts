import {
	buildAudioRequestOptions,
	buildEmbeddingsRequestOptions,
	buildImageRequestOptions,
	getAudioModeSupportForCapabilities,
	getAudioModelSchema,
	getDefaultAudioRoomParams,
	getDefaultEmbeddingsRoomParams,
	getDefaultImageRoomParams,
	getImageModelSchema,
	getModerationThreshold,
} from "@/lib/chat/roomModelSettings";

describe("roomModelSettings", () => {
	it("uses dalle3-specific image options", () => {
		const schema = getImageModelSchema("openai/dall-e-3");
		expect(schema.variant).toBe("dalle3");
		expect(schema.styleOptions).toEqual(["vivid", "natural"]);
		expect(schema.maxCount).toBe(1);
	});

	it("clamps image count to model max", () => {
		const params = getDefaultImageRoomParams("openai/dall-e-3");
		const request = buildImageRequestOptions("openai/dall-e-3", {
			...params,
			n: 99,
		});
		expect(request.n).toBe(1);
	});

	it("exposes extended voices for gpt-4o mini tts", () => {
		const schema = getAudioModelSchema("openai/gpt-4o-mini-tts");
		expect(schema.voiceOptions).toContain("coral");
		expect(schema.voiceOptions).toContain("sage");
	});

	it("uses Xiaomi-specific speech settings for mimo v2 tts", () => {
		const schema = getAudioModelSchema("xiaomi/mimo-v2-tts:free");
		expect(schema.voiceOptions).toEqual(["mimo_Default"]);
		expect(schema.formatOptions).toEqual(["mp3", "wav", "pcm"]);
		expect(schema.supportsSpeechSpeed).toBe(false);
	});

	it("builds speech requests with fixed mp3 response_format and omits unsupported speed", () => {
		const request = buildAudioRequestOptions(
			"speech",
			"xiaomi/mimo-v2-tts:free",
			{
				...getDefaultAudioRoomParams("xiaomi/mimo-v2-tts:free"),
				speechVoice: "mimo_Default",
				speechFormat: "pcm",
				speechSpeed: 1.75,
			},
		);
		expect(request.voice).toBe("mimo_Default");
		expect(request.response_format).toBe("mp3");
		expect(request).not.toHaveProperty("format");
		expect(request).not.toHaveProperty("speed");
	});

	it("maps audio capabilities into room mode support", () => {
		expect(
			getAudioModeSupportForCapabilities(["audio.speech"]),
		).toEqual({
			speech: true,
			transcription: false,
			translation: false,
		});
		expect(
			getAudioModeSupportForCapabilities(["audio.transcription"]),
		).toEqual({
			speech: false,
			transcription: true,
			translation: false,
		});
		expect(
			getAudioModeSupportForCapabilities(["audio"]),
		).toEqual({
			speech: true,
			transcription: true,
			translation: true,
		});
	});

	it("embeddings dimensions are clamped by model limits", () => {
		const request = buildEmbeddingsRequestOptions(
			"openai/text-embedding-3-small",
			{
				...getDefaultEmbeddingsRoomParams(),
				dimensions: 9999,
			},
		);
		expect(request.dimensions).toBe(1536);
	});

	it("moderation threshold is normalized", () => {
		expect(getModerationThreshold({ scoreThreshold: -1 })).toBe(0);
		expect(getModerationThreshold({ scoreThreshold: 5 })).toBe(1);
	});
});
