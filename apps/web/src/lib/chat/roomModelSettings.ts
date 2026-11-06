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
	/** Display names for voice ids, when the catalogue gives them. */
	voiceLabels?: Record<string, string>;
	/** Any voice id is accepted (ElevenLabs voice libraries); voiceOptions are suggestions. */
	customVoice?: boolean;
	formatOptions: string[];
	supportsSpeechSpeed: boolean;
	/** The provider's speed range, when it is narrower than 0.25 to 4. */
	speedRange?: { min: number; max: number };
	supportsLanguageHint: boolean;
};

const DEFAULT_SPEED_RANGE = { min: 0.25, max: 4 };

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

/** Stored speed bounds replace the built-in ones; either bound may be stored alone. */
function applySpeedParams(schema: AudioModelSchema, params: unknown): AudioModelSchema {
	const speed = normalizeParameterSpecs(params).speed;
	if (!speed || (speed.min === undefined && speed.max === undefined)) return schema;
	const current = schema.speedRange ?? DEFAULT_SPEED_RANGE;
	return { ...schema, speedRange: { min: speed.min ?? current.min, max: speed.max ?? current.max } };
}

function applyVoiceParams(
	builtIn: AudioModelSchema,
	params: unknown,
): AudioModelSchema {
	const schema = applySpeedParams(builtIn, params);
	const voiceOptions = readVoiceIdsFromParams(params);
	if (voiceOptions.length === 0) return schema;
	const voiceSpec = readVoiceSpec(params);
	const voiceLabels = Object.fromEntries(
		parameterOptions(voiceSpec)
			.filter((option) => typeof option.label === "string" && option.label.trim())
			.map((option) => [String(option.value), String(option.label)]),
	);
	const defaultVoice = readDefaultVoiceFromParams(params);
	const orderedVoiceOptions =
		defaultVoice && voiceOptions.includes(defaultVoice)
			? [defaultVoice, ...voiceOptions.filter((voice) => voice !== defaultVoice)]
			: voiceOptions;
	// A stored list decides whether other ids are allowed: the gateway rejects ids
	// outside a closed list, so the built-in custom-voice field is dropped then.
	return {
		...schema,
		voiceOptions: orderedVoiceOptions,
		...(Object.keys(voiceLabels).length > 0 ? { voiceLabels } : {}),
		customVoice: Boolean(voiceSpec?.open),
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
	return applyVoiceParams(getBuiltInSpeechSchema(modelId), speechParams);
}

// Fallback speech options per model family, from each provider's docs (checked
// 2026-11-05). Routes with stored voice params use those instead, so the long
// lists here are a documented subset, not every voice.
const GEMINI_TTS_VOICES = [
	"Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe",
	"Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib", "Rasalgethi",
	"Laomedeia", "Achernar", "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird",
	"Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
];
const GROK_TTS_VOICES = [
	"eve", "ara", "leo", "rex", "sal", "carina", "zagan", "helix", "orion", "luna", "iris", "altair",
	"zenith", "perseus", "helios", "lux", "kepler", "rigel", "cosmo", "celeste", "ursa", "sirius",
	"lumen", "castor", "naksh", "atlas", "aurora", "liora",
];
const ELEVENLABS_VOICE_LABELS: Record<string, string> = {
	"21m00Tcm4TlvDq8ikWAM": "Rachel",
	AZnzlk1XvdvUeBnXmlld: "Domi",
	EXAVITQu4vr4xnSDxMaL: "Bella",
	ErXwobaYiN019PkySvjV: "Antoni",
	MF3mGyEYCl7XYWbV9V6O: "Elli",
	TxGEqnHWrfWFTfGW9XjX: "Josh",
	VR6AewLTigWG4xSOukaG: "Arnold",
	pNInz6obpgDQGcFmaJgB: "Adam",
	yoZ06aMxZJJ28mfd3POQ: "Sam",
};
const RIVA_VOICES: Record<string, string[]> = {
	"en-us": [
		"English-US.Female-1", "English-US.Male-1", "English-US.Female-Calm", "English-US.Female-Neutral",
		"English-US.Female-Happy", "English-US.Female-Angry", "English-US.Female-Fearful",
		"English-US.Female-Sad", "English-US.Male-Calm", "English-US.Male-Neutral",
		"English-US.Male-Happy", "English-US.Male-Angry",
	],
	"de-de": ["German-DE-Male-1"],
	"es-es": ["Spanish-ES-Female-1", "Spanish-ES-Male-1"],
	"it-it": ["Italian-IT-Female-1", "Italian-IT-Male-1"],
};

function speechSchema(
	voiceOptions: string[],
	formatOptions: string[],
	speedRange: { min: number; max: number } | null,
	extra: Partial<AudioModelSchema> = {},
): AudioModelSchema {
	return {
		voiceOptions,
		formatOptions,
		supportsSpeechSpeed: speedRange !== null,
		...(speedRange ? { speedRange } : {}),
		supportsLanguageHint: false,
		...extra,
	};
}

function getBuiltInSpeechSchema(modelId: string): AudioModelSchema {
	const id = modelId.toLowerCase();
	// Xiaomi MiMo: VoiceDesign takes no voice and VoiceClone takes a voice sample, so
	// neither has a list. Non-streaming output is wav.
	if (id.includes("mimo-v2.5-tts-voicedesign") || id.includes("mimo-v2.5-tts-voiceclone")) {
		return speechSchema([], ["wav"], null);
	}
	if (id.includes("mimo-v2.5-tts")) {
		return speechSchema(["mimo_default", "冰糖", "茉莉", "苏打", "白桦", "Mia", "Chloe", "Milo", "Dean"], ["wav"], null);
	}
	if (id.includes("mimo-v2-tts")) {
		return speechSchema(["mimo_default", "default_zh", "default_en"], ["wav"], null);
	}
	if (id.includes("grok-tts")) {
		// xAI also takes mulaw and alaw, which the gateway's response_format does not.
		return speechSchema(GROK_TTS_VOICES, ["mp3", "wav", "pcm"], { min: 0.7, max: 1.5 }, { supportsLanguageHint: true });
	}
	if (id.includes("gemini") && id.includes("tts")) {
		// Gemini 3.8 TTS also takes custom voice ids (voice_... and voicekey_...).
		const custom = /gemini-3\.8-flash(?:-lite)?-tts/.test(id);
		return speechSchema(GEMINI_TTS_VOICES, ["wav", "pcm"], null, { supportsLanguageHint: true, ...(custom ? { customVoice: true } : {}) });
	}
	if (id.includes("eleven-labs/") || id.includes("elevenlabs")) {
		// Any voice in the account's library works by id; v4 has no speed setting.
		const speed = /eleven-v4/.test(id) ? null : { min: 0.7, max: 1.2 };
		return speechSchema(Object.keys(ELEVENLABS_VOICE_LABELS), ["mp3", "wav", "pcm"], speed, {
			voiceLabels: ELEVENLABS_VOICE_LABELS,
			customVoice: true,
		});
	}
	if (id.includes("minimax/speech-")) {
		return speechSchema([
			"English_expressive_narrator", "English_radiant_girl", "English_magnetic_voiced_man",
			"English_compelling_lady1", "English_Aussie_Bloke", "English_captivating_female1",
			"English_Upbeat_Woman", "English_Trustworth_Man", "English_CalmWoman", "English_Gentle-voiced_man",
		], ["mp3", "wav", "flac", "pcm"], { min: 0.5, max: 2 });
	}
	if (id.includes("kokoro")) {
		return speechSchema([
			"af_heart", "af_bella", "af_nicole", "af_sarah", "af_sky", "am_michael", "am_fenrir",
			"am_puck", "bf_emma", "bf_isabella", "bm_george", "bm_fable",
		], ["mp3", "wav", "opus", "flac", "pcm"], DEFAULT_SPEED_RANGE);
	}
	if (id.includes("qwen3-tts-voicedesign")) {
		// The voice is a free-text description; there are no preset voices.
		return speechSchema([], ["mp3", "wav", "opus", "flac", "pcm"], null);
	}
	if (id.includes("qwen3-tts")) {
		return speechSchema(
			["Vivian", "Serena", "Uncle_Fu", "Dylan", "Eric", "Ryan", "Aiden", "Ono_Anna", "Sohee"],
			["mp3", "wav", "opus", "flac", "pcm"],
			null,
		);
	}
	if (id.includes("stepfun/") && id.includes("tts")) {
		// Voices shared by step-tts-mini, step-tts-2 and stepaudio-2.5-tts.
		return speechSchema([
			"elegantgentle-female", "livelybreezy-female", "wenrounansheng", "wenrougongzi",
			"yuanqinansheng", "jingdiannvsheng", "wenroushunv", "tianmeinvsheng", "qingchunshaonv",
			"cixingnansheng",
		], ["mp3", "wav", "flac", "opus", "pcm"], { min: 0.5, max: 2 });
	}
	if (id.includes("voxtral") && id.includes("tts")) {
		// Voices shared by Voxtral TTS and Voxtral TTS 3.
		return speechSchema([
			"en_paul_neutral", "en_paul_cheerful", "gb_jane_neutral", "gb_jane_confident",
			"gb_oliver_neutral", "gb_oliver_cheerful", "fr_marie_neutral", "fr_marie_happy",
		], ["mp3", "wav", "flac", "opus", "pcm"], null);
	}
	if (id.includes("riva-tts")) {
		const locale = Object.keys(RIVA_VOICES).find((key) => id.endsWith(key));
		return speechSchema(locale ? RIVA_VOICES[locale] : [], ["wav"], null);
	}
	if (id.includes("gpt-4o-mini-tts") || id.includes("gpt-4o-audio")) {
		return {
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
		};
	}
	if (id.includes("tts-1")) {
		return {
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
		};
	}
	// Unknown models: OpenAI-compatible defaults.
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
		if (schema.voiceOptions.includes(params.speechVoice) || (schema.customVoice && params.speechVoice.trim())) {
			next.voice = params.speechVoice.trim();
		}
		const normalizedSpeechFormat = schema.formatOptions.includes(CHAT_AUDIO_SPEECH_FORMAT)
			? CHAT_AUDIO_SPEECH_FORMAT
			: (schema.formatOptions[0] ?? CHAT_AUDIO_SPEECH_FORMAT);
		next.response_format = normalizedSpeechFormat;
		if (schema.supportsSpeechSpeed) {
			const { min, max } = schema.speedRange ?? DEFAULT_SPEED_RANGE;
			next.speed = Math.max(min, Math.min(max, Number(params.speechSpeed) || 1));
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
