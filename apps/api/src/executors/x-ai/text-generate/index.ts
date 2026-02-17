// Purpose: Executor for x-ai / text-generate.
// Why: Isolates provider-specific behavior per capability.
// How: Transforms IR to xAI Responses API and normalizes usage.

import type { IRChatRequest, IRReasoning } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, Bill, ProviderExecutor } from "@executors/types";
import { computeBill } from "@pipeline/pricing/engine";
import { normalizeTextUsageForPricing } from "@executors/_shared/usage/text";
import { irToOpenAIResponses, openAIResponsesToIR } from "@executors/_shared/text-generate/openai-compat/transform";
import { resolveStreamForProtocol } from "@executors/_shared/text-generate/openai-compat";
import { getProviderQuirks } from "@executors/_shared/text-generate/openai-compat/quirks";
import { sanitizeOpenAICompatRequest } from "@executors/_shared/text-generate/openai-compat/provider-policy";
import {
	adaptRequestFromUpstreamError,
	readErrorPayload,
} from "@executors/_shared/text-generate/openai-compat/retry-policy";
import { openAICompatHeaders, openAICompatUrl } from "@providers/openai-compatible/config";
import { resolveProviderKey } from "@providers/keys";
import { getBindings } from "@/runtime/env";

type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

const REASONING_EFFORT_ORDER: ReasoningEffort[] = [
	"none",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
];

const REASONING_EFFORT_TO_PERCENT: Record<ReasoningEffort, number> = {
	none: 0.0,
	minimal: 0.15,
	low: 0.30,
	medium: 0.50,
	high: 0.75,
	xhigh: 0.90,
};

const XAI_REASONING_EFFORT_SUPPORT: Record<string, Set<ReasoningEffort>> = {
	"grok-4": new Set(["none", "low", "medium", "high", "xhigh"]),
	"grok-4-1": new Set(["none", "low", "medium", "high", "xhigh"]),
};

function normalizeModelName(model?: string | null): string {
	if (!model) return "";
	const value = model.trim();
	if (!value) return "";
	const parts = value.split("/");
	return parts[parts.length - 1] || value;
}

function resolveXAiModelForRequest(model: string, reasoning: IRReasoning | undefined): string {
	const normalized = normalizeModelName(model).toLowerCase();
	const isGrok41Alias = normalized === "grok-4.1" || normalized === "grok-4-1";
	if (!isGrok41Alias) return model;
	return reasoning?.enabled === true
		? "grok-4.1-reasoning"
		: "grok-4-1-fast-non-reasoning";
}

function getSupportedEfforts(model: string): ReasoningEffort[] {
	const normalized = normalizeModelName(model);
	if (normalized in XAI_REASONING_EFFORT_SUPPORT) {
		return Array.from(XAI_REASONING_EFFORT_SUPPORT[normalized]).sort();
	}
	for (const [modelPrefix, efforts] of Object.entries(XAI_REASONING_EFFORT_SUPPORT)) {
		if (normalized.startsWith(`${modelPrefix}-`) || normalized.startsWith(`${modelPrefix}_`)) {
			return Array.from(efforts).sort();
		}
	}
	return ["low", "medium", "high"];
}

function clampEffort(requested: ReasoningEffort, supported: ReasoningEffort[]): ReasoningEffort {
	if (supported.includes(requested)) return requested;
	const supportedOrdered = REASONING_EFFORT_ORDER.filter((effort) => supported.includes(effort));
	if (supportedOrdered.length === 0) return requested;

	const requestedIndex = REASONING_EFFORT_ORDER.indexOf(requested);
	if (requestedIndex <= 0) return supportedOrdered[0];
	if (requestedIndex >= REASONING_EFFORT_ORDER.length - 1) {
		return supportedOrdered[supportedOrdered.length - 1];
	}

	return supportedOrdered.includes("medium")
		? "medium"
		: supportedOrdered[Math.floor(supportedOrdered.length / 2)];
}

