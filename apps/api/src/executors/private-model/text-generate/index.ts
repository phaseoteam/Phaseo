// Purpose: Execute workspace-owned OpenAI-compatible private models.
// Why: Private endpoints need the normal text pipeline without entering the public provider registry.
// How: Uses the shared OpenAI wire implementation with request-scoped endpoint and credential data.

import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { executeOpenAIWire } from "@executors/_shared/text-generate/openai-compat";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";
import type { ProviderExecutor } from "../../types";

export function preprocess(ir: IRChatRequest, args: ExecutorExecuteArgs): IRChatRequest {
	return cherryPickIRParams(ir, args.capabilityParams);
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	if (!args.privateEndpoint) throw new Error("private_model_endpoint_missing");
	return executeOpenAIWire(args, {
		forceChat: !args.privateEndpoint.supportsResponses,
		transientRetries: 1,
	});
}

export const executor: ProviderExecutor = buildTextExecutor({
	preprocess,
	execute,
	postprocess: (ir) => ir,
	transformStream: (stream) => stream,
});
