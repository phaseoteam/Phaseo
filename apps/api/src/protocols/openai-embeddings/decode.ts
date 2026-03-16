// Purpose: Protocol adapter for embeddings payloads.
// Why: Normalize OpenAI-compatible embeddings requests/responses to IR.
// How: Maps between OpenAI embeddings shapes and IREmbeddings types.

import type { EmbeddingsRequest } from "@core/schemas";
import type {
	IREmbeddingsRequest,
	IREmbeddingsResponse,
	IREmbeddingsContentPart,
	IREmbeddingsInput,
	IREmbeddingsInputItem,
} from "@core/ir";
import { normalizeOpenAIContent } from "../shared/normalizeContent";

function isRecord(value: unknown): value is Record<string, any> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asEmbeddingsContentParts(value: unknown): IREmbeddingsContentPart[] {
	const normalized = normalizeOpenAIContent(
		Array.isArray(value) ? value : [value],
	);
	return normalized.filter((part): part is IREmbeddingsContentPart =>
		part.type === "text" ||
		part.type === "image" ||
		part.type === "audio" ||
		part.type === "video",
	);
}

function normalizeEmbeddingsInputItem(value: unknown): IREmbeddingsInputItem {
	if (typeof value === "string") {
		return value;
	}

	if (Array.isArray(value)) {
		if (value.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
			return value.map((entry) => Math.trunc(entry as number));
		}
		return asEmbeddingsContentParts(value);
	}

	if (isRecord(value)) {
		const content = value.content;
		if (content != null) {
			if (typeof content === "string") return content;
			return asEmbeddingsContentParts(content);
		}
		if (typeof value.type === "string") {
			return asEmbeddingsContentParts([value]);
		}
	}

	return String(value ?? "");
}

function normalizeEmbeddingsInput(value: unknown): IREmbeddingsInput {
	if (!Array.isArray(value)) {
		return normalizeEmbeddingsInputItem(value);
	}

	if (value.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
		return value.map((entry) => Math.trunc(entry as number));
	}

	const looksLikeSinglePartArray =
		value.length > 0 &&
		value.every((entry) => isRecord(entry) && typeof entry.type === "string" && entry.content == null && entry.parts == null);
	if (looksLikeSinglePartArray) {
		return asEmbeddingsContentParts(value);
	}

	return value.map((entry) => normalizeEmbeddingsInputItem(entry));
}

export function decodeOpenAIEmbeddingsRequest(req: EmbeddingsRequest): IREmbeddingsRequest {
	const providerOptions =
		(req as any)?.provider_options ??
		(req as any)?.embedding_options;
	const googleOptions = providerOptions?.google;
	const mistralOptions = providerOptions?.mistral;
	return {
		model: req.model,
		input: normalizeEmbeddingsInput(req.input),
		encodingFormat: req.encoding_format,
		dimensions: req.dimensions,
		providerOptions:
			googleOptions || mistralOptions
				? {
						google: googleOptions
							? {
									taskType: googleOptions.task_type,
									title: googleOptions.title,
								}
							: undefined,
						mistral: mistralOptions
							? {
									outputDtype: mistralOptions.output_dtype,
								}
							: undefined,
					}
				: undefined,
		userId: req.user,
	};
}

export function decodeOpenAIEmbeddingsResponse(payload: any): IREmbeddingsResponse {
	const data = Array.isArray(payload?.data)
		? payload.data.map((entry: any, index: number) => ({
				index: typeof entry?.index === "number" ? entry.index : index,
				embedding: Array.isArray(entry?.embedding) ? entry.embedding : [],
			}))
		: [];

	const usage = payload?.usage
		? {
				inputTokens: payload.usage.input_tokens ?? payload.usage.prompt_tokens ?? payload.usage.input_text_tokens,
				totalTokens: payload.usage.total_tokens,
				embeddingTokens: payload.usage.embedding_tokens,
				_ext: (() => {
					const inputImageTokens = payload.usage.input_image_tokens ?? payload.usage.input_tokens_details?.input_images;
					const inputAudioTokens = payload.usage.input_audio_tokens ?? payload.usage.input_tokens_details?.input_audio;
					const inputVideoTokens = payload.usage.input_video_tokens ?? payload.usage.input_tokens_details?.input_videos;
					const ext: NonNullable<IREmbeddingsResponse["usage"]>["_ext"] = {};
					if (typeof inputImageTokens === "number") ext.inputImageTokens = inputImageTokens;
					if (typeof inputAudioTokens === "number") ext.inputAudioTokens = inputAudioTokens;
					if (typeof inputVideoTokens === "number") ext.inputVideoTokens = inputVideoTokens;
					return Object.keys(ext).length > 0 ? ext : undefined;
				})(),
			}
		: undefined;

	return {
		object: "list",
		model: payload?.model ?? "unknown",
		data,
		usage,
	};
}
