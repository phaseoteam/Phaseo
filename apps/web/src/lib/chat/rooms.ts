export type ChatRoomId =
	| "text"
	| "fusion"
	| "image"
	| "video"
	| "audio"
	| "speech"
	| "speech-to-text"
	| "music"
	| "realtime"
	| "moderation"
	| "embeddings"
	| "ocr"
	| "rerank"
	| "systemone";

export type ChatRoomConfig = {
	id: ChatRoomId;
	label: string;
	route: string;
	description: string;
	capabilityHints: string[];
	beta?: boolean;
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
	"image.edit",
	"images.edits",
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
const OCR_CAPABILITY_HINTS = ["ocr"];
const RERANK_CAPABILITY_HINTS = ["rerank"];
const DECISIONS_CAPABILITY_HINTS = [
	"decisions.make",
	"decision.make",
	"systemone",
	"system.one",
	"typed.decisions",
	"decision.outputs",
	"decision_output",
	"decisions",
];

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
		description: "Speech transcription workspace.",
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
	{
		id: "ocr",
		label: "OCR",
		route: "/chat/ocr",
		description: "Extract structured text from documents and images.",
		capabilityHints: OCR_CAPABILITY_HINTS,
	},
	{
		id: "rerank",
		label: "Rerank",
		route: "/chat/rerank",
		description: "Rank documents by relevance to a query.",
		capabilityHints: RERANK_CAPABILITY_HINTS,
	},
	{
		id: "systemone",
		label: "Decisions",
		route: "/chat/decisions",
		description: "Generate typed decisions from structured state.",
		capabilityHints: DECISIONS_CAPABILITY_HINTS,
		beta: true,
	},
	{
		id: "fusion",
		label: "Fusion",
		route: "/chat/fusion",
		description: "Compare multiple model responses and synthesize one answer.",
		capabilityHints: [],
		beta: true,
	},
];

export const CHAT_ROOM_BY_ID: Record<ChatRoomId, ChatRoomConfig> = {
	text: CHAT_ROOMS[0],
	image: CHAT_ROOMS[1],
	video: CHAT_ROOMS[2],
	audio: {
		id: "audio",
		label: "Text to Speech",
		route: "/chat/speech",
		description: "Audio model compatibility mapping for focused audio rooms.",
		capabilityHints: AUDIO_CAPABILITY_HINTS,
	},
	speech: CHAT_ROOMS[3],
	"speech-to-text": CHAT_ROOMS[4],
	music: CHAT_ROOMS[5],
	realtime: CHAT_ROOMS[6],
	moderation: CHAT_ROOMS[7],
	embeddings: CHAT_ROOMS[8],
	ocr: CHAT_ROOMS[9],
	rerank: CHAT_ROOMS[10],
	systemone: CHAT_ROOMS[11],
	fusion: CHAT_ROOMS[12],
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
const SYSTEM_ONE_MODEL_HINTS = [
	"typesafe/jev-1.13.0",
	"typesafe/jev-latest",
	"system-one",
	"systemone",
	"decisions",
];

function normalizeCapability(capabilityId: string): string {
	return capabilityId.trim().toLowerCase();
}

function matchesCapability(capabilityId: string, supported: string[]): boolean {
	return supported.includes(capabilityId);
}

const CAPABILITY_ALIASES: Record<string, string> = {
	"images.generate": "image.generate",
	"images.generations": "image.generate",
	"image.generation": "image.generate",
	"images.edits": "image.edit",
	"rerank.create": "rerank",
	"text.rerank": "rerank",
};

export function normalizeChatCapabilityId(capabilityId: string): string {
	const normalized = normalizeCapability(capabilityId);
	return CAPABILITY_ALIASES[normalized] ?? normalized;
}

function includesHint(value: string, hints: string[]) {
	return hints.some((hint) => value.includes(hint));
}

export function capabilityIdToRoomId(
	capabilityId: string,
): ChatRoomId | null {
	const normalized = normalizeChatCapabilityId(capabilityId);
	if (matchesCapability(normalized, DECISIONS_CAPABILITY_HINTS)) {
		return "systemone";
	}
	if (matchesCapability(normalized, TEXT_CAPABILITY_HINTS)) {
		return "text";
	}
	if (matchesCapability(normalized, IMAGE_CAPABILITY_HINTS)) {
		return "image";
	}
	if (matchesCapability(normalized, VIDEO_CAPABILITY_HINTS)) {
		return "video";
	}
	if (matchesCapability(normalized, REALTIME_CAPABILITY_HINTS)) {
		return "realtime";
	}
	if (matchesCapability(normalized, SPEECH_TO_TEXT_CAPABILITY_HINTS)) {
		return "speech-to-text";
	}
	if (matchesCapability(normalized, SPEECH_CAPABILITY_HINTS)) {
		return "speech";
	}
	if (matchesCapability(normalized, MUSIC_CAPABILITY_HINTS)) {
		return "music";
	}
	if (matchesCapability(normalized, AUDIO_CAPABILITY_HINTS)) {
		return "audio";
	}
	if (matchesCapability(normalized, MODERATION_CAPABILITY_HINTS)) {
		return "moderation";
	}
	if (matchesCapability(normalized, EMBEDDINGS_CAPABILITY_HINTS)) {
		return "embeddings";
	}
	if (matchesCapability(normalized, OCR_CAPABILITY_HINTS)) {
		return "ocr";
	}
	if (matchesCapability(normalized, RERANK_CAPABILITY_HINTS)) {
		return "rerank";
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
	if (includesHint(normalized, SYSTEM_ONE_MODEL_HINTS)) return "systemone";
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
	outputModalities?: string[] | null;
};

function roomIdsFromOutputModalities(
	modalities: string[] | null | undefined,
): ChatRoomId[] {
	const rooms = new Set<ChatRoomId>();
	for (const value of modalities ?? []) {
		const modality = value.trim().toLowerCase().replace(/[\s/-]+/g, "_");
		if (modality === "text") rooms.add("text");
		else if (modality === "image") rooms.add("image");
		else if (modality === "video") rooms.add("video");
		else if (modality === "music" || modality === "audio_music") rooms.add("music");
		else if (modality === "audio_tts") rooms.add("speech");
		else if (modality === "audio_stt") rooms.add("speech-to-text");
		else if (modality === "audio") rooms.add("audio");
		else if (modality === "embeddings") rooms.add("embeddings");
		else if (modality === "moderations") rooms.add("moderation");
		else if (modality === "ocr") rooms.add("ocr");
		else if (modality === "rerank") rooms.add("rerank");
		else if (
			modality === "structured" ||
			modality === "system_one" ||
			modality === "decision" ||
			modality === "decisions" ||
			modality === "decision_make" ||
			modality === "decision_output" ||
			modality === "decision_outputs"
		) rooms.add("systemone");
	}
	return Array.from(rooms);
}

export function modelSupportsRoom(
	model: ModelWithCapabilities,
	roomId: ChatRoomId,
): boolean {
	if (roomId === "fusion") return false;
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
	const hasDeclaredCapabilities = (model.capabilities ?? []).some(
		(capabilityId) => capabilityId.trim().length > 0,
	);
	if (hasDeclaredCapabilities) {
		return false;
	}
	const modalityRooms = roomIdsFromOutputModalities(model.outputModalities);
	if (modalityRooms.length > 0) {
		return roomId === "audio"
			? modalityRooms.some((id) => ["audio", "speech", "speech-to-text", "music"].includes(id))
			: modalityRooms.includes(roomId);
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
