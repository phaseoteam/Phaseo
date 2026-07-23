// Purpose: Executor for openai / embeddings.
// Why: Isolates provider-specific behavior per capability.
// How: Maps IR embeddings to OpenAI embeddings and normalizes usage.

import type { IREmbeddingsRequest, IREmbeddingsResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { encodeOpenAIEmbeddingsRequest } from "@protocols/openai-embeddings/encode";
import { decodeOpenAIEmbeddingsResponse } from "@protocols/openai-embeddings/decode";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "@providers/openai-compatible/config";
import { upstreamTestHeaders } from "@providers/shared/testing";
import type { ProviderExecutor } from "../../types";

function isVoyageProvider(providerId: string): boolean {
	return providerId === "voyage" || providerId === "voyageai";
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

	if (args.providerId === "mistral") {
		const mistralOptions = ir.providerOptions?.mistral;
		if (typeof ir.dimensions === "number") {
			encoded.output_dimension = ir.dimensions;
			delete encoded.dimensions;
		}
		if (mistralOptions?.outputDtype) {
			encoded.output_dtype = mistralOptions.outputDtype;
		}
	}

	if (args.providerId === "cohere") {
		// Cohere OpenAI compatibility supports only input/model/encoding_format.
		delete encoded.dimensions;
		delete encoded.user;
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
		delete encoded.user;
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
	const keyInfo = await resolveOpenAICompatKey(args as any);
	const key = keyInfo.key;

	const requestBody = buildRequestBody(ir, args);

	const captureRequest = Boolean(args.meta.returnUpstreamRequest || args.meta.echoUpstreamRequest);
	const mappedRequest = captureRequest ? JSON.stringify(requestBody) : undefined;

	const endpointPath =
		isVoyageProvider(args.providerId) && isVoyageMultimodalModel(resolveTargetModel(ir, args))
			? "/multimodalembeddings"
			: "/embeddings";
	const res = await fetchUpstream(args, openAICompatUrl(args.providerId, endpointPath), {
		method: "POST",
		headers: openAICompatHeaders(args.providerId, key, {
			"Idempotency-Key": args.requestId,
			...upstreamTestHeaders(args.meta),
		}),
		body: JSON.stringify(requestBody),
	});

	const json = await res.clone().json().catch(() => null);
	const responseIr = json ? decodeOpenAIEmbeddingsResponse(json) : {
		object: "list",
		model: ir.model,
		data: [],
	} as IREmbeddingsResponse;

	responseIr.rawResponse = json ?? null;
	ir.rawRequest = requestBody;

	const usageMeters = usageToMeters(responseIr.usage);
	const bill = {
		cost_cents: 0,
		currency: "USD" as const,
		usage: undefined as any,
		upstream_id: res.headers.get("x-request-id"),
		finish_reason: null,
	};

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
