// OpenAI Chat Completions format transformations
// Transforms IR ↔ OpenAI Chat Completions upstream format

import type { IRChatRequest, IRChatResponse, IRMessage, IRContentPart } from "@core/ir";
import { applyChatRequestQuirks, applyChatResponseQuirks } from "./chat-quirks";

/**
 * Transform IR request to OpenAI Chat Completions format
 * Used when provider only supports /chat/completions (not /responses)
 */
export function irToOpenAIChat(ir: IRChatRequest, model?: string | null, providerId?: string): any {
	const messages: any[] = [];

	for (const msg of ir.messages) {
		if (msg.role === "system") {
			messages.push({
				role: "system",
				content: msg.content.map((c) => (c.type === "text" ? c.text : "")).join(""),
			});
		} else if (msg.role === "user") {
			messages.push({
				role: "user",
				content: mapIRContentToOpenAI(msg.content),
			});
		} else if (msg.role === "assistant") {
			const message: any = {
				role: "assistant",
				content: msg.content.map((c) => (c.type === "text" ? c.text : "")).join("") || null,
			};

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
	if (ir.maxTokens !== undefined) request.max_tokens = ir.maxTokens;
	if (ir.temperature !== undefined) request.temperature = ir.temperature;
	if (ir.topP !== undefined) request.top_p = ir.topP;

	applyChatRequestQuirks({ ir, providerId, model, request });

	// Tools
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

	if (ir.toolChoice) {
		if (typeof ir.toolChoice === "string") {
			request.tool_choice = ir.toolChoice;
		} else {
			request.tool_choice = {
				type: "function",
				function: { name: ir.toolChoice.name },
			};
		}
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
	if (ir.stop) request.stop = ir.stop;
	if (ir.seed !== undefined) request.seed = ir.seed;
	if (ir.user !== undefined) request.user = ir.user;

	return request;
}

/**
 * Map IR content to OpenAI Chat content
 */
function mapIRContentToOpenAI(content: IRContentPart[]): any {
	if (content.length === 1 && content[0].type === "text") {
		return content[0].text;
	}

	return content.map((part) => {
		if (part.type === "text") {
			return { type: "text", text: part.text };
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
			return {
				type: "input_audio",
				input_audio: { data: part.data, format: part.format || "wav" },
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

		const rawContent = extractChoiceContent(choice.message?.content);
		const { main, reasoning } = applyChatResponseQuirks({ providerId: provider, choice, rawContent });
		const content = main ?? "";

		if (reasoning.length > 0) {
			for (const reasoningText of reasoning) {
				choices.push({
					index: choice.index || 0,
					message: {
						role: "assistant",
						content: reasoningText,
					},
					finishReason: null,
					reasoning: true,
				});
			}
		}

		choices.push({
			index: choice.index || 0,
			message: {
				role: "assistant" as const,
				content,
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
		usage: json.usage
			? {
					inputTokens: json.usage.prompt_tokens || 0,
					outputTokens: json.usage.completion_tokens || 0,
					totalTokens: json.usage.total_tokens || 0,
					// Support both direct reasoning_tokens and nested completion_tokens_details.reasoning_tokens (MiniMax format)
					reasoningTokens: json.usage.reasoning_tokens ?? json.usage.completion_tokens_details?.reasoning_tokens,
			  }
			: undefined,
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
