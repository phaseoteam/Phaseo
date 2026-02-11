// Purpose: Protocol adapter for client-facing payloads.
// Why: Keeps protocol encoding/decoding separate from provider logic.
// How: Maps between protocol payloads and IR structures.

// OpenAI Chat Completions Protocol - Decoder
// Transforms OpenAI Chat Completions Request -> IR

import type { ChatCompletionsRequest } from "@core/schemas";
import type {
	IRChatRequest,
	IRMessage,
	IRToolCall,
	IRToolResult,
	IRTool,
	IRToolChoice,
} from "@core/ir";
import { normalizeOpenAIContent } from "../shared/normalizeContent";

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
		const normalizedRole =
			msgAny.role === "developer" ? "system" : msgAny.role;

		if (normalizedRole === "system" || normalizedRole === "user") {
			messages.push({
				role: normalizedRole,
				content: normalizeOpenAIContent(msgAny.content),
			});
		} else if (normalizedRole === "assistant") {
			messages.push({
				role: "assistant",
				content: normalizeOpenAIContent(msgAny.content || ""),
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
	const toolChoice = normalizeToolChoice(req.tool_choice);

	// Build IR request
	return {
		messages,
		model: req.model,
		stream: req.stream ?? false,

		// Generation parameters
		maxTokens: req.max_tokens ?? req.max_output_tokens,
		temperature: req.temperature,
		topP: req.top_p,
		topK: req.top_k,
		seed: req.seed,

		// Tool calling
		tools,
		toolChoice,
		parallelToolCalls: req.parallel_tool_calls,

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

		// Advanced parameters
		frequencyPenalty: req.frequency_penalty,
		presencePenalty: req.presence_penalty,
		logitBias: req.logit_bias,
		logprobs: req.logprobs,
		topLogprobs: req.top_logprobs,
		stop: reqAny.stop,
		speed: typeof (req as any).speed === "string" ? (req as any).speed : undefined,
		serviceTier: resolveRequestedServiceTier({
			service_tier: (req as any).service_tier,
			speed: (req as any).speed,
		}),

		// Metadata
		userId: req.user_id ?? req.user,
		metadata: req.user ? { user: req.user } : undefined,
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

/**
 * Normalize tool choice to IR format
 */
function normalizeToolChoice(choice: any): IRToolChoice | undefined {
	if (!choice) return undefined;

	if (typeof choice === "string") {
		if (choice === "auto") return "auto";
		if (choice === "none") return "none";
		if (choice === "required") return "required";
		return "auto"; // Default fallback
	}

	if (typeof choice === "object") {
		// OpenAI format: {type: "function", function: {name: "foo"}}
		if (choice.type === "function" && choice.function?.name) {
			return { name: choice.function.name };
		}
		// Direct name format: {name: "foo"}
		if (choice.name) {
			return { name: choice.name };
		}
	}

	return undefined;
}

/**
 * Normalize response format to IR
 */
function normalizeResponseFormat(format: any): IRChatRequest["responseFormat"] {
	if (!format) return undefined;

	// String format (legacy)
	if (typeof format === "string") {
		if (format === "json_object" || format === "json") {
			return { type: "json_object" };
		}
		return { type: "text" };
	}

	// Object format
	if (typeof format === "object") {
		if (format.type === "json_object" || format.type === "json") {
			return {
				type: "json_object",
				schema: format.schema,
			};
		}

		if (format.type === "json_schema") {
			return {
				type: "json_schema",
				schema: format.schema || format.json_schema?.schema || format.json_schema?.schema_,
				name: format.name || format.json_schema?.name,
				strict: format.strict || format.json_schema?.strict,
			};
		}

		return { type: "text" };
	}

	return undefined;
}

function resolveRequestedServiceTier(input: {
	service_tier?: unknown;
	speed?: unknown;
}): string | undefined {
	const speed = typeof input.speed === "string" ? input.speed.toLowerCase() : undefined;
	if (speed === "fast") return "priority";
	return typeof input.service_tier === "string" ? input.service_tier : undefined;
}

