// Purpose: Protocol adapter for client-facing payloads.
// Why: Keeps protocol encoding/decoding separate from provider logic.
// How: Maps between protocol payloads and IR structures.

// OpenAI Chat Completions Protocol - Decoder
// Transforms OpenAI Chat Completions Request -> IR

import type { ChatCompletionsRequest } from "@core/schemas";
import type {
	IRChatRequest,
	IRContentPart,
	IRMessage,
	IRToolCall,
	IRToolResult,
	IRTool,
} from "@core/ir";
import { normalizeOpenAIContent } from "../shared/normalizeContent";
import {
	normalizeImageConfig,
	normalizeModalities,
	normalizeThinkingConfig,
	normalizeOpenAIToolChoice,
	normalizeResponseFormat,
	resolveServiceTierFromSpeedAndTier,
	normalizeProviderCacheOptions,
} from "../shared/text-normalizers";

/**
 * Decode OpenAI Chat Completions request to IR format
 *
 * Handles:
 * - Messages with multimodal content (text, images, audio, video)
 * - Tool calling (tools[], tool_calls[], tool results)
 * - All generation parameters
 * - Reasoning configuration
 *
 * @param req - Validated OpenAI Chat Completions request
 * @returns IR chat request
 */
export function decodeOpenAIChatRequest(req: ChatCompletionsRequest): IRChatRequest {
	const reqAny = req as any;
	const metadataFromRequest = req.metadata ? { ...req.metadata } : undefined;
	const providerCacheOptions = normalizeProviderCacheOptions(req as any);
	const metadata = req.user
		? { ...(metadataFromRequest ?? {}), user: req.user }
		: metadataFromRequest;
	const messages: IRMessage[] = [];

	if (reqAny.system) {
		messages.push({
			role: "system",
			content: normalizeOpenAIContent(reqAny.system),
		});
	}

	for (const msgAny of req.messages as Array<any>) {
		const normalizedRole = msgAny.role;

		if (normalizedRole === "system" || normalizedRole === "developer" || normalizedRole === "user") {
			messages.push({
				role: normalizedRole,
				content: normalizeOpenAIContent(msgAny.content),
			});
		} else if (normalizedRole === "assistant") {
			const assistantContent = normalizeOpenAIContent(msgAny.content || "");
			const reasoningContent = typeof msgAny.reasoning_content === "string" ? msgAny.reasoning_content : "";
			const content: IRContentPart[] = reasoningContent
				? [{ type: "reasoning_text", text: reasoningContent } as const, ...assistantContent]
				: assistantContent;

			messages.push({
				role: "assistant",
				content,
				toolCalls: Array.isArray(msgAny.tool_calls) ? msgAny.tool_calls.map(decodeToolCall) : undefined,
			});
		} else if (normalizedRole === "tool") {
			messages.push({
				role: "tool",
				toolResults: [
					{
						toolCallId: msgAny.tool_call_id,
						content: typeof msgAny.content === "string" ? msgAny.content : JSON.stringify(msgAny.content),
					},
				],
			});
		}
	}

	const tools: IRTool[] | undefined = req.tools?.map((t: any) => ({
		name: t.function?.name || t.name,
		description: t.function?.description || t.description,
		parameters: t.function?.parameters || t.parameters || {},
	}));

	const toolChoice = normalizeOpenAIToolChoice(req.tool_choice, {
		unknownStringFallback: "auto",
	});

	const reasoningFromRequest = req.reasoning
		? {
			effort: req.reasoning.effort,
			summary: req.reasoning.summary as any,
			enabled: req.reasoning.enabled,
			maxTokens: req.reasoning.max_tokens,
		}
		: undefined;
	const reasoningEffortAlias =
		typeof reqAny.reasoning_effort === "string" && reqAny.reasoning_effort.length > 0
			? reqAny.reasoning_effort
			: undefined;
	const reasoningSummaryAlias =
		typeof reqAny.reasoning_summary === "string" && reqAny.reasoning_summary.length > 0
			? reqAny.reasoning_summary
			: undefined;
	const reasoningFromThinking = normalizeThinkingConfig(reqAny.thinking);
	const reasoning = {
		...(reasoningFromThinking ?? {}),
		...(reasoningFromRequest ?? {}),
		...(reasoningEffortAlias !== undefined ? { effort: reasoningEffortAlias } : {}),
		...(reasoningSummaryAlias !== undefined ? { summary: reasoningSummaryAlias } : {}),
	};

	const hasInceptionVendorOptions =
		typeof reqAny.diffusing === "boolean" ||
		typeof reqAny.reasoning_summary_wait === "boolean" ||
		typeof reqAny.reasoning_summary_wait === "number";
	const vendor = hasInceptionVendorOptions
		? {
			inception: {
				...(typeof reqAny.diffusing === "boolean" ? { diffusing: reqAny.diffusing } : {}),
				...((typeof reqAny.reasoning_summary_wait === "boolean" || typeof reqAny.reasoning_summary_wait === "number")
					? { reasoning_summary_wait: reqAny.reasoning_summary_wait }
					: {}),
			},
		}
		: undefined;

	return {
		messages,
		model: req.model,
		stream: req.stream ?? false,
		maxTokens: (req as any).max_completion_tokens ?? req.max_tokens ?? req.max_output_tokens,
		temperature: req.temperature,
		topP: req.top_p,
		topK: (req as any).top_k,
		seed: req.seed,
		tools,
		toolChoice,
		parallelToolCalls: req.parallel_tool_calls,
		maxToolCalls: (req as any).max_tool_calls,
		reasoning:
			reasoning && Object.values(reasoning).some((value) => value !== undefined)
				? reasoning
				: undefined,
		responseFormat: normalizeResponseFormat(req.response_format),
		modalities: normalizeModalities((req as any).modalities ?? (req as any).response_modalities ?? (req as any).responseModalities),
		imageConfig: normalizeImageConfig((req as any).image_config ?? (req as any).imageConfig),
		frequencyPenalty: req.frequency_penalty,
		presencePenalty: req.presence_penalty,
		logitBias: req.logit_bias,
		logprobs: req.logprobs,
		topLogprobs: req.top_logprobs,
		stop: reqAny.stop,
		streamOptions: req.stream_options,
		background: (req as any).background,
		speed: typeof (req as any).speed === "string" ? (req as any).speed : undefined,
		serviceTier: resolveServiceTierFromSpeedAndTier({
			service_tier: (req as any).service_tier,
			speed: (req as any).speed,
		}),
		promptCacheKey: (req as any).prompt_cache_key,
		promptCacheRetention: providerCacheOptions.promptCacheRetention,
		anthropicCacheControl: providerCacheOptions.anthropicCacheControl,
		googleCachedContent: providerCacheOptions.googleCachedContent,
		xaiConversationId: providerCacheOptions.xaiConversationId,
		safetyIdentifier: (req as any).safety_identifier,
		vendor,
		userId: req.user_id ?? req.user,
		metadata,
	};
}

/**
 * Normalize content to IRContentPart[]
 * Handles both string and array content
 */
// normalizeOpenAIContent moved to shared helper for consistent IR conversion

/**
 * Decode tool call from OpenAI format to IR
 */
function decodeToolCall(tc: any): IRToolCall {
	return {
		id: tc.id,
		name: tc.function?.name || tc.name,
		arguments: tc.function?.arguments || tc.arguments || "{}",
	};
}


