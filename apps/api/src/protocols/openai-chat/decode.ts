// OpenAI Chat Completions Protocol - Decoder
// Transforms OpenAI Chat Completions Request → IR

import type { ChatCompletionsRequest } from "@core/schemas";
import type {
	IRChatRequest,
	IRMessage,
	IRContentPart,
	IRToolCall,
	IRToolResult,
	IRTool,
	IRToolChoice,
} from "@core/ir";

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
	// Transform messages
	const messages: IRMessage[] = [];

	// Handle top-level system field (convenience field)
	if (req.system) {
		messages.push({
			role: "system",
			content: [{ type: "text", text: req.system }],
		});
	}

	// Transform message array
	for (const msg of req.messages) {
		const normalizedRole =
			msg.role === "developer" ? "system" : msg.role;

		if (normalizedRole === "system" || normalizedRole === "user") {
			messages.push({
				role: normalizedRole,
				content: normalizeContent(msg.content),
			});
		} else if (normalizedRole === "assistant") {
			messages.push({
				role: "assistant",
				content: normalizeContent(msg.content || ""),
				toolCalls: msg.tool_calls?.map(decodeToolCall),
			});
		} else if (normalizedRole === "tool") {
			// Tool result message
			messages.push({
				role: "tool",
				toolResults: [
					{
						toolCallId: msg.tool_call_id,
						content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
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
			}
			: undefined,

		// Response format
		responseFormat: normalizeResponseFormat(req.response_format),

		// Advanced parameters
		frequencyPenalty: req.frequency_penalty,
		presencePenalty: req.presence_penalty,
		logitBias: req.logit_bias,
		logprobs: req.logprobs,
		topLogprobs: req.top_logprobs,
		stop: req.stop,

		// Metadata
		userId: req.user_id ?? req.user,
		metadata: req.user ? { user: req.user } : undefined,
	};
}

/**
 * Normalize content to IRContentPart[]
 * Handles both string and array content
 */
function normalizeContent(content: string | any[]): IRContentPart[] {
	if (typeof content === "string") {
		return [{ type: "text", text: content }];
	}

	if (Array.isArray(content)) {
		return content.map((part) => {
			if (part.type === "text") {
				return { type: "text", text: part.text };
			}

			if (part.type === "image_url") {
				const url = part.image_url?.url || part.image_url;
				const isDataUrl = url.startsWith("data:");
				const data = isDataUrl ? url.split(",")[1] ?? "" : url;
				return {
					type: "image",
					source: isDataUrl ? "data" : "url",
					data,
					detail: part.image_url?.detail,
				} as IRContentPart;
			}

			if (part.type === "input_audio") {
				return {
					type: "audio",
					source: "data",
					data: part.input_audio?.data || part.data,
					format: part.input_audio?.format || part.format,
				} as IRContentPart;
			}

			if (part.type === "input_video") {
				return {
					type: "video",
					source: "url",
					url: part.video_url || part.url,
				} as IRContentPart;
			}

			// Fallback: treat unknown types as text
			return { type: "text", text: String(part) };
		});
	}

	// Fallback: empty content
	return [];
}

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
				schema: format.schema || format.json_schema?.schema,
				name: format.name || format.json_schema?.name,
				strict: format.strict || format.json_schema?.strict,
			};
		}

		return { type: "text" };
	}

	return undefined;
}
