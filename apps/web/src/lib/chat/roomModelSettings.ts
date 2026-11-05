import {
	normalizeParameterSpecs,
	parameterOptions,
	resolveParameterSpec,
	type ParameterSpec,
} from "@/lib/models/modelParameters";

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
	variant: "dalle2" | "dalle3" | "gpt-image" | "hy-image" | "generic";
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
	defaultSize?: string;
	defaultDuration?: number;
};

type AudioModelSchema = {
	voiceOptions: string[];
	formatOptions: string[];
	supportsSpeechSpeed: boolean;
	supportsLanguageHint: boolean;
};

export type CapabilityParamsById = Record<string, unknown> | null | undefined;

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


function dedupeStrings(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}

/** Voice ids (default first is applied by the caller) from a route's stored params. */
function readVoiceSpec(params: unknown): ParameterSpec | undefined {
	const specs = normalizeParameterSpecs(params);
	return specs.voice ?? specs.voices;
}

function readVoiceIdsFromParams(params: unknown): string[] {
	return dedupeStrings(parameterOptions(readVoiceSpec(params)).map((option) => String(option.value)));
}

function readDefaultVoiceFromParams(params: unknown): string | null {
	const value = readVoiceSpec(params)?.default;
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getCapabilityParams(
	paramsById: CapabilityParamsById,
	capabilityIds: string[],
): unknown {
	if (!paramsById) return null;
	for (const capabilityId of capabilityIds) {
		const params = paramsById[capabilityId];
		if (params) return params;
	}
	return null;
}

function applyVoiceParams(
	schema: AudioModelSchema,
	params: unknown,
): AudioModelSchema {
	const voiceOptions = readVoiceIdsFromParams(params);
	if (voiceOptions.length === 0) return schema;
	const defaultVoice = readDefaultVoiceFromParams(params);
	const orderedVoiceOptions =
		defaultVoice && voiceOptions.includes(defaultVoice)
			? [defaultVoice, ...voiceOptions.filter((voice) => voice !== defaultVoice)]
			: voiceOptions;
	return {
		...schema,
		voiceOptions: orderedVoiceOptions,
	};
}

export function getImageModelSchema(modelId: string): ImageModelSchema {
	if (modelIdIncludes(modelId, ["hy-image-v3.5-preview"])) {
		return {
			variant: "hy-image",
			sizeOptions: ["1024x1024", "1536x1536", "2048x2048"],
			qualityOptions: [],
			styleOptions: [],
			supportsBackground: false,
			maxCount: 1,
		};
	}
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

const VIDEO_CAPABILITY_IDS = ["video.generate", "video.generation", "video.generations"];

/**
 * Video options stored for a route (size and duration lists or ranges, their
 * defaults, and duration rules that depend on the size), laid over the built-in
 * schema for the model. Any part the catalogue leaves out keeps the built-in value.
 */
function applyStoredVideoParams(schema: VideoModelSchema, paramsById: CapabilityParamsById): VideoModelSchema {
	const params = getCapabilityParams(paramsById, VIDEO_CAPABILITY_IDS);
	if (!params) return schema;
	const specs = normalizeParameterSpecs(params);
	const sizeSpec = specs.size ?? specs.resolution;
	const durationSpec = specs.duration ?? specs.seconds ?? specs.duration_seconds;
	// Some rows list a size in two cases (480P and 480p); offer it once.
	const seenSizes = new Set<string>();
	const sizes = dedupeStrings(parameterOptions(sizeSpec).map((option) => option.value).filter((value): value is string => typeof value === "string"))
		.filter((size) => !seenSizes.has(size.toLowerCase()) && Boolean(seenSizes.add(size.toLowerCase())));
	const durationsFor = (spec: ParameterSpec | undefined) =>
		Array.from(new Set(parameterOptions(spec).map((option) => Number(option.value)).filter((value) => Number.isFinite(value) && value > 0)));
	const durations = durationsFor(durationSpec);
	const next: VideoModelSchema = { ...schema };
	if (sizes.length > 0) {
		next.sizeOptions = sizes;
		// Per-size durations written for other sizes no longer apply.
		next.durationOptionsBySize = undefined;
	}
	if (durations.length > 0) next.durationOptions = durations;
	if (durationSpec?.when?.length) {
		const bySize: Record<string, number[]> = {};
		for (const size of next.sizeOptions) {
			const options = durationsFor(resolveParameterSpec(durationSpec, { size }, specs));
			if (options.length > 0 && options.join() !== next.durationOptions.join()) bySize[size] = options;
		}
		if (Object.keys(bySize).length > 0) next.durationOptionsBySize = bySize;
	}
	const defaultSize = typeof sizeSpec?.default === "string" ? sizeSpec.default : undefined;
	if (defaultSize && next.sizeOptions.includes(defaultSize)) next.defaultSize = defaultSize;
	const defaultDuration = Number(durationSpec?.default);
	if (next.durationOptions.includes(defaultDuration)) next.defaultDuration = defaultDuration;
	return next;
}

export function getVideoModelSchema(modelId: string, capabilityParamsById?: CapabilityParamsById): VideoModelSchema {
	return applyStoredVideoParams(getBuiltInVideoModelSchema(modelId), capabilityParamsById);
}

function getBuiltInVideoModelSchema(modelId: string): VideoModelSchema {
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
	capabilityParamsById?: CapabilityParamsById,
): number[] {
	const schema = getVideoModelSchema(modelId, capabilityParamsById);
	const normalizedSize =
		typeof size === "string" && schema.sizeOptions.includes(size)
			? size
			: (schema.sizeOptions[0] ?? "");
	return getVideoDurationOptionsForSchema(schema, normalizedSize);
}

export function getAudioModelSchema(
	modelId: string,
	capabilityParamsById?: CapabilityParamsById,
): AudioModelSchema {
	const speechParams = getCapabilityParams(capabilityParamsById, [
		"audio.speech",
		"audio",
		"audio.generate",
	]);
	if (modelIdIncludes(modelId, ["mimo-v2-tts"])) {
		return applyVoiceParams({
			voiceOptions: ["mimo_Default"],
			formatOptions: ["mp3", "wav", "pcm"],
			supportsSpeechSpeed: false,
			supportsLanguageHint: false,
		}, speechParams);
	}
	if (modelIdIncludes(modelId, ["gpt-4o-mini-tts", "gpt-4o-audio"])) {
		return applyVoiceParams({
			voiceOptions: [
				"marin",
				"cedar",
				"alloy",
				"ash",
				"ballad",
				"coral",
				"echo",
				"fable",
				"nova",
				"onyx",
				"sage",
				"shimmer",
				"verse",
			],
			formatOptions: ["mp3", "wav", "opus"],
			supportsSpeechSpeed: true,
			supportsLanguageHint: true,
		}, speechParams);
	}
	if (modelIdIncludes(modelId, ["tts-1"])) {
		return applyVoiceParams({
			voiceOptions: [
				"alloy",
				"ash",
				"coral",
				"echo",
				"fable",
				"onyx",
				"nova",
				"sage",
				"shimmer",
			],
			formatOptions: ["mp3", "wav", "opus"],
			supportsSpeechSpeed: true,
			supportsLanguageHint: false,
		}, speechParams);
	}
	if (modelIdIncludes(modelId, ["grok-tts"])) {
		return applyVoiceParams({
			voiceOptions: ["eve", "ara", "rex", "sal", "leo"],
			formatOptions: ["mp3", "wav", "pcm", "ulaw"],
			supportsSpeechSpeed: true,
			supportsLanguageHint: true,
		}, speechParams);
	}
	if (modelIdIncludes(modelId, ["gemini", "tts"])) {
		return applyVoiceParams({
			voiceOptions: ["Kore", "Puck", "Zephyr", "Charon"],
			formatOptions: ["wav"],
			supportsSpeechSpeed: false,
			supportsLanguageHint: true,
		}, speechParams);
	}
	return applyVoiceParams({
		voiceOptions: ["alloy"],
		formatOptions: ["mp3", "wav"],
		supportsSpeechSpeed: true,
		supportsLanguageHint: true,
	}, speechParams);
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
		quality: schema.qualityOptions[0] ?? "",
		style: schema.styleOptions[0] ?? "",
		background: "auto",
		n: 1,
	};
}

export function getDefaultVideoRoomParams(
	modelId: string,
	capabilityParamsById?: CapabilityParamsById,
): VideoRoomParams {
	const schema = getVideoModelSchema(modelId, capabilityParamsById);
	const size = schema.defaultSize ?? schema.sizeOptions[0] ?? "1280x720";
	const durationOptions = getVideoDurationOptionsForSchema(schema, size);
	const duration = schema.defaultDuration != null && durationOptions.includes(schema.defaultDuration)
		? schema.defaultDuration
		: durationOptions[0];
	return {
		duration: duration ?? schema.durationOptions[0] ?? 5,
		size,
		n: 1,
	};
}

export function getDefaultAudioRoomParams(
	modelId: string,
	capabilityParamsById?: CapabilityParamsById,
): AudioRoomParams {
	const schema = getAudioModelSchema(modelId, capabilityParamsById);
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
	capabilityParamsById?: CapabilityParamsById,
): Record<string, unknown> {
	const schema = getVideoModelSchema(modelId, capabilityParamsById);
	const defaults = getDefaultVideoRoomParams(modelId, capabilityParamsById);
	const next: Record<string, unknown> = {};
	const size = schema.sizeOptions.includes(params.size)
		? params.size
		: defaults.size;
	const durationOptions = getVideoDurationOptionsForSchema(schema, size);
	const duration = durationOptions.includes(params.duration)
		? params.duration
		: durationOptions.includes(defaults.duration)
			? defaults.duration
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
	capabilityParamsById?: CapabilityParamsById,
): Record<string, unknown> {
	const schema = getAudioModelSchema(modelId, capabilityParamsById);
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
