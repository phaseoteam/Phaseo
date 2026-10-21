// Purpose: Modality-aware routing for text generation requests.
// Why: Ensure providers only receive inputs they advertise support for.
// How: Inspect IR content + requested output modalities to filter candidates.

import type {
	IRChatRequest,
	IRDecisionsRequest,
	IRContentPart,
	IREmbeddingsRequest,
	IREmbeddingsInput,
	IREmbeddingsInputItem,
	IRMessage,
} from "@core/ir";
import type { ProviderCandidate } from "../before/types";

export type Modality = "text" | "image" | "audio" | "video";

export function filterDecisionCandidatesByModalities(candidates: ProviderCandidate[], ir: IRDecisionsRequest): ProviderCandidate[] {
	const requestsBox = Object.values(ir.questions ?? {}).some(question => question.type === "box");
	const requestsLongContext = ir.providerOptions?.typesafe?.long_context === true;
	const media = [
		{ modality: "image", parameter: "images", requested: Boolean(ir.images?.length) },
		{ modality: "audio", parameter: "audio", requested: Boolean(ir.audio?.length) },
		{ modality: "video", parameter: "videos", requested: Boolean(ir.videos?.length) },
	].filter(item => item.requested);
	return candidates.filter(candidate =>
		(!requestsBox || (Boolean(ir.images?.length) && candidate.capabilityParams?.box === true)) &&
		(!requestsLongContext || (candidate.providerId === "typesafe" && candidate.capabilityParams?.long_context === true)) &&
		media.every(item => candidate.inputModalities?.includes(item.modality) && candidate.capabilityParams?.[item.parameter] === true));
}

type ModalityRequirements = {
	input: Set<Modality>;
	output: Set<Modality>;
};

type EmbeddingsModalityRequirements = {
	input: Set<Modality>;
};

function isGoogleImagePreviewModel(candidate: ProviderCandidate, modelId: string): boolean {
	if (candidate.providerId !== "google-ai-studio") {
		return false;
	}
	const haystack = `${modelId} ${candidate.providerModelSlug ?? ""}`.toLowerCase();
	return (
		haystack.includes("gemini-2-5-flash-image-preview") ||
		haystack.includes("gemini-2-5-flash-image") ||
		haystack.includes("gemini-2.5-flash-image") ||
		haystack.includes("gemini-3-pro-image-preview") ||
		haystack.includes("gemini-3-flash-image") ||
		haystack.includes("image-preview") ||
		haystack.includes("flash-image")
	);
}

function isGoogleEmbeddingsModel(candidate: ProviderCandidate, modelId: string): boolean {
	if (candidate.providerId !== "google-ai-studio") {
		return false;
	}
	const haystack = `${modelId} ${candidate.providerModelSlug ?? ""}`.toLowerCase();
	return haystack.includes("gemini-embedding");
}

function toBaseInputModality(value: string): Modality | null {
	if (value === "text" || value.startsWith("text_")) return "text";
	if (value === "image" || value.startsWith("image_")) return "image";
	if (value === "audio" || value.startsWith("audio_")) return "audio";
	if (value === "video" || value.startsWith("video_")) return "video";
	return null;
}

function toBaseOutputModality(value: string): Modality | null {
	if (value === "text" || value.startsWith("text_")) return "text";
	if (value === "image" || value.startsWith("image_")) return "image";
	if (value === "audio" || value === "audio_tts" || value === "audio_music") return "audio";
	if (value === "video" || value.startsWith("video_")) return "video";
	return null;
}

function normalizeModalities(
	values: string[] | null | undefined,
	mapper: (value: string) => Modality | null,
): Set<Modality> {
	if (!values || values.length === 0) return new Set();
	const normalized = new Set<Modality>();
	for (const value of values) {
		const base = mapper(String(value).trim().toLowerCase());
		if (base) {
			normalized.add(base);
		}
	}
	return normalized;
}

/** Content parts of a message, including the parts of its tool results. */
function messageParts(message: IRMessage): IRContentPart[] {
	if (message.role === "tool") return (message.toolResults ?? []).flatMap((result) => result.parts ?? []);
	return Array.isArray(message.content) ? message.content : [];
}

function collectInputModalities(messages: IRMessage[]): Set<Modality> {
	const required = new Set<Modality>(["text"]);
	for (const message of messages) {
		for (const part of messageParts(message)) {
			switch ((part as IRContentPart).type) {
				case "image":
					required.add("image");
					break;
				case "audio":
					required.add("audio");
					break;
				case "video":
					required.add("video");
					break;
				default:
					break;
			}
		}
	}
	return required;
}

type FileRequirements = {
	/** A document or other file is sent (file part or Anthropic document block). */
	files: boolean;
	/** Uploaded file references (file or image parts sent by id). */
	fileIds: string[];
};

