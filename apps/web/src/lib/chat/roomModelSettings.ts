export type AudioMode = "speech" | "transcription" | "translation" | "music";
export const CHAT_AUDIO_SPEECH_FORMAT = "mp3";

export type AudioModeSupport = {
	speech: boolean;
	transcription: boolean;
	translation: boolean;
	music: boolean;
};

export type ImageRoomParams = {
	size: string;
	quality: string;
	style: string;
	background: string;
	n: number;
};

export type VideoRoomParams = {
	duration: number;
	size: string;
	n: number;
};

export type AudioRoomParams = {
	speechVoice: string;
	speechFormat: string;
	speechSpeed: number;
	transcriptionLanguage: string;
	transcriptionPrompt: string;
	transcriptionResponseFormat: string;
	translationPrompt: string;
	translationResponseFormat: string;
};

export type ModerationRoomParams = {
	scoreThreshold: number;
};

export type EmbeddingsRoomParams = {
	dimensions: number | null;
	encodingFormat: "float" | "base64";
};

type ImageModelSchema = {
	variant: "dalle2" | "dalle3" | "gpt-image" | "generic";
	sizeOptions: string[];
	qualityOptions: string[];
	styleOptions: string[];
	supportsBackground: boolean;
	maxCount: number;
};

type VideoModelSchema = {
	sizeOptions: string[];
	durationOptions: number[];
	durationOptionsBySize?: Record<string, number[]>;
	maxCount: number;
};

type AudioModelSchema = {
	voiceOptions: string[];
	formatOptions: string[];
	supportsSpeechSpeed: boolean;
	supportsLanguageHint: boolean;
};

const AUDIO_MODE_SUPPORT_FALLBACK: AudioModeSupport = {
	speech: true,
	transcription: true,
	translation: true,
	music: false,
};

type EmbeddingsModelSchema = {
	supportsDimensions: boolean;
	maxDimensions: number;
};

function modelIdIncludes(modelId: string, hints: string[]) {
	const normalized = modelId.toLowerCase();
	return hints.some((hint) => normalized.includes(hint));
}

export function getImageModelSchema(modelId: string): ImageModelSchema {
	if (modelIdIncludes(modelId, ["dall-e-2"])) {
		return {
			variant: "dalle2",
			sizeOptions: ["256x256", "512x512", "1024x1024"],
			qualityOptions: ["standard"],
			styleOptions: [],
			supportsBackground: false,
			maxCount: 10,
		};
	}
	if (modelIdIncludes(modelId, ["dall-e-3"])) {
		return {
			variant: "dalle3",
			sizeOptions: ["1024x1024", "1792x1024", "1024x1792"],
			qualityOptions: ["standard", "hd"],
			styleOptions: ["vivid", "natural"],
			supportsBackground: false,
			maxCount: 1,
		};
	}
	if (modelIdIncludes(modelId, ["gpt-image"])) {
		return {
			variant: "gpt-image",
			sizeOptions: ["1024x1024", "1536x1024", "1024x1536", "auto"],
			qualityOptions: ["low", "medium", "high", "auto"],
			styleOptions: [],
			supportsBackground: true,
			maxCount: 4,
		};
	}
	return {
		variant: "generic",
		sizeOptions: ["1024x1024", "1280x720", "720x1280"],
		qualityOptions: ["standard"],
		styleOptions: [],
		supportsBackground: false,
		maxCount: 4,
	};
}

