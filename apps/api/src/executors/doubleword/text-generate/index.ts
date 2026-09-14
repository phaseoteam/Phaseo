// Purpose: Executor for Doubleword text generation.
// Why: Keeps Doubleword-specific behavior behind an explicit provider boundary.
// How: Reuses the OpenAI-compatible IR transport for Chat Completions and Responses.

import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { executeOpenAIWire } from "@executors/_shared/text-generate/openai-compat";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";
import type { ProviderExecutor } from "../../types";

export function preprocess(ir: IRChatRequest, args: ExecutorExecuteArgs): IRChatRequest {
	return cherryPickIRParams(ir, args.capabilityParams);
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	// Doubleword does not document an idempotency key for realtime POSTs.
	// Do not retry an ambiguous transport failure after the upstream may have accepted it.
	return executeOpenAIWire(args);
}

export function postprocess(ir: IRChatRequest): IRChatRequest {
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
