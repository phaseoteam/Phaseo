import type { HttpMethod } from "@/components/HttpMethodBadge";
import { resolveGatewayPath } from "./endpoint-paths";

export type EndpointOption = {
	value: string;
	label: string;
};

export type EndpointRoute = {
	value: string;
	method: HttpMethod;
	path: string;
	title: string;
	description: string;
	tag: "Recommended" | "Compatible" | "Optional" | "Discovery";
};

const ENDPOINT_ROUTE_META: Record<string, Omit<EndpointRoute, "value">> = {
	responses: {
		method: "POST",
		path: "/v1/responses",
		title: "Responses",
		description: "Modern response API with text, tools, and multimodal input support.",
		tag: "Recommended",
	},
	"chat.completions": {
		method: "POST",
		path: "/v1/chat/completions",
		title: "Chat Completions",
		description: "OpenAI-compatible route for existing chat integrations.",
		tag: "Compatible",
	},
	messages: {
		method: "POST",
		path: "/v1/messages",
		title: "Messages",
		description: "Anthropic-compatible route for Claude-style clients.",
		tag: "Compatible",
	},
	embeddings: {
		method: "POST",
		path: "/v1/embeddings",
		title: "Embeddings",
		description: "Create vector embeddings for search, retrieval, and ranking workflows.",
		tag: "Recommended",
	},
	moderations: {
		method: "POST",
		path: "/v1/moderations",
		title: "Moderations",
		description: "Classify content before routing requests downstream.",
		tag: "Recommended",
	},
	"moderations.create": {
		method: "POST",
		path: "/v1/moderations",
		title: "Moderations",
		description: "Create a moderation check with SDK method compatibility.",
		tag: "Compatible",
	},
	"images.generations": {
		method: "POST",
		path: "/v1/images/generations",
		title: "Image Generation",
		description: "Generate images from a prompt.",
		tag: "Recommended",
	},
	"images.edits": {
		method: "POST",
		path: "/v1/images/edits",
		title: "Image Edits",
		description: "Edit or transform an existing image.",
		tag: "Optional",
	},
	"video.generations": {
		method: "POST",
		path: "/v1/video/generations",
		title: "Video Generation",
		description: "Create long-running video generation jobs from prompts.",
		tag: "Recommended",
	},
	"audio.speech": {
		method: "POST",
		path: "/v1/audio/speech",
		title: "Audio Speech",
		description: "Generate spoken audio from text input.",
		tag: "Recommended",
	},
	"audio.realtime": {
		method: "POST",
		path: "/v1/audio/realtime",
		title: "Realtime Audio",
		description: "Start realtime voice sessions for low-latency audio workflows.",
		tag: "Optional",
	},
	"audio.transcriptions": {
		method: "POST",
		path: "/v1/audio/transcriptions",
		title: "Audio Transcription",
		description: "Transcribe audio files into text.",
		tag: "Recommended",
	},
	"audio.translations": {
		method: "POST",
		path: "/v1/audio/translations",
		title: "Audio Translation",
		description: "Translate audio into English text.",
		tag: "Optional",
	},
	"batch.create": {
		method: "POST",
		path: "/v1/batches",
		title: "Batch Create",
		description: "Create asynchronous batch jobs for high-volume requests.",
		tag: "Optional",
	},
	"music.generate": {
		method: "POST",
		path: "/v1/music/generations",
		title: "Music Generation",
		description: "Generate music or audio loops from prompts.",
		tag: "Recommended",
	},
};

export const ENDPOINT_OPTIONS: EndpointOption[] = [
	{ value: "responses", label: "Responses" },
	{ value: "chat.completions", label: "Chat Completions" },
	{ value: "messages", label: "Messages" },
	{ value: "embeddings", label: "Embeddings" },
	{ value: "moderations", label: "Moderations" },
	{ value: "moderations.create", label: "Moderations (Create)" },
	{ value: "images.generations", label: "Image Generation" },
	{ value: "images.edits", label: "Image Edits" },
	{ value: "video.generations", label: "Video Generation" },
	{ value: "audio.speech", label: "Audio Speech" },
	{ value: "audio.realtime", label: "Audio Realtime" },
	{ value: "audio.transcriptions", label: "Audio Transcription" },
	{ value: "audio.translations", label: "Audio Translation" },
	{ value: "batch.create", label: "Batch Create" },
	{ value: "music.generate", label: "Music Generation" },
];

export const ENDPOINT_ROUTE_PREVIEW_LIMIT = 4;

export function buildEndpointRoutes(
	availableEndpoints: EndpointOption[],
): EndpointRoute[] {
	return availableEndpoints.map((option) => {
		const meta = ENDPOINT_ROUTE_META[option.value];
		if (meta) {
			return { value: option.value, ...meta };
		}

		return {
			value: option.value,
			method: "POST",
			path: `/v1${resolveGatewayPath(option.value)}`,
			title: option.label,
			description: "Call this Gateway route with the selected model identifier.",
			tag: "Compatible",
		};
	});
}

export function getVisibleEndpointRoutes(
	endpointRoutes: EndpointRoute[],
	selectedEndpoint: string,
	showAllEndpointRoutes: boolean,
	previewLimit = ENDPOINT_ROUTE_PREVIEW_LIMIT,
): EndpointRoute[] {
	if (showAllEndpointRoutes || endpointRoutes.length <= previewLimit) {
		return endpointRoutes;
	}

	const previewRoutes = endpointRoutes.slice(0, previewLimit);
	if (previewRoutes.some((route) => route.value === selectedEndpoint)) {
		return previewRoutes;
	}

	const selectedRoute = endpointRoutes.find(
		(route) => route.value === selectedEndpoint,
	);
	if (!selectedRoute) return previewRoutes;

	return [...previewRoutes.slice(0, previewLimit - 1), selectedRoute];
}