export function getVideoModelSchema(modelId: string): VideoModelSchema {
	if (modelIdIncludes(modelId, ["minimax/hailuo-2.3-fast", "hailuo-2.3-fast"])) {
		return {
			sizeOptions: ["768P", "1080P"],
			durationOptions: [6, 10],
			durationOptionsBySize: {
				"768P": [6, 10],
				"1080P": [6],
			},
			maxCount: 1,
		};
	}
	if (modelIdIncludes(modelId, ["minimax/hailuo-2.3", "hailuo-2.3"])) {
		return {
			sizeOptions: ["768P", "1080P"],
			durationOptions: [6, 10],
			durationOptionsBySize: {
				"768P": [6, 10],
				"1080P": [6],
			},
			maxCount: 1,
		};
	}
	if (modelIdIncludes(modelId, ["minimax/hailuo-02", "hailuo-02"])) {
		return {
			sizeOptions: ["512P", "768P", "1080P"],
			durationOptions: [6, 10],
			durationOptionsBySize: {
				"512P": [6, 10],
				"768P": [6, 10],
				"1080P": [6],
			},
			maxCount: 1,
		};
	}
	if (modelIdIncludes(modelId, ["veo-3.1", "veo-3-1"])) {
		return {
			sizeOptions: ["720p", "1080p", "4k"],
			durationOptions: [4, 6, 8],
			durationOptionsBySize: {
				"720p": [4, 6, 8],
				"1080p": [8],
				"4k": [8],
			},
			maxCount: 1,
		};
	}
	if (
		modelIdIncludes(modelId, [
			"veo-3.0",
			"veo-3-preview",
			"veo-3-fast",
			"veo-3-generate",
			"veo-3",
		])
	) {
		return {
			sizeOptions: ["720p", "1080p", "4k"],
			durationOptions: [4, 6, 8],
			durationOptionsBySize: {
				"720p": [4, 6, 8],
				"1080p": [8],
				"4k": [8],
			},
			maxCount: 1,
		};
	}
	if (modelIdIncludes(modelId, ["veo-2.0", "veo-2", "veo2"])) {
		return {
			sizeOptions: ["720p"],
			durationOptions: [5, 6, 8],
			durationOptionsBySize: {
				"720p": [5, 6, 8],
			},
			maxCount: 1,
		};
	}
	if (modelIdIncludes(modelId, ["sora-2-pro"])) {
		return {
			sizeOptions: [
				"720x1280",
				"1280x720",
				"1024x1792",
				"1792x1024",
				"1080x1920",
				"1920x1080",
			],
			durationOptions: [4, 8, 12],
			maxCount: 1,
		};
	}
	if (modelIdIncludes(modelId, ["sora-2"])) {
		return {
			sizeOptions: ["720x1280", "1280x720"],
			durationOptions: [4, 8, 12],
			maxCount: 1,
		};
	}
	if (modelIdIncludes(modelId, ["sora"])) {
		return {
			sizeOptions: ["720x1280", "1280x720"],
			durationOptions: [4, 8, 12],
			maxCount: 1,
		};
	}
	return {
		sizeOptions: ["1280x720", "1920x1080"],
		durationOptions: [5, 10],
		maxCount: 1,
	};
}

function getVideoDurationOptionsForSchema(
	schema: VideoModelSchema,
	size: string,
): number[] {
	const durationOptions = schema.durationOptionsBySize?.[size];
	if (Array.isArray(durationOptions) && durationOptions.length > 0) {
		return durationOptions;
	}
	return schema.durationOptions;
}

export function getVideoDurationOptions(
	modelId: string,
	size?: string | null,
): number[] {
	const schema = getVideoModelSchema(modelId);
	const normalizedSize =
		typeof size === "string" && schema.sizeOptions.includes(size)
			? size
			: (schema.sizeOptions[0] ?? "");
	return getVideoDurationOptionsForSchema(schema, normalizedSize);
}

export function getAudioModelSchema(modelId: string): AudioModelSchema {
	if (modelIdIncludes(modelId, ["mimo-v2-tts"])) {
		return {
			voiceOptions: ["mimo_Default"],
			formatOptions: ["mp3", "wav", "pcm"],
			supportsSpeechSpeed: false,
			supportsLanguageHint: false,
		};
	}
	if (modelIdIncludes(modelId, ["gpt-4o-mini-tts", "gpt-4o-audio"])) {
		return {
			voiceOptions: ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer"],
			formatOptions: ["mp3", "wav", "opus"],
			supportsSpeechSpeed: true,
			supportsLanguageHint: true,
		};
	}
	if (modelIdIncludes(modelId, ["tts-1"])) {
		return {
			voiceOptions: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
			formatOptions: ["mp3", "wav", "opus"],
			supportsSpeechSpeed: true,
			supportsLanguageHint: false,
		};
	}
	return {
		voiceOptions: ["alloy"],
		formatOptions: ["mp3", "wav"],
		supportsSpeechSpeed: true,
		supportsLanguageHint: true,
	};
}

function normalizeCapabilityId(value: string): string {
	return value.trim().toLowerCase();
}

function hasCapabilityMatch(
	capabilities: string[],
	hints: string[],
): boolean {
	return capabilities.some((capabilityId) =>
		hints.some((hint) => capabilityId.includes(hint)),
	);
}

