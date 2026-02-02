// Purpose: Protocol adapter for embeddings payloads.
// Why: Normalize OpenAI-compatible embeddings requests/responses to IR.
// How: Maps between OpenAI embeddings shapes and IREmbeddings types.

import type { EmbeddingsRequest } from "@core/schemas";
import type { IREmbeddingsRequest, IREmbeddingsResponse } from "@core/ir";

export function decodeOpenAIEmbeddingsRequest(req: EmbeddingsRequest): IREmbeddingsRequest {
	const googleOptions = req.embedding_options?.google;
	const mistralOptions = req.embedding_options?.mistral;
	return {
		model: req.model,
		input: req.input,
		encodingFormat: req.encoding_format,
		dimensions: req.dimensions,
		embeddingOptions:
			googleOptions || mistralOptions
				? {
						google: googleOptions
							? {
									outputDimensionality: googleOptions.output_dimensionality,
									taskType: googleOptions.task_type,
									title: googleOptions.title,
								}
							: undefined,
						mistral: mistralOptions
							? {
									outputDimension: mistralOptions.output_dimension,
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
			}
		: undefined;

	return {
		object: "list",
		model: payload?.model ?? "unknown",
		data,
		usage,
	};
}
