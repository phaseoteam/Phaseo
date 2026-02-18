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
	normalizeOpenAIToolChoice,
	normalizeResponseFormat,
	resolveServiceTierFromSpeedAndTier,
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
	const metadata = req.user
		? { ...(metadataFromRequest ?? {}), user: req.user }
		: metadataFromRequest;
	// Transform messages
	const messages: IRMessage[] = [];

	// Handle top-level system field (convenience field)
	if (req.system) {
		messages.push({
			role: "system",
			content: normalizeOpenAIContent(req.system),
		});
	}

	// Transform message array
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
			// Tool result message
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

	// Transform tools
	const tools: IRTool[] | undefined = req.tools?.map((t: any) => ({
		name: t.function?.name || t.name,
		description: t.function?.description || t.description,
		parameters: t.function?.parameters || t.parameters || {},
	}));

	// Transform tool choice
	const toolChoice = normalizeOpenAIToolChoice(req.tool_choice, {
		unknownStringFallback: "auto",
	});

	// Build IR request
	return {
		messages,
		model: req.model,
		stream: req.stream ?? false,

		// Generation parameters
		maxTokens: (req as any).max_completion_tokens ?? req.max_tokens ?? req.max_output_tokens,
		temperature: req.temperature,
		topP: req.top_p,
		topK: req.top_k,
		seed: req.seed,

		// Tool calling
		tools,
		toolChoice,
		parallelToolCalls: req.parallel_tool_calls,
		maxToolCalls: (req as any).max_tool_calls,

		// Reasoning
		reasoning: req.reasoning
			? {
				effort: req.reasoning.effort,
				summary: req.reasoning.summary as any,
				enabled: (req.reasoning as any).enabled,
				maxTokens: (req.reasoning as any).max_tokens,
			}
			: undefined,

		// Response format
		responseFormat: normalizeResponseFormat(req.response_format),
		modalities: Array.isArray((req as any).modalities) ? (req as any).modalities : undefined,
		imageConfig: normalizeImageConfig((req as any).image_config),

		// Advanced parameters
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
		safetyIdentifier: (req as any).safety_identifier,

		// Metadata
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