function collectFileRequirements(messages: IRMessage[]): FileRequirements {
	const requirements: FileRequirements = { files: false, fileIds: [] };
	for (const message of messages) {
		for (const part of messageParts(message)) {
			if (part.type === "file") {
				requirements.files = true;
				if (part.source === "id") requirements.fileIds.push(part.data);
			} else if (part.type === "image" && part.source === "id") {
				requirements.fileIds.push(part.data);
			} else if (part.type === "provider_block" && part.block?.type === "document") {
				requirements.files = true;
				if (part.block.source?.type === "file") requirements.fileIds.push(String(part.block.source.file_id ?? ""));
			}
		}
	}
	return requirements;
}

// Providers whose executors send documents in a shape the provider documents:
// OpenAI, Azure and xAI (`file` / `input_file`), Claude (`document`), Gemini
// (`inline_data` / `file_data`), Mistral (`document_url`), and the hosts whose
// published Chat schema defines OpenAI's `file` part.
const FILE_INPUT_PROVIDERS = new Set([
	"openai", "openai-eu", "azure",
	"anthropic", "anthropic-us", "anthropic-aws", "anthropic-aws-us",
	"google-ai-studio", "google-vertex", "google-vertex-eu", "amazon-bedrock",
	"spacex-ai", "x-ai", "xai",
	"mistral", "mistral-eu",
	"deepinfra", "ambient", "io-net", "morpheus", "nebius-token-factory",
	"nebius-token-factory-eu-north-1", "nebius-token-factory-us-central-1",
	"ovhcloud", "sail-research", "scaleway", "venice", "z-ai", "zai",
]);

// Providers that resolve uploaded file ids: OpenAI, Azure and xAI file ids
// and Anthropic Files API ids. Gemini (Files API names) and Mistral (UUIDs)
// read only their own ids.
const FILE_ID_PROVIDERS = new Set([
	"openai", "openai-eu", "azure",
	"anthropic", "anthropic-us", "anthropic-aws", "anthropic-aws-us",
	"spacex-ai", "x-ai", "xai",
]);
// Anthropic Files API ids, as sent by /v1/messages clients, resolve only on
// the Claude API, Claude Platform on AWS and Microsoft Foundry.
// https://platform.claude.com/docs/en/build-with-claude/files
const ANTHROPIC_FILE_ID_PROVIDERS = new Set([
	"anthropic", "anthropic-us", "anthropic-aws", "anthropic-aws-us", "azure",
]);

const GEMINI_FILE_ID = /^(files\/[^/]+|https:\/\/generativelanguage\.googleapis\.com\/.+)$/i;
const MISTRAL_FILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function declaresFileInput(values: string[] | null | undefined): boolean {
	return (values ?? []).some((value) => {
		const normalized = String(value).trim().toLowerCase();
		return normalized === "file" || normalized === "document" || normalized === "pdf"
			|| normalized.startsWith("file_") || normalized.startsWith("document_");
	});
}

/**
 * A route takes documents when its catalogue entry says so, or when its
 * provider's executor sends files in a documented shape and the model reads
 * images (PDF input is a vision feature on OpenAI, Claude and Gemini). Vertex
 * AI and Bedrock carry files only for their Claude and Gemini models.
 */
function candidateAcceptsFiles(candidate: ProviderCandidate, modelId: string, input: Set<Modality>): boolean {
	if (declaresFileInput(candidate.inputModalities)) return true;
	if (!FILE_INPUT_PROVIDERS.has(candidate.providerId)) return false;
	const haystack = `${modelId} ${candidate.providerModelSlug ?? ""}`.toLowerCase();
	if (candidate.providerId === "amazon-bedrock" && !haystack.includes("claude")) return false;
	if (candidate.providerId.startsWith("google-vertex") && !haystack.includes("claude") && !haystack.includes("gemini")) return false;
	return input.has("image");
}

function candidateResolvesFileIds(candidate: ProviderCandidate, fileIds: string[], protocol: string | undefined): boolean {
	if (fileIds.length === 0) return true;
	if (protocol === "anthropic.messages") return ANTHROPIC_FILE_ID_PROVIDERS.has(candidate.providerId);
	if (FILE_ID_PROVIDERS.has(candidate.providerId)) return true;
	if (candidate.providerId === "google-ai-studio") return fileIds.every((id) => GEMINI_FILE_ID.test(id));
	if (candidate.providerId === "mistral" || candidate.providerId === "mistral-eu") {
		return fileIds.every((id) => MISTRAL_FILE_ID.test(id));
	}
	return false;
}

function collectOutputModalities(ir: IRChatRequest): Set<Modality> {
	const output = new Set<Modality>();
	const requested = ir.modalities ?? [];
	for (const modality of requested) {
		if (modality === "text" || modality === "image" || modality === "audio" || modality === "video") {
			output.add(modality);
		}
	}
	return output;
}

export function detectModalityRequirements(ir: IRChatRequest): ModalityRequirements {
	return {
		input: collectInputModalities(ir.messages),
		output: collectOutputModalities(ir),
	};
}

