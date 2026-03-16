import type { UnifiedChatEndpoint } from "@/lib/indexeddb/chats";

const VIDEO_MODEL_HINTS = [
	"video",
	"veo",
	"sora",
	"kling",
	"luma",
	"pika",
	"runway",
	"wan",
	"mochi",
];

const IMAGE_MODEL_HINTS = [
	"image",
	"imagen",
	"flux",
	"sdxl",
	"stable-diffusion",
	"dall-e",
	"gpt-image",
	"recraft",
	"black-forest",
];

const MUSIC_MODEL_HINTS = ["music", "udio", "suno", "melody"];
const SPEECH_MODEL_HINTS = ["tts", "text-to-speech", "speech", "voice"];
const MODERATION_MODEL_HINTS = ["moderation"];
const EMBEDDING_MODEL_HINTS = ["embedding", "embed"];

export const AUDIO_INPUT_MODEL_HINTS = [
	"audio",
	"voice",
	"speech",
	"realtime",
	"transcribe",
	"voxtral",
];

const AUDIO_INPUT_CAPABILITY_HINTS = [
	"audio.input",
	"input_audio",
	"audio.transcribe",
	"audio.transcription",
	"audio.realtime",
	"speech.to.text",
	"speech-to-text",
];

function includesAnyHint(value: string, hints: string[]) {
	return hints.some((hint) => value.includes(hint));
}

function normalizeCapabilityId(capabilityId: string): string {
	return capabilityId.trim().toLowerCase();
}

export function supportsAudioInputByCapabilities(
	capabilityIds: string[] | null | undefined,
) {
	for (const capabilityId of capabilityIds ?? []) {
		const normalized = normalizeCapabilityId(capabilityId);
		if (
			AUDIO_INPUT_CAPABILITY_HINTS.some((hint) =>
				normalized.includes(hint),
			)
		) {
			return true;
		}
	}
	return false;
}

function capabilityIdToUnifiedEndpoint(
	capabilityId: string,
): UnifiedChatEndpoint | null {
	const normalized = normalizeCapabilityId(capabilityId);
	if (
		normalized === "text.generate" ||
		normalized === "responses" ||
		normalized === "chat.completions"
	) {
		return "responses";
	}
	if (
		normalized === "image.generate" ||
		normalized === "images.generate" ||
		normalized === "images.generations" ||
		normalized === "image.generations"
	) {
		return "images.generations";
	}
	if (
		normalized === "video.generate" ||
		normalized === "video.generation" ||
		normalized === "video.generations"
	) {
		return "video.generation";
	}
	if (normalized === "audio.speech" || normalized === "audio.generate") {
		return "audio.speech";
	}
	if (
		normalized === "audio.transcribe" ||
		normalized === "audio.transcription"
	) {
		return "audio.transcription";
	}
	if (normalized === "audio.translate" || normalized === "audio.translation") {
		return "audio.translation";
	}
	if (normalized === "moderation" || normalized === "moderations.create") {
		return "moderations";
	}
	if (normalized === "text.embed" || normalized === "embeddings") {
		return "embeddings";
	}
	return null;
}

export function capabilityIdsToUnifiedEndpoints(
	capabilityIds?: string[] | null,
): UnifiedChatEndpoint[] {
	const endpoints = new Set<UnifiedChatEndpoint>();
	for (const capabilityId of capabilityIds ?? []) {
		const endpoint = capabilityIdToUnifiedEndpoint(capabilityId);
		if (endpoint) {
			endpoints.add(endpoint);
		}
	}
	return Array.from(endpoints);
}

export function inferModelCapabilityEndpoint(
	modelId: string,
): UnifiedChatEndpoint {
	const normalized = modelId.toLowerCase();
	if (includesAnyHint(normalized, VIDEO_MODEL_HINTS)) {
		return "video.generation";
	}
	if (includesAnyHint(normalized, MODERATION_MODEL_HINTS)) {
		return "moderations";
	}
	if (includesAnyHint(normalized, EMBEDDING_MODEL_HINTS)) {
		return "embeddings";
	}
	if (includesAnyHint(normalized, SPEECH_MODEL_HINTS)) {
		return "audio.speech";
	}
	if (includesAnyHint(normalized, MUSIC_MODEL_HINTS)) {
		return "audio.speech";
	}
	if (includesAnyHint(normalized, IMAGE_MODEL_HINTS)) {
		return "images.generations";
	}
	return "responses";
}

export function getPrimaryUnifiedCapability(
	endpoints: UnifiedChatEndpoint[],
): UnifiedChatEndpoint {
	if (endpoints.includes("responses")) return "responses";
	if (endpoints.includes("video.generation")) return "video.generation";
	if (endpoints.includes("moderations")) return "moderations";
	if (endpoints.includes("embeddings")) return "embeddings";
	if (endpoints.includes("audio.speech")) return "audio.speech";
	if (endpoints.includes("audio.transcription")) return "audio.transcription";
	if (endpoints.includes("audio.translation")) return "audio.translation";
	if (endpoints.includes("images.generations")) return "images.generations";
	return "responses";
}

export function inferUnifiedEndpoint(args: {
	modelId: string;
	defaultCapability?: UnifiedChatEndpoint;
}): UnifiedChatEndpoint {
	const modelCapability =
		args.defaultCapability ?? inferModelCapabilityEndpoint(args.modelId);

	if (modelCapability === "video.generation") {
		return "video.generation";
	}
	if (modelCapability !== "responses") {
		return modelCapability;
	}
	return "responses";
}
