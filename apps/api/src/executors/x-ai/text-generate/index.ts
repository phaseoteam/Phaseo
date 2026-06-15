// Purpose: Executor for x-ai / text-generate.
// Why: Isolates provider-specific behavior per capability.
// How: Transforms IR to xAI Responses API and normalizes usage.

import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, Bill, ProviderExecutor } from "@executors/types";
import { normalizeTextUsageForPricing } from "@executors/_shared/usage/text";
import { irToOpenAIResponses } from "@executors/_shared/text-generate/openai-compat/transform";
import { resolveStreamForProtocol, bufferStreamToIR } from "@executors/_shared/text-generate/openai-compat";
import { getProviderQuirks } from "@executors/_shared/text-generate/openai-compat/quirks";
import { sanitizeOpenAICompatRequest } from "@executors/_shared/text-generate/openai-compat/provider-policy";
import {
	adaptRequestFromUpstreamError,
	readErrorPayload,
} from "@executors/_shared/text-generate/openai-compat/retry-policy";
import { openAICompatHeaders, openAICompatUrl } from "@providers/openai-compatible/config";
import { resolveProviderKey } from "@providers/keys";
import { upstreamTestHeaders } from "@providers/shared/testing";
import { normalizeTextServiceTier } from "@core/serviceTiers";
import { getBindings } from "@/runtime/env";

import { cherryPickIRParams, resolveXAiModelForRequest, withNormalizedReasoning } from "./reasoning";

const XAI_MAX_ADAPTIVE_RETRIES = 0;

