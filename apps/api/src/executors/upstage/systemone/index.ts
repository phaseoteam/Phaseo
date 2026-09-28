import type { IRDecisionsRequest, IRDecisionsResponse } from "@core/ir";
import { BodyLimitExceededError, readStreamTextWithLimit } from "@core/bounded-stream";
import type { ExecutorExecuteArgs, ExecutorResult, ProviderExecutor } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { openAICompatUrl, resolveOpenAICompatKey } from "@providers/openai-compatible/config";
import { upstreamTestHeaders } from "@providers/shared/testing";
import { decodeSystemOneResponse } from "@protocols/systemone/decode";

const MAX_RESPONSE_BYTES = 1024 * 1024;

function malformedResponse(
	args: ExecutorExecuteArgs,
	upstream: Response,
	rawResponse: unknown,
): ExecutorResult {
	return {
		kind: "completed",
		upstream: new Response(
			JSON.stringify({
				error: "invalid_upstage_systemone_response",
				message: "Upstage returned an invalid System One response.",
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
		rawResponse,
	};
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRDecisionsRequest;
	const keyInfo = resolveOpenAICompatKey({
		...args,
		forceGatewayKey: args.meta.forceGatewayKey,
	});
	const model = args.providerModelSlug?.trim() || "solar-decide";
	const requestBody = {
		model,
		state: ir.state,
		questions: ir.questions,
	};
	const captureRequest = Boolean(args.meta.returnUpstreamRequest || args.meta.echoUpstreamRequest);
	const upstream = await fetchUpstream(args, openAICompatUrl(args.providerId, "/systemone"), {
		method: "POST",
		headers: {
			Authorization: "Bearer " + keyInfo.key,
			"Content-Type": "application/json",
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

	let rawBody: string;
	try {
		rawBody = await readStreamTextWithLimit(
			upstream.clone().body,
			MAX_RESPONSE_BYTES,
			"upstage_systemone_response_too_large",
		);
	} catch (error) {
		if (error instanceof BodyLimitExceededError) {
			return malformedResponse(args, upstream, { error: "upstream_response_too_large" });
		}
		throw error;
	}
	let payload: unknown = null;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		// Preserve malformed non-JSON bodies in internal diagnostics too.
	}
	const response = payload && typeof payload === "object" && !Array.isArray(payload)
		? payload as Record<string, unknown>
		: undefined;
	const answers = response?.answers;
	const usage = response?.usage && typeof response.usage === "object" && !Array.isArray(response.usage)
		? response.usage as Record<string, unknown>
		: undefined;
	const inputTokens = usage?.input_tokens;
	const outputTokens = usage?.output_tokens;
	if (
		!response || !answers || typeof answers !== "object" || Array.isArray(answers) ||
		typeof inputTokens !== "number" || !Number.isSafeInteger(inputTokens) || inputTokens < 0 ||
		typeof outputTokens !== "number" || !Number.isSafeInteger(outputTokens) || outputTokens < 0 ||
		!Number.isSafeInteger(inputTokens + outputTokens)
	) {
		return malformedResponse(args, upstream, payload ?? (rawBody || null));
	}

	const responseIr = decodeSystemOneResponse(response, ir.model) as IRDecisionsResponse;
	responseIr.model = ir.model;
	const usageMeters = {
		requests: 1,
		input_tokens: inputTokens,
		input_text_tokens: inputTokens,
		output_tokens: outputTokens,
		output_text_tokens: outputTokens,
		total_tokens: inputTokens + outputTokens,
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
		rawResponse: response,
		...(headersTiming === undefined ? {} : { timing: { latencyMs: headersTiming, generationMs: headersTiming } }),
	};
}

export const executor: ProviderExecutor = execute;
