// Purpose: Executor for perplexity / text-generate.
// Why: Isolates provider-specific behavior per capability.
// How: Transforms IR and calls the provider API for this capability.

// Perplexity AI Executor - OpenAI Compatible
// Documentation: https://docs.perplexity.ai/api-reference/chat-completions-post

import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { executeOpenAICompat } from "@executors/_shared/text-generate/openai-compat";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";
import type { ProviderExecutor } from "../../types";

export function preprocess(ir: IRChatRequest, args: ExecutorExecuteArgs): IRChatRequest {
	return cherryPickIRParams(ir, args.capabilityParams);
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	return executeOpenAICompat(args);
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


