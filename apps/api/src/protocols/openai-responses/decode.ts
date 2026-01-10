// OpenAI Responses Protocol - Decoder
// Transforms OpenAI Responses Request → IR

import type {
	IRChatRequest,
	IRMessage,
	IRContentPart,
	IRToolCall,
	IRToolResult,
	IRTool,
	IRReasoning,
} from "@core/ir";
import type { ResponsesRequest } from "@core/schemas";
import { decodeOpenAIChatRequest } from "../openai-chat/decode";

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

	// Handle instructions as system message
	if (req.instructions) {
		messages.push({
			role: "system",
			content: [{ type: "text", text: req.instructions }],
		});
	}

	// Process input
	if (input) {
		// Simple string input = user message
		if (typeof input === "string") {
			messages.push({
				role: "user",
				content: [{ type: "text", text: input }],
			});
		}
		// Array of input items
		else if (Array.isArray(input)) {
			for (const item of input) {
				// Message item
				if (item.type === "message" || (!item.type && item.role && "content" in item)) {
					const content = Array.isArray(item.content)
						? normalizeOpenAIResponsesContent(item.content)
						: [{ type: "text" as const, text: String(item.content) }];

					if (item.role === "user" || item.role === "system" || item.role === "developer") {
						messages.push({
							role: item.role === "developer" ? "system" : item.role,
							content,
						});
					} else if (item.role === "assistant") {
						messages.push({
							role: "assistant",
							content,
						});
					}
				}
				// Fallback: accept Chat Completions-style requests sent to /responses
				else if (Array.isArray((req as any).messages)) {
					return decodeOpenAIChatRequest(req as any);
				}
				// Function call item (assistant tool call)
				else if (item.type === "function_call") {
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
					// Create tool result message
					messages.push({
						role: "tool",
						toolResults: [
							{
								toolCallId: item.call_id,
								content: item.output || "",
							},
						],
					});
				}
			}
		}
	}

	// Transform tools
	const tools: IRTool[] | undefined = req.tools?.map((t: any) => ({
		name: t.name || t.function?.name,
		description: t.description || t.function?.description,
		parameters: t.parameters || t.function?.parameters || {},
	}));

	// Transform tool choice
	let toolChoice: IRChatRequest["toolChoice"] = undefined;
	if (req.tool_choice) {
		if (typeof req.tool_choice === "string") {
			if (req.tool_choice === "auto") toolChoice = "auto";
			else if (req.tool_choice === "required" || req.tool_choice === "any") toolChoice = "required";
			else if (req.tool_choice === "none") toolChoice = undefined;
		} else if (typeof req.tool_choice === "object" && req.tool_choice.name) {
			toolChoice = { name: req.tool_choice.name };
		}
	}

	// Transform reasoning
	let reasoning: IRReasoning | undefined = undefined;
	if (req.reasoning) {
		reasoning = {
			effort: req.reasoning.effort || "medium",
			summary: req.reasoning.summary || undefined,
		};
	}

	return {
		messages,
		model: req.model,
		stream: req.stream ?? false,

		// Generation parameters
		maxTokens: req.max_output_tokens,
		temperature: req.temperature,
		topP: req.top_p,

		// Tool calling
		tools,
		toolChoice,

		// Reasoning
		reasoning,

		// Advanced parameters
		metadata: req.metadata,
	};
}

/**
 * Normalize OpenAI Responses content to IR content parts
 */
function normalizeOpenAIResponsesContent(content: any): IRContentPart[] {
	if (typeof content === "string") {
		return [{ type: "text", text: content }];
	}

	if (Array.isArray(content)) {
		return content.map((part: any) => {
			if (part.type === "input_text") {
				return { type: "text", text: part.text };
			}

			if (part.type === "text") {
				return { type: "text", text: part.text };
			}

			if (part.type === "input_image") {
				const url = part.image_url || part.url || part.image_url?.url;
				return {
					type: "image",
					source: typeof url === "string" && url.startsWith("data:") ? "data" : "url",
					data: url || "",
					detail: part.image_detail || part.detail,
				};
			}

			if (part.type === "image_url") {
				return {
					type: "image",
					source: "url" as const,
					data: part.image_url?.url || "",
					detail: part.image_url?.detail,
				};
			}

			if (part.type === "input_audio") {
				return {
					type: "audio",
					source: "data" as const,
					data: part.input_audio?.data || "",
					format: part.input_audio?.format,
				};
			}

			// Fallback: treat as text
			return { type: "text", text: String(part) };
		});
	}

	// Fallback: treat as text
	return [{ type: "text", text: String(content) }];
}