function hasAnyAudioCapability(capabilities: string[]): boolean {
	return capabilities.some(
		(capabilityId) =>
			capabilityId === "audio" ||
			capabilityId === "music" ||
			capabilityId.startsWith("audio.") ||
			capabilityId.startsWith("music."),
	);
}

export function getAudioModeSupportForCapabilities(
	capabilityIds: string[] | null | undefined,
): AudioModeSupport {
	const normalized = Array.from(
		new Set((capabilityIds ?? []).map(normalizeCapabilityId).filter(Boolean)),
	);
	if (normalized.length === 0) {
		return { ...AUDIO_MODE_SUPPORT_FALLBACK };
	}
	if (!hasAnyAudioCapability(normalized)) {
		return { ...AUDIO_MODE_SUPPORT_FALLBACK };
	}
	const hasGenericAudio = normalized.includes("audio");
	const hasGenericMusic = normalized.includes("music");
	if (hasGenericAudio) {
		return {
			...AUDIO_MODE_SUPPORT_FALLBACK,
			music:
				hasGenericMusic ||
				hasCapabilityMatch(normalized, ["music.generate", "music"]),
		};
	}
	return {
		speech: hasCapabilityMatch(normalized, ["audio.speech", "audio.generate"]),
		transcription: hasCapabilityMatch(normalized, [
			"audio.transcription",
			"audio.transcribe",
		]),
		translation: hasCapabilityMatch(normalized, [
			"audio.translation",
			"audio.translate",
		]),
		music: hasCapabilityMatch(normalized, ["music.generate", "music"]),
	};
}

export function mergeAudioModeSupport(
	support: AudioModeSupport[],
): AudioModeSupport {
	if (support.length === 0) {
		return { ...AUDIO_MODE_SUPPORT_FALLBACK };
	}
	const merged = support.reduce<AudioModeSupport>(
		(acc, current) => ({
			speech: acc.speech || current.speech,
			transcription: acc.transcription || current.transcription,
			translation: acc.translation || current.translation,
			music: acc.music || current.music,
		}),
		{ speech: false, transcription: false, translation: false, music: false },
	);
	if (
		!merged.speech &&
		!merged.transcription &&
		!merged.translation &&
		!merged.music
	) {
		return { ...AUDIO_MODE_SUPPORT_FALLBACK };
	}
	return merged;
}

export function getEmbeddingsModelSchema(modelId: string): EmbeddingsModelSchema {
	if (modelIdIncludes(modelId, ["text-embedding-3-large"])) {
		return {
			supportsDimensions: true,
			maxDimensions: 3072,
		};
	}
	if (modelIdIncludes(modelId, ["text-embedding-3-small"])) {
		return {
			supportsDimensions: true,
			maxDimensions: 1536,
		};
	}
	if (modelIdIncludes(modelId, ["embedding", "embed"])) {
		return {
			supportsDimensions: true,
			maxDimensions: 4096,
		};
	}
	return {
		supportsDimensions: false,
		maxDimensions: 0,
	};
}

export function getDefaultImageRoomParams(modelId: string): ImageRoomParams {
	const schema = getImageModelSchema(modelId);
	return {
		size: schema.sizeOptions[0] ?? "1024x1024",
		quality: schema.qualityOptions[0] ?? "standard",
		style: schema.styleOptions[0] ?? "",
		background: "auto",
		n: 1,
	};
}

export function getDefaultVideoRoomParams(modelId: string): VideoRoomParams {
	const schema = getVideoModelSchema(modelId);
	const size = schema.sizeOptions[0] ?? "1280x720";
	const durationOptions = getVideoDurationOptionsForSchema(schema, size);
	return {
		duration: durationOptions[0] ?? schema.durationOptions[0] ?? 5,
		size,
		n: 1,
	};
}

export function getDefaultAudioRoomParams(modelId: string): AudioRoomParams {
	const schema = getAudioModelSchema(modelId);
	const defaultSpeechFormat = schema.formatOptions.includes(CHAT_AUDIO_SPEECH_FORMAT)
		? CHAT_AUDIO_SPEECH_FORMAT
		: (schema.formatOptions[0] ?? CHAT_AUDIO_SPEECH_FORMAT);
	return {
		speechVoice: schema.voiceOptions[0] ?? "alloy",
		speechFormat: defaultSpeechFormat,
		speechSpeed: 1,
		transcriptionLanguage: "",
		transcriptionPrompt: "",
		transcriptionResponseFormat: "json",
		translationPrompt: "",
		translationResponseFormat: "json",
	};
}

