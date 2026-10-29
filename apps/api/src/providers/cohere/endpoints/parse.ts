// Purpose: Cohere Parse v2 provider integration.
// Why: Parse uses Cohere's native API and returns structured document pages.
// How: Forwards the validated Phaseo payload and meters Cohere billed pages.

import type { AdapterResult, ProviderExecuteArgs } from "@providers/types";
import { resolveOpenAICompatKey } from "@providers/openai-compatible/config";
import { computeBillAfterProviderCharge } from "@pipeline/pricing/engine";

const COHERE_PARSE_URL = "https://api.cohere.com/v2/parse";

function extractUsage(json: any): Record<string, number> {
	const billed = json?.meta?.billed_units ?? json?.meta?.billedUnits ?? {};
	const pages = Number(billed?.pages ?? 0);
	const inputTokens = Number(billed?.input_tokens ?? billed?.inputTokens ?? 0);
	const imageTokens = Number(billed?.image_tokens ?? billed?.imageTokens ?? 0);
	const outputTokens = Number(billed?.output_tokens ?? billed?.outputTokens ?? 0);
	return {
		requests: 1,
		...(Number.isFinite(pages) && pages > 0 ? { input_pages: pages } : {}),
		...(Number.isFinite(inputTokens) && inputTokens > 0 ? { input_tokens: inputTokens } : {}),
		...(Number.isFinite(imageTokens) && imageTokens > 0 ? { image_tokens: imageTokens } : {}),
		...(Number.isFinite(outputTokens) && outputTokens > 0 ? { output_tokens: outputTokens } : {}),
	};
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
	const keyInfo = resolveOpenAICompatKey(args);
	const body = {
		model: args.providerModelSlug || args.body?.model || "parse-v5.0",
		document: args.body?.document,
		output_format: args.body?.output_format ?? "markdown",
	};
	const res = await (args.upstreamTiming?.fetch ?? fetch)(COHERE_PARSE_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${keyInfo.key}`,
			"Content-Type": "application/json",
			...(args.meta.appName ? { "X-Client-Name": args.meta.appName } : {}),
		},
		body: JSON.stringify(body),
	});
	const json = await res.clone().json().catch(() => null);
	const usageMeters = extractUsage(json);
	const bill = {
		cost_cents: 0,
		currency: "USD" as const,
		usage: undefined as any,
		upstream_id: res.headers.get("x-request-id") || res.headers.get("request-id") || json?.id,
		finish_reason: null,
	};
	if (args.pricingCard) {
		const pricedUsage = computeBillAfterProviderCharge(usageMeters, args.pricingCard);
		bill.cost_cents = pricedUsage.pricing.total_cents;
		bill.currency = pricedUsage.pricing.currency as "USD";
		bill.usage = pricedUsage;
	}

	return {
		kind: "completed",
		upstream: res,
		bill,
		normalized: {
			id: json?.id,
			model: body.model,
			pages: Array.isArray(json?.pages) ? json.pages : [],
			meta: json?.meta,
			usage: usageMeters,
			rawResponse: json,
		},
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
	};
}

export const __testUtils = { extractUsage, COHERE_PARSE_URL };
