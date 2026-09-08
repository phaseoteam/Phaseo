// Purpose: Executor for openai / embeddings.
// Why: Isolates provider-specific behavior per capability.
// How: Maps IR embeddings to OpenAI embeddings and normalizes usage.

import type { IREmbeddingsRequest, IREmbeddingsResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { encodeOpenAIEmbeddingsRequest } from "@protocols/openai-embeddings/encode";
import { decodeOpenAIEmbeddingsResponse } from "@protocols/openai-embeddings/decode";
import { resolveOpenAITransport } from "@providers/shared/openai-transport";
import { upstreamTestHeaders } from "@providers/shared/testing";
import type { ProviderExecutor } from "../../types";

function isVoyageProvider(providerId: string): boolean {
	return providerId === "voyage" || providerId === "voyageai";
}

function isNebiusProvider(providerId: string): boolean {
	return providerId.startsWith("nebius-token-factory");
}

function unsupportedParameterResult(parameter: string, message: string): ExecutorResult {
	const rawResponse = {
		error: {
			type: "invalid_request_error",
			code: "unsupported_parameter",
			message,
			param: parameter,
		},
	};
	return {
		kind: "completed",
		ir: undefined,
		bill: {
			cost_cents: 0,
			currency: "USD",
			usage: undefined,
			upstream_id: null,
			finish_reason: null,
		},
		upstream: new Response(JSON.stringify(rawResponse), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		}),
		keySource: "gateway",
		rawResponse,
	};
}

function normalizeModelName(model?: string | null): string {
	if (!model) return "";
	const trimmed = model.trim();
	if (!trimmed) return "";
	if (trimmed.includes("/")) {
		const parts = trimmed.split("/");
		return parts[parts.length - 1] || trimmed;
	}
	return trimmed;
}

function isVoyageMultimodalModel(model?: string | null): boolean {
	return normalizeModelName(model).toLowerCase().startsWith("voyage-multimodal-");
}

function isVoyageContextualModel(model?: string | null): boolean {
	return normalizeModelName(model).toLowerCase().startsWith("voyage-context-");
}

function toVoyageContextualInputs(input: unknown, inputType?: string): string[][] {
	if (typeof input === "string" && input.length > 0) {
		return [[input]];
	}
	if (
		Array.isArray(input) &&
		input.length > 0 &&
		input.every((entry) => typeof entry === "string" && entry.length > 0)
	) {
		if (inputType === "query") {
			return (input as string[]).map((entry) => [entry]);
		}
		// The OpenAI-compatible input surface has no document-grouping field.
		// Treat a flat list as chunks from one document so the native response
		// can be flattened without losing document boundaries.
		return [input as string[]];
	}
	throw new Error("voyage_contextualized_embeddings_require_one_text_document");
}

function decodeVoyageContextualResponse(
	payload: any,
	modelFallback: string,
): IREmbeddingsResponse {
	const groups = Array.isArray(payload?.data) ? payload.data : [];
	if (groups.length === 0 || groups.some((group: any) => !Array.isArray(group?.data))) {
		throw new Error("voyage_contextualized_embeddings_response_shape_unsupported");
	}
	const data = groups
		.flatMap((group: any) => group.data)
		.map((entry: any, index: number) => ({ ...entry, index }));
	return decodeOpenAIEmbeddingsResponse({
		...payload,
		model: payload?.model ?? modelFallback,
		data,
	});
}

function asString(value: unknown): string {
	if (typeof value === "string") return value;
	if (value == null) return "";
	return String(value);
}

function isDataUrl(value: string): boolean {
	return value.startsWith("data:");
}

function extractBase64Payload(value: string): string {
	const trimmed = value.trim();
	const match = /^data:[^,]*;base64,(.*)$/i.exec(trimmed);
	if (match && match[1]) return match[1];
	return trimmed;
}

function extractUrlString(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	if (value && typeof value === "object" && typeof (value as any).url === "string") {
		return (value as any).url;
	}
	return undefined;
}

