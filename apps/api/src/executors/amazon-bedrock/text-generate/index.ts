// Purpose: Executor for amazon-bedrock / text-generate.
// Why: Uses the unified Bedrock Mantle OpenAI-compatible endpoint for every model.
// How: IR -> OpenAI Chat/Responses payload, then protocol shaping is handled by the pipeline.

import type { IRChatRequest } from "@core/ir";
import type {
	ExecutorExecuteArgs,
	ExecutorResult,
	ExecutorUpstreamAttempt,
	Bill,
} from "@executors/types";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";
import { resolveStreamForProtocol, bufferStreamToIR } from "@executors/_shared/text-generate/openai-compat";
import { irToOpenAIChat, openAIChatToIR } from "@executors/_shared/text-generate/openai-compat/transform-chat";
import { irToOpenAIResponses, openAIResponsesToIR } from "@executors/_shared/text-generate/openai-compat/transform";
import { shouldFallbackToChatFromError, readErrorPayload } from "@executors/_shared/text-generate/openai-compat/retry-policy";
import { normalizeTextUsageForPricing } from "@executors/_shared/usage/text";
import { upstreamTestHeaders } from "@providers/shared/testing";
import type { ProviderExecutor } from "../../types";
import { resolveBedrockAuth, signAwsV4Request } from "./bedrock-utils";

type BedrockCredentials = {
	accessKeyId: string;
	secretAccessKey: string;
	sessionToken?: string;
	region?: string;
	baseUrl?: string;
};

type BedrockAuth =
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
	const { keyInfo, auth } = resolveBedrockAuth(args);
	const route = resolveBedrockTextRoute(args, model);
	return executeBedrockOpenAI(args, keyInfo, auth, model, route);
}

async function executeBedrockOpenAI(
	args: ExecutorExecuteArgs,
	keyInfo: { source: "gateway" | "byok"; byokId: string | null },
	auth: BedrockAuth,
	model: string,
	preferredRoute: "chat" | "responses",
): Promise<ExecutorResult> {
	const irRequest = args.ir as IRChatRequest;
	const upstreamStartMs = args.meta.upstreamStartMs ?? Date.now();
	const upstreamAttempts: ExecutorUpstreamAttempt[] = [];

	const buildPayload = (route: "chat" | "responses"): Record<string, any> => {
		const providerId = args.providerId || "amazon-bedrock";
		const payload = route === "responses"
			? irToOpenAIResponses(irRequest, model, providerId, args.capabilityParams)
			: irToOpenAIChat(irRequest, model, providerId, args.capabilityParams);

		payload.stream = Boolean(irRequest.stream);
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
	const performRequest = async (targetRoute: "chat" | "responses") => {
		const url = buildBedrockOpenAIUrl(auth.baseUrl, targetRoute);
		const startedAt = Date.now();
		const response = await sendBedrockRequest(auth, {
			url,
			body: requestBody,
			headers: {
				"Content-Type": "application/json",
				Accept: requestPayload.stream ? "text/event-stream" : "application/json",
				...upstreamTestHeaders(args.meta),
			},
		});
		let responsePayload: unknown;
		if (!response.ok) {
			const failure = await readErrorPayload(response);
			responsePayload = failure.errorPayload ?? failure.errorText ?? null;
		}
		upstreamAttempts.push({
			sequence: upstreamAttempts.length + 1,
			route: targetRoute,
			request: requestBody,
			response: responsePayload,
			status: response.status,
			statusText: response.statusText || null,
			url: response.url || url,
			durationMs: Math.max(0, Date.now() - startedAt),
			outcome: response.ok ? "success" : "upstream_non_2xx",
		});
		return response;
	};
	let res = await performRequest(route);

	if (!res.ok && route === "responses") {
		const { errorText } = await readErrorPayload(res);
		if (shouldFallbackToChatFromError({ route: "responses", status: res.status, errorText })) {
			route = "chat";
			requestPayload = buildPayload(route);
			requestBody = JSON.stringify(requestPayload);
			mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest) ? requestBody : undefined;
			res = await performRequest(route);
		}
	}

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
			upstreamAttempts,
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
			upstreamAttempts,
			timing: {
				latencyMs: undefined,
				generationMs: undefined,
			},
		};
	}

	if (requestPayload.stream) {
		const { ir, usage, rawResponse, firstByteMs, totalMs } = await bufferStreamToIR(
			res,
			args,
			route,
			upstreamStartMs,
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
			upstreamAttempts,
			timing: {
				latencyMs: firstByteMs ?? undefined,
				generationMs:
					typeof firstByteMs === "number" && typeof totalMs === "number"
						? Math.max(0, totalMs - firstByteMs)
						: totalMs ?? undefined,
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
		upstreamAttempts,
		timing: {
			latencyMs: Date.now() - upstreamStartMs,
			generationMs: 0,
		},
	};
}

export function postprocess(ir: any): any {
	return ir;
}

export function transformStream(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
	return stream;
}


function resolveBedrockTextRoute(
	args: ExecutorExecuteArgs,
	model: string,
): "chat" | "responses" {
	const protocol = args.protocol ?? (args.endpoint === "responses" ? "openai.responses" : "openai.chat.completions");
	const wantsResponses = protocol === "openai.responses" || args.endpoint === "responses";
	return wantsResponses || isResponsesOnlyBedrockModel(model) ? "responses" : "chat";
}

function isResponsesOnlyBedrockModel(model: string): boolean {
	const normalized = model.trim().toLowerCase().replaceAll("/", ".");
	return /(?:^|\.)openai\.gpt-5\.(?:4|5|6)(?:$|[.-])/.test(normalized);
}

function buildBedrockOpenAIUrl(baseUrl: string, route: "chat" | "responses"): string {
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

async function sendBedrockRequest(
	auth: BedrockAuth,
	args: { url: string; body: string; headers: Record<string, string> },
): Promise<Response> {
	const requestHeaders = auth.mode === "sigv4"
		? await signAwsV4Request({
			method: "POST",
			url: args.url,
			body: args.body,
			region: auth.region,
			service: "bedrock-mantle",
			accessKeyId: auth.credentials.accessKeyId,
			secretAccessKey: auth.credentials.secretAccessKey,
			sessionToken: auth.credentials.sessionToken,
			headers: args.headers,
		})
		: {
			Authorization: `Bearer ${auth.token}`,
			...args.headers,
		};

	return fetch(args.url, {
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


