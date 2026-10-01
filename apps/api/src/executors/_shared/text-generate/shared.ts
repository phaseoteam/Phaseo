// Shared text.generate helpers
// Purpose: Common preprocessing and adapter hooks for text executors.
// Why: Keeps provider executors small and consistent across openai-compat and native adapters.
// How: Filters IR params and applies pre/post hooks around the executor call.

import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, ProviderExecutor } from "@executors/types";

export type TextGenerateAdapterHooks = {
	preprocessIR?: (ir: IRChatRequest, args: ExecutorExecuteArgs) => IRChatRequest;
	postprocessIR?: (ir: any, args: ExecutorExecuteArgs) => any;
	transformStream?: (stream: ReadableStream<Uint8Array>, args: ExecutorExecuteArgs) => ReadableStream<Uint8Array>;
};

export function cherryPickIRParams(
	ir: IRChatRequest,
	capabilityParams?: Record<string, any> | null,
): IRChatRequest {
	const rawAllowlist =
		capabilityParams?.request?.allowlist ??
		capabilityParams?.request?.params ??
		capabilityParams?.params;
	let allowlist: string[] = [];
	if (Array.isArray(rawAllowlist)) {
		allowlist = rawAllowlist.filter((entry) => typeof entry === "string");
	} else if (rawAllowlist && typeof rawAllowlist === "object") {
		for (const [key, value] of Object.entries(rawAllowlist)) {
			if (key === "reasoning" && value && typeof value === "object" && !Array.isArray(value)) {
				for (const subKey of Object.keys(value)) {
					allowlist.push(`reasoning.${subKey}`);
				}
				continue;
			}
			allowlist.push(key);
		}
	}
	if (allowlist.length === 0) return ir;

	const next: IRChatRequest = {
		messages: ir.messages,
		model: ir.model,
		stream: ir.stream,
		// These carry validated adapter options and request context, not sampling params.
		vendor: ir.vendor,
		geo: ir.geo,
		rawRequest: ir.rawRequest,
		anthropicCacheControl: ir.anthropicCacheControl,
		googleCachedContent: ir.googleCachedContent,
		xaiConversationId: ir.xaiConversationId,
		promptCacheOptions: ir.promptCacheOptions,
		// Reasoning is normalized by the provider adapter as a complete configuration.
		reasoning: ir.reasoning,
	};

	let responseFormat: IRChatRequest["responseFormat"] | undefined = undefined;

	for (const entry of allowlist) {
		if (typeof entry !== "string") continue;
		if (entry.includes(".")) {
			const [root] = entry.split(".", 2);
			if (root === "responseFormat" || root === "response_format") {
				responseFormat = ir.responseFormat;
			}
			if (root === "text" && entry === "text.verbosity") next.textVerbosity = ir.textVerbosity;
			if (entry === "text.format" || entry.startsWith("text.format.")) responseFormat = ir.responseFormat;
			if (root === "audio") next.audioConfig = ir.audioConfig;
			continue;
		}
		const mappedKey = (() => {
			switch (entry) {
				case "max_tokens":
				case "max_output_tokens":
				case "max_completion_tokens":
					return "maxTokens";
				case "temperature":
					return "temperature";
				case "top_p":
					return "topP";
				case "top_k":
					return "topK";
				case "min_p":
					return "minP";
				case "seed":
					return "seed";
				case "stop":
					return "stop";
				case "logit_bias":
					return "logitBias";
				case "logprobs":
					return "logprobs";
				case "top_logprobs":
					return "topLogprobs";
				case "frequency_penalty":
					return "frequencyPenalty";
				case "presence_penalty":
					return "presencePenalty";
				case "repetition_penalty":
					return "repetitionPenalty";
				case "tools":
					return "tools";
				case "tool_choice":
					return "toolChoice";
				case "parallel_tool_calls":
					return "parallelToolCalls";
				case "max_tool_calls":
					return "maxToolCalls";
				case "response_format":
				case "structured_outputs":
					return "responseFormat";
				case "modalities":
					return "modalities";
				case "image_config":
					return "imageConfig";
				case "audio":
					return "audioConfig";
				case "verbosity":
					return "textVerbosity";
				case "web_search_options":
					return "webSearchOptions";
				case "context_management":
					return "contextManagement";
				case "cache_control":
					return "anthropicCacheControl";
				case "cached_content":
					return "googleCachedContent";
				case "prompt_cache_options":
					return "promptCacheOptions";
				case "stream_options":
					return "streamOptions";
				case "store":
					return "store";
				case "truncation":
					return "truncation";
				case "include":
					return "include";
				case "conversation":
					return "conversation";
				case "previous_response_id":
					return "previousResponseId";
				case "prompt":
					return "prompt";
				case "background":
					return "background";
				case "service_tier":
					return "serviceTier";
				case "prompt_cache_key":
					return "promptCacheKey";
				case "prompt_cache_retention":
					return "promptCacheRetention";
				case "safety_identifier":
					return "safetyIdentifier";
				case "user":
				case "user_id":
					return "userId";
				default:
					return entry;
			}
		})();

		if (mappedKey in ir) {
			(next as any)[mappedKey] = (ir as any)[mappedKey];
		}
	}

	if (responseFormat) {
		next.responseFormat = responseFormat;
	}

	return next;
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