function toVoyageMultimodalPart(part: any): Record<string, string> | null {
	const type = typeof part?.type === "string" ? part.type : "";
	if (type === "input_text" || type === "text") {
		return { type: "text", text: asString(part?.text) };
	}
	if (type === "input_image" || type === "image_url" || type === "image") {
		const imageValue =
			type === "image"
				? (part?.source === "data"
						? asString(part?.data)
						: extractUrlString(part?.data ?? part?.url))
				: extractUrlString(part?.image_url ?? part?.url);
		if (!imageValue) return null;
		return isDataUrl(imageValue)
			? { type: "image_base64", image_base64: extractBase64Payload(imageValue) }
			: { type: "image_url", image_url: imageValue };
	}
	if (type === "input_video" || type === "video_url" || type === "video") {
		const videoValue =
			type === "video"
				? extractUrlString(part?.url ?? part?.data)
				: extractUrlString(part?.video_url ?? part?.url);
		if (!videoValue) return null;
		return isDataUrl(videoValue)
			? { type: "video_base64", video_base64: extractBase64Payload(videoValue) }
			: { type: "video_url", video_url: videoValue };
	}
	if (typeof part === "string") {
		return { type: "text", text: part };
	}
	return null;
}

function toVoyageMultimodalContent(item: unknown): Record<string, string>[] {
	if (typeof item === "string") {
		return [{ type: "text", text: item }];
	}
	if (Array.isArray(item) && item.every((entry) => typeof entry === "number")) {
		return [{ type: "text", text: item.join(" ") }];
	}
	if (Array.isArray(item)) {
		const content = item
			.map((entry) => toVoyageMultimodalPart(entry))
			.filter((entry): entry is Record<string, string> => entry != null);
		if (content.length > 0) return content;
		return [{ type: "text", text: asString(item) }];
	}
	if (item && typeof item === "object" && Array.isArray((item as any).content)) {
		return toVoyageMultimodalContent((item as any).content);
	}
	const part = toVoyageMultimodalPart(item);
	if (part) return [part];
	return [{ type: "text", text: asString(item) }];
}

function toVoyageMultimodalInputs(input: unknown): Array<{ content: Record<string, string>[] }> {
	if (Array.isArray(input)) {
		const looksLikeSingleContentArray = input.some((entry) =>
			Boolean(entry && typeof entry === "object" && typeof (entry as any).type === "string"),
		);
		if (looksLikeSingleContentArray) {
			return [{ content: toVoyageMultimodalContent(input) }];
		}
		return input.map((item) => ({ content: toVoyageMultimodalContent(item) }));
	}
	return [{ content: toVoyageMultimodalContent(input) }];
}

function resolveTargetModel(ir: IREmbeddingsRequest, args: ExecutorExecuteArgs): string {
	const providerModelSlug = args.providerModelSlug?.trim();
	if (providerModelSlug) {
		// Preserve provider slugs verbatim (for example "baai/bge-m3" on Novita).
		return providerModelSlug;
	}
	return normalizeModelName(ir.model) || ir.model;
}

