// Purpose: TypeSafe Jev executor for the native System One API.
// Why: Jev is a structured evaluator, not an OpenAI-compatible text model.

import type { IRDecisionsRequest, IRDecisionsResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, ProviderExecutor } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { resolveProviderKey } from "@providers/keys";
import { upstreamTestHeaders } from "@providers/shared/testing";
import { getBindings } from "@/runtime/env";
import { decodeTypeSafeSystemOneResponse } from "@protocols/typesafe-systemone/decode";

const TYPESAFE_SYSTEMONE_URL = "https://api.typesafe.ai/v1/systemone";

function malformedResponse(args: ExecutorExecuteArgs, upstream: Response): ExecutorResult {
	return {
		kind: "completed",
		upstream: new Response(
			JSON.stringify({
				error: "invalid_typesafe_response",
				message: "TypeSafe returned an invalid System One response.",
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
	const bindings = getBindings();
	const keyInfo = resolveProviderKey(
		{
			providerId: args.providerId,
			byokMeta: args.byokMeta,
			forceGatewayKey: args.meta.forceGatewayKey,
		},
		() => bindings.TYPESAFE_API_KEY,
	);
	const model = args.providerModelSlug?.trim() || "jev-1.13.0";
	const requestBody = {
		model,
		state: ir.state,
		questions: ir.questions,
	};
	const captureRequest = Boolean(args.meta.returnUpstreamRequest || args.meta.echoUpstreamRequest);
	const upstream = await fetchUpstream(args, TYPESAFE_SYSTEMONE_URL, {
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
	if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
		(!answers || typeof answers !== "object" || Array.isArray(answers))) {
		return malformedResponse(args, upstream);
	}

	const responseIr = decodeTypeSafeSystemOneResponse(payload, ir.model) as IRDecisionsResponse;
	// Keep Phaseo's canonical model ID in the client-facing payload while the
	// provider alias/version remains available in rawResponse for diagnostics.
	responseIr.model = ir.model;
	const usage = responseIr.usage;
	const usageMeters = {
		requests: 1,
		input_tokens: usage?.inputTokens ?? 0,
		input_text_tokens: usage?.inputTokens ?? 0,
		output_tokens: usage?.outputTokens ?? 0,
		output_text_tokens: usage?.outputTokens ?? 0,
		total_tokens: usage?.totalTokens ?? 0,
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
