import { modelGroupModalities } from "./modelGroupModalities";

export type DecisionModelCapability = "text.generate" | "decisions.make";

function normalizeEndpoint(endpoint: string): string {
	return endpoint.trim().toLowerCase().replace(/^\/v1\//, "").replace(/^\//, "").replace(/\//g, ".");
}

export function decisionModelCapability(endpoint: string): DecisionModelCapability | null {
	const value = normalizeEndpoint(endpoint);
	if (["text.generate", "responses", "chat.completions", "messages", "text", "chat.generate"].includes(value)) return "text.generate";
	if (["decisions", "decisions.make", "decision.make", "systemone", "system.one", "typed.decisions"].includes(value)) return "decisions.make";
	return null;
}

export function decisionModelCapabilities(endpoints: readonly string[]): DecisionModelCapability[] {
	const capabilities = new Set(endpoints.map(decisionModelCapability));
	return (["text.generate", "decisions.make"] as const).filter(value => capabilities.has(value));
}

export function modelOutputFilterValues(modalities: readonly string[], endpoints: readonly string[]): string[] {
	const groups = modelGroupModalities(new Set(modalities.map(value => value.trim().toLowerCase()).filter(Boolean)), endpoints);
	return [...new Set([...groups, ...(endpoints.some(endpoint => decisionModelCapability(endpoint) === "decisions.make") ? ["decisions"] : [])])];
}

// Endpoint names that address the same gateway capability. Only true aliases belong here:
// image generation and image editing, for example, remain separate capabilities.
const MODEL_CAPABILITY_ALIASES: Record<string, string> = {
	embeddings: "text.embed",
	rerank: "text.rerank",
	moderation: "text.moderate",
	moderations: "text.moderate",
	"moderations.create": "text.moderate",
	"images.generate": "image.generate",
	"images.generations": "image.generate",
	"images.edits": "image.edit",
	"images.variations": "image.vary",
	"audio.transcribe": "audio.transcription",
	"audio.transcriptions": "audio.transcription",
	"audio.translate": "audio.translations",
	"audio.translation": "audio.translations",
	realtime: "audio.realtime",
	"video.generations": "video.generate",
	batches: "batch",
	"batch.create": "batch",
};

// Display order and Catalogue.models.filtersUi label keys for known capabilities.
export const MODEL_CAPABILITY_LABEL_KEYS = {
	"text.generate": "capabilityTextGeneration",
	"decisions.make": "modalityDecisions",
	"image.generate": "endpointImageGeneration",
	"image.edit": "endpointImageEditing",
	"image.vary": "endpointImageVariations",
	"video.generate": "endpointVideoGeneration",
	"video.edit": "endpointVideoEditing",
	"audio.speech": "endpointTextToSpeech",
	"audio.transcription": "endpointTranscription",
	"audio.translations": "endpointTranslation",
	"audio.realtime": "endpointRealtime",
	"music.generate": "endpointMusicGeneration",
	"text.embed": "endpointEmbeddings",
	"text.rerank": "endpointRerank",
	"text.moderate": "endpointModerations",
	ocr: "endpointOcr",
	parse: "endpointDocumentParsing",
	batch: "tierBatch",
} as const;

const MODEL_CAPABILITY_ORDER: readonly string[] = Object.keys(MODEL_CAPABILITY_LABEL_KEYS);

export function modelCapability(endpoint: string): string {
	return decisionModelCapability(endpoint) ?? MODEL_CAPABILITY_ALIASES[normalizeEndpoint(endpoint)] ?? normalizeEndpoint(endpoint);
}

export function modelCapabilities(endpoints: readonly string[]): string[] {
	const rank = (capability: string) => {
		const index = MODEL_CAPABILITY_ORDER.indexOf(capability);
		return index === -1 ? MODEL_CAPABILITY_ORDER.length : index;
	};
	return [...new Set(endpoints.map(modelCapability).filter(Boolean))]
		.sort((left, right) => rank(left) - rank(right) || left.localeCompare(right));
}
