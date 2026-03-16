// Purpose: Protocol adapter for embeddings payloads.
// Why: Encode IREmbeddings responses to OpenAI-compatible shape.
// How: Maps IREmbeddingsResponse to OpenAI embeddings response format.

import type { IREmbeddingsRequest, IREmbeddingsResponse } from "@core/ir";

function toOpenAIEmbeddingsPart(part: any): Record<string, any> {
	switch (part?.type) {
		case "text":
			return { type: "input_text", text: part.text ?? "" };
		case "image":
			return {
				type: "input_image",
				image_url: {
					url: part.source === "data"
						? `data:${part.mimeType || "image/jpeg"};base64,${part.data}`
						: part.data,
				},
			};
		case "audio":
			return {
				type: "input_audio",
				input_audio: part.source === "url"
					? { url: part.data, ...(part.format ? { format: part.format } : {}) }
					: { data: part.data, ...(part.format ? { format: part.format } : {}) },
			};
		case "video":
			return {
				type: "input_video",
				video_url: { url: part.url },
			};
		default:
			return { type: "input_text", text: String(part ?? "") };
	}
}

function encodeEmbeddingsInput(input: IREmbeddingsRequest["input"]): any {
	const encodeItem = (item: any): any => {
		if (typeof item === "string") return item;
		if (Array.isArray(item) && item.every((entry) => typeof entry === "number")) {
			return item;
		}
		if (Array.isArray(item)) {
			return item.map((part) => toOpenAIEmbeddingsPart(part));
		}
		return item;
	};

	if (Array.isArray(input) && input.every((entry) => typeof entry === "number")) {
		return input;
	}
	if (Array.isArray(input) && input.every((entry) => typeof entry === "object")) {
		const looksLikeSinglePartsArray = input.some((entry) => (entry as any)?.type != null);
		if (looksLikeSinglePartsArray) {
			return input.map((part) => toOpenAIEmbeddingsPart(part));
		}
	}
	if (Array.isArray(input)) {
		return input.map((item) => encodeItem(item));
	}
	return encodeItem(input);
}

export function encodeOpenAIEmbeddingsRequest(ir: IREmbeddingsRequest): any {
	return {
		model: ir.model,
		input: encodeEmbeddingsInput(ir.input),
		encoding_format: ir.encodingFormat,
		dimensions: ir.dimensions,
		provider_options: ir.providerOptions
			? {
					google: ir.providerOptions.google
						? {
								task_type: ir.providerOptions.google.taskType,
								title: ir.providerOptions.google.title,
							}
						: undefined,
					mistral: ir.providerOptions.mistral
						? {
								output_dtype: ir.providerOptions.mistral.outputDtype,
							}
						: undefined,
				}
			: undefined,
		user: ir.userId,
	};
}

export function encodeOpenAIEmbeddingsResponse(ir: IREmbeddingsResponse): any {
	const inputTokensDetails = ir.usage?._ext
		? {
				...(typeof ir.usage._ext.inputImageTokens === "number"
					? { input_images: ir.usage._ext.inputImageTokens }
					: {}),
				...(typeof ir.usage._ext.inputAudioTokens === "number"
					? { input_audio: ir.usage._ext.inputAudioTokens }
					: {}),
				...(typeof ir.usage._ext.inputVideoTokens === "number"
					? { input_videos: ir.usage._ext.inputVideoTokens }
					: {}),
			}
		: undefined;

	const usage = ir.usage
		? {
				input_tokens: ir.usage.inputTokens ?? ir.usage.embeddingTokens ?? 0,
				total_tokens: ir.usage.totalTokens ?? ir.usage.inputTokens ?? 0,
				embedding_tokens: ir.usage.embeddingTokens ?? ir.usage.inputTokens ?? 0,
				...(inputTokensDetails && Object.keys(inputTokensDetails).length > 0
					? { input_tokens_details: inputTokensDetails }
					: {}),
			}
		: undefined;

	return {
		object: "list",
		data: ir.data.map((entry) => ({
			object: "embedding",
			embedding: entry.embedding,
			index: entry.index,
		})),
		model: ir.model,
		...(usage ? { usage } : {}),
	};
}
