// Purpose: Protocol adapter for client-facing payloads.
// Why: Keeps protocol encoding/decoding separate from provider logic.
// How: Maps between protocol payloads and IR structures.

// OpenAI Responses Protocol - Decoder
// Transforms OpenAI Responses Request -> IR

import type {
	IRChatRequest,
	IRMessage,
	IRContentPart,
	IRTool,
	IRReasoning,
} from "@core/ir";
import type { ResponsesRequest } from "@core/schemas";
import { decodeOpenAIChatRequest } from "../openai-chat/decode";
import { normalizeOpenAIContent } from "../shared/normalizeContent";
import {
	normalizeImageConfig,
	normalizeOpenAIToolChoice,
	normalizeResponseFormat,
	resolveServiceTierFromSpeedAndTier,
} from "../shared/text-normalizers";

/**
 * Decode OpenAI Responses request to IR format
 *
 * OpenAI Responses API uses `input` which can be:
 * - A string (simple text, equivalent to user message)
 * - An array of InputItem objects (messages, function calls, etc.)
 *
 * @param req - OpenAI Responses request
 * @returns IR chat request
 */
export function decodeOpenAIResponsesRequest(req: ResponsesRequest): IRChatRequest {
	const messages: IRMessage[] = [];
	const input = (req as any).input_items ?? req.input;
	const pendingUserParts: IRContentPart[] = [];
	const metadataFromRequest = req.metadata ? { ...req.metadata } : undefined;
	const metadata = (req as any).user
		? { ...(metadataFromRequest ?? {}), user: (req as any).user }
		: metadataFromRequest;

	// Handle instructions as a system message (string or content-like object/array).
	const instructions = (req as any).instructions;
	if (instructions != null) {
		messages.push({
			role: "system",
			content: normalizeOpenAIContent(instructions),
		});
	}

	// Process input
	const flushPendingUserParts = () => {
		if (pendingUserParts.length > 0) {
			messages.push({
				role: "user",
				content: [...pendingUserParts],
			});
			pendingUserParts.length = 0;
		}
	};

	if (input) {
		// Simple string input = user message
		if (typeof input === "string") {
			messages.push({
				role: "user",
				content: normalizeOpenAIContent(input),
			});
		}
		// Array of input items
		else if (Array.isArray(input)) {
			for (const item of input) {
				// Input parts (Responses API)
				if (item?.type === "input_text" || item?.type === "input_image" || item?.type === "input_audio" || item?.type === "input_video") {
					const parts = normalizeOpenAIContent([item]);
					if (parts.length > 0) {
						pendingUserParts.push(...parts);
					}
					continue;
				}

				// Message item
				if (item.type === "message" || (!item.type && item.role && "content" in item)) {
					flushPendingUserParts();
					const content = normalizeOpenAIContent(item.content ?? "");

					if (item.role === "user" || item.role === "system" || item.role === "developer") {
						messages.push({
							role: item.role,
							content,
						});
					} else if (item.role === "assistant") {
						messages.push({
							role: "assistant",
							content,
							toolCalls: Array.isArray(item.tool_calls)
								? item.tool_calls.map((tc: any) => ({
									id: tc.id,
									name: tc.function?.name || tc.name,
									arguments: tc.function?.arguments || tc.arguments || "{}",
								}))
								: undefined,
						});
					} else if (item.role === "tool" && item.tool_call_id) {
						messages.push({
							role: "tool",
							toolResults: [
								{
									toolCallId: item.tool_call_id,
									content: typeof item.content === "string"
										? item.content
										: JSON.stringify(item.content),
								},
							],
						});
					}
				}
				// Fallback: accept Chat Completions-style requests sent to /responses
				else if (Array.isArray((req as any).messages)) {
					flushPendingUserParts();
					return decodeOpenAIChatRequest(req as any);
				}
				// Function call item (assistant tool call)
				else if (item.type === "function_call") {
					flushPendingUserParts();
					// Find or create assistant message for this tool call
					let lastAssistant = messages[messages.length - 1];
					if (!lastAssistant || lastAssistant.role !== "assistant") {
						lastAssistant = {
							role: "assistant",
							content: [],
							toolCalls: [],
						};
						messages.push(lastAssistant);
					}

					if (!lastAssistant.toolCalls) {
						lastAssistant.toolCalls = [];
					}

					lastAssistant.toolCalls.push({
						id: item.call_id || `call_${Date.now()}`,
						name: item.name,
						arguments: item.arguments || "{}",
					});
				}
				// Function call output (tool result)
				else if (item.type === "function_call_output") {
					flushPendingUserParts();
					// Create tool result message
					messages.push({
						role: "tool",
						toolResults: [
							{
								toolCallId: item.call_id,
								content: typeof item.output === "string"
									? item.output
									: item.output == null
										? ""
										: JSON.stringify(item.output),
							},
						],
					});
				}
			}

			flushPendingUserParts();
		}
	}

	// Transform tools
	const tools: IRTool[] | undefined = req.tools?.map((t: any) => ({
		name: t.name || t.function?.name,
		description: t.description || t.function?.description,
		parameters: t.parameters || t.function?.parameters || {},
	}));

	// Transform tool choice
	const toolChoice = normalizeOpenAIToolChoice(req.tool_choice);

	// Transform reasoning
	let reasoning: IRReasoning | undefined = undefined;
	if (req.reasoning) {
		reasoning = {
			effort: req.reasoning.effort || "medium",
			summary: req.reasoning.summary || undefined,
			enabled: (req.reasoning as any).enabled ?? undefined,
			maxTokens: (req.reasoning as any).max_tokens ?? undefined,
		};
	}

	return {
		messages,
		model: req.model,
		stream: req.stream ?? false,

		// Generation parameters
		maxTokens: (req as any).max_output_tokens ?? (req as any).max_completion_tokens ?? (req as any).max_tokens,
		temperature: req.temperature,
		topP: req.top_p,
		topK: (req as any).top_k,
		seed: (req as any).seed,

		// Tool calling
		tools,
		toolChoice,
		parallelToolCalls: req.parallel_tool_calls,
		maxToolCalls: (req as any).max_tool_calls ?? (req as any).max_tools_calls,

		// Reasoning
		reasoning,

		// Response format
		responseFormat: normalizeResponseFormat((req as any).response_format ?? (req as any).text?.format),

		// Advanced parameters
		frequencyPenalty: (req as any).frequency_penalty,
		presencePenalty: (req as any).presence_penalty,
		logitBias: (req as any).logit_bias,
		logprobs: (req as any).logprobs,
		topLogprobs: (req as any).top_logprobs,
		stop: (req as any).stop,
		streamOptions: (req as any).stream_options,
		store: (req as any).store,
		truncation: (req as any).truncation,
		include: (req as any).include,
		conversation: (req as any).conversation,
		previousResponseId: (req as any).previous_response_id,
		prompt: (req as any).prompt,
		metadata,
		background: (req as any).background,
		speed: typeof (req as any).speed === "string" ? (req as any).speed : undefined,
		serviceTier: resolveServiceTierFromSpeedAndTier({
			service_tier: (req as any).service_tier,
			speed: (req as any).speed,
		}),
		userId: (req as any).user,
		promptCacheKey: (req as any).prompt_cache_key,
		safetyIdentifier: (req as any).safety_identifier,
		modalities: Array.isArray((req as any).modalities) ? (req as any).modalities : undefined,
		imageConfig: normalizeImageConfig((req as any).image_config),
	};
}

