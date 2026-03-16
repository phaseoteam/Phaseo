// Purpose: Executor for openai / embeddings.
// Why: Isolates provider-specific behavior per capability.
// How: Maps IR embeddings to OpenAI embeddings and normalizes usage.

import type { IREmbeddingsRequest, IREmbeddingsResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { encodeOpenAIEmbeddingsRequest } from "@protocols/openai-embeddings/encode";
import { decodeOpenAIEmbeddingsResponse } from "@protocols/openai-embeddings/decode";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "@providers/openai-compatible/config";
import type { ProviderExecutor } from "../../types";

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

function buildRequestBody(ir: IREmbeddingsRequest, args: ExecutorExecuteArgs): Record<string, any> {
	const encoded = encodeOpenAIEmbeddingsRequest({
		...ir,
		model: normalizeModelName(args.providerModelSlug || ir.model) || ir.model,
	}) as Record<string, any>;

	// Most OpenAI-compatible providers reject unknown provider_options fields.
	delete encoded.provider_options;

	if (args.providerId === "mistral") {
		const mistralOptions = ir.providerOptions?.mistral;
		if (typeof ir.dimensions === "number") {
			encoded.output_dimension = ir.dimensions;
		}
		if (mistralOptions?.outputDtype) {
			encoded.output_dtype = mistralOptions.outputDtype;
		}
	}

	return encoded;
}

function usageToMeters(usage?: IREmbeddingsResponse["usage"]): Record<string, number> {
	const meters: Record<string, number> = {
		requests: 1,
	};
	if (!usage) return meters;

	const inputTokens = usage.inputTokens ?? usage.embeddingTokens ?? 0;
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
	return meters;
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IREmbeddingsRequest;
	const keyInfo = await resolveOpenAICompatKey(args as any);
	const key = keyInfo.key;

	const requestBody = buildRequestBody(ir, args);

	const captureRequest = Boolean(args.meta.returnUpstreamRequest || args.meta.echoUpstreamRequest);
	const mappedRequest = captureRequest ? JSON.stringify(requestBody) : undefined;

	const res = await fetch(openAICompatUrl(args.providerId, "/embeddings"), {
		method: "POST",
		headers: openAICompatHeaders(args.providerId, key, {
			"Idempotency-Key": args.requestId,
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
