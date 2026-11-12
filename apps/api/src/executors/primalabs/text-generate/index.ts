// Purpose: Executor for primalabs / text-generate.
// PrimaLabs' Kimi endpoints only accept some sampling values (https://docs.primalabs.ai/inference/models).
// Those limits live on the route as `supported_values`, so the gateway drops and reports anything else
// (X-Phaseo-Dropped-Params, reason value_not_supported) before this executor runs.
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
