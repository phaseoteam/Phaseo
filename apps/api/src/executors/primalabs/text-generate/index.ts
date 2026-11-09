// Purpose: Executor for primalabs / text-generate.
import type { IRChatRequest } from "@core/ir";
import { executeOpenAIWire } from "@executors/_shared/text-generate/openai-compat";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import type { ProviderExecutor } from "../../types";

// PrimaLabs serves Kimi models to Moonshot's Kimi Vendor Verifier: temperature must be 0, 0.6 or 1,
// top_p 0.95 and both penalties 0; any other value is a 400 (https://docs.primalabs.ai/inference/models).
// Unsupported values are dropped so the provider defaults (1.0, 0.95, 0) apply.
const KIMI_ALLOWED_TEMPERATURES = new Set([0, 0.6, 1]);

function isKimiModel(slug: string | null | undefined): boolean {
	return /(^|\/)kimi-/i.test(slug ?? "");
}

export function preprocess(ir: IRChatRequest, args: ExecutorExecuteArgs): IRChatRequest {
	const next = cherryPickIRParams(ir, args.capabilityParams);
	if (isKimiModel(args.providerModelSlug)) {
		if (next.temperature !== undefined && !KIMI_ALLOWED_TEMPERATURES.has(next.temperature)) delete next.temperature;
		if (next.topP !== undefined && next.topP !== 0.95) delete next.topP;
		if (next.frequencyPenalty !== undefined && next.frequencyPenalty !== 0) delete next.frequencyPenalty;
		if (next.presencePenalty !== undefined && next.presencePenalty !== 0) delete next.presencePenalty;
	}
	return next;
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