function buildRequestBody(ir: IREmbeddingsRequest, args: ExecutorExecuteArgs): Record<string, any> {
	const encoded = encodeOpenAIEmbeddingsRequest({
		...ir,
		model: resolveTargetModel(ir, args),
	}) as Record<string, any>;

	// Most OpenAI-compatible providers reject unknown provider_options fields.
	delete encoded.provider_options;

	if (args.providerId === "perplexity") {
		const model = normalizeModelName(encoded.model).toLowerCase();
		if (model.startsWith("pplx-embed-context-")) {
			throw new Error("perplexity_contextualized_embeddings_require_native_schema");
		}
		if (model !== "pplx-embed-v1-0.6b" && model !== "pplx-embed-v1-4b") {
			throw new Error("perplexity_embedding_model_unsupported");
		}
		const input = encoded.input;
		const validInput =
			typeof input === "string"
				? input.length > 0
				: Array.isArray(input) && input.length > 0 && input.length <= 512 &&
					input.every((value: unknown) => typeof value === "string" && value.length > 0);
		if (!validInput) {
			throw new Error("perplexity_embeddings_text_input_required");
		}
		const encoding = encoded.encoding_format ?? "base64_int8";
		if (encoding !== "base64_int8" && encoding !== "base64_binary") {
			throw new Error("perplexity_embeddings_encoding_format_unsupported");
		}
		const maxDimensions = model.endsWith("0.6b") ? 1024 : 2560;
		if (
			encoded.dimensions !== undefined &&
			(!Number.isInteger(encoded.dimensions) || encoded.dimensions < 128 || encoded.dimensions > maxDimensions)
		) {
			throw new Error("perplexity_embeddings_dimensions_out_of_range");
		}
		encoded.encoding_format = encoding;
		delete encoded.user;
	}

	if (args.providerId === "morpheus") {
		const sessionId = ir.providerOptions?.morpheus?.sessionId;
		if (sessionId !== undefined) encoded.session_id = sessionId;
	}

	if (args.providerId === "mistral" || args.providerId === "mistral-eu") {
		const mistralOptions = ir.providerOptions?.mistral;
		if (typeof ir.dimensions === "number") {
			encoded.output_dimension = ir.dimensions;
			delete encoded.dimensions;
		}
		if (mistralOptions?.outputDtype) {
			encoded.output_dtype = mistralOptions.outputDtype;
		}
		if (ir.metadata !== undefined) {
			encoded.metadata = ir.metadata;
		}
	}

	if (args.providerId === "cohere") {
		// Cohere OpenAI compatibility supports only input/model/encoding_format.
		delete encoded.dimensions;
		delete encoded.user;
	}
	if (args.providerId === "together") {
		// Together's native embeddings schema accepts only model and text input.
		// Do not leak OpenAI-only optional fields into its strict request model.
		delete encoded.dimensions;
		delete encoded.encoding_format;
		delete encoded.user;
	}
	if (args.providerId === "novita" || args.providerId === "novitaai") {
		// Novita's public embeddings contract accepts only input, model and encoding_format.
		delete encoded.dimensions;
		delete encoded.user;
	}

	if (isNebiusProvider(args.providerId) && ir.serviceTier) {
		encoded.service_tier = ir.serviceTier;
	}

	if (args.providerId === "fireworks") {
		const fireworksOptions = ir.providerOptions?.fireworks;
		if (fireworksOptions?.promptTemplate !== undefined) {
			encoded.prompt_template = fireworksOptions.promptTemplate;
		}
		if (fireworksOptions?.returnLogits !== undefined) {
			encoded.return_logits = fireworksOptions.returnLogits;
		}
		if (fireworksOptions?.normalize !== undefined) {
			encoded.normalize = fireworksOptions.normalize;
		}
	}

	if (isVoyageProvider(args.providerId)) {
		const voyageOptions = ir.providerOptions?.voyage;
		// Voyage uses output_dimension instead of dimensions.
		if (typeof ir.dimensions === "number") {
			encoded.output_dimension = ir.dimensions;
			delete encoded.dimensions;
		}
		if (
			typeof encoded.output_dimension !== "number" &&
			typeof voyageOptions?.outputDimension === "number"
		) {
			encoded.output_dimension = voyageOptions.outputDimension;
		}
		if (voyageOptions?.inputType) {
			encoded.input_type = voyageOptions.inputType;
		}
		if (typeof voyageOptions?.truncation === "boolean") {
			encoded.truncation = voyageOptions.truncation;
		}
		if (voyageOptions?.outputDtype) {
			encoded.output_dtype = voyageOptions.outputDtype;
		}
		// Voyage uses omission, rather than OpenAI's `float` literal, for
		// ordinary numeric-array embeddings.
		if (encoded.encoding_format === "float") {
			delete encoded.encoding_format;
		}
		delete encoded.user;
	}

	if (isVoyageProvider(args.providerId) && isVoyageContextualModel(encoded.model)) {
		if (ir.providerOptions?.voyage?.truncation !== undefined) {
			throw new Error("voyage_contextualized_embeddings_truncation_unsupported");
		}
		encoded.inputs = toVoyageContextualInputs(ir.input, encoded.input_type);
		delete encoded.input;
		delete encoded.truncation;
	}

	if (isVoyageProvider(args.providerId) && isVoyageMultimodalModel(encoded.model)) {
		encoded.inputs = toVoyageMultimodalInputs(encoded.input);
		delete encoded.input;

		const outputEncoding = typeof encoded.encoding_format === "string"
			? (encoded.encoding_format.startsWith("base64") ? "base64" : undefined)
			: undefined;
		if (outputEncoding) {
			encoded.output_encoding = outputEncoding;
		}

		// Multimodal endpoint only accepts a subset of fields.
		delete encoded.encoding_format;
		delete encoded.dimensions;
		delete encoded.output_dimension;
		delete encoded.output_dtype;
	}

	return encoded;
}

