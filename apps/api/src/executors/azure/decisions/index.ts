// Microsoft Foundry decision scoring uses the existing typed-question IR.
import type { IRDecisionsRequest } from "@core/ir";
import type { ProviderExecutor } from "@executors/types";
import { completeSystemOne } from "@executors/_shared/decisions/systemone";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { azureDecisionsUrl, azureHeaders, resolveAzureConfig, resolveAzureCredential } from "@providers/azure/config";
import { upstreamTestHeaders } from "@providers/shared/testing";

export const executor: ProviderExecutor = async args => {
	const ir = args.ir as IRDecisionsRequest;
	const raw = ir.rawRequest;
	const parts = Array.isArray(ir.state) ? ir.state : [ir.state];
	if (ir.images?.length || ir.audio?.length || ir.videos?.length ||
		parts.some(part => part && typeof part === "object" && part.type === "image_url") ||
		raw?.stream === true || raw?.tools != null || raw?.tool_choice != null ||
		raw?.safety_identifier != null || ir.decisionContext?.safety_identifier != null ||
		raw?.service_tier != null) {
		return {
			kind: "completed", terminal: true, localClientError: true,
			upstream: Response.json({ error: "unsupported_decision_request",
				message: "Microsoft Decision accepts text and JSON evidence only; media, streaming, tools, safety_identifier, and service_tier are unsupported.",
				request_id: args.requestId }, { status: 400 }),
			bill: { cost_cents: 0, currency: "USD" },
		};
	}
	const credentialArgs = {
		providerId: args.providerId, byokMeta: args.byokMeta, model: ir.model,
		providerModelSlug: args.providerModelSlug, forceGatewayKey: args.meta.forceGatewayKey,
	};
	const config = resolveAzureConfig(credentialArgs);
	const keyInfo = resolveAzureCredential(credentialArgs);
	const body = JSON.stringify({
		model: config.deployment || args.providerModelSlug || ir.model,
		state: ir.state, questions: ir.questions,
	});
	const upstream = await fetchUpstream(args, azureDecisionsUrl(config.baseUrl), {
		method: "POST",
		headers: { ...azureHeaders(keyInfo.key, keyInfo.authType), ...upstreamTestHeaders(args.meta) },
		body,
	});
	return completeSystemOne(args, upstream, keyInfo,
		args.meta.returnUpstreamRequest || args.meta.echoUpstreamRequest ? body : undefined);
};
