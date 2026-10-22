// Purpose: Executor for amazon-bedrock / text-generate.
// Why: Uses each model's supported Bedrock API surface. Bare model IDs go to
// bedrock-mantle; cross-Region inference profile IDs (global./us./...) go to
// bedrock-runtime, which serves the Claude and GPT models Mantle lacks.
// How: IR -> Anthropic Messages (Mantle) or InvokeModel (Runtime), or OpenAI
// Chat/Responses, then protocol shaping is handled by the pipeline.

import type { IRChatRequest } from "@core/ir";
import { isClaudeOpus55, normalizeClaudeModelId } from "@core/claudeModelCapabilities";
import { assertClaudeRequestSupported } from "@core/claudeRequestValidation";
import type { ExecutorExecuteArgs, ExecutorResult, Bill } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";
import { resolveStreamForProtocol, bufferStreamToIR } from "@executors/_shared/text-generate/openai-compat";
import { irToOpenAIChat, openAIChatToIR } from "@executors/_shared/text-generate/openai-compat/transform-chat";
import { irToOpenAIResponses, openAIResponsesToIR } from "@executors/_shared/text-generate/openai-compat/transform";
import { irToAnthropicMessages, anthropicMessagesToIR, anthropicUsageForPricing, anthropicUnsupportedMediaResult, mapAnthropicStopReason } from "@executors/anthropic/text-generate";
import {
	ANTHROPIC_CACHE_USAGE_SEMANTICS,
	createAnthropicStreamAccounting,
	createAnthropicPassthroughStreamTransformer,
	createAnthropicToResponsesStreamTransformer,
} from "@executors/anthropic/text-generate/stream-transformer";
import { inlineClaudeMediaForBase64OnlyPlatform } from "@executors/anthropic/text-generate/inline-media";
import { inlineAudioUrlsForProvider } from "@executors/_shared/text-generate/openai-compat/inline-audio";
import { normalizeTextUsageForPricing } from "@executors/_shared/usage/text";
import { upstreamTestHeaders } from "@providers/shared/testing";
import type { ProviderExecutor } from "../../types";
import {
	resolveMantleAuth,
	signAwsV4Request,
	extractRegionFromMantleUrl,
	isBedrockInferenceProfileId,
	bedrockRuntimeBaseUrl,
	bedrockSigningService,
	createBedrockInvokeStreamToSseTransformer,
} from "./bedrock-utils";

type BedrockCredentials = {
	accessKeyId: string;
	secretAccessKey: string;
	sessionToken?: string;
	region?: string;
	baseUrl?: string;
};

type MantleAuth =
	| {
		mode: "sigv4";
		region: string;
		baseUrl: string;
		credentials: BedrockCredentials & { region: string; baseUrl: string };
	}
	| {
		mode: "bearer";
		token: string;
		region: string;
		baseUrl: string;
	};

export function preprocess(ir: IRChatRequest, args: ExecutorExecuteArgs): IRChatRequest {
	assertClaudeRequestSupported(ir, args.providerModelSlug ?? ir.model, args.providerId);
	return cherryPickIRParams(ir, args.capabilityParams);
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const irRequest = args.ir as IRChatRequest;
	const model = args.providerModelSlug ?? irRequest.model;
	assertClaudeRequestSupported(irRequest, model, args.providerId);
	const { keyInfo, auth } = resolveMantleAuth(args);
	const route = resolveMantleTextRoute(args);
	if (isClaudeOpus55(irRequest.model) || isClaudeOpus55(model)) {
		// Runtime inference profiles cannot be stripped here: that would change
		// residency semantics. The catalogue must provide the Mantle model ID.
		if (model !== "anthropic.claude-opus-5-5") throw new Error("amazon_bedrock_opus_55_mantle_model_required");
		if (!["us-east-1", "ap-southeast-4", "us-gov-west-1"].includes(auth.region)) throw new Error("amazon_bedrock_opus_55_mantle_region_unsupported");
		const hostRegion = extractRegionFromMantleUrl(auth.baseUrl);
		if (hostRegion && hostRegion !== auth.region) throw new Error("amazon_bedrock_opus_55_mantle_region_mismatch");
	}
	if (route === "messages") {
		return executeBedrockMessages(args, keyInfo, auth, model);
	}
	return executeMantleOpenAI(args, keyInfo, auth, model, route);
}