function collectEmbeddingsInputModalities(input: IREmbeddingsInput): Set<Modality> {
	const required = new Set<Modality>();

	const collectFromParts = (parts: IREmbeddingsInputItem) => {
		if (!Array.isArray(parts)) return;
		for (const part of parts as any[]) {
			switch (part?.type) {
				case "text":
					required.add("text");
					break;
				case "image":
					required.add("image");
					break;
				case "audio":
					required.add("audio");
					break;
				case "video":
					required.add("video");
					break;
				default:
					break;
			}
		}
	};

	const collectItem = (item: IREmbeddingsInputItem) => {
		if (typeof item === "string") {
			required.add("text");
			return;
		}
		if (Array.isArray(item) && item.every((entry) => typeof entry === "number")) {
			required.add("text");
			return;
		}
		collectFromParts(item);
	};

	if (
		Array.isArray(input) &&
		(input.length === 0 || input.every((entry) => typeof entry === "number"))
	) {
		required.add("text");
		return required;
	}

	if (Array.isArray(input)) {
		const looksLikeSingleContentParts =
			input.length > 0 &&
			input.some((entry) => typeof entry === "object" && entry !== null && (entry as any).type != null) &&
			input.every((entry) => typeof entry === "object" && entry !== null && (entry as any).type != null);
		if (looksLikeSingleContentParts) {
			collectFromParts(input as unknown as IREmbeddingsInputItem);
			if (required.size === 0) required.add("text");
			return required;
		}
		for (const item of input as IREmbeddingsInputItem[]) {
			collectItem(item);
		}
		if (required.size === 0) required.add("text");
		return required;
	}

	collectItem(input as IREmbeddingsInputItem);
	if (required.size === 0) required.add("text");
	return required;
}

export function detectEmbeddingsModalityRequirements(ir: IREmbeddingsRequest): EmbeddingsModalityRequirements {
	return {
		input: collectEmbeddingsInputModalities(ir.input),
	};
}

function supportsRequiredModalities(
	required: Set<Modality>,
	available: Set<Modality>,
	allowTextOnlyWhenUnknown: boolean,
): boolean {
	if (required.size === 0) return true;
	if (available.size === 0) {
		if (allowTextOnlyWhenUnknown && required.size === 1 && required.has("text")) {
			return true;
		}
		return false;
	}
	for (const modality of required) {
		if (!available.has(modality)) return false;
	}
	return true;
}

export function filterCandidatesByModalities(
	candidates: ProviderCandidate[],
	ir: IRChatRequest,
	options: { protocol?: string } = {},
): ProviderCandidate[] {
	const requirements = detectModalityRequirements(ir);
	const fileRequirements = collectFileRequirements(ir.messages);
	const needsNonTextInput = Array.from(requirements.input).some((m) => m !== "text");
	const needsNonTextOutput = Array.from(requirements.output).some((m) => m !== "text");

	return candidates.filter((candidate) => {
		let input = normalizeModalities(candidate.inputModalities ?? undefined, toBaseInputModality);
		let output = normalizeModalities(candidate.outputModalities ?? undefined, toBaseOutputModality);

		// Fallback for Google Nano Banana image-preview models where modality
		// metadata can be temporarily missing/stale in provider rows.
		if (isGoogleImagePreviewModel(candidate, ir.model)) {
			if (input.size === 0) input = new Set<Modality>(["text", "image"]);
			else input.add("text");
			if (output.size === 0) output = new Set<Modality>(["text", "image"]);
			else {
				output.add("text");
				output.add("image");
			}
		}

		const inputOk = supportsRequiredModalities(
			requirements.input,
			input,
			!needsNonTextInput,
		);
		if (!inputOk) return false;
		if (fileRequirements.files && !candidateAcceptsFiles(candidate, ir.model, input)) return false;
		if (!candidateResolvesFileIds(candidate, fileRequirements.fileIds, options.protocol)) return false;

		const outputOk = supportsRequiredModalities(
			requirements.output,
			output,
			!needsNonTextOutput,
		);
		return outputOk;
	});
}

export function filterEmbeddingCandidatesByModalities(
	candidates: ProviderCandidate[],
	ir: IREmbeddingsRequest,
): ProviderCandidate[] {
	const requirements = detectEmbeddingsModalityRequirements(ir);
	const needsNonTextInput = Array.from(requirements.input).some((m) => m !== "text");

	return candidates.filter((candidate) => {
		let input = normalizeModalities(candidate.inputModalities ?? undefined, toBaseInputModality);

		// Fallback for Gemini embedding families while provider modality metadata catches up.
		if (isGoogleEmbeddingsModel(candidate, ir.model) && input.size === 0) {
			input = new Set<Modality>(["text", "image", "audio", "video"]);
		}

		return supportsRequiredModalities(requirements.input, input, !needsNonTextInput);
	});
}
