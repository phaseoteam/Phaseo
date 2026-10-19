import type { IRChatRequest } from "@core/ir";
import { executeOpenAIWire } from "@executors/_shared/text-generate/openai-compat";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import type { ProviderExecutor } from "../../types";

const BALANCED_MODEL_SLUGS = new Set([
	"zai-org/GLM-5.2-FP8",
	"moonshotai/Kimi-K2.6",
	"google/gemma-4-31B-it",
	"nvidia/Gemma-4-31B-IT-NVFP4",
]);

const SAIL_RESERVED_METADATA_KEYS = ["supercache_write", "completion_webhook", "webhook_token", "completion_window"] as const;

export function preprocess(ir: IRChatRequest, args: ExecutorExecuteArgs): IRChatRequest {
	const next = cherryPickIRParams(ir, args.capabilityParams);
	{
		const requestedTier = next.serviceTier ?? "standard";
		const completionWindow = requestedTier === "flex"
			? "flex"
			: requestedTier === "standard" && BALANCED_MODEL_SLUGS.has(args.providerModelSlug ?? "")
				? "balanced"
				: "asap";
		// Sail reads control keys from metadata: supercache_write bills a prefix write at 100x
		// input (https://docs.sailresearch.com/supercache) and completion_webhook/webhook_token
		// send results to a URL. A client must not set them through the gateway.
		const clientMetadata = { ...(next.metadata ?? {}) } as Record<string, unknown>;
		for (const key of SAIL_RESERVED_METADATA_KEYS) delete clientMetadata[key];
		next.metadata = { ...clientMetadata, completion_window: completionWindow };
		delete next.serviceTier;
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
