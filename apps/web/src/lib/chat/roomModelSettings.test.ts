import {
	buildAudioRequestOptions,
	buildEmbeddingsRequestOptions,
	buildImageRequestOptions,
	buildVideoRequestOptions,
	getAudioModeSupportForCapabilities,
	getAudioModelSchema,
	getDefaultAudioRoomParams,
	getDefaultEmbeddingsRoomParams,
	getDefaultImageRoomParams,
	getDefaultVideoRoomParams,
	getImageModelSchema,
	getModerationThreshold,
	getVideoDurationOptions,
	getVideoModelSchema,
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

	it("uses Veo 3.1 duration constraints by resolution", () => {
		const schema = getVideoModelSchema("google/veo-3.1-preview");
		expect(schema.sizeOptions).toEqual(["720p", "1080p", "4k"]);
		expect(getVideoDurationOptions("google/veo-3.1-preview", "720p")).toEqual([4, 6, 8]);
		expect(getVideoDurationOptions("google/veo-3.1-preview", "1080p")).toEqual([8]);
		expect(getVideoDurationOptions("google/veo-3.1-preview", "4k")).toEqual([8]);
	});

	it("uses Veo 3 duration constraints by resolution", () => {
		const schema = getVideoModelSchema("google/veo-3-preview");
		expect(schema.sizeOptions).toEqual(["720p", "1080p", "4k"]);
		expect(getVideoDurationOptions("google/veo-3-preview", "720p")).toEqual([4, 6, 8]);
		expect(getVideoDurationOptions("google/veo-3-preview", "1080p")).toEqual([8]);
		expect(getVideoDurationOptions("google/veo-3-preview", "4k")).toEqual([8]);
	});

	it("normalizes invalid Veo 3.1 resolution and duration combinations", () => {
		const request = buildVideoRequestOptions("google/veo-3.1-fast-preview", {
			duration: 6,
			size: "4k",
			n: 3,
		});
		expect(request.size).toBe("4k");
		expect(request.duration).toBe(8);
		expect(request.n).toBe(1);
	});

	it("uses Veo 2 defaults and clamps unsupported settings", () => {
		const defaults = getDefaultVideoRoomParams("google/veo-2");
		expect(defaults.size).toBe("720p");
		expect(defaults.duration).toBe(5);
		expect(getVideoDurationOptions("google/veo-2", "720p")).toEqual([5, 6, 8]);

		const request = buildVideoRequestOptions("google/veo-2", {
			duration: 12,
			size: "1080p",
			n: 2,
		});
		expect(request.size).toBe("720p");
		expect(request.duration).toBe(5);
		expect(request.n).toBe(1);
	});

	it("uses Sora 2 allowed durations and clamps invalid selections", () => {
		const defaults = getDefaultVideoRoomParams("openai/sora-2");
		expect(defaults.size).toBe("720x1280");
		expect(defaults.duration).toBe(4);
		expect(getVideoDurationOptions("openai/sora-2", "720x1280")).toEqual([4, 8, 12]);

		const request = buildVideoRequestOptions("openai/sora-2", {
			duration: 5,
			size: "1920x1080",
			n: 4,
		});
		expect(request.size).toBe("720x1280");
		expect(request.duration).toBe(4);
		expect(request.n).toBe(1);
	});

	it("uses MiniMax Hailuo 2.3 resolution-duration constraints", () => {
		const request = buildVideoRequestOptions("minimax/hailuo-2.3", {
			duration: 10,
			size: "1080P",
			n: 2,
		});
		expect(request.size).toBe("1080P");
		expect(request.duration).toBe(6);
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

	it("returns empty request options for music generation mode", () => {
		const request = buildAudioRequestOptions(
			"music",
			"suno/suno-v4",
			getDefaultAudioRoomParams("suno/suno-v4"),
		);
		expect(request).toEqual({});
	});

	it("maps audio capabilities into room mode support", () => {
		expect(
			getAudioModeSupportForCapabilities(["audio.speech"]),
		).toEqual({
			speech: true,
			transcription: false,
			translation: false,
			music: false,
		});
		expect(
			getAudioModeSupportForCapabilities(["audio.transcription"]),
		).toEqual({
			speech: false,
			transcription: true,
			translation: false,
			music: false,
		});
		expect(
			getAudioModeSupportForCapabilities(["music.generate"]),
		).toEqual({
			speech: false,
			transcription: false,
			translation: false,
			music: true,
		});
		expect(
			getAudioModeSupportForCapabilities(["audio"]),
		).toEqual({
			speech: true,
			transcription: true,
			translation: true,
			music: false,
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
