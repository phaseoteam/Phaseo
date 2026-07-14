export type ChatRoomId =
	| "text"
	| "image"
	| "video"
	| "audio"
	| "speech"
	| "speech-to-text"
	| "music"
	| "realtime"
	| "moderation"
	| "embeddings";

export type ChatRoomConfig = {
	id: ChatRoomId;
	label: string;
	route: string;
	description: string;
	capabilityHints: string[];
};

const TEXT_CAPABILITY_HINTS = [
	"text.generate",
	"responses",
	"chat.completions",
	"chat.generate",
	"text",
];
const IMAGE_CAPABILITY_HINTS = [
	"image.generate",
	"images.generate",
	"images.generations",
	"image.generation",
];
const VIDEO_CAPABILITY_HINTS = [
	"video.generate",
	"video.generation",
	"video.generations",
];
const AUDIO_CAPABILITY_HINTS = [
	"audio.speech",
	"audio.transcribe",
	"audio.transcription",
	"audio.translate",
	"audio.translation",
	"audio",
];
const SPEECH_CAPABILITY_HINTS = ["audio.speech", "text to speech", "tts", "speech"];
const SPEECH_TO_TEXT_CAPABILITY_HINTS = [
	"audio.transcribe",
	"audio.transcription",
	"audio.transcriptions",
	"audio.translate",
	"audio.translation",
	"audio.translations",
	"speech to text",
	"transcription",
	"translation",
	"whisper",
];
const MUSIC_CAPABILITY_HINTS = ["music.generate", "music", "song", "audio.music"];
const REALTIME_CAPABILITY_HINTS = ["audio.realtime", "realtime", "real-time"];
const MODERATION_CAPABILITY_HINTS = ["moderation", "moderations.create", "text.moderate"];
const EMBEDDINGS_CAPABILITY_HINTS = ["text.embed", "embeddings", "embedding"];

export const CHAT_ROOMS: ChatRoomConfig[] = [
	{
		id: "text",
		label: "Text",
		route: "/chat",
		description: "Text workspace with multimodal inputs and responses output.",
		capabilityHints: TEXT_CAPABILITY_HINTS,
	},
	{
		id: "image",
		label: "Images",
		route: "/chat/image",
		description: "Prompt-first image generation studio.",
		capabilityHints: IMAGE_CAPABILITY_HINTS,
	},
	{
		id: "video",
		label: "Videos",
		route: "/chat/video",
		description: "Prompt-first video generation studio with polling.",
		capabilityHints: VIDEO_CAPABILITY_HINTS,
	},
	{
		id: "speech",
		label: "Text to Speech",
		route: "/chat/speech",
		description: "Text-to-speech workspace for generating spoken audio.",
		capabilityHints: SPEECH_CAPABILITY_HINTS,
	},
	{
		id: "speech-to-text",
		label: "Speech to Text",
		route: "/chat/speech-to-text",
		description: "Speech transcription and translation workspace.",
		capabilityHints: SPEECH_TO_TEXT_CAPABILITY_HINTS,
	},
	{
		id: "music",
		label: "Music",
		route: "/chat/music",
		description: "Music generation workspace.",
		capabilityHints: MUSIC_CAPABILITY_HINTS,
	},
	{
		id: "realtime",
		label: "Realtime",
		route: "/chat/realtime",
		description: "Realtime voice and multimodal conversation workspace.",
		capabilityHints: REALTIME_CAPABILITY_HINTS,
	},
	{
		id: "moderation",
		label: "Moderation",
		route: "/chat/moderation",
		description: "Moderation analyzer for text and images.",
		capabilityHints: MODERATION_CAPABILITY_HINTS,
	},
	{
		id: "embeddings",
		label: "Embeddings",
		route: "/chat/embeddings",
		description: "Multimodal embeddings explorer with vector projection.",
		capabilityHints: EMBEDDINGS_CAPABILITY_HINTS,
	},
];

export const CHAT_ROOM_BY_ID: Record<ChatRoomId, ChatRoomConfig> = {
	text: CHAT_ROOMS[0],
	image: CHAT_ROOMS[1],
	video: CHAT_ROOMS[2],
	audio: {
		id: "audio",
		label: "Audio",
		route: "/chat/audio",
		description: "Legacy audio workspace.",
		capabilityHints: AUDIO_CAPABILITY_HINTS,
	},
	speech: CHAT_ROOMS[3],
	"speech-to-text": CHAT_ROOMS[4],
	music: CHAT_ROOMS[5],
	realtime: CHAT_ROOMS[6],
	moderation: CHAT_ROOMS[7],
	embeddings: CHAT_ROOMS[8],
};