function tokensToEffort(tokens: number, maxReasoningTokens: number): ReasoningEffort {
	if (tokens <= 0 || maxReasoningTokens <= 0) return "none";
	const percent = tokens / maxReasoningTokens;
	let closest: ReasoningEffort = "medium";
	let minDiff = Infinity;
	for (const [effort, effortPercent] of Object.entries(REASONING_EFFORT_TO_PERCENT)) {
		const diff = Math.abs(percent - effortPercent);
		if (diff < minDiff) {
			minDiff = diff;
			closest = effort as ReasoningEffort;
		}
	}
	return closest;
}

function normalizeXAIReasoning(
	reasoning: IRReasoning | undefined,
	model: string | null | undefined,
	maxReasoningTokens?: number | null,
): IRReasoning | undefined {
	if (!reasoning) return undefined;
	const normalized: IRReasoning = { ...reasoning };
	const maxTokens = typeof maxReasoningTokens === "number" ? maxReasoningTokens : undefined;

	if (normalized.enabled === false) {
		normalized.effort = "none";
		delete normalized.maxTokens;
		delete normalized.enabled;
		return normalized;
	}

	if (!normalized.effort) {
		if (typeof normalized.maxTokens === "number" && maxTokens) {
			normalized.effort = tokensToEffort(normalized.maxTokens, maxTokens);
		} else if (normalized.enabled === true || normalized.maxTokens !== undefined || normalized.summary !== undefined) {
			normalized.effort = "medium";
		}
	}

	if (normalized.effort) {
		const supported = getSupportedEfforts(model ?? "");
		normalized.effort = clampEffort(normalized.effort as ReasoningEffort, supported);
		delete normalized.enabled;
	}

	delete normalized.maxTokens;
	return normalized;
}

function withNormalizedReasoning(
	ir: IRChatRequest,
	modelOverride?: string | null,
	capabilityParams?: Record<string, any> | null,
): IRChatRequest {
	const nextReasoning = normalizeXAIReasoning(
		ir.reasoning,
		modelOverride ?? ir.model,
		capabilityParams?.reasoning?.maxReasoningTokens,
	);
	if (nextReasoning === ir.reasoning) return ir;
	const next: IRChatRequest = { ...ir };
	if (nextReasoning) {
		next.reasoning = nextReasoning;
	} else {
		delete next.reasoning;
	}
	return next;
}

function cherryPickIRParams(
	ir: IRChatRequest,
	capabilityParams?: Record<string, any> | null,
): IRChatRequest {
	const rawAllowlist =
		capabilityParams?.request?.allowlist ??
		capabilityParams?.request?.params ??
		capabilityParams?.params;
	let allowlist: string[] = [];
	if (Array.isArray(rawAllowlist)) {
		allowlist = rawAllowlist.filter((entry) => typeof entry === "string");
	} else if (rawAllowlist && typeof rawAllowlist === "object") {
		for (const [key, value] of Object.entries(rawAllowlist)) {
			if (key === "reasoning" && value && typeof value === "object" && !Array.isArray(value)) {
				for (const subKey of Object.keys(value)) {
					allowlist.push(`reasoning.${subKey}`);
				}
				continue;
			}
			allowlist.push(key);
		}
	}
	if (allowlist.length === 0) return ir;

	const next: IRChatRequest = {
		messages: ir.messages,
		model: ir.model,
		stream: ir.stream,
	};

	let reasoning: IRReasoning | undefined = undefined;
	let responseFormat: IRChatRequest["responseFormat"] | undefined = undefined;

	for (const entry of allowlist) {
		if (typeof entry !== "string") continue;
		if (entry.includes(".")) {
			const [root, leaf] = entry.split(".", 2);
			if (root === "reasoning") {
				reasoning ??= {};
				if (leaf === "effort") reasoning.effort = ir.reasoning?.effort;
				if (leaf === "summary") reasoning.summary = ir.reasoning?.summary;
				if (leaf === "enabled") reasoning.enabled = ir.reasoning?.enabled;
				if (leaf === "maxTokens" || leaf === "max_tokens") reasoning.maxTokens = ir.reasoning?.maxTokens;
			}
			if (root === "responseFormat") {
				responseFormat = ir.responseFormat;
			}
			continue;
		}
		const mappedKey = (() => {
			switch (entry) {
				case "max_tokens":
				case "max_output_tokens":
				case "max_completion_tokens":
					return "maxTokens";
				case "temperature":
					return "temperature";
				case "top_p":
					return "topP";
				case "top_k":
					return "topK";
				case "seed":
					return "seed";
				case "stop":
					return "stop";
				case "logit_bias":
					return "logitBias";
				case "logprobs":
					return "logprobs";
				case "top_logprobs":
					return "topLogprobs";
				case "frequency_penalty":
					return "frequencyPenalty";
				case "presence_penalty":
					return "presencePenalty";
				case "tools":
					return "tools";
				case "tool_choice":
					return "toolChoice";
				case "parallel_tool_calls":
					return "parallelToolCalls";
				case "max_tool_calls":
					return "maxToolCalls";
				case "response_format":
					return "responseFormat";
				case "background":
					return "background";
				case "service_tier":
					return "serviceTier";
				case "prompt_cache_key":
					return "promptCacheKey";
				case "safety_identifier":
					return "safetyIdentifier";
				case "user":
				case "user_id":
					return "userId";
				default:
					return entry;
			}
		})();

		if (mappedKey in ir) {
			(next as any)[mappedKey] = (ir as any)[mappedKey];
		}
	}

	if (reasoning && Object.keys(reasoning).length > 0) {
		next.reasoning = reasoning;
	}
	if (responseFormat) {
		next.responseFormat = responseFormat;
	}

	if (ir.reasoning && !next.reasoning) {
		next.reasoning = ir.reasoning;
	}

	return next;
}

