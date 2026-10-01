// Purpose: Executor for azure / text-generate.
// Why: Azure OpenAI uses deployment-based URLs and api-version query params.
// How: Reuse OpenAI-compatible transforms with Azure-specific URL/auth.

import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, ProviderExecutor, Bill } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";
import { irToOpenAIResponses } from "@executors/_shared/text-generate/openai-compat/transform";
import { irToOpenAIChat, openAIChatToIR } from "@executors/_shared/text-generate/openai-compat/transform-chat";
import { bufferStreamToIR, resolveStreamForProtocol } from "@executors/_shared/text-generate/openai-compat";
import { azureDeployment, azureHeaders, azureMaiUrl, azureOpenAIV1Url, azureUrl, resolveAzureConfig, resolveAzureCredential, usesAzureV1 } from "@providers/azure/config";
import { normalizeTextUsageForPricing } from "@executors/_shared/usage/text";
import { executeAnthropic } from "@executors/anthropic/text-generate";
import { upstreamTestHeaders } from "@providers/shared/testing";

export function preprocess(ir: IRChatRequest, args: ExecutorExecuteArgs): IRChatRequest {
	return cherryPickIRParams(ir, args.capabilityParams);
}

export function normalizeAzureChatRequest(
	request: Record<string, any>,
	args: Pick<ExecutorExecuteArgs, "providerModelSlug" | "ir">,
): Record<string, any> {
	const model = String(args.providerModelSlug || args.ir.model || "").toLowerCase();
	const isGpt5 = /^(?:openai\/)?gpt-5(?:[.-]|$)/.test(model);
	if (isGpt5 && typeof request.max_tokens === "number" && request.max_completion_tokens == null) {
		request.max_completion_tokens = request.max_tokens;
		delete request.max_tokens;
	}
	return request;
}

export function shouldUseAzureResponsesRoute(args: Pick<ExecutorExecuteArgs, "providerModelSlug" | "ir" | "protocol">): boolean {
	if (/^(?:microsoft\/)?mai-/i.test(args.providerModelSlug || args.ir.model)) return false;
	if (args.protocol === "openai.responses") return true;
	if (args.protocol === "openai.chat.completions") return false;
	const model = String(args.providerModelSlug || args.ir.model || "").toLowerCase();
	return /^(?:openai\/)?gpt-5\.6-(?:luna|sol|terra)$/.test(model);
}

export function resolveAzureTextUrl(args: {
	route: "chat" | "responses";
	deployment: string;
	baseUrl: string;
	apiVersion: string;
}): string {
	if (args.route === "responses" || usesAzureV1(args.apiVersion)) {
		return azureOpenAIV1Url(args.route === "responses" ? "responses" : "chat/completions", args.baseUrl, args.apiVersion);
	}
	return azureUrl(`openai/deployments/${args.deployment}/chat/completions`, args.apiVersion, args.baseUrl);
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	if (/^(?:anthropic\/)?claude-/i.test(args.providerModelSlug || args.ir.model)) return executeAnthropic(args);
	const credentialArgs = { providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey, model: args.ir.model, providerModelSlug: args.providerModelSlug };
	const keyInfo = resolveAzureCredential(credentialArgs as any);
	const config = resolveAzureConfig(credentialArgs);
	const route = shouldUseAzureResponsesRoute(args) ? "responses" : "chat";
	const deployment = azureDeployment({ providerModelSlug: config.deployment || args.providerModelSlug, model: args.ir.model } as any);
	const isMai = /^(?:microsoft\/)?mai-/i.test(args.providerModelSlug || args.ir.model);
	const url = isMai ? azureMaiUrl("chat/completions", config.baseUrl) : resolveAzureTextUrl({ route, deployment, baseUrl: config.baseUrl, apiVersion: config.apiVersion });

	const requestPayload = route === "responses"
		? irToOpenAIResponses(args.ir, config.deployment || args.providerModelSlug, "openai", args.capabilityParams, args.providerId)
		: irToOpenAIChat(args.ir, config.deployment || args.providerModelSlug, args.providerId, args.capabilityParams);
	const payload = {
		...(route === "chat" ? normalizeAzureChatRequest(requestPayload, args) : requestPayload),
		stream: true,
		...(route === "chat"
			? {
					stream_options: {
						...(requestPayload.stream_options ?? {}),
						include_usage: true,
					},
				}
			: { store: false }),
	};
	const requestBody = JSON.stringify(payload);
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest) ? requestBody : undefined;

	const res = await fetchUpstream(args, url, {
		method: "POST",
		headers: { ...azureHeaders(keyInfo.key, keyInfo.authType), ...upstreamTestHeaders(args.meta) },
		body: requestBody,
	});
	const selectedDispatchAtMs = args.upstreamTiming?.timingFor(res)?.dispatchAtMs ?? Date.now();

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

	if (args.ir.stream) {
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

	const { ir, usage, rawResponse, firstByteMs, totalMs } = await bufferStreamToIR(res, args, route, selectedDispatchAtMs);
	const usageMeters = normalizeTextUsageForPricing(usage);
	if (usageMeters) {
		bill.usage = usageMeters;
	}

	return {
		kind: "completed",
		ir: ir ?? (route === "chat" ? openAIChatToIR(rawResponse, args.requestId, args.ir.model, args.providerId) : undefined),
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

export function postprocess(ir: any): any {
	return ir;
}

export function transformStream(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
	return stream;
}

export const executor: ProviderExecutor = buildTextExecutor({
	preprocess,
	execute,
	postprocess,
	transformStream,
});
