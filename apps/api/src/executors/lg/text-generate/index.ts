// Purpose: Executor for lg / text-generate (LG AI Research EXAONE API Platform).
// K-EXAONE always thinks and takes reasoning_effort low, high or max; the mapping lives in
// openai-compat/reasoning.ts (https://docs.exaone.ai/en/docs/k-exaone-2.5).
import type { IRChatRequest } from "@core/ir";
import { executeOpenAIWire } from "@executors/_shared/text-generate/openai-compat";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
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
	postprocess: (ir: any) => ir,
	transformStream: (stream: ReadableStream<Uint8Array>) => stream,
});
