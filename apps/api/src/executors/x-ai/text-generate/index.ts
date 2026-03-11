// Purpose: Executor for x-ai / text-generate.
// Why: Isolates provider-specific behavior per capability.
// How: Transforms IR to xAI Responses API and normalizes usage.

import type { IRChatRequest, IRReasoning } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, Bill, ProviderExecutor } from "@executors/types";
import { computeBill } from "@pipeline/pricing/engine";
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
import { getBindings } from "@/runtime/env";

type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

const REASONING_EFFORT_ORDER: ReasoningEffort[] = [
	"none",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
];

const REASONING_EFFORT_TO_PERCENT: Record<ReasoningEffort, number> = {
	none: 0.0,
	minimal: 0.15,
	low: 0.30,
	medium: 0.50,
	high: 0.75,
	xhigh: 0.90,
	max: 1.0,
};

const XAI_REASONING_EFFORT_SUPPORT: Record<string, Set<ReasoningEffort>> = {
	"grok-4": new Set(["none", "low", "medium", "high", "xhigh"]),
	"grok-4-1": new Set(["none", "low", "medium", "high", "xhigh"]),
};

type XAiReasoningRouteFamily = {
	baseAliases: string[];
	explicitReasoningAliases: string[];
	explicitNonReasoningAliases: string[];
	reasoningSlug: string;
	nonReasoningSlug: string;
};

const XAI_REASONING_ROUTE_FAMILIES: XAiReasoningRouteFamily[] = [
	{
		baseAliases: ["grok-4.1", "grok-4-1"],
		explicitReasoningAliases: ["grok-4.1-thinking", "grok-4-1-thinking", "grok-4.1-reasoning"],
		explicitNonReasoningAliases: ["grok-4-1-fast-non-reasoning", "grok-4.1-non-thinking"],
		reasoningSlug: "grok-4.1-reasoning",
		nonReasoningSlug: "grok-4-1-fast-non-reasoning",
	},
	{
		baseAliases: ["grok-4-fast"],
		explicitReasoningAliases: ["grok-4-fast-reasoning"],
		explicitNonReasoningAliases: ["grok-4-fast-non-reasoning"],
		reasoningSlug: "grok-4-fast-reasoning",
		nonReasoningSlug: "grok-4-fast-non-reasoning",
	},
	{
		baseAliases: ["grok-4.20-beta-0309"],
		explicitReasoningAliases: ["grok-4.20-beta-0309-reasoning"],
		explicitNonReasoningAliases: ["grok-4.20-beta-0309-non-reasoning"],
		reasoningSlug: "grok-4.20-beta-0309-reasoning",
		nonReasoningSlug: "grok-4.20-beta-0309-non-reasoning",
	},
];

function normalizeModelName(model?: string | null): string {
	if (!model) return "";
	const value = model.trim();
	if (!value) return "";
	const parts = value.split("/");
	return parts[parts.length - 1] || value;
}

function findReasoningRouteFamily(model: string): XAiReasoningRouteFamily | null {
	const normalized = normalizeModelName(model).toLowerCase();
	if (!normalized) return null;
	return (
		XAI_REASONING_ROUTE_FAMILIES.find((family) => {
			return (
				family.baseAliases.includes(normalized) ||
				family.explicitReasoningAliases.includes(normalized) ||
				family.explicitNonReasoningAliases.includes(normalized)
			);
		}) ?? null
	);
}

export function resolveXAiModelForRequest(
	model: string,
	reasoning: IRReasoning | undefined,
	requestedModel?: string | null,
): string {
	const requestedNormalized = normalizeModelName(requestedModel).toLowerCase();
	const explicitReasoningRequested = reasoning?.enabled === true;
	const explicitNonReasoningRequested = reasoning?.enabled === false;

	const requestedFamily = requestedNormalized
		? findReasoningRouteFamily(requestedNormalized)
		: null;
	const routingFamily = requestedFamily ?? findReasoningRouteFamily(model);

	if (!routingFamily) return model;

	if (requestedNormalized) {
		if (routingFamily.explicitReasoningAliases.includes(requestedNormalized)) {
			if (explicitNonReasoningRequested) return routingFamily.nonReasoningSlug;
			return routingFamily.reasoningSlug;
		}
		if (routingFamily.explicitNonReasoningAliases.includes(requestedNormalized)) {
			if (explicitReasoningRequested) return routingFamily.reasoningSlug;
			return routingFamily.nonReasoningSlug;
		}
		if (routingFamily.baseAliases.includes(requestedNormalized)) {
			return explicitReasoningRequested
				? routingFamily.reasoningSlug
				: routingFamily.nonReasoningSlug;
		}
	}

	return explicitReasoningRequested
		? routingFamily.reasoningSlug
		: routingFamily.nonReasoningSlug;
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
	if (requestedIndex < 0) return requested;
	if (requestedIndex === 0) return supportedOrdered[0];
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
				case "prompt_cache_retention":
					return "promptCacheRetention";
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

	const usageMetersBase = normalizeTextUsageForPricing((rawResponse as any)?.usage ?? usage);
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









