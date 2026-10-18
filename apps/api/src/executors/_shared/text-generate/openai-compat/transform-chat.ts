// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

// OpenAI Chat Completions format transformations
// Transforms IR <-> OpenAI Chat Completions upstream format

import type { IRChatRequest, IRChatResponse, IRMessage, IRContentPart, IRTool, IRToolCall } from "@core/ir";
import { isIRNativeToolDefinition } from "@core/nativeTools";
import { applyChatRequestQuirks, applyChatResponseQuirks } from "./chat-quirks-bridge";
import { applyReasoningParams } from "./reasoning";
import { getProviderQuirks } from "./quirks";
import { applyPromptCacheFieldPolicy, cacheMarkFields } from "./prompt-cache-policy";
import { isSealedReasoningValue } from "@core/reasoning-state";
import { applyToolCallSignatures, decodeChatReasoningDetails } from "@protocols/shared/reasoning";

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
				...messageNameField(msg.name, providerId),
			});
		} else if (msg.role === "developer") {
			messages.push({
				role: "developer",
				content: mapSystemLikeContentToOpenAI(msg.content),
				...messageNameField(msg.name, providerId),
			});
		} else if (msg.role === "user") {
			messages.push({
				role: "user",
				content: mapIRContentToOpenAI(msg.content),
				...messageNameField(msg.name, providerId),
			});
		} else if (msg.role === "assistant") {
			const assistantText = msg.content
				.filter((c) => c.type === "text")
				.map((c) => c.text)
				.join("");
			// Plain reasoning text goes back to providers that accept it. Reasoning
			// that carries another provider family's state (Claude signatures,
			// OpenAI encrypted reasoning, Gemini thoughts) never does.
			const assistantReasoning = msg.content
				.filter((c): c is Extract<IRContentPart, { type: "reasoning_text" }> => c.type === "reasoning_text")
				.filter((c) => !c.reasoningFormat)
				.map((c) => c.text)
				.join("");

			const message: any = {
				role: "assistant",
				content: assistantText || null,
				...messageNameField(msg.name, providerId),
			};

			const providerSupportsAssistantReasoningContent =
				providerId === "reflection" ||
				providerId === "deepseek" ||
				providerId === "z-ai" ||
				providerId === "zai" ||
				providerId === "xiaomi" ||
				providerId === "minimax" ||
				providerId === "minimax-lightning" ||
				providerId === "moonshot-ai" ||
				providerId === "moonshotai" ||
				providerId === "moonshot-ai-turbo" ||
				providerId === "moonshotai-turbo" ||
				providerId === "poolside" ||
				providerId === "siliconflow" ||
				providerId === "stepfun" ||
				providerId === "wafer" ||
				providerId === "doubleword";
			if (providerSupportsAssistantReasoningContent && assistantReasoning.length > 0) {
				if (providerId === "minimax" || providerId === "minimax-lightning") {
					// With reasoning_split, MiniMax returns thinking in reasoning_details
					// and documents passing that field back unchanged in tool loops.
					// https://platform.minimax.io/docs/guides/text-m3-function-call
					message.reasoning_details = [{
						type: "reasoning.text",
						id: "reasoning-text-1",
						format: "MiniMax-response-v1",
						index: 0,
						text: assistantReasoning,
					}];
				} else {
					message.reasoning_content = assistantReasoning;
				}
			}

			if (msg.toolCalls && msg.toolCalls.length > 0) {
				message.tool_calls = msg.toolCalls.map((tc) => tc.type === "custom"
					? {
						id: tc.id,
						type: "custom",
						custom: { name: tc.name, input: tc.arguments },
					}
					: {
						id: tc.id,
						type: "function",
						function: {
							name: tc.name,
							arguments: tc.arguments,
						},
					});
			}

			messages.push(message);
		} else if (msg.role === "tool") {
			// Tool results as separate messages
			for (const result of msg.toolResults) {
				messages.push({
					role: "tool",
					tool_call_id: result.toolCallId,
					content: mapToolResultToOpenAIChat(result, providerId),
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
		if (providerId === "openai" || providerId === "openai-eu" || providerId === "byteplus" || providerId === "clarifai" || providerId === "minimax" || providerId === "minimax-lightning") {
			request.max_completion_tokens = ir.maxTokens;
		} else {
			request.max_tokens = ir.maxTokens;
		}
	}
	if (ir.temperature !== undefined) request.temperature = ir.temperature;
	if (ir.topP !== undefined) request.top_p = ir.topP;
	if (ir.topK !== undefined) request.top_k = ir.topK;
	if (ir.minP !== undefined) request.min_p = ir.minP;
	if (ir.logitBias !== undefined) request.logit_bias = ir.logitBias;
	if (ir.logprobs !== undefined) request.logprobs = ir.logprobs;
	if (ir.topLogprobs !== undefined) request.top_logprobs = ir.topLogprobs;

	applyReasoningParams({ ir, request, providerId, providerModelSlug: model });

	// Tools
	if (ir.tools && ir.tools.length > 0) {
		request.tools = ir.tools.map((tool) => toOpenAIChatTool(tool));
	}

	if (ir.toolChoice) {
		const rawOpenAIToolChoice = (ir.vendor as any)?.openai?.tool_choice;
		if (
			(providerId === "openai" || providerId === "openai-eu")
			&& rawOpenAIToolChoice
			&& typeof rawOpenAIToolChoice === "object"
		) {
			request.tool_choice = rawOpenAIToolChoice;
		} else if (typeof ir.toolChoice === "string") {
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
	// Never send null: absent keys stay absent. The pipeline has already namespaced the key per workspace.
	if (typeof ir.promptCacheKey === "string" && ir.promptCacheKey.length > 0) request.prompt_cache_key = ir.promptCacheKey;
	if (ir.promptCacheRetention !== undefined) request.prompt_cache_retention = ir.promptCacheRetention;
	if (ir.promptCacheOptions !== undefined) request.prompt_cache_options = ir.promptCacheOptions;
	if (ir.textVerbosity !== undefined) request.verbosity = ir.textVerbosity;
	if (ir.audioConfig !== undefined) request.audio = ir.audioConfig;
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
	if (providerId === "ai21") {
		const ai21Options = (ir.vendor as any)?.ai21;
		if (ai21Options?.n !== undefined) request.n = ai21Options.n;
		if (ai21Options?.documents !== undefined) request.documents = ai21Options.documents;
	}
	if (providerId === "akashml") {
		const akashOptions = (ir.vendor as any)?.akashml;
		if (akashOptions?.n !== undefined) request.n = akashOptions.n;
	}
	if (providerId === "arcee" || providerId === "arcee-ai") {
		const arceeOptions = (ir.vendor as any)?.arcee;
		if (arceeOptions?.n !== undefined) request.n = arceeOptions.n;
	}
	if (providerId === "baseten") {
		const basetenOptions = (ir.vendor as any)?.baseten;
		if (basetenOptions?.n !== undefined) request.n = basetenOptions.n;
	}
	if (providerId === "siliconflow") {
		const siliconFlowOptions = (ir.vendor as any)?.siliconflow;
		if (siliconFlowOptions?.n !== undefined) request.n = siliconFlowOptions.n;
	}
	if (providerId === "friendli") {
		const friendliOptions = (ir.vendor as any)?.friendli;
		if (friendliOptions?.n !== undefined) request.n = friendliOptions.n;
	}
	if (providerId === "morpheus") {
		const morpheusOptions = (ir.vendor as any)?.morpheus;
		if (morpheusOptions?.n !== undefined) request.n = morpheusOptions.n;
		if (morpheusOptions?.session_id !== undefined) request.session_id = morpheusOptions.session_id;
	}
	if (providerId === "clarifai") {
		const clarifaiOptions = (ir.vendor as any)?.clarifai;
		if (Array.isArray(clarifaiOptions?.mcp_servers)) {
			request.mcp_servers = [...clarifaiOptions.mcp_servers];
		}
	}
	if (providerId === "mistral" || providerId === "mistral-eu") {
		const mistralOptions = (ir.vendor as any)?.mistral;
		for (const field of ["n", "prediction", "safe_prompt", "prompt_mode", "guardrails"] as const) {
			if (mistralOptions?.[field] !== undefined) request[field] = mistralOptions[field];
		}
	}
	if (["moonshot-ai", "moonshotai", "moonshot-ai-turbo", "moonshotai-turbo"].includes(String(providerId))) {
		const moonshotOptions = (ir.vendor as any)?.moonshot;
		if (moonshotOptions?.n !== undefined) request.n = moonshotOptions.n;
		if (moonshotOptions?.prediction !== undefined) request.prediction = moonshotOptions.prediction;
		if (Array.isArray(moonshotOptions?.message_fields)) {
			request.messages = request.messages.map((message: any, index: number) => ({
				...message,
				...(moonshotOptions.message_fields[index] ?? {}),
			}));
		}
	}
	if (providerId === "openai" || providerId === "openai-eu") {
		const openAIOptions = (ir.vendor as any)?.openai;
		if (openAIOptions?.prediction !== undefined) request.prediction = openAIOptions.prediction;
		if (openAIOptions?.moderation !== undefined) request.moderation = openAIOptions.moderation;
	}

	applyPromptCacheFieldPolicy(request, { providerId, model, irModel: ir.model });

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
			...(tool.strict !== undefined ? { strict: tool.strict } : {}),
		},
		...cacheMarkFields(tool.cacheControl),
	};
}

/**
 * Map IR content to OpenAI Chat content
 */
function hasCacheControl(content: IRContentPart[]): boolean {
	return content.some((part) => part.type === "text" && part.cacheControl);
}

// Chat APIs whose message schema defines a participant `name` on system, user and
// assistant messages (from each provider's published spec). Strict APIs such as
// Mistral's reject the field, so it is sent only here.
const MESSAGE_NAME_PROVIDERS = new Set([
	"openai", "openai-eu", "azure", "akashml", "ambient", "baidu", "baseten", "cerebras", "deepinfra",
	"deepseek", "friendli", "io-net", "moonshot-ai", "moonshotai", "nebius-token-factory",
	"nebius-token-factory-eu-north-1", "nebius-token-factory-us-central-1", "ovhcloud",
	"sail-research", "together", "venice",
]);

// Chat APIs whose tool message content may be an array of text parts, as in
// OpenAI's schema. Others take a string.
const TOOL_CONTENT_PARTS_PROVIDERS = new Set([
	"openai", "openai-eu", "azure", "akashml", "ambient", "baseten", "cerebras", "deepinfra",
	"deepseek", "groq", "inception", "io-net", "meta", "mistral", "mistral-eu", "moonshot-ai", "moonshotai",
	"nebius-token-factory", "nebius-token-factory-eu-north-1", "nebius-token-factory-us-central-1",
	"ovhcloud", "perplexity", "reka", "sail-research", "sambanova",
]);

function messageNameField(name: string | undefined, providerId: string | undefined): { name?: string } {
	if (!name || !providerId || !MESSAGE_NAME_PROVIDERS.has(providerId)) return {};
	return { name };
}

/**
 * Tool result content: the client's text parts as an array where the provider
 * accepts one, otherwise the text parts joined. Chat tool messages carry text
 * only, so image parts in a tool result have no place here.
 */
function mapToolResultToOpenAIChat(
	result: Extract<IRMessage, { role: "tool" }>["toolResults"][number],
	providerId: string | undefined,
): any {
	const textParts = (result.parts ?? []).filter((part): part is Extract<IRContentPart, { type: "text" }> => part.type === "text");
	if (textParts.length > 0 && providerId && TOOL_CONTENT_PARTS_PROVIDERS.has(providerId)) {
		return textParts.map((part) => mapTextPartToOpenAI(part));
	}
	// A marked result is sent as a text part so the mark survives;
	// the cache policy turns it back into a string where unsupported.
	return result.cacheControl
		? [mapTextPartToOpenAI({ type: "text", text: result.content, cacheControl: result.cacheControl })]
		: result.content;
}

function mapTextPartToOpenAI(part: Extract<IRContentPart, { type: "text" }>, type = "text"): any {
	const promptCacheBreakpoint = part.cacheControl?.type === "prompt_cache_breakpoint"
		? { mode: part.cacheControl.mode }
		: undefined;
	return {
		type,
		text: part.text,
		...(promptCacheBreakpoint
			? { prompt_cache_breakpoint: promptCacheBreakpoint }
			: part.cacheControl ? { cache_control: part.cacheControl } : {}),
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

/**
 * Chat Completions `file` part: base64 `file_data` (as a data URL) or an
 * uploaded `file_id`. Chat has no URL form, so a file given by URL is left out
 * rather than sent in a shape the provider would reject.
 * https://platform.openai.com/docs/api-reference/chat/create
 */
export function mapFilePartToOpenAIChat(part: Extract<IRContentPart, { type: "file" }>): any | null {
	const filename = part.filename ? { filename: part.filename } : {};
	if (part.source === "data") {
		return {
			type: "file",
			file: { ...filename, file_data: `data:${part.mimeType || "application/pdf"};base64,${part.data}` },
			...cacheMarkFields(part.cacheControl),
		};
	}
	if (part.source === "id") {
		return {
			type: "file",
			file: { ...filename, file_id: part.data },
			...cacheMarkFields(part.cacheControl),
		};
	}
	return null;
}

function mapIRContentToOpenAI(content: IRContentPart[]): any {
	if (content.length === 1 && content[0].type === "text" && !content[0].cacheControl) {
		return content[0].text;
	}

	return content.flatMap((part) => {
		if (part.type === "text") {
			return mapTextPartToOpenAI(part);
		}

		if (part.type === "file") {
			const mapped = mapFilePartToOpenAIChat(part);
			// Chat Completions has no file-by-URL field. Dropping the document would let the model
			// answer without it, so fail this attempt instead: routing then tries a provider that can
			// carry it, and the client gets an explicit error if none can.
			if (!mapped) {
				throw Object.assign(
					new Error("This provider's Chat Completions API cannot take a file by URL; send the file as file_data or file_id."),
					{ code: "unsupported_parameter", param: "file" },
				);
			}
			return [mapped];
		}

		if (part.type === "image") {
			if (part.source === "url") {
				return {
					type: "image_url",
					image_url: { url: part.data, detail: part.detail },
					...cacheMarkFields(part.cacheControl),
				};
			} else {
				return {
					type: "image_url",
					image_url: { url: `data:${part.mimeType || "image/jpeg"};base64,${part.data}` },
					...cacheMarkFields(part.cacheControl),
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
				...(part.cacheControl?.type === "prompt_cache_breakpoint"
					? { prompt_cache_breakpoint: { mode: part.cacheControl.mode } }
					: {}),
			};
		}

		if (part.type === "provider_block") return { ...part.block };

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
/**
 * Read reasoning state the gateway sealed into `reasoning_details` while
 * converting a provider stream to chat chunks (Gemini thought signatures).
 * Unsealed entries are a provider's own text (for example MiniMax) and are
 * already handled by the provider quirks.
 */
function applySealedReasoningDetails(
	details: unknown,
	contentParts: IRContentPart[],
	toolCalls: IRToolCall[] | undefined,
): void {
	if (!Array.isArray(details)) return;
	const sealed = details.filter((entry: any) =>
		isSealedReasoningValue(entry?.signature) || isSealedReasoningValue(entry?.data));
	if (sealed.length === 0) return;
	const decoded = decodeChatReasoningDetails(sealed, new Set((toolCalls ?? []).map((call) => call.id)));
	applyToolCallSignatures(toolCalls, decoded.toolSignatures);
	for (const part of decoded.parts) {
		const plain = contentParts.find((candidate): candidate is Extract<IRContentPart, { type: "reasoning_text" }> =>
			candidate.type === "reasoning_text" && !candidate.reasoningFormat);
		if (plain && !part.text) {
			Object.assign(plain, { ...part, text: plain.text });
		} else {
			contentParts.push(part);
		}
	}
}

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
			name: tc.type === "custom" ? (tc.custom?.name || tc.name) : (tc.function?.name || tc.name),
			arguments: (() => {
				const value = tc.type === "custom" ? (tc.custom?.input ?? tc.input ?? "") : (tc.function?.arguments ?? "{}");
				return typeof value === "string" ? value : JSON.stringify(value);
			})(),
			type: tc.type === "custom" ? "custom" as const : "function" as const,
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
		applySealedReasoningDetails(choice.message?.reasoning_details, contentParts, toolCalls);
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
	const observedServiceTier = json.usage?.service_tier ?? json.service_tier;
	const citations = provider === "perplexity" && Array.isArray(json.citations)
		? json.citations.filter((value: unknown): value is string => typeof value === "string")
		: undefined;
	if (citations?.length) {
		const searchResults = Array.isArray(json.search_results) ? json.search_results : [];
		for (const choice of choices) {
			for (const part of choice.message.content) {
				if (part.type !== "text") continue;
				part.annotations = citations.map((url: string) => {
					const match = searchResults.find((result: any) => result?.url === url);
					return {
						type: "url_citation",
						url,
						...(typeof match?.title === "string" ? { title: match.title } : {}),
					};
				});
			}
		}
	}

	return {
		id: requestId,
		nativeId: json.id,
		created: json.created || Math.floor(Date.now() / 1000),
		model,
		provider,
		choices,
		usage: normalizeChatUsage(json.usage, observedServiceTier),
		serviceTier: observedServiceTier,
		...(citations ? { citations } : {}),
		...(provider === "perplexity" && Array.isArray(json.search_results) ? { searchResults: json.search_results } : {}),
		...(provider === "perplexity" && Array.isArray(json.images) ? { images: json.images } : {}),
		...(provider === "perplexity" && Array.isArray(json.related_questions) ? { relatedQuestions: json.related_questions } : {}),
		...(provider === "perplexity" && Array.isArray(json.reasoning_steps) ? { reasoningSteps: json.reasoning_steps } : {}),
	};
}

function firstFiniteNumber(...values: unknown[]): number | undefined {
	for (const value of values) {
		if (typeof value === "number" && Number.isFinite(value)) return value;
	}
	return undefined;
}

function normalizeChatUsage(usage: any, observedServiceTier?: unknown): IRChatResponse["usage"] {
	if (!usage || typeof usage !== "object") return undefined;

	const inputDetails = usage.input_tokens_details ?? usage.prompt_tokens_details;
	const outputDetails = usage.output_tokens_details ?? usage.completion_tokens_details;
	// Top-level fallbacks: StepFun and some Together/Alibaba models report `cached_tokens`,
	// DeepSeek and SiliconFlow `prompt_cache_hit_tokens`. All count inside prompt tokens.
	const cachedInputTokens = firstFiniteNumber(
		inputDetails?.cached_tokens,
		usage.cached_tokens,
		usage.prompt_cache_hit_tokens,
		usage.cached_input_tokens,
	);
	// Writes nested in input details (OpenAI/Azure GPT-5.6+, Kimi, Alibaba, Venice) are part
	// of prompt tokens; the top-level and output-detail forms are reported on top of input.
	const nestedCachedWriteTokens = firstFiniteNumber(
		inputDetails?.cache_write_tokens,
		inputDetails?.cache_creation_input_tokens,
		inputDetails?.cache_creation_tokens,
	);
	const cachedWriteTokens5m = firstFiniteNumber(
		usage.cached_write_text_tokens_5m,
		usage.cache_creation?.ephemeral_5m_input_tokens,
	);
	const cachedWriteTokens1h = firstFiniteNumber(
		usage.cached_write_text_tokens_1h,
		usage.cache_creation?.ephemeral_1h_input_tokens,
	);
	// TTL-split writes (Anthropic-shaped `cache_creation`, gateway meters) sit on top of input.
	const ttlCachedWriteTokens =
		cachedWriteTokens5m !== undefined || cachedWriteTokens1h !== undefined
			? (cachedWriteTokens5m ?? 0) + (cachedWriteTokens1h ?? 0)
			: undefined;
	const cachedWriteTokens = nestedCachedWriteTokens ?? firstFiniteNumber(
		usage.cache_write_tokens,
		usage.cache_creation_input_tokens,
		outputDetails?.cached_tokens,
	) ?? ttlCachedWriteTokens;
	const reasoningTokens = usage.reasoning_tokens ?? outputDetails?.reasoning_tokens;
	const cachedReadTokensAreSubsetOfInput = typeof cachedInputTokens === "number" ? true : undefined;
	const cachedWriteTokensAreSubsetOfInput = typeof nestedCachedWriteTokens === "number" || typeof usage.cache_write_tokens === "number"
		? true
		: typeof cachedWriteTokens === "number" ? false : undefined;
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
			: typeof usage.num_search_queries === "number"
				? usage.num_search_queries
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
		...(cachedWriteTokensAreSubsetOfInput !== undefined ? { cachedWriteTokensAreSubsetOfInput } : {}),
		reasoningTokens,
		...(
			typeof observedServiceTier === "string"
				? { serviceTier: observedServiceTier }
				: typeof usage.serviceTier === "string"
					? { serviceTier: usage.serviceTier }
					: {}
		),
		_ext: {
			citationTokens: typeof usage.citation_tokens === "number" ? usage.citation_tokens : undefined,
			numSearchQueries: typeof usage.num_search_queries === "number" ? usage.num_search_queries : undefined,
			searchContextSize: typeof usage.search_context_size === "string" ? usage.search_context_size : undefined,
			providerCost: usage.cost && typeof usage.cost === "object" ? usage.cost : undefined,
			spentCredits: typeof usage["x-spent-credits"] === "number" ? usage["x-spent-credits"] : undefined,
			inputImageTokens: usage.image_tokens ?? inputDetails?.input_images,
			inputAudioTokens: inputDetails?.audio_tokens ?? inputDetails?.input_audio,
			inputVideoTokens: inputDetails?.input_videos,
			outputImageTokens: outputDetails?.output_images,
			outputAudioTokens: outputDetails?.audio_tokens ?? outputDetails?.output_audio,
			outputVideoTokens: outputDetails?.output_videos,
			cachedWriteTokens,
			...(cachedWriteTokens5m !== undefined ? { cachedWriteTokens5m } : {}),
			...(cachedWriteTokens1h !== undefined ? { cachedWriteTokens1h } : {}),
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
		case "insufficient_system_resource":
		case "custom_timeout":
		case "constraint":
		case "aborted":
		case "error":
			return "error";
		default:
			return "stop";
	}
}
