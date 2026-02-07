// Purpose: Executor for azure / text-generate.
// Why: Azure OpenAI uses deployment-based URLs and api-version query params.
// How: Reuse OpenAI-compatible transforms with Azure-specific URL/auth.

import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, ProviderExecutor, Bill } from "@executors/types";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";
import { irToOpenAIChat, openAIChatToIR } from "@executors/_shared/text-generate/openai-compat/transform-chat";
import { bufferStreamToIR, resolveStreamForProtocol } from "@executors/_shared/text-generate/openai-compat";
import { computeBill } from "@pipeline/pricing/engine";
import { azureDeployment, azureHeaders, azureUrl, resolveAzureConfig, resolveAzureKey } from "@providers/azure/config";
import { normalizeTextUsageForPricing } from "@executors/_shared/usage/text";

export function preprocess(ir: IRChatRequest, args: ExecutorExecuteArgs): IRChatRequest {
	return cherryPickIRParams(ir, args.capabilityParams);
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const upstreamStartMs = args.meta.upstreamStartMs ?? Date.now();
	const keyInfo = resolveAzureKey({ providerId: args.providerId, byokMeta: args.byokMeta } as any);
	const config = resolveAzureConfig();
	const deployment = azureDeployment({ providerModelSlug: args.providerModelSlug, model: args.ir.model } as any);
	const url = azureUrl(`openai/deployments/${deployment}/chat/completions`, config.apiVersion, config.baseUrl);

	const requestPayload = irToOpenAIChat(args.ir, args.providerModelSlug, args.providerId, args.capabilityParams);
	const payload = {
		...requestPayload,
		stream: true,
		stream_options: {
			...(requestPayload.stream_options ?? {}),
			include_usage: true,
		},
	};
	const requestBody = JSON.stringify(payload);
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest) ? requestBody : undefined;

	const res = await fetch(url, {
		method: "POST",
		headers: azureHeaders(keyInfo.key),
		body: requestBody,
	});

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
		const stream = resolveStreamForProtocol(res, args, "chat");
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

	const { ir, usage, rawResponse, firstByteMs, totalMs } = await bufferStreamToIR(res, args, "chat", upstreamStartMs);
	const usageMeters = normalizeTextUsageForPricing(usage);
	if (usageMeters) {
		const priced = computeBill(usageMeters, args.pricingCard);
		bill.cost_cents = priced.pricing.total_cents;
		bill.currency = priced.pricing.currency;
		bill.usage = priced;
	}

	return {
		kind: "completed",
		ir: ir ?? openAIChatToIR(rawResponse, args.requestId, args.ir.model, args.providerId),
		bill,
		upstream: res,
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
		mappedRequest,
		rawResponse,
		timing: {
			latencyMs: firstByteMs,
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
