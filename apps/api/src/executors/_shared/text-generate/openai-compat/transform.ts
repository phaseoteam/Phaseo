// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

// Transformation functions between IR and OpenAI Responses API format

import type { IRChatRequest, IRChatResponse, IRMessage, IRContentPart, IRChoice, IRUsage } from "@core/ir";
import { applyResponsesRequestQuirks, applyResponsesResponseQuirks } from "./responses-quirks";
import { applyReasoningParams } from "./reasoning";
import { getProviderQuirks } from "./quirks";

/**
 * Transform IR request to OpenAI Responses API format
 *
 * The Responses API uses "input_items" instead of "messages":
 * - message items (conversation turns)
 * - function_call items (tool calls from assistant)
 * - function_call_output items (tool results from user)
 *
 * @param ir - IR chat request
 * @param providerModelSlug - Provider's native model name (optional)
 * @returns OpenAI Responses API request
 */
export function irToOpenAIResponses(
	ir: IRChatRequest,
	providerModelSlug?: string | null,
	providerId?: string,
	capabilityParams?: Record<string, any> | null,
): any {
	// Xiaomi uses messages instead of input_items for responses
	// This is a fallback path - normally Xiaomi uses Chat Completions route
	if (providerId === 'xiaomi') {
		const messages: any[] = [];
		for (const msg of ir.messages) {
			if (msg.role === "system") {
				messages.push({
					role: "system",
					content: msg.content.map(mapContentPart).map(c => typeof c === 'string' ? c : c.text).join(''),
				});
			} else if (msg.role === "user") {
				messages.push({
					role: "user",
					content: msg.content.map(mapContentPart).map(c => typeof c === 'string' ? c : c.text).join(''),
				});
			} else if (msg.role === "assistant") {
				messages.push({
					role: "assistant",
					content: msg.content.map(mapContentPart).map(c => typeof c === 'string' ? c : c.text).join(''),
				});
			}
		}
		const request: any = {
			model: providerModelSlug || ir.model,
			messages,
		};
		if (ir.maxTokens !== undefined) request.max_tokens = ir.maxTokens;
		if (ir.temperature !== undefined) request.temperature = ir.temperature;
		if (ir.topP !== undefined) request.top_p = ir.topP;
		if (ir.seed !== undefined) request.seed = ir.seed;
		if (ir.tools && ir.tools.length > 0) {
			request.tools = ir.tools.map((t) => ({
				type: "function",
				function: {
					name: t.name,
					description: t.description,
					parameters: t.parameters,
				},
			}));
		}

		// Apply reasoning params - Xiaomi not configured, so this won't add anything
		applyReasoningParams({ ir, request, providerId });

		// Xiaomi-specific format: chat_template_kwargs.enable_thinking
		// Xiaomi uses a nested parameter instead of the standard reasoning field
		const reasoningEnabled = ir.reasoning?.enabled ??
			(ir.reasoning?.effort && ir.reasoning.effort !== "none");

		if (reasoningEnabled) {
			request.chat_template_kwargs = {
				enable_thinking: true,
			};
		}

		return request;
	}

	const inputItems: any[] = [];

	// Convert IR messages to Responses API input_items
	for (const msg of ir.messages) {
		if (msg.role === "system") {
			inputItems.push({
				type: "message",
				role: "system",
				content: msg.content.map(mapContentPart),
			});
		} else if (msg.role === "user") {
			inputItems.push({
				type: "message",
				role: "user",
				content: msg.content.map(mapContentPart),
			});
		} else if (msg.role === "assistant") {
			// Assistant message with optional tool calls
			inputItems.push({
				type: "message",
				role: "assistant",
				content: msg.content.map(mapAssistantContentPart).filter(Boolean),
			});

			// Add tool calls as function_call items
			if (msg.toolCalls) {
				for (const tc of msg.toolCalls) {
					inputItems.push({
						type: "function_call",
						call_id: tc.id,
						name: tc.name,
						arguments: tc.arguments,
					});
				}
			}
		} else if (msg.role === "tool") {
			// Tool results as function_call_output items
			for (const result of msg.toolResults) {
				inputItems.push({
					type: "function_call_output",
					call_id: result.toolCallId,
					output: result.content,
				});
			}
		}
	}

	// Build Responses API request
        const request: any = {
                model: providerModelSlug || ir.model,
                ...(providerId === "openai" ? { input: inputItems } : { input_items: inputItems }),
        };

	// Add generation parameters
	if (ir.maxTokens !== undefined) request.max_output_tokens = ir.maxTokens;
	if (ir.temperature !== undefined) request.temperature = ir.temperature;
	if (ir.topP !== undefined) request.top_p = ir.topP;
	if (ir.seed !== undefined) request.seed = ir.seed;

	// Add tool configuration
	if (ir.tools && ir.tools.length > 0) {
		if (providerId === "openai") {
			request.tools = ir.tools.map((t) => ({
				type: "function",
				name: t.name,
				description: t.description,
				parameters: t.parameters,
			}));
		} else {
			request.tools = ir.tools.map((t) => ({
				type: "function",
				function: {
					name: t.name,
					description: t.description,
					parameters: t.parameters,
				},
			}));
		}
	}

	if (ir.toolChoice) {
		if (typeof ir.toolChoice === "string") {
			request.tool_choice = ir.toolChoice;
		} else {
			if (providerId === "openai") {
				request.tool_choice = {
					type: "function",
					name: ir.toolChoice.name,
				};
			} else {
				request.tool_choice = {
					type: "function",
					function: { name: ir.toolChoice.name },
				};
			}
		}
	}

	if (ir.parallelToolCalls !== undefined) {
		request.parallel_tool_calls = ir.parallelToolCalls;
	}

	// Add reasoning configuration
	applyReasoningParams({ ir, request, providerId });

	// Add response format
	// For Responses API: use text.format instead of response_format
	if (ir.responseFormat) {
		if (providerId === "openai") {
			// OpenAI Responses API uses text.format
			if (ir.responseFormat.type === "json_object") {
				request.text = { format: { type: "json_object" } };
			} else if (ir.responseFormat.type === "json_schema") {
				// Ensure schema has additionalProperties: false for OpenAI strict mode
				const schema = ir.responseFormat.schema;
				if (schema && typeof schema === "object" && !("additionalProperties" in schema)) {
					schema.additionalProperties = false;
				}

				request.text = {
					format: {
						type: "json_schema",
						name: ir.responseFormat.name || "response",
						schema: schema,
						strict: ir.responseFormat.strict !== false, // Default to true
					},
				};
			}
		} else {
			// Other providers (like Xiaomi) may use response_format
			if (ir.responseFormat.type === "json_object") {
				request.response_format = { type: "json_object" };
			} else if (ir.responseFormat.type === "json_schema") {
				// Ensure schema has additionalProperties: false for strict mode
				const schema = ir.responseFormat.schema;
				if (schema && typeof schema === "object" && !("additionalProperties" in schema)) {
					schema.additionalProperties = false;
				}

				request.response_format = {
					type: "json_schema",
					json_schema: {
						name: ir.responseFormat.name || "response",
						schema: schema,
						strict: ir.responseFormat.strict !== false, // Default to true
					},
				};
			}
		}
	}

	// Add advanced parameters
	if (ir.frequencyPenalty !== undefined) request.frequency_penalty = ir.frequencyPenalty;
	if (ir.presencePenalty !== undefined) request.presence_penalty = ir.presencePenalty;
	if (ir.logitBias) request.logit_bias = ir.logitBias;
	if (ir.stop) request.stop = ir.stop;
	if (ir.logprobs) request.logprobs = ir.logprobs;
	if (ir.topLogprobs) request.top_logprobs = ir.topLogprobs;
	if (ir.maxToolCalls !== undefined) request.max_tool_calls = ir.maxToolCalls;
	if (ir.background !== undefined) request.background = ir.background;
	if (ir.serviceTier !== undefined) request.service_tier = ir.serviceTier;
	if (ir.promptCacheKey !== undefined) request.prompt_cache_key = ir.promptCacheKey;
	if (ir.safetyIdentifier !== undefined) request.safety_identifier = ir.safetyIdentifier;
	if (ir.userId) request.user = ir.userId;
	if (ir.metadata) request.metadata = ir.metadata;

	// Apply provider-specific request transformations (e.g., Z.AI thinking mode)
	applyResponsesRequestQuirks({
		ir,
		providerId,
		model: providerModelSlug,
		request,
	});

	return request;
}

