type AudioMode = "speech" | "transcription" | "translation";

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
	maxCount: number;
};

type AudioModelSchema = {
	voiceOptions: string[];
	formatOptions: string[];
	supportsSpeechSpeed: boolean;
	supportsLanguageHint: boolean;
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
	if (modelIdIncludes(modelId, ["sora"])) {
		return {
			sizeOptions: ["854x480", "1280x720", "1920x1080"],
			durationOptions: [5, 10, 15, 20],
			maxCount: 2,
		};
	}
	return {
		sizeOptions: ["1280x720", "1920x1080"],
		durationOptions: [5, 10],
		maxCount: 1,
	};
}

export function getAudioModelSchema(modelId: string): AudioModelSchema {
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
	return {
		duration: schema.durationOptions[0] ?? 5,
		size: schema.sizeOptions[0] ?? "1280x720",
		n: 1,
	};
}

export function getDefaultAudioRoomParams(modelId: string): AudioRoomParams {
	const schema = getAudioModelSchema(modelId);
	return {
		speechVoice: schema.voiceOptions[0] ?? "alloy",
		speechFormat: schema.formatOptions[0] ?? "mp3",
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
	const duration = schema.durationOptions.includes(params.duration)
		? params.duration
		: schema.durationOptions[0] ?? 5;
	const size = schema.sizeOptions.includes(params.size)
		? params.size
		: schema.sizeOptions[0] ?? "1280x720";
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
		if (schema.formatOptions.includes(params.speechFormat)) {
			next.format = params.speechFormat;
		}
		if (schema.supportsSpeechSpeed) {
			next.speed = Math.max(0.25, Math.min(4, Number(params.speechSpeed) || 1));
		}
		return next;
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
