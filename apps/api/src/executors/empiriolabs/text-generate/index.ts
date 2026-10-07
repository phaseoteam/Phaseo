import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { executeOpenAIWire } from "@executors/_shared/text-generate/openai-compat";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";
import type { ProviderExecutor } from "../../types";

export function preprocess(ir: IRChatRequest, args: ExecutorExecuteArgs): IRChatRequest {
	return cherryPickIRParams(ir, args.capabilityParams);
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const model = args.providerModelSlug?.trim() || args.ir.model;
	const unpricedResearch = /^(?:perplexity\/)?perplexity-(?:advanced-)?deep-research$/.test(model);
	const unpricedTools = args.ir.webSearchOptions !== undefined
		|| args.ir.rawRequest?.web_search_options !== undefined
		|| args.ir.tools?.some((tool: { type?: string }) => tool.type && tool.type !== "function" && tool.type !== "custom")
		|| Object.entries(args.ir.rawRequest ?? {}).some(([key, value]) =>
			/^tool_(web_search|web_extractor|code_interpreter|image_search)|^web_search_force$/.test(key) && value === true);
	if (unpricedResearch || unpricedTools) {
		return { kind: "completed", terminal: true, localClientError: true,
			upstream: Response.json({ error: "unsupported_provider_feature", message: "EmpirioLabs paid built-in tools and research models are unavailable until their pricing is configured.", request_id: args.requestId }, { status: 400 }),
			bill: { cost_cents: 0, currency: "USD" } };
	}
	return executeOpenAIWire(args, {
		forceChat: args.endpoint !== "responses",
		useClientStreamingMode: true,
	});
}

export const executor: ProviderExecutor = buildTextExecutor({
	preprocess,
	execute,
	postprocess: (ir) => ir,
	transformStream: (stream) => stream,
});
