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
			} else if (msg.role === "developer") {
				messages.push({
					role: "developer",
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
		} else if (msg.role === "developer") {
			inputItems.push({
				type: "message",
				role: "developer",
				content: msg.content.map(mapContentPart),
			});
		} else if (msg.role === "user") {
			inputItems.push({
				type: "message",
				role: "user",
				content: msg.content.map(mapContentPart),
			});
		} else if (msg.role === "assistant") {
			const assistantContent = msg.content.map(mapAssistantContentPart).filter(Boolean);

			// Assistant message with optional tool calls
			if (hasMeaningfulAssistantContent(assistantContent)) {
				inputItems.push({
					type: "message",
					role: "assistant",
					content: assistantContent,
					...(msg.phase !== undefined ? { phase: msg.phase } : {}),
				});
			}

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
	if (ir.speed !== undefined) request.speed = ir.speed;
	if (ir.store !== undefined) request.store = ir.store;
	if (ir.streamOptions !== undefined) request.stream_options = ir.streamOptions;
	if (ir.truncation !== undefined) request.truncation = ir.truncation;
	if (ir.include !== undefined) request.include = ir.include;
	if (ir.conversation !== undefined) request.conversation = ir.conversation;
	if (ir.previousResponseId !== undefined) request.previous_response_id = ir.previousResponseId;
	if (ir.prompt !== undefined) request.prompt = ir.prompt;
	if (ir.promptCacheKey !== undefined) request.prompt_cache_key = ir.promptCacheKey;
	if (ir.promptCacheRetention !== undefined) request.prompt_cache_retention = ir.promptCacheRetention;
	if (ir.safetyIdentifier !== undefined) request.safety_identifier = ir.safetyIdentifier;
	const openAIContextManagement = (ir.vendor as any)?.openai?.context_management;
	if (providerId === "openai" && openAIContextManagement && typeof openAIContextManagement === "object") {
		request.context_management = {
			type: openAIContextManagement.type,
			...(typeof openAIContextManagement.compact_threshold === "number"
				? { compact_threshold: openAIContextManagement.compact_threshold }
				: {}),
		};
	}
	if (ir.modalities !== undefined) request.modalities = ir.modalities;
	if (ir.imageConfig !== undefined) {
		request.image_config = {
			...(ir.imageConfig.aspectRatio !== undefined ? { aspect_ratio: ir.imageConfig.aspectRatio } : {}),
			...(ir.imageConfig.imageSize !== undefined ? { image_size: ir.imageConfig.imageSize } : {}),
			...(Array.isArray(ir.imageConfig.fontInputs)
				? {
					font_inputs: ir.imageConfig.fontInputs.map((entry) => ({
						font_url: entry.fontUrl,
						text: entry.text,
					})),
				}
				: {}),
			...(Array.isArray(ir.imageConfig.superResolutionReferences)
				? { super_resolution_references: ir.imageConfig.superResolutionReferences }
				: {}),
		};
	}
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
		const inputAudio = part.source === "url"
			? { url: part.data, ...(part.format ? { format: part.format } : {}) }
			: { data: part.data, format: part.format || "wav" };
		return {
			type: "input_audio",
			input_audio: inputAudio,
		};
	}

	if (part.type === "video") {
		return {
			type: "input_video",
			video_url: { url: part.url },
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

function hasMeaningfulAssistantContent(content: any[]): boolean {
	return content.some((part) => {
		if (!part || typeof part !== "object") return false;
		return typeof part.text === "string" && part.text.length > 0;
	});
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
	const toInlineImagePart = (value: any): IRContentPart | null => {
		if (!value || typeof value !== "object") return null;
		const type = String(value.type ?? "").toLowerCase();
		const isImageType =
			type === "output_image" ||
			type === "image" ||
			type === "image_url" ||
			type === "input_image";
		if (!isImageType) return null;

		const b64 =
			typeof value.b64_json === "string"
				? value.b64_json
				: typeof value.data === "string"
					? value.data
					: null;
		const mimeType =
			typeof value.mime_type === "string"
				? value.mime_type
				: typeof value.mimeType === "string"
					? value.mimeType
					: undefined;

		if (b64) {
			return {
				type: "image",
				source: "data",
				data: b64,
				...(mimeType ? { mimeType } : {}),
			};
		}

		const urlValue =
			typeof value.image_url === "string"
				? value.image_url
				: typeof value.image_url?.url === "string"
					? value.image_url.url
					: typeof value.url === "string"
						? value.url
						: null;
		if (!urlValue) return null;

		return {
			type: "image",
			source: "url",
			data: urlValue,
			...(mimeType ? { mimeType } : {}),
		};
	};

	const extractInlineImages = (value: any): IRContentPart[] => {
		if (!Array.isArray(value)) return [];
		const out: IRContentPart[] = [];
		for (const part of value) {
			const imagePart = toInlineImagePart(part);
			if (imagePart) out.push(imagePart);
		}
		return out;
	};

	const toInlineAudioPart = (value: any): IRContentPart | null => {
		if (!value || typeof value !== "object") return null;
		const type = String(value.type ?? "").toLowerCase();
		const isAudioType =
			type === "output_audio" ||
			type === "audio" ||
			type === "audio_url" ||
			type === "input_audio";
		if (!isAudioType) return null;

		const mimeType =
			typeof value.mime_type === "string"
				? value.mime_type
				: typeof value.mimeType === "string"
					? value.mimeType
					: undefined;
		const normalizedMimeType = mimeType?.toLowerCase();
		const format =
			typeof value.format === "string"
				? value.format
				: normalizedMimeType === "audio/wav" || normalizedMimeType === "audio/x-wav"
					? "wav"
					: normalizedMimeType === "audio/mpeg" || normalizedMimeType === "audio/mp3"
						? "mp3"
						: normalizedMimeType === "audio/flac"
							? "flac"
							: normalizedMimeType === "audio/m4a" || normalizedMimeType === "audio/mp4" || normalizedMimeType === "audio/x-m4a"
								? "m4a"
								: normalizedMimeType === "audio/ogg"
									? "ogg"
									: normalizedMimeType === "audio/l16" || normalizedMimeType === "audio/pcm"
										? "pcm16"
										: normalizedMimeType === "audio/l24"
											? "pcm24"
											: undefined;

		const b64 =
			typeof value.b64_json === "string"
				? value.b64_json
				: typeof value.audio_base64 === "string"
					? value.audio_base64
					: typeof value.data === "string"
						? value.data
						: null;
		if (b64) {
			return {
				type: "audio",
				source: "data",
				data: b64,
				...(format ? { format } : {}),
			};
		}

		const urlValue =
			typeof value.audio_url === "string"
				? value.audio_url
				: typeof value.audio_url?.url === "string"
					? value.audio_url.url
					: typeof value.url === "string"
						? value.url
						: null;
		if (!urlValue) return null;

		return {
			type: "audio",
			source: "url",
			data: urlValue,
			...(format ? { format } : {}),
		};
	};

	const extractInlineAudios = (value: any): IRContentPart[] => {
		if (!Array.isArray(value)) return [];
		const out: IRContentPart[] = [];
		for (const part of value) {
			const audioPart = toInlineAudioPart(part);
			if (audioPart) out.push(audioPart);
		}
		return out;
	};

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
			if (item.phase !== undefined) {
				choice.message.phase = item.phase;
			}
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

				choice.message.content.push(...extractInlineImages(item.content));
				choice.message.content.push(...extractInlineAudios(item.content));
			}
		} else if (item.type === "reasoning" || item.type === "reasoning_details") {
			const reasoningText = extractReasoningText(item);
			if (reasoningText) {
				choice.message.content.push({
					type: "reasoning_text",
					text: reasoningText,
				});
			}
		} else if (
			item.type === "output_image" ||
			item.type === "image" ||
			item.type === "image_url"
		) {
			const imagePart = toInlineImagePart(item);
			if (imagePart) {
				choice.message.content.push(imagePart);
			}
		} else if (
			item.type === "output_audio" ||
			item.type === "audio" ||
			item.type === "audio_url"
		) {
			const audioPart = toInlineAudioPart(item);
			if (audioPart) {
				choice.message.content.push(audioPart);
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

	const inputDetails = usage.input_tokens_details ?? usage.prompt_tokens_details;
	const outputDetails = usage.output_tokens_details ?? usage.completion_tokens_details;
	const cachedInputTokens = inputDetails?.cached_tokens;
	const reasoningTokens = outputDetails?.reasoning_tokens;
	const cachedReadTokensAreSubsetOfInput = typeof cachedInputTokens === "number" ? true : undefined;

	return {
		inputTokens,
		outputTokens,
		totalTokens,
		cachedInputTokens,
		cachedReadTokensAreSubsetOfInput,
		reasoningTokens,
		_ext: {
			inputImageTokens: inputDetails?.input_images,
			inputAudioTokens: inputDetails?.input_audio,
			inputVideoTokens: inputDetails?.input_videos,
			outputImageTokens: outputDetails?.output_images,
			outputAudioTokens: outputDetails?.output_audio,
			outputVideoTokens: outputDetails?.output_videos,
			cachedWriteTokens: outputDetails?.cached_tokens,
		},
	};
}