/**
 * Map IR content part to Responses API content item
 */
function mapContentPart(part: IRContentPart): any {
	if (part.type === "text") {
		return { type: "input_text", text: part.text };
	}

	if (part.type === "reasoning_text") {
		return { type: "input_text", text: part.text };
	}

        if (part.type === "image") {
                if (part.source === "url") {
                        return {
                                type: "input_image",
                                image_url: part.data,
                                detail: part.detail,
                        };
                } else {
                        const dataUrl = part.data.startsWith("data:")
                                ? part.data
                                : `data:${part.mimeType || "image/jpeg"};base64,${part.data}`;
                        return {
                                type: "input_image",
                                image_url: dataUrl,
                                detail: part.detail,
                        };
                }
        }

	if (part.type === "audio") {
		return {
			type: "input_audio",
			input_audio: {
				data: part.data,
				format: part.format || "wav",
			},
		};
	}

	if (part.type === "video") {
		return {
			type: "input_video",
			video_url: part.url,
		};
	}

	// Fallback: unknown type -> text
	return { type: "input_text", text: String(part) };
}

function mapAssistantContentPart(part: IRContentPart): any {
	if (part.type === "text") {
		return { type: "output_text", text: part.text };
	}
	if (part.type === "reasoning_text") {
		return null;
	}
	return { type: "output_text", text: String(part) };
}

