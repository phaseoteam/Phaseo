// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

// OpenAI Chat Completions format transformations
// Transforms IR <-> OpenAI Chat Completions upstream format

import type { IRChatRequest, IRChatResponse, IRMessage, IRContentPart, IRTool } from "@core/ir";
import { isIRNativeToolDefinition } from "@core/nativeTools";
import { applyChatRequestQuirks, applyChatResponseQuirks } from "./chat-quirks-bridge";
import { applyReasoningParams } from "./reasoning";
import { getProviderQuirks } from "./quirks";

/**
 * Transform IR request to OpenAI Chat Completions format
 * Used when provider only supports /chat/completions (not /responses)
 */
export function irToOpenAIChat(
	ir: IRChatRequest,
	model?: string | null,
	providerId?: string,
	capabilityParams?: Record<string, any> | null,
): any {
	const messages: any[] = [];

	for (const msg of ir.messages) {
		if (msg.role === "system") {
			messages.push({
				role: "system",
				content: mapSystemLikeContentToOpenAI(msg.content),
			});
		} else if (msg.role === "developer") {
			messages.push({
				role: "developer",
				content: mapSystemLikeContentToOpenAI(msg.content),
			});
		} else if (msg.role === "user") {
			messages.push({
				role: "user",
				content: mapIRContentToOpenAI(msg.content),
			});
		} else if (msg.role === "assistant") {
			const assistantText = msg.content
				.filter((c) => c.type === "text")
				.map((c) => c.text)
				.join("");
			const assistantReasoning = msg.content
				.filter((c) => c.type === "reasoning_text")
				.map((c) => c.text)
				.join("");

			const message: any = {
				role: "assistant",
				content: assistantText || null,
			};

			const providerSupportsAssistantReasoningContent =
				providerId === "deepseek" ||
				providerId === "z-ai" ||
				providerId === "zai" ||
				providerId === "crofai" ||
				providerId === "xiaomi" ||
				providerId === "minimax" ||
				providerId === "minimax-lightning" ||
				providerId === "moonshot-ai" ||
				providerId === "moonshotai" ||
				providerId === "moonshot-ai-turbo" ||
				providerId === "moonshotai-turbo";
			if (providerSupportsAssistantReasoningContent && assistantReasoning.length > 0) {
				message.reasoning_content = assistantReasoning;
			}

			if (msg.toolCalls && msg.toolCalls.length > 0) {
				message.tool_calls = msg.toolCalls.map((tc) => ({
					id: tc.id,
					type: "function",
					function: {
						name: tc.name,
						arguments: tc.arguments,
					},
				}));
			}

			messages.push(message);
		} else if (msg.role === "tool") {
			// Tool results as separate messages
			for (const result of msg.toolResults) {
				messages.push({
					role: "tool",
					tool_call_id: result.toolCallId,
					content: result.content,
				});
			}
		}
	}

	const request: any = {
		model: model || ir.model,
		messages,
		stream: ir.stream,
	};

	// Generation parameters
	if (ir.maxTokens !== undefined) {
		if (providerId === "openai") {
			request.max_completion_tokens = ir.maxTokens;
		} else {
			request.max_tokens = ir.maxTokens;
		}
	}
	if (ir.temperature !== undefined) request.temperature = ir.temperature;
	if (ir.topP !== undefined) request.top_p = ir.topP;
	if (ir.topK !== undefined) request.top_k = ir.topK;
	if (ir.logitBias !== undefined) request.logit_bias = ir.logitBias;
	if (ir.logprobs !== undefined) request.logprobs = ir.logprobs;
	if (ir.topLogprobs !== undefined) request.top_logprobs = ir.topLogprobs;

	applyReasoningParams({ ir, request, providerId });

	// Tools
	if (ir.tools && ir.tools.length > 0) {
		request.tools = ir.tools.map((tool) => toOpenAIChatTool(tool));
	}

	if (ir.toolChoice) {
		if (typeof ir.toolChoice === "string") {
			request.tool_choice = ir.toolChoice;
		} else {
			const selectedToolName = ir.toolChoice.name;
			const selectedTool = ir.tools?.find((tool) => tool.name === selectedToolName);
			request.tool_choice = isIRNativeToolDefinition(selectedTool)
				? selectedToolName
				: {
					type: "function",
					function: { name: selectedToolName },
				};
		}
	}

	if (
		ir.parallelToolCalls !== undefined &&
		(providerId !== "openai" || (ir.tools && ir.tools.length > 0))
	) {
		request.parallel_tool_calls = ir.parallelToolCalls;
	}
	if (ir.maxToolCalls !== undefined) {
		request.max_tool_calls = ir.maxToolCalls;
	}

	// Response format
	if (ir.responseFormat) {
		if (ir.responseFormat.type === "json_object") {
			request.response_format = { type: "json_object" };
		} else if (ir.responseFormat.type === "json_schema") {
			// Ensure schema has additionalProperties: false for OpenAI strict mode
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

	// Other parameters
	if (ir.frequencyPenalty !== undefined) request.frequency_penalty = ir.frequencyPenalty;
	if (ir.presencePenalty !== undefined) request.presence_penalty = ir.presencePenalty;
	if (ir.repetitionPenalty !== undefined) request.repetition_penalty = ir.repetitionPenalty;
	if (ir.stop) request.stop = ir.stop;
	if (ir.seed !== undefined) request.seed = ir.seed;
	if (ir.background !== undefined) request.background = ir.background;
	if (ir.serviceTier !== undefined) request.service_tier = ir.serviceTier;
	if (ir.promptCacheKey !== undefined) request.prompt_cache_key = ir.promptCacheKey;
	if (ir.promptCacheRetention !== undefined) request.prompt_cache_retention = ir.promptCacheRetention;
	if (ir.safetyIdentifier !== undefined) request.safety_identifier = ir.safetyIdentifier;
	if (ir.streamOptions !== undefined) request.stream_options = ir.streamOptions;
	if (ir.metadata !== undefined) request.metadata = ir.metadata;
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
	const rawRequest = ir.rawRequest && typeof ir.rawRequest === "object" && !Array.isArray(ir.rawRequest)
		? ir.rawRequest as Record<string, any>
		: {};
	if (rawRequest.quality !== undefined) request.quality = rawRequest.quality;
	if (rawRequest.background !== undefined) request.background = rawRequest.background;
	if (rawRequest.output_format !== undefined) request.output_format = rawRequest.output_format;
	if (rawRequest.output_compression !== undefined) request.output_compression = rawRequest.output_compression;
	if (rawRequest.moderation !== undefined) request.moderation = rawRequest.moderation;
	if (ir.userId !== undefined) request.user = ir.userId;
	if (ir.webSearchOptions !== undefined) request.web_search_options = ir.webSearchOptions;

	// Apply provider-specific request transformations after base params are set.
	applyChatRequestQuirks({ ir, providerId, model, request });

	return request;
}

function toOpenAIChatTool(tool: IRTool): any {
	if (isIRNativeToolDefinition(tool)) {
		return {
			...(tool?.raw ?? {}),
			type: tool.type,
		};
	}

	return {
		type: "function",
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters,
		},
	};
}

/**
 * Map IR content to OpenAI Chat content
 */
function hasCacheControl(content: IRContentPart[]): boolean {
	return content.some((part) => part.type === "text" && part.cacheControl);
}

function mapTextPartToOpenAI(part: Extract<IRContentPart, { type: "text" }>, type = "text"): any {
	return {
		type,
		text: part.text,
		...(part.cacheControl ? { cache_control: part.cacheControl } : {}),
	};
}

function mapSystemLikeContentToOpenAI(content: IRContentPart[]): any {
	if (!hasCacheControl(content)) {
		return content.map((c) => (c.type === "text" ? c.text : "")).join("");
	}
	return content
		.filter((part): part is Extract<IRContentPart, { type: "text" }> => part.type === "text")
		.map((part) => mapTextPartToOpenAI(part));
}

function mapIRContentToOpenAI(content: IRContentPart[]): any {
	if (content.length === 1 && content[0].type === "text" && !content[0].cacheControl) {
		return content[0].text;
	}

	return content.map((part) => {
		if (part.type === "text") {
			return mapTextPartToOpenAI(part);
		}

		if (part.type === "image") {
			if (part.source === "url") {
				return {
					type: "image_url",
					image_url: { url: part.data, detail: part.detail },
				};
			} else {
				return {
					type: "image_url",
					image_url: { url: `data:${part.mimeType || "image/jpeg"};base64,${part.data}` },
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

		// Fallback
		return { type: "text", text: String(part) };
	});
}

/**
 * Transform OpenAI Chat Completions response to IR
 */
export function openAIChatToIR(
	json: any,
	requestId: string,
	model: string,
	provider: string,
): IRChatResponse {
	const choices: IRChatResponse["choices"] = [];

	// Apply provider-specific response normalization (e.g., Google Nano Banana inline_data)
	const quirks = getProviderQuirks(provider);
	if (quirks.normalizeResponse) {
		quirks.normalizeResponse({ response: json, ir: null as any });
	}

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
			} as IRContentPart;
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
		} as IRContentPart;
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

		const format =
			typeof value.format === "string"
				? value.format
				: typeof value.audio_format === "string"
					? value.audio_format
					: typeof value.input_audio?.format === "string"
						? value.input_audio.format
						: undefined;

		const b64 =
			typeof value.b64_json === "string"
				? value.b64_json
				: typeof value.data === "string"
					? value.data
					: typeof value.input_audio?.data === "string"
						? value.input_audio.data
						: null;
		if (b64) {
			return {
				type: "audio",
				source: "data",
				data: b64,
				...(format ? { format } : {}),
			} as IRContentPart;
		}

		const urlValue =
			typeof value.audio_url === "string"
				? value.audio_url
				: typeof value.audio_url?.url === "string"
					? value.audio_url.url
					: typeof value.url === "string"
						? value.url
						: typeof value.input_audio?.url === "string"
							? value.input_audio.url
							: null;
		if (!urlValue) return null;

		return {
			type: "audio",
			source: "url",
			data: urlValue,
			...(format ? { format } : {}),
		} as IRContentPart;
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

	const extractChoiceContent = (content: any): string => {
		if (typeof content === "string") return content;
		if (Array.isArray(content)) {
			return content
				.map((part) => {
					if (typeof part === "string") return part;
					if (part && typeof part.text === "string") return part.text;
					return "";
				})
				.join("");
		}
		return "";
	};

	for (const choice of json.choices || []) {
		const toolCalls = choice.message?.tool_calls?.map((tc: any) => ({
			id: tc.id,
			name: tc.function?.name || tc.name,
			arguments: tc.function?.arguments || "{}",
		}));

		// Check if the choice has pre-parsed content parts (e.g., from Google Nano Banana quirk)
		let contentParts: IRContentPart[] = [];

		if (choice.message?._contentParts && Array.isArray(choice.message._contentParts)) {
			// Use the pre-parsed content parts directly
			contentParts = [...choice.message._contentParts];
		} else {
			// Regular content processing
			const rawContent = extractChoiceContent(choice.message?.content);
			const { main, reasoning } = applyChatResponseQuirks({ providerId: provider, choice, rawContent });

			// Add reasoning as reasoning_text parts
			if (reasoning.length > 0) {
				for (const reasoningText of reasoning) {
					contentParts.push({
						type: "reasoning_text",
						text: reasoningText,
					});
				}
			}

			// Add main content as text part
			if (main) {
				contentParts.push({
					type: "text",
					text: main,
				});
			}
		}
		contentParts.push(...extractInlineImages(choice.message?.content));
		contentParts.push(...extractInlineImages(choice.message?.images));
		contentParts.push(...extractInlineAudios(choice.message?.content));
		contentParts.push(...extractInlineAudios(choice.message?.audios));

		choices.push({
			index: choice.index || 0,
			message: {
				role: "assistant" as const,
				content: contentParts,
				toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
			},
			finishReason: mapFinishReason(choice.finish_reason),
			logprobs: choice.logprobs,
		});
	}

	// Validate ID presence
	if (!json.id) {
		console.warn(`[ID-VALIDATION] Provider ${provider} did not return response ID in OpenAI Chat format`);
	}

	return {
		id: requestId,
		nativeId: json.id,
		created: json.created || Math.floor(Date.now() / 1000),
		model,
		provider,
		choices,
		usage: normalizeChatUsage(json.usage),
	};
}

function normalizeChatUsage(usage: any): IRChatResponse["usage"] {
	if (!usage || typeof usage !== "object") return undefined;

	const inputDetails = usage.input_tokens_details ?? usage.prompt_tokens_details;
	const outputDetails = usage.output_tokens_details ?? usage.completion_tokens_details;
	const cachedInputTokens = inputDetails?.cached_tokens;
	const cachedWriteTokens =
		inputDetails?.cache_creation_input_tokens ??
		inputDetails?.cache_creation_tokens ??
		outputDetails?.cached_tokens;
	const reasoningTokens = usage.reasoning_tokens ?? outputDetails?.reasoning_tokens;
	const cachedReadTokensAreSubsetOfInput = typeof cachedInputTokens === "number" ? true : undefined;
	const inputTokens = usage.prompt_tokens ?? usage.input_tokens ?? usage.input_text_tokens ?? 0;
	const outputTokens = usage.completion_tokens ?? usage.output_tokens ?? usage.output_text_tokens ?? 0;
	const totalTokens = usage.total_tokens ?? (inputTokens + outputTokens);
	const serverToolUseRaw =
		usage.server_tool_use && typeof usage.server_tool_use === "object"
			? usage.server_tool_use
			: usage.serverToolUse && typeof usage.serverToolUse === "object"
				? usage.serverToolUse
				: null;
	const datetimeRequests =
		typeof serverToolUseRaw?.datetime_requests === "number"
			? serverToolUseRaw.datetime_requests
			: undefined;
	const webSearchRequests =
		typeof serverToolUseRaw?.web_search_requests === "number"
			? serverToolUseRaw.web_search_requests
			: undefined;
	const webSearchResults =
		typeof serverToolUseRaw?.web_search_results === "number"
			? serverToolUseRaw.web_search_results
			: undefined;
	const webSearchExtraResults =
		typeof serverToolUseRaw?.web_search_extra_results === "number"
			? serverToolUseRaw.web_search_extra_results
			: undefined;
	const webFetchRequests =
		typeof serverToolUseRaw?.web_fetch_requests === "number"
			? serverToolUseRaw.web_fetch_requests
			: undefined;
	const advisorRequests =
		typeof serverToolUseRaw?.advisor_requests === "number"
			? serverToolUseRaw.advisor_requests
			: undefined;
	const imageGenerationRequests =
		typeof serverToolUseRaw?.image_generation_requests === "number"
			? serverToolUseRaw.image_generation_requests
			: undefined;
	const applyPatchRequests =
		typeof serverToolUseRaw?.apply_patch_requests === "number"
			? serverToolUseRaw.apply_patch_requests
			: undefined;
	const serverToolUse =
		datetimeRequests != null ||
		webSearchRequests != null ||
		webSearchResults != null ||
		webSearchExtraResults != null ||
		webFetchRequests != null ||
		advisorRequests != null ||
		imageGenerationRequests != null ||
		applyPatchRequests != null
			? {
				...(datetimeRequests != null ? { datetime_requests: datetimeRequests } : {}),
				...(webSearchRequests != null ? { web_search_requests: webSearchRequests } : {}),
				...(webSearchResults != null ? { web_search_results: webSearchResults } : {}),
				...(webSearchExtraResults != null ? { web_search_extra_results: webSearchExtraResults } : {}),
				...(webFetchRequests != null ? { web_fetch_requests: webFetchRequests } : {}),
				...(advisorRequests != null ? { advisor_requests: advisorRequests } : {}),
				...(imageGenerationRequests != null ? { image_generation_requests: imageGenerationRequests } : {}),
				...(applyPatchRequests != null ? { apply_patch_requests: applyPatchRequests } : {}),
			}
			: undefined;

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
			cachedWriteTokens,
			...(serverToolUse ? { serverToolUse } : {}),
		},
	};
}

/**
 * Map OpenAI finish reason to IR format
 */
function mapFinishReason(reason: string | undefined): any {
	switch (reason) {
		case "stop":
			return "stop";
		case "length":
		case "max_tokens":
			return "length";
		case "tool_calls":
		case "function_call":
			return "tool_calls";
		case "content_filter":
			return "content_filter";
		default:
			return "stop";
	}
}



