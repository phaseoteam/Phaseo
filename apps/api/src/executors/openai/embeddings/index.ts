// Purpose: Executor for openai / embeddings.
// Why: Isolates provider-specific behavior per capability.
// How: Maps IR embeddings to OpenAI embeddings and normalizes usage.

import type { IREmbeddingsRequest, IREmbeddingsResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { computeBill } from "@pipeline/pricing/engine";
import { encodeOpenAIEmbeddingsRequest } from "@protocols/openai-embeddings/encode";
import { decodeOpenAIEmbeddingsResponse } from "@protocols/openai-embeddings/decode";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "@providers/openai-compatible/config";
import type { ProviderExecutor } from "../../types";

function usageToMeters(usage?: IREmbeddingsResponse["usage"]): Record<string, number> | undefined {
	if (!usage) return undefined;
	const inputTokens = usage.inputTokens ?? usage.embeddingTokens ?? 0;
	const totalTokens = usage.totalTokens ?? inputTokens;
	const embeddingTokens = usage.embeddingTokens ?? inputTokens;
	return {
		input_tokens: inputTokens,
		input_text_tokens: inputTokens,
		total_tokens: totalTokens,
		embedding_tokens: embeddingTokens,
		output_tokens: 0,
		output_text_tokens: 0,
	};
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IREmbeddingsRequest;
	const keyInfo = await resolveOpenAICompatKey(args as any);
	const key = keyInfo.key;

	const requestBody = encodeOpenAIEmbeddingsRequest({
		...ir,
		model: args.providerModelSlug || ir.model,
	});

	const captureRequest = Boolean(args.meta.returnUpstreamRequest || args.meta.echoUpstreamRequest);
	const mappedRequest = captureRequest ? JSON.stringify(requestBody) : undefined;

	const res = await fetch(openAICompatUrl(args.providerId, "/embeddings"), {
		method: "POST",
		headers: openAICompatHeaders(args.providerId, key),
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

	if (usageMeters) {
		const priced = computeBill(usageMeters, args.pricingCard);
		bill.cost_cents = priced.pricing.total_cents;
		bill.currency = priced.pricing.currency;
		bill.usage = priced;
	}

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
