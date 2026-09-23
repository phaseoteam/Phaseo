// Purpose: Executor for novitaai / text-generate.
// Why: Isolates provider-specific behavior per capability.
// How: Transforms IR and calls the provider API for this capability.

// NovitaAI Executor - OpenAI Compatible
// Documentation: https://docs.novita.ai/

import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { executeOpenAIWire } from "@executors/_shared/text-generate/openai-compat";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";
import { withNovitaError } from "@executors/novita/error-mapping";
import type { ProviderExecutor } from "../../types";

export function preprocess(ir: IRChatRequest, args: ExecutorExecuteArgs): IRChatRequest {
	return cherryPickIRParams(ir, args.capabilityParams);
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const model = (args.providerModelSlug?.trim() || args.ir.model).toLowerCase();
	const emptyDoneBehavior = model === "mindai/macaron-v1-tall" || model === "mindai/macaron-v1-venti"
		? "length"
		: undefined;
	return withNovitaError(await executeOpenAIWire(args, { emptyDoneBehavior }), args.ir.model);
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
