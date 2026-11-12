// Purpose: Executor for fireworks / text-generate.
// Why: Isolates provider-specific behavior per capability.
// How: Transforms IR and calls the provider API for this capability.

// Fireworks AI Executor - OpenAI Compatible
// Documentation: https://docs.fireworks.ai/tools-sdks/openai-compatibility

import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { executeOpenAIWire } from "@executors/_shared/text-generate/openai-compat";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";
import type { ProviderExecutor } from "../../types";

export function preprocess(ir: IRChatRequest, args: ExecutorExecuteArgs): IRChatRequest {
	return cherryPickIRParams(ir, args.capabilityParams);
}

/**
 * Fireworks documents cached usage (usage.prompt_tokens_details.cached_tokens) and
 * prompt_cache_key affinity on Chat Completions only. Its Responses API documents
 * neither, and stores responses by default. Use Responses only for features that
 * need it: stored state (previous_response_id, conversation, store: true) and
 * non-function tools such as remote MCP.
 * https://docs.fireworks.ai/api-reference/post-chatcompletions
 * https://docs.fireworks.ai/api-reference/post-responses
 */
export function fireworksNeedsResponses(ir: IRChatRequest): boolean {
	if (ir.previousResponseId || ir.conversation || ir.store === true) return true;
	return (ir.tools ?? []).some((tool) => typeof tool?.type === "string" && tool.type !== "function");
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	return executeOpenAIWire(args, {
		transientRetries: 1,
		forceChat: !fireworksNeedsResponses(args.ir as IRChatRequest),
	});
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