export function getDefaultModerationRoomParams(): ModerationRoomParams {
	return {
		scoreThreshold: 0.5,
	};
}

export function getDefaultEmbeddingsRoomParams(): EmbeddingsRoomParams {
	return {
		dimensions: null,
		encodingFormat: "float",
	};
}

export function buildImageRequestOptions(
	modelId: string,
	params: ImageRoomParams,
): Record<string, unknown> {
	const schema = getImageModelSchema(modelId);
	const next: Record<string, unknown> = {};
	if (schema.sizeOptions.includes(params.size)) {
		next.size = params.size;
	}
	if (schema.qualityOptions.includes(params.quality)) {
		next.quality = params.quality;
	}
	if (schema.styleOptions.length > 0 && schema.styleOptions.includes(params.style)) {
		next.style = params.style;
	}
	if (schema.supportsBackground && params.background) {
		next.background = params.background;
	}
	const count = Math.max(1, Math.min(schema.maxCount, Math.floor(params.n || 1)));
	next.n = count;
	return next;
}

export function buildVideoRequestOptions(
	modelId: string,
	params: VideoRoomParams,
): Record<string, unknown> {
	const schema = getVideoModelSchema(modelId);
	const next: Record<string, unknown> = {};
	const size = schema.sizeOptions.includes(params.size)
		? params.size
		: schema.sizeOptions[0] ?? "1280x720";
	const durationOptions = getVideoDurationOptionsForSchema(schema, size);
	const duration = durationOptions.includes(params.duration)
		? params.duration
		: durationOptions[0] ?? schema.durationOptions[0] ?? 5;
	const count = Math.max(1, Math.min(schema.maxCount, Math.floor(params.n || 1)));
	next.duration = duration;
	next.size = size;
	next.n = count;
	return next;
}

export function buildAudioRequestOptions(
	mode: AudioMode,
	modelId: string,
	params: AudioRoomParams,
): Record<string, unknown> {
	const schema = getAudioModelSchema(modelId);
	if (mode === "speech") {
		const next: Record<string, unknown> = {};
		if (schema.voiceOptions.includes(params.speechVoice)) {
			next.voice = params.speechVoice;
		}
		const normalizedSpeechFormat = schema.formatOptions.includes(CHAT_AUDIO_SPEECH_FORMAT)
			? CHAT_AUDIO_SPEECH_FORMAT
			: (schema.formatOptions[0] ?? CHAT_AUDIO_SPEECH_FORMAT);
		next.response_format = normalizedSpeechFormat;
		if (schema.supportsSpeechSpeed) {
			next.speed = Math.max(0.25, Math.min(4, Number(params.speechSpeed) || 1));
		}
		return next;
	}
	if (mode === "music") {
		return {};
	}
	if (mode === "transcription") {
		const next: Record<string, unknown> = {};
		if (schema.supportsLanguageHint && params.transcriptionLanguage.trim()) {
			next.language = params.transcriptionLanguage.trim();
		}
		if (params.transcriptionPrompt.trim()) {
			next.prompt = params.transcriptionPrompt.trim();
		}
		next.response_format = params.transcriptionResponseFormat || "json";
		return next;
	}
	const next: Record<string, unknown> = {};
	if (params.translationPrompt.trim()) {
		next.prompt = params.translationPrompt.trim();
	}
	next.response_format = params.translationResponseFormat || "json";
	return next;
}

export function buildEmbeddingsRequestOptions(
	modelId: string,
	params: EmbeddingsRoomParams,
): Record<string, unknown> {
	const schema = getEmbeddingsModelSchema(modelId);
	const next: Record<string, unknown> = {};
	if (
		schema.supportsDimensions &&
		typeof params.dimensions === "number" &&
		Number.isFinite(params.dimensions)
	) {
		const clamped = Math.max(
			1,
			Math.min(schema.maxDimensions, Math.floor(params.dimensions)),
		);
		next.dimensions = clamped;
	}
	next.encoding_format = params.encodingFormat;
	return next;
}

export function getModerationThreshold(params: ModerationRoomParams) {
	return Math.max(0, Math.min(1, Number(params.scoreThreshold) || 0.5));
}