function usageToMeters(usage?: IREmbeddingsResponse["usage"]): Record<string, number> {
	const meters: Record<string, number> = {
		requests: 1,
	};
	if (!usage) return meters;

	const inputTokens = usage.inputTokens ?? usage.embeddingTokens ?? usage.totalTokens ?? 0;
	const totalTokens = usage.totalTokens ?? inputTokens;
	const embeddingTokens = usage.embeddingTokens ?? inputTokens;
	meters.input_tokens = inputTokens;
	meters.input_text_tokens = inputTokens;
	meters.total_tokens = totalTokens;
	meters.embedding_tokens = embeddingTokens;
	meters.output_tokens = 0;
	meters.output_text_tokens = 0;

	if (typeof usage._ext?.inputImageTokens === "number") {
		meters.input_image_tokens = usage._ext.inputImageTokens;
	}
	if (typeof usage._ext?.inputAudioTokens === "number") {
		meters.input_audio_tokens = usage._ext.inputAudioTokens;
	}
	if (typeof usage._ext?.inputVideoTokens === "number") {
		meters.input_video_tokens = usage._ext.inputVideoTokens;
	}
	if (typeof usage._ext?.imagePixels === "number") {
		meters.image_pixels = usage._ext.imagePixels;
	}
	if (typeof usage._ext?.videoPixels === "number") {
		meters.video_pixels = usage._ext.videoPixels;
	}
	return meters;
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IREmbeddingsRequest;
	if (args.providerId === "morpheus" && ir.dimensions !== undefined) {
		return unsupportedParameterResult(
			"dimensions",
			"Morpheus embeddings do not support the dimensions parameter.",
		);
	}

	const requestBody = buildRequestBody(ir, args);

	const captureRequest = Boolean(args.meta.returnUpstreamRequest || args.meta.echoUpstreamRequest);
	const mappedRequest = captureRequest ? JSON.stringify(requestBody) : undefined;

	const targetModel = resolveTargetModel(ir, args);
	const endpointPath = isVoyageProvider(args.providerId)
		? isVoyageMultimodalModel(targetModel)
			? "/multimodalembeddings"
			: isVoyageContextualModel(targetModel)
				? "/contextualizedembeddings"
				: "/embeddings"
		: "/embeddings";
	const { keyInfo, url, headers, deployment } = resolveOpenAITransport({ ...args, model: ir.model, forceGatewayKey: args.meta.forceGatewayKey } as any, endpointPath, {
		"Idempotency-Key": args.requestId,
		...upstreamTestHeaders(args.meta),
	});
	const res = await fetchUpstream(args, url, {
		method: "POST",
		headers,
		body: JSON.stringify(deployment ? { ...requestBody, model: deployment } : requestBody),
	});

	const json = await res.clone().json().catch(() => null);
	const bill = {
		cost_cents: 0,
		currency: "USD" as const,
		usage: undefined as any,
		upstream_id: res.headers.get("x-request-id"),
		finish_reason: null,
	};
	if (!res.ok) {
		return {
			kind: "completed",
			upstream: res,
			ir: undefined,
			bill,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
			rawResponse: json ?? null,
		};
	}

	const responseIr = json
		? isVoyageProvider(args.providerId) && isVoyageContextualModel(targetModel)
			? decodeVoyageContextualResponse(json, ir.model)
			: decodeOpenAIEmbeddingsResponse(json)
		: {
			object: "list",
			model: ir.model,
			data: [],
		} as IREmbeddingsResponse;

	responseIr.rawResponse = json ?? null;
	ir.rawRequest = requestBody;

	const usageMeters = usageToMeters(responseIr.usage);
	bill.usage = usageMeters;

	return {
		kind: "completed",
		upstream: res,
		ir: responseIr,
		bill,
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
		mappedRequest,
		rawResponse: json ?? null,
	};
}

export const executor: ProviderExecutor = async (args: ExecutorExecuteArgs) => execute(args);
