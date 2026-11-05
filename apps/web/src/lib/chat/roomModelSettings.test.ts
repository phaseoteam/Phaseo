import { describe, it, expect, test } from "vitest";
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

	it("sends only supported Hy Image options from the image room", () => {
		const modelId = "tencent/hy-image-v3.5-preview:free";
		const schema = getImageModelSchema(modelId);
		expect(schema.sizeOptions).toContain("2048x2048");
		expect(schema.qualityOptions).toEqual([]);
		expect(buildImageRequestOptions(modelId, {
			...getDefaultImageRoomParams(modelId),
			quality: "standard",
			n: 4,
		})).toEqual({ size: "1024x1024", n: 1 });
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
		expect(schema.voiceOptions[0]).toBe("marin");
		expect(schema.voiceOptions).toContain("cedar");
		expect(schema.voiceOptions).toContain("coral");
		expect(schema.voiceOptions).toContain("sage");
	});

	it("uses capability voice params ahead of fallback audio voices", () => {
		const schema = getAudioModelSchema("provider/example-tts", {
			"audio.speech": {
				voice: {
					default: "voice-b",
					values: [
						{ id: "voice-a", label: "Voice A" },
						{ id: "voice-b", label: "Voice B" },
					],
				},
			},
		});
		expect(schema.voiceOptions).toEqual(["voice-b", "voice-a"]);

		const request = buildAudioRequestOptions(
			"speech",
			"provider/example-tts",
			{
				...getDefaultAudioRoomParams("provider/example-tts"),
				speechVoice: "voice-a",
			},
			{
				"audio.speech": {
					voice: {
						default: "voice-b",
						values: ["voice-a", "voice-b"],
					},
				},
			},
		);
		expect(request.voice).toBe("voice-a");
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

describe("Video options stored in the catalogue", () => {
	// As stored in v2_route_capabilities.params for google-ai-studio:google/gemini-omni-flash.
	const omniParams = {
		"video.generate": {
			size: { enum: ["360p", "720p", "1080p", "4k"], type: "string", aliases: ["resolution"], default: "720p" },
			duration: { type: "enum", values: [3, 4, 5, 6, 7, 8, 9, 10], aliases: ["seconds", "duration_seconds"], default: 8 },
		},
	};

	test("reads sizes, durations and defaults from the stored params", () => {
		expect(getVideoModelSchema("google/gemini-omni-flash", omniParams)).toMatchObject({
			sizeOptions: ["360p", "720p", "1080p", "4k"],
			durationOptions: [3, 4, 5, 6, 7, 8, 9, 10],
			defaultSize: "720p",
			defaultDuration: 8,
		});
		expect(getDefaultVideoRoomParams("google/gemini-omni-flash", omniParams)).toEqual({ duration: 8, size: "720p", n: 1 });
		expect(buildVideoRequestOptions("google/gemini-omni-flash", { duration: 3, size: "360p", n: 1 }, omniParams))
			.toEqual({ duration: 3, size: "360p", n: 1 });
	});

	test("replaces values the stored params do not allow with the stored defaults", () => {
		expect(buildVideoRequestOptions("google/gemini-omni-flash", { duration: 5, size: "1280x720", n: 1 }, omniParams))
			.toEqual({ duration: 5, size: "720p", n: 1 });
		expect(buildVideoRequestOptions("google/gemini-omni-flash", { duration: 12, size: "4k", n: 1 }, omniParams))
			.toEqual({ duration: 8, size: "4k", n: 1 });
	});

	test("uses per-size durations and min/max/step ranges", () => {
		const params = {
			"video.generate": {
				size: { type: "enum", values: ["720p", "1080p", "4k"] },
				duration: { type: "number", min: 4, max: 8, step: 2, values_by_size: { "1080p": [8], "4k": [8] } },
			},
		};
		expect(getVideoDurationOptions("google/veo-3.1", "720p", params)).toEqual([4, 6, 8]);
		expect(getVideoDurationOptions("google/veo-3.1", "4k", params)).toEqual([8]);
	});

	test("offers a size listed in two cases once, and keeps the stored default", () => {
		// As stored for alibaba-cloud:qwen/wan3.0-video.
		const params = {
			"video.generate": {
				size: { type: "enum", values: ["480P", "480p", "720P", "720p", "1080P", "1080p"], default: "1080P" },
				duration: { type: "number", min: 2, max: 30 },
			},
		};
		const schema = getVideoModelSchema("qwen/wan3.0-video", params);
		expect(schema.sizeOptions).toEqual(["480P", "720P", "1080P"]);
		expect(schema.durationOptions).toHaveLength(29);
		expect(getDefaultVideoRoomParams("qwen/wan3.0-video", params)).toEqual({ duration: 2, size: "1080P", n: 1 });
	});

	test("ignores null and open-ended durations", () => {
		expect(getVideoModelSchema("ltx-2-5-pro", { "video.generate": { duration: { enum: [null, 6, 8, 10] } } }).durationOptions)
			.toEqual([6, 8, 10]);
		expect(getVideoModelSchema("spacex-ai/grok-imagine-video", { "video.generate": { duration: { min: 1, type: "number" } } }).durationOptions)
			.toEqual(getVideoModelSchema("spacex-ai/grok-imagine-video").durationOptions);
	});

	test("keeps the built-in options when nothing is stored", () => {
		expect(getVideoModelSchema("google/veo-3.1", { "video.generate": [] })).toEqual(getVideoModelSchema("google/veo-3.1"));
		expect(getDefaultVideoRoomParams("google/gemini-omni-flash")).toEqual({ duration: 5, size: "1280x720", n: 1 });
	});
});
