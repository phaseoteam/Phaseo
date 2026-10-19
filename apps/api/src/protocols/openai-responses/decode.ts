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
	IRToolCall,
} from "@core/ir";
import type { ResponsesRequest } from "@core/schemas";
import { extractToolNameOrType, isOpenAINativeWebSearchTool } from "@core/nativeTools";
import { normalizeOpenAIContent, normalizePartCacheControl, normalizeToolResultContent } from "../shared/normalizeContent";
import { applyToolCallSignatures, decodeResponsesReasoningItem, type ToolCallSignature } from "../shared/reasoning";

/**
 * Deterministic id for a function call item that arrived without `call_id`.
 * It depends only on the item's position and content, so replaying the same
 * history produces the same upstream prefix (a timestamp never repeats).
 */
function deriveResponsesCallId(index: number, name: unknown, args: unknown): string {
	const seed = `${index}:${typeof name === "string" ? name : ""}:${typeof args === "string" ? args : JSON.stringify(args ?? null)}`;
	let hash = 0x811c9dc5;
	for (let i = 0; i < seed.length; i += 1) {
		hash ^= seed.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return `call_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
import {
	normalizeImageConfig,
	normalizeModalities,
	normalizeThinkingConfig,
	normalizeOpenAIToolChoice,
	normalizeProviderGeoPreferences,
	normalizeResponseFormat,
	resolveTextServiceTier,
	normalizeProviderCacheOptions,
} from "../shared/text-normalizers";

type OpenAIContextManagementConfig = {
	type: "compaction";
	compact_threshold?: number;
};

function normalizeOpenAIContextManagement(
	req: ResponsesRequest,
): OpenAIContextManagementConfig[] | undefined {
	const direct = (req as any).context_management;
	const openaiProviderOptions = (req as any).provider_options?.openai;
	const raw = direct ?? openaiProviderOptions?.context_management;
	const entries = Array.isArray(raw) ? raw : raw ? [raw] : [];
	const normalized = entries.flatMap((entry: any) => {
		if (!entry || typeof entry !== "object" || entry.type !== "compaction") return [];
		return [{
			type: "compaction" as const,
			...(typeof entry.compact_threshold === "number"
				? { compact_threshold: entry.compact_threshold }
				: {}),
		}];
	});
	return normalized.length > 0 ? normalized : undefined;
}

function isAllowedToolsChoice(value: unknown): value is Record<string, any> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value)
		&& (value as any).type === "allowed_tools");
}

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
	const input = req.input;
	const pendingUserParts: IRContentPart[] = [];
	// Gemini function-call signatures arrive in reasoning items next to their call
	// (before it in a buffered response, after it in a stream). Generated call ids
	// can repeat across turns, so a signature only binds to a call in its own turn.
	let turnSignatures = new Map<string, ToolCallSignature>();
	let turnCalls: IRToolCall[] = [];
	const bindTurnSignature = (callId: string, signature: ToolCallSignature) => {
		const call = turnCalls.find((candidate) => candidate.id === callId);
		if (call) applyToolCallSignatures([call], new Map([[callId, signature]]));
		else turnSignatures.set(callId, signature);
	};
	const endAssistantTurn = () => {
		turnSignatures = new Map();
		turnCalls = [];
	};
	const unanchoredReasoning: Array<{ owner: IRMessage; part: Extract<IRContentPart, { type: "reasoning_text" }> }> = [];
	const openAIContextManagement = normalizeOpenAIContextManagement(req);
	// `user` stays in `userId`; folding it into metadata sent an unknown
	// `metadata.user` key upstream (Anthropic rejects anything but user_id).
	const metadata = req.metadata ? { ...req.metadata } : undefined;
	const providerCacheOptions = normalizeProviderCacheOptions(req as any);

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
			for (const [itemIndex, item] of input.entries()) {
				const assistantItem = item?.type === "reasoning"
					|| item?.type === "function_call"
					|| item?.type === "custom_tool_call"
					|| ((item?.type === "message" || (!item?.type && item?.role)) && item?.role === "assistant");
				if (!assistantItem) endAssistantTurn();
				// Input parts (Responses API)
				if (item?.type === "input_text" || item?.type === "input_image" || item?.type === "input_audio" || item?.type === "input_video") {
					const parts = normalizeOpenAIContent([item]);
					if (parts.length > 0) {
						pendingUserParts.push(...parts);
					}
					continue;
				}

				// Reasoning item: attach it to the assistant turn it came from.
				if (item?.type === "reasoning") {
					flushPendingUserParts();
					const decoded = decodeResponsesReasoningItem(item);
					if (!decoded) continue;
					if (decoded.kind === "tool_signature") {
						bindTurnSignature(decoded.callId, decoded.signature);
						continue;
					}
					let lastAssistant = messages[messages.length - 1];
					if (!lastAssistant || lastAssistant.role !== "assistant") {
						lastAssistant = { role: "assistant", content: [], toolCalls: [] };
						messages.push(lastAssistant);
					}
					lastAssistant.content.push(decoded.part);
					// Reasoning after a call in the same turn precedes the next call.
					if ((lastAssistant.toolCalls?.length ?? 0) > 0) unanchoredReasoning.push({ owner: lastAssistant, part: decoded.part });
					continue;
				}

				// Message item
				if (item.type === "message" || (!item.type && item.role && "content" in item)) {
					flushPendingUserParts();
					const content = normalizeOpenAIContent(item.content ?? "");
					const previous = messages[messages.length - 1];

					if (item.role === "user" || item.role === "system" || item.role === "developer") {
						messages.push({
							role: item.role,
							content,
						});
					} else if (
						item.role === "assistant"
						&& previous?.role === "assistant"
						&& !(previous.toolCalls?.length)
						&& previous.content.length > 0
						&& !previous.content.some((part) => part.type !== "reasoning_text")
					) {
						// The message that follows its reasoning items is the same turn.
						previous.content.push(...content);
						if (item.phase !== undefined) previous.phase = item.phase;
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
							phase: item.phase ?? undefined,
						});
					} else if (item.role === "tool" && item.tool_call_id) {
						const toolResult = normalizeToolResultContent(item.content);
						messages.push({
							role: "tool",
							toolResults: [
								{
									toolCallId: item.tool_call_id,
									content: toolResult.content,
									...(toolResult.cacheControl ? { cacheControl: toolResult.cacheControl } : {}),
									...(toolResult.parts ? { parts: toolResult.parts } : {}),
								},
							],
						});
					}
				}
				// Function call item (assistant tool call)
				else if (item.type === "function_call" || item.type === "custom_tool_call") {
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

					const callId = item.call_id || deriveResponsesCallId(itemIndex, item.name, item.type === "custom_tool_call" ? item.input : item.arguments);
					const toolCall: IRToolCall = {
						id: callId,
						name: item.name,
						arguments: item.type === "custom_tool_call"
							? (item.input || "")
							: (item.arguments || "{}"),
						...(item.type === "custom_tool_call" ? { type: "custom" as const } : {}),
					};
					lastAssistant.toolCalls.push(toolCall);
					turnCalls.push(toolCall);
					applyToolCallSignatures([toolCall], turnSignatures);
					turnSignatures.delete(callId);
					for (const entry of unanchoredReasoning.splice(0)) {
						if (entry.owner === lastAssistant) entry.part.beforeToolCallId = callId;
					}
				}
				// Function call output (tool result)
				else if (item.type === "function_call_output" || item.type === "custom_tool_call_output") {
					flushPendingUserParts();
					// Create tool result message
					const toolResult = normalizeToolResultContent(item.output);
					messages.push({
						role: "tool",
						toolResults: [
							{
								toolCallId: item.call_id,
								content: toolResult.content,
								...(toolResult.cacheControl ? { cacheControl: toolResult.cacheControl } : {}),
								...(toolResult.parts ? { parts: toolResult.parts } : {}),
								...(item.type === "custom_tool_call_output" ? { type: "custom" as const } : {}),
							},
						],
					});
				}
			}

			flushPendingUserParts();
		}
	}

	// Transform tools
	const tools: IRTool[] | undefined = req.tools?.map(decodeOpenAITool);

	// Transform tool choice
	const toolChoice = normalizeOpenAIToolChoice(req.tool_choice);
	const rawOpenAIToolChoice = isAllowedToolsChoice(req.tool_choice)
		? { ...(req.tool_choice as Record<string, any>) }
		: undefined;

	// Transform reasoning
	const reasoningCandidate: IRReasoning | undefined = req.reasoning
		? {
			effort: req.reasoning.effort,
			mode: req.reasoning.mode ?? undefined,
			summary: req.reasoning.summary || undefined,
			context: req.reasoning.context ?? undefined,
			enabled: req.reasoning.enabled ?? undefined,
			maxTokens: req.reasoning.max_tokens ?? undefined,
		}
		: undefined;
	const reasoningFromThinking = normalizeThinkingConfig((req as any).thinking);
	const mergedReasoningCandidate = {
		...(reasoningFromThinking ?? {}),
		...(reasoningCandidate ?? {}),
	};
	const normalizedReasoningCandidate = Object.values(mergedReasoningCandidate).some((value) => value !== undefined)
		? mergedReasoningCandidate
		: undefined;
	const supportsTopLevelReasoningEffort = /^(?:aion-labs|meta)\//i.test(String(req.model ?? ""));
	const reasoningEffortAlias = supportsTopLevelReasoningEffort && typeof (req as any).reasoning_effort === "string"
		? (req as any).reasoning_effort
		: undefined;
	const reasoning: IRReasoning | undefined = normalizedReasoningCandidate || reasoningEffortAlias
		? {
			...(normalizedReasoningCandidate ?? {}),
			...(reasoningEffortAlias !== undefined ? { effort: reasoningEffortAlias } : {}),
		}
		: undefined;
	const vendor = {
		...(openAIContextManagement
			? {
				openai: {
					context_management: openAIContextManagement,
					...(rawOpenAIToolChoice ? { tool_choice: rawOpenAIToolChoice } : {}),
				},
			}
			: rawOpenAIToolChoice ? { openai: { tool_choice: rawOpenAIToolChoice } } : {}),
		...(((req as any).venice_parameters ?? (req as any).provider_options?.venice)
			&& typeof ((req as any).venice_parameters ?? (req as any).provider_options?.venice) === "object"
			? { venice: { ...((req as any).venice_parameters ?? (req as any).provider_options.venice) } }
			: {}),
	};

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
		webSearchOptions: (req as any).web_search_options ?? (req as any).webSearchOptions,
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
		metadata,
		background: (req as any).background,
		serviceTier: resolveTextServiceTier({
			service_tier: (req as any).service_tier,
		}),
		geo: normalizeProviderGeoPreferences(req as any),
		userId: (req as any).user,
		promptCacheKey: (req as any).prompt_cache_key,
		promptCacheRetention: providerCacheOptions.promptCacheRetention,
		promptCacheOptions: (req as any).prompt_cache_options
			?? (req as any).provider_options?.openai?.prompt_cache_options,
		textVerbosity: (req as any).text?.verbosity,
		contextManagement: openAIContextManagement,
		anthropicCacheControl: providerCacheOptions.anthropicCacheControl,
		googleCachedContent: providerCacheOptions.googleCachedContent,
		xaiConversationId: providerCacheOptions.xaiConversationId,
		// The schema fills an absent value with null; null is never sent upstream.
		safetyIdentifier: typeof (req as any).safety_identifier === "string" ? (req as any).safety_identifier : undefined,
		modalities: normalizeModalities((req as any).modalities),
		imageConfig: normalizeImageConfig((req as any).image_config),
		vendor: Object.keys(vendor).length > 0 ? vendor : undefined,
	};
}

function decodeOpenAITool(tool: any): IRTool {
	if (isOpenAINativeWebSearchTool(tool) || (typeof tool?.type === "string" && tool.type !== "function")) {
		return {
			name: extractToolNameOrType(tool.custom ?? tool) ?? tool.type,
			type: tool.type,
			description: typeof tool.description === "string"
				? tool.description
				: typeof tool.custom?.description === "string"
					? tool.custom.description
					: undefined,
			parameters: {},
			async: typeof tool.async === "boolean" ? tool.async : undefined,
			cacheControl: normalizePartCacheControl(tool),
			raw: { ...tool },
		};
	}

	return {
		name: extractToolNameOrType(tool) ?? "tool",
		description: tool.description || tool.function?.description,
		parameters: tool.parameters || tool.function?.parameters || {},
		strict: tool.strict ?? tool.function?.strict,
		async: typeof tool.async === "boolean" ? tool.async : undefined,
		cacheControl: normalizePartCacheControl(tool) ?? normalizePartCacheControl(tool.function),
	};
}
