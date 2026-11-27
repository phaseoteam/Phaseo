// Purpose: Executor for prime-intellect / text-generate.
// Why: Keeps the prime-intellect OpenAI-compatible gateway route provider-local.
// How: Uses the shared OpenAI wire executor and standard IR parameter handling;
// responses and streams pass through unchanged.

import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { executeOpenAIWire } from "@executors/_shared/text-generate/openai-compat";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";
import type { ProviderExecutor } from "../../types";

export function preprocess(ir: IRChatRequest, args: ExecutorExecuteArgs): IRChatRequest {
	return cherryPickIRParams(ir, args.capabilityParams);
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	return executeOpenAIWire(args);
}

export const executor: ProviderExecutor = buildTextExecutor({
	preprocess,
	execute,
	postprocess: <T>(ir: T): T => ir,
	transformStream: (stream: ReadableStream<Uint8Array>) => stream,
});
