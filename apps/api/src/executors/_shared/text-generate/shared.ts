// Shared text.generate helpers
// Purpose: Common preprocessing and adapter hooks for text executors.
// Why: Keeps provider executors small and consistent across openai-compat and native adapters.
// How: Applies pre/post hooks around the executor call.

import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, ProviderExecutor } from "@executors/types";

export type TextGenerateAdapterHooks = {
	preprocessIR?: (ir: IRChatRequest, args: ExecutorExecuteArgs) => IRChatRequest;
	postprocessIR?: (ir: any, args: ExecutorExecuteArgs) => any;
	transformStream?: (stream: ReadableStream<Uint8Array>, args: ExecutorExecuteArgs) => ReadableStream<Uint8Array>;
};

/**
 * Historical allowlist hook, kept as an identity function so the provider
 * executors that call it keep a single preprocessing seam.
 *
 * It used to filter the IR by `capabilityParams.request.allowlist`,
 * `capabilityParams.request.params` or `capabilityParams.params`. Production
 * never has those keys: routing normalises a route's catalogue parameters into
 * a keyed record such as `{ max_tokens: {}, temperature: {} }`
 * (`pipeline/before/schemas.ts`), so the filter never ran. Turning it on would
 * silently drop `tools`, `prompt_cache_key` and other fields on every route
 * whose catalogue list is incomplete. Parameter support is enforced during
 * routing instead (`pipeline/before/paramCapabilities.ts`), and provider
 * quirks strip fields an upstream really rejects.
 */
export function cherryPickIRParams(
	ir: IRChatRequest,
	_capabilityParams?: Record<string, any> | null,
): IRChatRequest {
	return ir;
}

export async function applyAdapterHooks(
	args: ExecutorExecuteArgs,
	execute: (nextArgs: ExecutorExecuteArgs) => Promise<ExecutorResult>,
	hooks?: TextGenerateAdapterHooks,
): Promise<ExecutorResult> {
	const ir = hooks?.preprocessIR ? hooks.preprocessIR(args.ir, args) : args.ir;
	const result = await execute({ ...args, ir });

	if (result.kind === "completed" && result.ir && hooks?.postprocessIR) {
		result.ir = hooks.postprocessIR(result.ir, args);
	}
	if (result.kind === "stream" && result.stream && !result.streamAlreadyTransformed && hooks?.transformStream) {
		result.stream = hooks.transformStream(result.stream, args);
	}

	return result;
}

export function buildTextExecutor(args: {
	preprocess: (ir: IRChatRequest, execArgs: ExecutorExecuteArgs) => IRChatRequest;
	execute: (execArgs: ExecutorExecuteArgs) => Promise<ExecutorResult>;
	postprocess: (ir: any, execArgs: ExecutorExecuteArgs) => any;
	transformStream: (stream: ReadableStream<Uint8Array>, execArgs: ExecutorExecuteArgs) => ReadableStream<Uint8Array>;
}): ProviderExecutor {
	return async (execArgs: ExecutorExecuteArgs) => {
		const processed = args.preprocess(execArgs.ir, execArgs);
		const result = await args.execute({ ...execArgs, ir: processed });

		if (result.kind === "completed" && result.ir) {
			result.ir = args.postprocess(result.ir, execArgs);
		}
		if (result.kind === "stream" && result.stream && !result.streamAlreadyTransformed) {
			result.stream = args.transformStream(result.stream, execArgs);
		}
		return result;
	};
}