const IMAGE_MODEL_HINTS = [
	"image",
	"imagen",
	"flux",
	"stable-diffusion",
	"dall-e",
	"gpt-image",
];
const VIDEO_MODEL_HINTS = ["video", "veo", "sora", "kling", "runway"];
const AUDIO_MODEL_HINTS = [
	"audio",
	"speech",
	"voice",
	"transcribe",
	"transcription",
	"tts",
	"music",
	"suno",
	"udio",
	"melody",
];
const REALTIME_MODEL_HINTS = ["realtime", "real-time", "gpt-4o-realtime"];
const MODERATION_MODEL_HINTS = ["moderation"];
const EMBEDDING_MODEL_HINTS = ["embedding", "embed"];
const MUSIC_MODEL_HINTS = ["music", "suno", "udio", "melody", "song"];

function normalizeCapability(capabilityId: string): string {
	return capabilityId.trim().toLowerCase();
}

function includesHint(value: string, hints: string[]) {
	return hints.some((hint) => value.includes(hint));
}

export function capabilityIdToRoomId(
	capabilityId: string,
): ChatRoomId | null {
	const normalized = normalizeCapability(capabilityId);
	if (
		TEXT_CAPABILITY_HINTS.some((hint) => normalized.includes(hint)) &&
		!normalized.includes("embed") &&
		!normalized.includes("moderate")
	) {
		return "text";
	}
	if (IMAGE_CAPABILITY_HINTS.some((hint) => normalized.includes(hint))) {
		return "image";
	}
	if (VIDEO_CAPABILITY_HINTS.some((hint) => normalized.includes(hint))) {
		return "video";
	}
	if (REALTIME_CAPABILITY_HINTS.some((hint) => normalized.includes(hint))) {
		return "realtime";
	}
	if (SPEECH_TO_TEXT_CAPABILITY_HINTS.some((hint) => normalized.includes(hint))) {
		return "speech-to-text";
	}
	if (SPEECH_CAPABILITY_HINTS.some((hint) => normalized.includes(hint))) {
		return "speech";
	}
	if (MUSIC_CAPABILITY_HINTS.some((hint) => normalized.includes(hint))) {
		return "music";
	}
	if (AUDIO_CAPABILITY_HINTS.some((hint) => normalized.includes(hint))) {
		return "audio";
	}
	if (MODERATION_CAPABILITY_HINTS.some((hint) => normalized.includes(hint))) {
		return "moderation";
	}
	if (EMBEDDINGS_CAPABILITY_HINTS.some((hint) => normalized.includes(hint))) {
		return "embeddings";
	}
	return null;
}

export function roomIdsFromCapabilities(
	capabilityIds: string[] | null | undefined,
): ChatRoomId[] {
	const roomIds = new Set<ChatRoomId>();
	for (const capabilityId of capabilityIds ?? []) {
		const roomId = capabilityIdToRoomId(capabilityId);
		if (roomId) {
			roomIds.add(roomId);
		}
	}
	return Array.from(roomIds);
}

export function inferModelRoomFromId(modelId: string): ChatRoomId {
	const normalized = modelId.toLowerCase();
	if (includesHint(normalized, REALTIME_MODEL_HINTS)) return "realtime";
	if (includesHint(normalized, VIDEO_MODEL_HINTS)) return "video";
	if (includesHint(normalized, IMAGE_MODEL_HINTS)) return "image";
	if (includesHint(normalized, MODERATION_MODEL_HINTS)) return "moderation";
	if (includesHint(normalized, EMBEDDING_MODEL_HINTS)) return "embeddings";
	if (includesHint(normalized, ["whisper", "transcribe", "transcription"])) {
		return "speech-to-text";
	}
	if (includesHint(normalized, ["tts", "voice", "speech"])) return "speech";
	if (includesHint(normalized, MUSIC_MODEL_HINTS)) return "music";
	if (includesHint(normalized, AUDIO_MODEL_HINTS)) return "audio";
	return "text";
}

type ModelWithCapabilities = {
	modelId: string;
	capabilities?: string[] | null;
};

export function modelSupportsRoom(
	model: ModelWithCapabilities,
	roomId: ChatRoomId,
): boolean {
	const capabilityRooms = roomIdsFromCapabilities(model.capabilities);
	if (capabilityRooms.length > 0) {
		if (roomId === "audio") {
			return capabilityRooms.some((id) =>
				id === "audio" ||
				id === "speech" ||
				id === "speech-to-text" ||
				id === "music" ||
				id === "realtime",
			);
		}
		return capabilityRooms.includes(roomId);
	}
	if (roomId === "text") {
		return inferModelRoomFromId(model.modelId) === "text";
	}
	return inferModelRoomFromId(model.modelId) === roomId;
}

export function filterModelsForRoom<T extends ModelWithCapabilities>(
	models: T[],
	roomId: ChatRoomId,
): T[] {
	return models.filter((model) => modelSupportsRoom(model, roomId));
}

export function getRoomStoragePrefix(roomId: ChatRoomId): string {
	return `phaseo-chat-${roomId}`;
}

export function getRoomScopedStorageKey(
	roomId: ChatRoomId,
	key: string,
): string {
	return `${getRoomStoragePrefix(roomId)}-${key}`;
}