async function executeBedrockMessages(
	args: ExecutorExecuteArgs,
	keyInfo: { source: "gateway" | "byok"; byokId: string | null },
	auth: MantleAuth,
	model: string,
): Promise<ExecutorResult> {
	const irRequest = args.ir as IRChatRequest;
	const unsupportedMedia = anthropicUnsupportedMediaResult(irRequest, args.requestId);
	if (unsupportedMedia) return unsupportedMedia;
	// Claude on Bedrock reads base64 sources only.
	const inlined = await inlineClaudeMediaForBase64OnlyPlatform(irRequest, args);
	if (inlined.ok === false) return inlined.result;
	const anthropicRequest = irToAnthropicMessages(inlined.ir, args.maxOutputTokens, model, { providerId: args.providerId || "amazon-bedrock" });
	const stream = Boolean(irRequest.stream);
	// bedrock-runtime: InvokeModel takes the model in the path and the version in
	// the body; older Claude models there do not offer the /anthropic Messages route.
	const runtime = isBedrockInferenceProfileId(model);
	const requestPayload = runtime
		? { anthropic_version: "bedrock-2023-05-31", ...anthropicRequest }
		: { ...anthropicRequest, model, stream };
	const requestBody = JSON.stringify(requestPayload);
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest) ? requestBody : undefined;
	const res = await sendBedrockRequest(args, auth, runtime
		? {
			url: buildRuntimeInvokeUrl(auth.region, model, stream),
			body: requestBody,
			headers: {
				"Content-Type": "application/json",
				Accept: stream ? "application/vnd.amazon.eventstream" : "application/json",
				...upstreamTestHeaders(args.meta),
			},
		}
		: {
			url: buildMantleMessagesUrl(auth.baseUrl),
			body: requestBody,
			headers: {
				"Content-Type": "application/json",
				Accept: stream ? "text/event-stream" : "application/json",
				"anthropic-version": "2023-06-01",
				...upstreamTestHeaders(args.meta),
			},
			apiKeyHeader: "x-api-key",
		});
	const selectedDispatchAtMs = args.upstreamTiming?.timingFor(res)?.dispatchAtMs ?? Date.now();

	const bill: Bill = {
		cost_cents: 0,
		currency: "USD",
		usage: undefined,
		upstream_id:
			res.headers.get("request-id") ??
			res.headers.get("x-amzn-requestid") ??
			res.headers.get("x-request-id") ??
			undefined,
		finish_reason: null,
	};

	if (!res.ok) {
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
		if (!res.body) {
			throw new Error("bedrock_messages_stream_missing_body");
		}
		// Usage is recorded by the transformer itself; no tee()'d accounting
		// branch buffering the whole response.
		const accounting = createAnthropicStreamAccounting();
		const sseBody = runtime ? res.body.pipeThrough(createBedrockInvokeStreamToSseTransformer()) : res.body;
		const nativeMessages = isClaudeOpus55(model) && args.protocol === "anthropic.messages";
		const responsesStream = nativeMessages ? null : sseBody.pipeThrough(
			createAnthropicToResponsesStreamTransformer(args.requestId, model, { accounting, providerId: args.providerId }),
		);
		const clientStream = nativeMessages ? sseBody.pipeThrough(createAnthropicPassthroughStreamTransformer(accounting)) : resolveStreamForProtocol(
			new Response(responsesStream!, {
				status: res.status,
				headers: res.headers,
			}),
			args,
			"responses",
			{ canonicalResponsesEvents: true },
		);
		return {
			kind: "stream",
			stream: clientStream,
			usageFinalizer: async () => {
				const final = accounting.snapshot();
				return {
					...bill,
					usage: anthropicUsageForPricing(final.usage),
					finish_reason: mapAnthropicStopReason(final.stopReason),
				};
			},
			usageFinalizerAuthoritative: true,
			usageSnapshot: () => anthropicUsageForPricing(accounting.snapshot().usage) ?? null,
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

	const json: any = await res.json().catch(() => null);
	const providerId = args.providerId || "amazon-bedrock";
	const ir = anthropicMessagesToIR(json ?? {}, args.requestId, model, providerId);
	const usageMeters = normalizeTextUsageForPricing(json?.usage ?? ir.usage, ANTHROPIC_CACHE_USAGE_SEMANTICS);
	if (usageMeters) {
		bill.usage = usageMeters;
	}
	bill.finish_reason = ir.choices?.[0]?.finishReason ?? null;

	return {
		kind: "completed",
		ir,
		bill,
		upstream: res,
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
		mappedRequest,
		rawResponse: json,
		timing: {
			latencyMs: undefined,
			generationMs: Math.max(0, Date.now() - selectedDispatchAtMs),
		},
	};
}

async function executeMantleOpenAI(
	args: ExecutorExecuteArgs,
	keyInfo: { source: "gateway" | "byok"; byokId: string | null },
	auth: MantleAuth,
	model: string,
	preferredRoute: "chat" | "responses",
): Promise<ExecutorResult> {
	const irRequest = args.ir as IRChatRequest;
	// Audio given by URL is downloaded and sent as base64 input_audio.
	const inlinedAudio = await inlineAudioUrlsForProvider(irRequest, args);
	if (inlinedAudio.ok === false) return inlinedAudio.result;
	const buildPayload = (route: "chat" | "responses"): Record<string, any> => {
		const providerId = args.providerId || "amazon-bedrock";
		const payload = route === "responses"
			? irToOpenAIResponses(inlinedAudio.ir, model, providerId, args.capabilityParams)
			: irToOpenAIChat(inlinedAudio.ir, model, providerId, args.capabilityParams);

		payload.stream = true;
		if (route === "chat" && payload.stream) {
			payload.stream_options = {
				...(payload.stream_options ?? {}),
				include_usage: true,
			};
		}

		return payload;
	};

	let route: "chat" | "responses" = preferredRoute;
	let requestPayload = buildPayload(route);
	let requestBody = JSON.stringify(requestPayload);
	let mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest) ? requestBody : undefined;
	let res = await sendBedrockRequest(args, auth, {
		url: buildBedrockOpenAIUrl(auth, model, route),
		body: requestBody,
		headers: {
			"Content-Type": "application/json",
			Accept: requestPayload.stream ? "text/event-stream" : "application/json",
			...upstreamTestHeaders(args.meta),
		},
	});

	const bill: Bill = {
		cost_cents: 0,
		currency: "USD",
		usage: undefined,
		upstream_id:
			res.headers.get("x-amzn-requestid") ??
			res.headers.get("x-request-id") ??
			undefined,
		finish_reason: null,
	};

	if (!res.ok) {
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
		const stream = resolveStreamForProtocol(res, args, route);
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

	if (requestPayload.stream) {
		const selectedDispatchAtMs =
			args.upstreamTiming?.timingFor(res)?.dispatchAtMs ?? Date.now();
		const { ir, usage, rawResponse, firstByteMs, totalMs } = await bufferStreamToIR(
			res,
			args,
			route,
			selectedDispatchAtMs,
		);
		const usageMeters = normalizeTextUsageForPricing(usage ?? ir?.usage);
		if (usageMeters) {
			bill.usage = usageMeters;
		}
		bill.finish_reason = ir?.choices?.[0]?.finishReason ?? null;

		return {
			kind: "completed",
			ir,
			bill,
			upstream: res,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
			rawResponse,
			timing: {
				latencyMs: firstByteMs ?? undefined,
				generationMs: totalMs,
			},
		};
	}

	const json: any = await res.json().catch(() => null);
	const providerId = args.providerId || "amazon-bedrock";
	const ir = route === "responses"
		? openAIResponsesToIR(json ?? {}, args.requestId, model, providerId)
		: openAIChatToIR(json ?? {}, args.requestId, model, providerId);
	const usageMeters = normalizeTextUsageForPricing(json?.usage ?? ir?.usage);
	if (usageMeters) {
		bill.usage = usageMeters;
	}
	bill.finish_reason = ir?.choices?.[0]?.finishReason ?? null;

	return {
		kind: "completed",
		ir,
		bill,
		upstream: res,
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
		mappedRequest,
		rawResponse: json,
		timing: {
			latencyMs: undefined,
			generationMs: args.upstreamTiming?.timingFor(res)?.dispatchAtMs
				? Math.max(0, Date.now() - args.upstreamTiming.timingFor(res)!.dispatchAtMs)
				: undefined,
		},
	};
}

export function postprocess(ir: any): any {
	return ir;
}

export function transformStream(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
	return stream;
}


export function resolveMantleTextRoute(
	args: ExecutorExecuteArgs,
): "messages" | "chat" | "responses" {
	// Claude on Bedrock serves only the Anthropic Messages API (InvokeModel on
	// bedrock-runtime), so every Claude model uses it whatever the client protocol.
	if (isBedrockClaudeModel(args.providerModelSlug) || isBedrockClaudeModel(args.ir.model)) return "messages";
	// Every other model serves Chat Completions. Messages clients and Responses
	// clients of chat-only models are translated by the pipeline; /anthropic/v1/messages
	// is Claude-only and most open-weight model cards mark Responses "not supported".
	const protocol = args.protocol ?? (args.endpoint === "responses" ? "openai.responses" : "openai.chat.completions");
	const wantsResponses = protocol === "openai.responses" || args.endpoint === "responses";
	return wantsResponses && supportsBedrockResponses(args.providerModelSlug ?? args.ir.model) ? "responses" : "chat";
}

/**
 * Bedrock model cards list Messages as the only Mantle API for Claude
 * (Responses and Chat Completions are "not supported"). Matches bare Mantle IDs
 * such as `anthropic.claude-sonnet-5`, inference-profile IDs such as
 * `us.anthropic.claude-fable-5-1` and gateway IDs such as
 * `anthropic/claude-opus-5`.
 */
export function isBedrockClaudeModel(model: string | null | undefined): boolean {
	const normalized = normalizeClaudeModelId(model);
	if (!normalized) return false;
	return isClaudeOpus55(normalized) || /(?:^|[./:])(?:anthropic[./])?claude-/.test(normalized);
}

function bareBedrockModelId(model: string | null | undefined): string {
	return String(model ?? "").trim().toLowerCase().replace(/^(?:global|us|us-gov|eu|apac|au|jp)\./, "");
}

/**
 * Responses is offered by the OpenAI GPT models and xAI Grok on both hosts and
 * by gpt-oss on Mantle only (its bedrock-runtime card lists Chat Completions alone).
 */
function supportsBedrockResponses(model: string | null | undefined): boolean {
	const bare = bareBedrockModelId(model);
	if (/^openai\.gpt-oss/.test(bare)) return !isBedrockInferenceProfileId(model);
	return /^openai\.gpt-/.test(bare) || /^xai\./.test(bare);
}

/**
 * On bedrock-mantle the OpenAI GPT and xAI models are served under /openai/v1;
 * gpt-oss and the open-weight models under /v1 (per each model card).
 */
function usesMantleOpenAIPathPrefix(model: string | null | undefined): boolean {
	const bare = bareBedrockModelId(model);
	return (/^openai\.gpt-/.test(bare) && !/^openai\.gpt-oss/.test(bare)) || /^xai\./.test(bare);
}

/** The configured Mantle base URL without any API path suffix. */
function mantleOrigin(baseUrl: string): string {
	const normalizedBase = baseUrl.replace(/\/+$/, "");
	const lower = normalizedBase.toLowerCase();
	for (const suffix of ["/anthropic/v1/messages", "/anthropic/v1", "/anthropic", "/openai/v1", "/openai", "/v1"]) {
		if (lower.endsWith(suffix)) return normalizedBase.slice(0, -suffix.length);
	}
	return normalizedBase;
}

function buildMantleMessagesUrl(baseUrl: string): string {
	return `${mantleOrigin(baseUrl)}/anthropic/v1/messages`;
}

function buildRuntimeInvokeUrl(region: string, model: string, stream: boolean): string {
	return `${bedrockRuntimeBaseUrl(region)}/model/${encodeURIComponent(model)}/${stream ? "invoke-with-response-stream" : "invoke"}`;
}

function buildBedrockOpenAIUrl(auth: MantleAuth, model: string, route: "chat" | "responses"): string {
	const suffix = route === "responses" ? "/responses" : "/chat/completions";
	// bedrock-runtime serves every OpenAI-compatible model under /openai/v1.
	if (isBedrockInferenceProfileId(model)) return `${bedrockRuntimeBaseUrl(auth.region)}/openai/v1${suffix}`;
	return `${mantleOrigin(auth.baseUrl)}${usesMantleOpenAIPathPrefix(model) ? "/openai/v1" : "/v1"}${suffix}`;
}

async function sendBedrockRequest(
	executorArgs: ExecutorExecuteArgs,
	auth: MantleAuth,
	args: {
		url: string;
		body: string;
		headers: Record<string, string>;
		apiKeyHeader?: "authorization" | "x-api-key";
	},
): Promise<Response> {
	const requestHeaders = auth.mode === "sigv4"
		? await signAwsV4Request({
			method: "POST",
			url: args.url,
			body: args.body,
			region: auth.region,
			service: bedrockSigningService(args.url),
			accessKeyId: auth.credentials.accessKeyId,
			secretAccessKey: auth.credentials.secretAccessKey,
			sessionToken: auth.credentials.sessionToken,
			headers: args.headers,
		})
		: args.apiKeyHeader === "x-api-key"
			? {
				"x-api-key": auth.token,
				...args.headers,
			}
			: {
				Authorization: `Bearer ${auth.token}`,
				...args.headers,
			};

	return fetchUpstream(executorArgs, args.url, {
		method: "POST",
		headers: requestHeaders,
		body: args.body,
	});
}

export const executor: ProviderExecutor = buildTextExecutor({
	preprocess,
	execute,
	postprocess,
	transformStream,
});
