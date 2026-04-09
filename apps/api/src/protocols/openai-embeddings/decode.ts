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

function toNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

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
	const voyageOptions = providerOptions?.voyage;
	return {
		model: req.model,
		input: normalizeEmbeddingsInput(req.input),
		encodingFormat: req.encoding_format,
		dimensions: req.dimensions,
		providerOptions:
			googleOptions || mistralOptions || voyageOptions
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
						voyage: voyageOptions
							? {
									inputType: voyageOptions.input_type,
									truncation:
										typeof voyageOptions.truncation === "boolean"
											? voyageOptions.truncation
											: undefined,
									outputDtype: voyageOptions.output_dtype,
									outputDimension:
										typeof voyageOptions.output_dimension === "number"
											? voyageOptions.output_dimension
											: undefined,
								}
							: undefined,
					}
				: undefined,
		userId: req.user,
	};
}

export function decodeOpenAIEmbeddingsResponse(payload: any): IREmbeddingsResponse {
	const dataSource = Array.isArray(payload?.data)
		? payload.data
		: (Array.isArray(payload?.embeddings)
				? payload.embeddings.map((entry: any, index: number) => {
					if (Array.isArray(entry)) {
						return { index, embedding: entry };
					}
					return {
						index: typeof entry?.index === "number" ? entry.index : index,
						embedding: Array.isArray(entry?.embedding) ? entry.embedding : [],
					};
				})
				: []);
	const data = dataSource.map((entry: any, index: number) => ({
		index: typeof entry?.index === "number" ? entry.index : index,
		embedding: Array.isArray(entry?.embedding) ? entry.embedding : [],
	}));

	const usageRaw = payload?.usage && typeof payload.usage === "object"
		? payload.usage
		: undefined;
	const inputTokens = toNumber(
		usageRaw?.input_tokens ??
		usageRaw?.prompt_tokens ??
		usageRaw?.input_text_tokens ??
		usageRaw?.text_tokens ??
		payload?.text_tokens,
	);
	const totalTokens = toNumber(usageRaw?.total_tokens ?? payload?.total_tokens);
	const embeddingTokens = toNumber(usageRaw?.embedding_tokens);
	const inputImageTokens = toNumber(
		usageRaw?.input_image_tokens ?? usageRaw?.input_tokens_details?.input_images,
	);
	const inputAudioTokens = toNumber(
		usageRaw?.input_audio_tokens ?? usageRaw?.input_tokens_details?.input_audio,
	);
	const inputVideoTokens = toNumber(
		usageRaw?.input_video_tokens ?? usageRaw?.input_tokens_details?.input_videos,
	);
	const imagePixels = toNumber(usageRaw?.image_pixels ?? payload?.image_pixels);
	const videoPixels = toNumber(usageRaw?.video_pixels ?? payload?.video_pixels);
	const hasUsage =
		inputTokens != null ||
		totalTokens != null ||
		embeddingTokens != null ||
		inputImageTokens != null ||
		inputAudioTokens != null ||
		inputVideoTokens != null ||
		imagePixels != null ||
		videoPixels != null;
	const usage = hasUsage
		? {
			inputTokens,
			totalTokens,
			embeddingTokens,
			_ext: (() => {
				const ext: NonNullable<IREmbeddingsResponse["usage"]>["_ext"] = {};
				if (inputImageTokens != null) ext.inputImageTokens = inputImageTokens;
				if (inputAudioTokens != null) ext.inputAudioTokens = inputAudioTokens;
				if (inputVideoTokens != null) ext.inputVideoTokens = inputVideoTokens;
				if (imagePixels != null) ext.imagePixels = imagePixels;
				if (videoPixels != null) ext.videoPixels = videoPixels;
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