/**
 * Transform OpenAI Responses API response to IR format
 *
 * Responses API output_items contain:
 * - message items (text/reasoning responses)
 * - function_call items (tool calls)
 *
 * @param json - OpenAI Responses API response
 * @param requestId - Gateway request ID
 * @param model - Model name
 * @param provider - Provider name
 * @returns IR chat response
 */
export function openAIResponsesToIR(
	json: any,
	requestId: string,
	model: string,
	provider: string,
): IRChatResponse {
	const choices: IRChoice[] = [];

	// Apply provider-specific response normalization (e.g., Z.AI multi-message format)
	const quirks = getProviderQuirks(provider);

	if (quirks.normalizeResponse) {
		quirks.normalizeResponse({ response: json, ir: null as any });
	}

	// Process output items
	// Group by index to handle multiple choices
	const choicesMap = new Map<number, IRChoice>();

	const outputItems = Array.isArray(json?.output_items)
		? json.output_items
		: (Array.isArray(json?.output) ? json.output : []);

	for (const item of outputItems) {
		const index = item.index ?? item.output_index ?? 0;

		if (!choicesMap.has(index)) {
			choicesMap.set(index, {
				index,
				message: {
					role: "assistant",
					content: [], // Array of content parts
					toolCalls: [],
				},
				finishReason: null,
			});
		}

		const choice = choicesMap.get(index)!;

		// Handle different output item types
		if (item.type === "message") {
			// Check if the item has pre-parsed content parts (e.g., from Google Nano Banana quirk)
			// This allows quirks to provide already-structured IR content parts
			if (item._contentParts && Array.isArray(item._contentParts)) {
				// Use the pre-parsed content parts directly
				choice.message.content.push(...item._contentParts);
			} else {
				// Regular assistant message
				const content = extractTextFromContent(item.content || []);

				// Apply provider-specific reasoning extraction
				const { main, reasoning } = applyResponsesResponseQuirks({
					providerId: provider,
					item,
					rawContent: content,
				});

				// Add reasoning as reasoning_text content parts
				if (reasoning.length > 0) {
					for (const reasoningText of reasoning) {
						choice.message.content.push({
							type: "reasoning_text",
							text: reasoningText,
						});
					}
				}

				// Add main content as text part
				if (main) {
					choice.message.content.push({
						type: "text",
						text: main,
					});
				}
			}
		} else if (item.type === "reasoning" || item.type === "reasoning_details") {
			const reasoningText = extractReasoningText(item);
			if (reasoningText) {
				choice.message.content.push({
					type: "reasoning_text",
					text: reasoningText,
				});
			}
		} else if (item.type === "function_call" || item.type === "tool_call") {
			// Tool call from assistant
			choice.message.toolCalls = choice.message.toolCalls || [];
			choice.message.toolCalls.push({
				id: item.call_id || item.id || `call_${requestId}_${index}_${choice.message.toolCalls.length}`,
				name: item.name,
				arguments: item.arguments || "{}",
			});
		}
	}

	// Convert map to array and determine finish reasons
	const choicesList = Array.from(choicesMap.values());

	for (const choice of choicesList) {
		// Determine finish reason
		if (choice.message.toolCalls && choice.message.toolCalls.length > 0) {
			choice.finishReason = "tool_calls";
		} else if (json.finish_reason === "length" || json.finish_reason === "max_tokens") {
			choice.finishReason = "length";
		} else if (json.finish_reason === "content_filter") {
			choice.finishReason = "content_filter";
		} else {
			choice.finishReason = "stop";
		}

		choices.push(choice);
	}

	// If no choices were extracted, create a default one
	if (choices.length === 0) {
		choices.push({
			index: 0,
			message: {
				role: "assistant",
				content: [],
			},
			finishReason: "stop",
		});
	}

	// Extract usage
	const usage = normalizeUsage(json.usage);

	// Validate ID presence
	if (!json.id) {
		console.warn(`[ID-VALIDATION] Provider ${provider} did not return response ID in OpenAI Responses format`);
	}

	return {
		id: requestId,
		nativeId: json.id,
		created: json.created_at || json.created || Math.floor(Date.now() / 1000),
		model,
		provider,
		choices,
		usage,
		serviceTier: json.service_tier,
		systemFingerprint: json.system_fingerprint,
	};
}

