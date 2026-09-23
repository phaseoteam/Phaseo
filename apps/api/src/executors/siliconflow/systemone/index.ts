// Purpose: SiliconFlow executor for the native System One decision API.
// Why: Kev is a structured evaluator and cannot be routed through chat completions.
// How: Sends the Decisions IR to SiliconFlow and normalizes answers and token usage.

import type { IRDecisionsRequest, IRDecisionsResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, ProviderExecutor } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { resolveProviderKey } from "@providers/keys";
import { openAICompatUrl } from "@providers/openai-compatible/config";
import { upstreamTestHeaders } from "@providers/shared/testing";
import { decodeTypeSafeSystemOneResponse } from "@protocols/typesafe-systemone/decode";
import { getBindings } from "@/runtime/env";

function malformedResponse(args: ExecutorExecuteArgs, upstream: Response): ExecutorResult {
	return {
		kind: "completed",
		upstream: new Response(
			JSON.stringify({
				error: "invalid_siliconflow_systemone_response",
				message: "SiliconFlow returned an invalid System One response.",
				request_id: args.requestId,
			}),
			{
				status: 502,
				headers: { "Content-Type": "application/json" },
			},
		),
		bill: {
			cost_cents: 0,
			currency: "USD",
			upstream_id: upstream.headers.get("x-request-id"),
		},
	};
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRDecisionsRequest;
	const keyInfo = resolveProviderKey(
		{
			providerId: args.providerId,
			byokMeta: args.byokMeta,
			forceGatewayKey: args.meta.forceGatewayKey,
		},
		() => getBindings().SILICONFLOW_API_KEY,
	);
	const model = args.providerModelSlug?.trim() || ir.model;
	const requestBody = {
		model,
		state: ir.state,
		questions: ir.questions,
	};
	const captureRequest = Boolean(args.meta.returnUpstreamRequest || args.meta.echoUpstreamRequest);
	const upstream = await fetchUpstream(args, openAICompatUrl(args.providerId, "/systemone"), {
		method: "POST",
		headers: {
			Authorization: `Bearer ${keyInfo.key}`,
			"Content-Type": "application/json",
			"Idempotency-Key": args.requestId,
			...upstreamTestHeaders(args.meta),
		},
		body: JSON.stringify(requestBody),
	});

	if (!upstream.ok) {
		return {
			kind: "completed",
			upstream,
			bill: {
				cost_cents: 0,
				currency: "USD",
				upstream_id: upstream.headers.get("x-request-id"),
			},
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			...(captureRequest ? { mappedRequest: JSON.stringify(requestBody) } : {}),
		};
	}

	const payload = await upstream.clone().json().catch(() => null);
	const answers = payload && typeof payload === "object" && !Array.isArray(payload)
		? (payload as Record<string, unknown>).answers
		: undefined;
	const usage = payload && typeof payload === "object" && !Array.isArray(payload)
		? (payload as Record<string, any>).usage
		: undefined;
	const inputTokens = usage?.input_tokens;
	const outputTokens = usage?.output_tokens ?? 0;
	if (
		!payload || typeof payload !== "object" || Array.isArray(payload) ||
		!answers || typeof answers !== "object" || Array.isArray(answers) ||
		typeof inputTokens !== "number" || !Number.isSafeInteger(inputTokens) || inputTokens < 0 ||
		typeof outputTokens !== "number" || !Number.isSafeInteger(outputTokens) || outputTokens < 0 ||
		!Number.isSafeInteger(inputTokens + outputTokens)
	) {
		return malformedResponse(args, upstream);
	}

	const responseIr = decodeTypeSafeSystemOneResponse(payload, ir.model) as IRDecisionsResponse;
	// Keep Phaseo's canonical model ID client-facing; the provider ID remains in rawResponse.
	responseIr.model = ir.model;
	const totalTokens = inputTokens + outputTokens;
	const usageMeters = {
		requests: 1,
		input_tokens: inputTokens,
		input_text_tokens: inputTokens,
		output_tokens: outputTokens,
		output_text_tokens: outputTokens,
		total_tokens: totalTokens,
	};
	const headersTiming = args.upstreamTiming?.timingFor(upstream)?.headersMs;

	return {
		kind: "completed",
		upstream,
		ir: responseIr,
		bill: {
			cost_cents: 0,
			currency: "USD",
			usage: usageMeters,
			upstream_id: upstream.headers.get("x-request-id"),
		},
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
		...(captureRequest ? { mappedRequest: JSON.stringify(requestBody) } : {}),
		rawResponse: payload,
		...(headersTiming === undefined ? {} : { timing: { latencyMs: headersTiming, generationMs: headersTiming } }),
	};
}

export const executor: ProviderExecutor = execute;