async function executeXAi(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const upstreamStartMs = args.meta.upstreamStartMs ?? Date.now();
	const irRequest = args.ir as IRChatRequest;
	const quirks = getProviderQuirks(args.providerId);
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta },
		() => (getBindings() as any).X_AI_API_KEY,
	);

	const modelForRoutingRaw = args.providerModelSlug ?? irRequest.model;
	const modelForRouting = resolveXAiModelForRequest(
		modelForRoutingRaw,
		irRequest.reasoning,
		args.meta.requestedModel ?? irRequest.model,
	);
	const requestPayload = irToOpenAIResponses(
		irRequest,
		modelForRouting,
		"openai",
		args.capabilityParams,
	);

	requestPayload.stream = true;
	requestPayload.store = false;
	requestPayload.stream_options = {
		...(requestPayload.stream_options ?? {}),
		include_usage: true,
	};

	if (quirks.transformRequest) {
		quirks.transformRequest({
			request: requestPayload,
			ir: irRequest,
			model: modelForRouting,
		});
	}
	// Enforce non-persistent storage semantics for xAI requests.
	requestPayload.store = false;

	const captureRequest = Boolean(
		args.meta.returnUpstreamRequest ||
		args.meta.echoUpstreamRequest ||
		args.meta.debug?.return_upstream_request ||
		args.meta.debug?.trace,
	);
	const sendPayload = async (payload: Record<string, any>) => {
		const sanitized = sanitizeOpenAICompatRequest({
			providerId: args.providerId,
			route: "responses",
			model: modelForRouting,
			request: payload,
		});
		if (args.meta.debug?.enabled && sanitized.dropped.length > 0) {
			console.log("[gateway-debug] x-ai request sanitized", {
				provider: args.providerId,
				dropped: sanitized.dropped,
			});
		}
		try {
			(args.ir as any).rawRequest = sanitized.request;
		} catch {
			// ignore if readonly
		}
		const requestBody = JSON.stringify(sanitized.request);
			const response = await fetch(openAICompatUrl(args.providerId, "/responses"), {
				method: "POST",
				headers: openAICompatHeaders(args.providerId, keyInfo.key, {
					"x-grok-conv-id": irRequest.xaiConversationId,
					"Idempotency-Key": args.requestId,
					...upstreamTestHeaders(args.meta),
				}),
				body: requestBody,
			});
		return {
			response,
			request: sanitized.request,
			requestBody,
		};
	};

	let attempt = await sendPayload(requestPayload);
	let res = attempt.response;
	let requestBody = attempt.requestBody;
	let mappedRequest = captureRequest ? requestBody : undefined;
	const seenRequestBodies = new Set<string>([requestBody]);

	let adaptiveRetryCount = 0;
	while (!res.ok && adaptiveRetryCount < XAI_MAX_ADAPTIVE_RETRIES) {
		// Restrict adaptive replay to validation-style failures.
		if (res.status !== 400 && res.status !== 422) {
			break;
		}
		const { errorText, errorPayload } = await readErrorPayload(res);
		const adapted = adaptRequestFromUpstreamError({
			providerId: args.providerId,
			route: "responses",
			request: attempt.request,
			errorText,
			errorPayload,
		});
		if (!adapted.changed) {
			break;
		}
		const nextRequestBody = JSON.stringify(adapted.request);
		if (seenRequestBodies.has(nextRequestBody)) {
			break;
		}
		if (args.meta.debug?.enabled) {
			console.log("[gateway-debug] x-ai request adapted from upstream error", {
				provider: args.providerId,
				status: res.status,
				dropped: adapted.dropped,
			});
		}
		attempt = await sendPayload(adapted.request);
		seenRequestBodies.add(attempt.requestBody);
		res = attempt.response;
		requestBody = attempt.requestBody;
		mappedRequest = captureRequest ? requestBody : undefined;
		adaptiveRetryCount += 1;
	}

	const bill: Bill = {
		cost_cents: 0,
		currency: "USD",
		usage: undefined,
		upstream_id: res.headers.get("x-request-id") || undefined,
		finish_reason: null,
	};

	if (!res.ok) {
		console.error(`Upstream error for provider ${args.providerId}: ${res.status} ${res.statusText}`);
		return {
			kind: "completed",
			ir: undefined,
			bill,
			upstream: res,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
		};
	}

	if (irRequest.stream) {
		const stream = resolveStreamForProtocol(res, args, "responses");
		return {
			kind: "stream",
			stream,
			usageFinalizer: async () => null,
			bill,
			upstream: res,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
			timing: {
				latencyMs: undefined,
				generationMs: undefined,
			},
		};
	}

	const { ir, usage, rawResponse, firstByteMs, totalMs } = await bufferStreamToIR(
		res,
		args,
		"responses",
		upstreamStartMs,
	);
	if (rawResponse && typeof rawResponse === "object") {
		quirks.normalizeResponse?.({ response: rawResponse, ir: irRequest });
		const bindings = getBindings();
		if (bindings.XAI_DEBUG_USAGE === "1") {
			console.log("[x-ai][usage-debug] raw usage:", (rawResponse as any).usage ?? null);
		}
	}

	if (ir) {
		(ir as any).rawResponse = rawResponse;
	}

	const usageMetersBase = normalizeTextUsageForPricing(ir?.usage ?? (rawResponse as any)?.usage ?? usage);
	const usageMeters = usageMetersBase
		? { ...usageMetersBase, requests: usageMetersBase.requests ?? 1 }
		: {
			requests: 1,
			input_tokens: 0,
			input_text_tokens: 0,
			output_tokens: 0,
			output_text_tokens: 0,
			total_tokens: 0,
		};
	const observedServiceTierRaw =
		(rawResponse as any)?.service_tier ?? (rawResponse as any)?.usage?.service_tier ?? null;
	const observedServiceTier =
		typeof observedServiceTierRaw === "string" &&
		observedServiceTierRaw.trim().toLowerCase() === "default"
			? "standard"
			: normalizeTextServiceTier(observedServiceTierRaw);
	if (observedServiceTier) {
		(usageMeters as Record<string, any>).service_tier = observedServiceTier;
		(usageMeters as Record<string, any>).serviceTier = observedServiceTier;
	}
	bill.usage = usageMeters;

	return {
		kind: "completed",
		ir,
		bill,
		upstream: res,
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
		mappedRequest,
		rawResponse: rawResponse ?? null,
		timing: {
			latencyMs: firstByteMs ?? totalMs,
			generationMs: firstByteMs === null ? 0 : Math.max(0, totalMs - firstByteMs),
		},
	};
}

export const executor: ProviderExecutor = async (execArgs: ExecutorExecuteArgs) => {
	const normalized = withNormalizedReasoning(
		execArgs.ir as IRChatRequest,
		execArgs.providerModelSlug ?? (execArgs.ir as IRChatRequest).model,
		execArgs.capabilityParams,
	);
	const processed = cherryPickIRParams(normalized, execArgs.capabilityParams);
	return executeXAi({ ...execArgs, ir: processed });
};









