// Purpose: Protocol adapter for embeddings payloads.
// Why: Encode IREmbeddings responses to OpenAI-compatible shape.
// How: Maps IREmbeddingsResponse to OpenAI embeddings response format.

import type { IREmbeddingsRequest, IREmbeddingsResponse } from "@core/ir";

export function encodeOpenAIEmbeddingsRequest(ir: IREmbeddingsRequest): any {
	return {
		model: ir.model,
		input: ir.input,
		encoding_format: ir.encodingFormat,
		dimensions: ir.dimensions,
		embedding_options: ir.embeddingOptions
			? {
					google: ir.embeddingOptions.google
						? {
								output_dimensionality: ir.embeddingOptions.google.outputDimensionality,
								task_type: ir.embeddingOptions.google.taskType,
								title: ir.embeddingOptions.google.title,
							}
						: undefined,
					mistral: ir.embeddingOptions.mistral
						? {
								output_dimension: ir.embeddingOptions.mistral.outputDimension,
								output_dtype: ir.embeddingOptions.mistral.outputDtype,
							}
						: undefined,
				}
			: undefined,
		user: ir.userId,
	};
}

export function encodeOpenAIEmbeddingsResponse(ir: IREmbeddingsResponse): any {
	const usage = ir.usage
		? {
				input_tokens: ir.usage.inputTokens ?? ir.usage.embeddingTokens ?? 0,
				total_tokens: ir.usage.totalTokens ?? ir.usage.inputTokens ?? 0,
				embedding_tokens: ir.usage.embeddingTokens ?? ir.usage.inputTokens ?? 0,
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