async function executeXAi(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const upstreamStartMs = args.meta.upstreamStartMs ?? Date.now();
	const irRequest = args.ir as IRChatRequest;
	const quirks = getProviderQuirks(args.providerId);
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta },
		() => (getBindings() as any).X_AI_API_KEY || (getBindings() as any).XAI_API_KEY,
	);

	const modelForRoutingRaw = args.providerModelSlug ?? irRequest.model;
	const modelForRouting = resolveXAiModelForRequest(
		modelForRoutingRaw,
		irRequest.reasoning,
	);
	const requestPayload = irToOpenAIResponses(
		irRequest,
		modelForRouting,
		"openai",
		args.capabilityParams,
	);

	if (irRequest.stream) {
		requestPayload.stream = true;
		requestPayload.stream_options = {
			...(requestPayload.stream_options ?? {}),
			include_usage: true,
		};
	}

	if (quirks.transformRequest) {
		quirks.transformRequest({
			request: requestPayload,
			ir: irRequest,
			model: modelForRouting,
		});
	}

	const captureRequest = Boolean(args.meta.debug?.return_upstream_request || args.meta.debug?.trace);
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
			headers: openAICompatHeaders(args.providerId, keyInfo.key),
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

	let adaptiveRetryCount = 0;
	while (!res.ok && adaptiveRetryCount < 3) {
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
		if (args.meta.debug?.enabled) {
			console.log("[gateway-debug] x-ai request adapted from upstream error", {
				provider: args.providerId,
				status: res.status,
				dropped: adapted.dropped,
			});
		}
		attempt = await sendPayload(adapted.request);
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

	const json = await res.json().catch(() => null);
	if (json && typeof json === "object") {
		quirks.normalizeResponse?.({ response: json, ir: irRequest });

		const bindings = getBindings();
		if (bindings.XAI_DEBUG_USAGE === "1") {
			console.log("[x-ai][usage-debug] raw usage:", (json as any).usage ?? null);
		}
	}

	const ir = json
		? openAIResponsesToIR(json, args.requestId, irRequest.model, args.providerId)
		: undefined;
	if (ir) {
		(ir as any).rawResponse = json;
	}

	const usageMetersBase = normalizeTextUsageForPricing(json?.usage);
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
	if (usageMeters) {
		const priced = computeBill(usageMeters, args.pricingCard);
		bill.cost_cents = priced.pricing.total_cents;
		bill.currency = priced.pricing.currency;
		bill.usage = priced;
	}

	const totalMs = Math.max(0, Date.now() - upstreamStartMs);

	return {
		kind: "completed",
		ir,
		bill,
		upstream: res,
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
		mappedRequest,
		rawResponse: json ?? null,
		timing: {
			latencyMs: totalMs,
			generationMs: totalMs,
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
