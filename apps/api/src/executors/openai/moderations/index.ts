// Purpose: Executor for openai / moderations.
// Why: Isolates provider-specific behavior per capability.
// How: Maps IR moderations to OpenAI moderations and normalizes usage.

import type { IRModerationsRequest, IRModerationsResponse, IRModerationsResult } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { computeBill } from "@pipeline/pricing/engine";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "@providers/openai-compatible/config";
import type { ProviderExecutor } from "../../types";

function mapOpenAIResult(entry: any): IRModerationsResult {
	return {
		flagged: Boolean(entry?.flagged),
		categories: entry?.categories ?? undefined,
		categoryScores: entry?.category_scores ?? undefined,
		categoryAppliedInputTypes: entry?.category_applied_input_types ?? undefined,
	};
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRModerationsRequest;
	const keyInfo = await resolveOpenAICompatKey(args as any);
	const key = keyInfo.key;

	const requestBody = {
		input: ir.input,
		model: args.providerModelSlug || ir.model,
	};

	const captureRequest = Boolean(args.meta.returnUpstreamRequest || args.meta.echoUpstreamRequest);
	const mappedRequest = captureRequest ? JSON.stringify(requestBody) : undefined;

	const res = await fetch(openAICompatUrl(args.providerId, "/moderations"), {
		method: "POST",
		headers: openAICompatHeaders(args.providerId, key),
		body: JSON.stringify(requestBody),
	});

	const json = await res.clone().json().catch(() => null);
	const results = Array.isArray(json?.results) ? json.results.map(mapOpenAIResult) : [];
	const responseIr: IRModerationsResponse = {
		id: args.requestId,
		nativeId: json?.id ?? undefined,
		model: json?.model ?? ir.model,
		results,
		usage: json?.usage
			? {
				inputTokens: json.usage.input_tokens ?? json.usage.prompt_tokens ?? undefined,
				outputTokens: json.usage.output_tokens ?? json.usage.completion_tokens ?? undefined,
				totalTokens: json.usage.total_tokens ?? undefined,
			}
			: undefined,
		rawResponse: json ?? null,
	};

	ir.rawRequest = requestBody;

	const usageMeters = responseIr.usage
		? {
			input_tokens: responseIr.usage.inputTokens ?? 0,
			input_text_tokens: responseIr.usage.inputTokens ?? 0,
			output_tokens: responseIr.usage.outputTokens ?? 0,
			output_text_tokens: responseIr.usage.outputTokens ?? 0,
			total_tokens: responseIr.usage.totalTokens ?? 0,
		}
		: undefined;

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
