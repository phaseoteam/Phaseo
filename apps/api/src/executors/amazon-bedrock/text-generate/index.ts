// Purpose: Executor for amazon-bedrock / text-generate.
// Why: Uses each model's supported Bedrock Mantle API surface.
// How: IR -> Anthropic Messages or OpenAI Chat/Responses, then protocol shaping is handled by the pipeline.

import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, Bill } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";
import { resolveStreamForProtocol, bufferStreamToIR } from "@executors/_shared/text-generate/openai-compat";
import { irToOpenAIChat, openAIChatToIR } from "@executors/_shared/text-generate/openai-compat/transform-chat";
import { irToOpenAIResponses, openAIResponsesToIR } from "@executors/_shared/text-generate/openai-compat/transform";
import { irToAnthropicMessages, anthropicMessagesToIR, mapAnthropicStopReason } from "@executors/anthropic/text-generate";
import { observeAnthropicStream } from "@executors/anthropic/text-generate/stream-usage";
import { createAnthropicToResponsesStreamTransformer } from "@executors/anthropic/text-generate/stream-transformer";
import { normalizeTextUsageForPricing } from "@executors/_shared/usage/text";
import { upstreamTestHeaders } from "@providers/shared/testing";
import type { ProviderExecutor } from "../../types";
import { resolveMantleAuth, signAwsV4Request } from "./bedrock-utils";

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
	return cherryPickIRParams(ir, args.capabilityParams);
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const irRequest = args.ir as IRChatRequest;
	const model = args.providerModelSlug ?? irRequest.model;
	const { keyInfo, auth } = resolveMantleAuth(args);
	if (usesBedrockMessagesApi(args)) {
		return executeBedrockMessages(args, keyInfo, auth, model);
	}
	const route = resolveMantleTextRoute(args);
	return executeMantleOpenAI(args, keyInfo, auth, model, route);
}

async function executeBedrockMessages(
	args: ExecutorExecuteArgs,
	keyInfo: { source: "gateway" | "byok"; byokId: string | null },
	auth: MantleAuth,
	model: string,
): Promise<ExecutorResult> {
	const irRequest = args.ir as IRChatRequest;
	const requestPayload = {
		...irToAnthropicMessages(irRequest, args.maxOutputTokens, model),
		model,
		stream: Boolean(irRequest.stream),
	};
	const requestBody = JSON.stringify(requestPayload);
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest) ? requestBody : undefined;
	const res = await sendMantleRequest(args, auth, {
		url: buildMantleMessagesUrl(auth.baseUrl),
		body: requestBody,
		headers: {
			"Content-Type": "application/json",
			Accept: requestPayload.stream ? "text/event-stream" : "application/json",
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
		const observed = observeAnthropicStream(res.body, keyInfo.source);
		const nativeMessages = args.protocol === "anthropic.messages" || (!args.protocol && args.endpoint === "messages");
		const responsesStream = nativeMessages ? observed.stream : observed.stream.pipeThrough(
			createAnthropicToResponsesStreamTransformer(args.requestId, model, keyInfo.source),
		);
		const stream = nativeMessages ? responsesStream : resolveStreamForProtocol(
			new Response(responsesStream, {
				status: res.status,
				headers: res.headers,
			}),
			args,
			"responses",
		);
		return {
			kind: "stream",
			stream,
			usageFinalizer: async () => {
				const final = observed.finalUsage();
				return {
					...bill,
					usage: normalizeTextUsageForPricing(final.usage) ?? undefined,
					finish_reason: mapAnthropicStopReason(final.stopReason),
				};
			},
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
	const usageMeters = normalizeTextUsageForPricing(json?.usage ?? ir.usage);
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
	const buildPayload = (route: "chat" | "responses"): Record<string, any> => {
		const providerId = args.providerId || "amazon-bedrock";
		const payload = route === "responses"
			? irToOpenAIResponses(irRequest, model, providerId, args.capabilityParams)
			: irToOpenAIChat(irRequest, model, providerId, args.capabilityParams);

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
	let res = await sendMantleRequest(args, auth, {
		url: buildMantleOpenAIUrl(auth.baseUrl, route),
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


function resolveMantleTextRoute(
	args: ExecutorExecuteArgs,
): "chat" | "responses" {
	const protocol = args.protocol ?? (args.endpoint === "responses" ? "openai.responses" : "openai.chat.completions");
	const wantsResponses = protocol === "openai.responses" || args.endpoint === "responses";
	return wantsResponses ? "responses" : "chat";
}

function usesBedrockMessagesApi(args: ExecutorExecuteArgs): boolean {
	return args.protocol === "anthropic.messages" || args.endpoint === "messages";
}

function buildMantleMessagesUrl(baseUrl: string): string {
	const normalizedBase = baseUrl.replace(/\/+$/, "");
	const lower = normalizedBase.toLowerCase();
	if (lower.endsWith("/anthropic/v1/messages")) {
		return normalizedBase;
	}
	if (lower.endsWith("/anthropic/v1")) {
		return `${normalizedBase}/messages`;
	}
	if (lower.endsWith("/anthropic")) {
		return `${normalizedBase}/v1/messages`;
	}

	for (const suffix of ["/openai/v1", "/openai", "/v1"]) {
		if (lower.endsWith(suffix)) {
			return `${normalizedBase.slice(0, -suffix.length)}/anthropic/v1/messages`;
		}
	}

	return `${normalizedBase}/anthropic/v1/messages`;
}

function buildMantleOpenAIUrl(baseUrl: string, route: "chat" | "responses"): string {
	const suffix = route === "responses" ? "/responses" : "/chat/completions";
	const normalizedBase = baseUrl.replace(/\/+$/, "");
	const lower = normalizedBase.toLowerCase();
	if (lower.endsWith("/openai/v1") || lower.endsWith("/v1")) {
		return `${normalizedBase}${suffix}`;
	}
	if (lower.endsWith("/openai")) {
		return `${normalizedBase}/v1${suffix}`;
	}
	if (lower.includes("bedrock-mantle.")) {
		return `${normalizedBase}/v1${suffix}`;
	}
	return `${normalizedBase}/openai/v1${suffix}`;
}

async function sendMantleRequest(
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
			service: "bedrock",
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