/**
 * Extract text content from Responses API content array
 */
function extractTextFromContent(content: any[]): string {
	return content
		.filter((item) => item.type === "text" || item.type === "input_text" || item.type === "output_text")
		.map((item) => item.text || "")
		.join("");
}

function extractReasoningText(item: any): string {
	const summary = Array.isArray(item?.summary) ? item.summary : [];
	const content = Array.isArray(item?.content) ? item.content : [];
	const summaryText = summary
		.map((s: any) => (typeof s?.text === "string" ? s.text : ""))
		.join("");
	const contentText = content
		.map((c: any) => (typeof c?.text === "string" ? c.text : ""))
		.join("");
	return contentText || summaryText;
}

/**
 * Normalize usage from OpenAI format to IR format
 */
function normalizeUsage(usage: any): IRUsage | undefined {
	if (!usage || typeof usage !== "object") return undefined;

	const inputTokens = usage.input_tokens ?? usage.prompt_tokens ?? 0;
	const outputTokens = usage.output_tokens ?? usage.completion_tokens ?? 0;
	const totalTokens = usage.total_tokens ?? inputTokens + outputTokens;

	const cachedInputTokens = usage.input_tokens_details?.cached_tokens;
	const reasoningTokens = usage.output_tokens_details?.reasoning_tokens;

	return {
		inputTokens,
		outputTokens,
		totalTokens,
		cachedInputTokens,
		reasoningTokens,
		_ext: {
			inputImageTokens: usage.input_tokens_details?.input_images,
			inputAudioTokens: usage.input_tokens_details?.input_audio,
			inputVideoTokens: usage.input_tokens_details?.input_videos,
			outputImageTokens: usage.output_tokens_details?.output_images,
			outputAudioTokens: usage.output_tokens_details?.output_audio,
			cachedWriteTokens: usage.output_tokens_details?.cached_tokens,
		},
	};
}

