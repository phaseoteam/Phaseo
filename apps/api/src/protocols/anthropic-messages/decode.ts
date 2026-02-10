// Purpose: Protocol adapter for client-facing payloads.
// Why: Keeps protocol encoding/decoding separate from provider logic.
// How: Maps between protocol payloads and IR structures.

// Anthropic Messages Protocol - Decoder
// Transforms Anthropic Messages Request -> IR

import type {
	IRChatRequest,
	IRMessage,
	IRContentPart,
	IRToolCall,
	IRToolResult,
	IRTool,
} from "@core/ir";
import { mapAnthropicEffortToIr } from "@core/reasoningEffort";

/**
 * Anthropic Messages request type
 * Based on: https://docs.anthropic.com/claude/reference/messages_post
 */
export type AnthropicMessagesRequest = {
	model: string;
	messages: AnthropicMessage[];
	system?: string | AnthropicContentBlock[];
	max_tokens: number;
	temperature?: number;
	top_p?: number;
	top_k?: number;
	stream?: boolean;
	tools?: AnthropicTool[];
	tool_choice?: AnthropicToolChoice;
	metadata?: Record<string, any>;
	service_tier?: string;
	speed?: string;
	stop_sequences?: string[];
	thinking?: {
		type: "enabled" | "disabled" | "adaptive";
		budget_tokens?: number;
		effort?: "low" | "medium" | "high" | "max" | "xhigh";
	};
	output_config?: {
		effort?: "low" | "medium" | "high" | "max" | "xhigh";
	};
	reasoning?: {
		effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
	};
};

export type AnthropicMessage = {
	role: "user" | "assistant";
	content: string | AnthropicContentBlock[];
};

export type AnthropicContentBlock =
	| { type: "text"; text: string }
	| { type: "image"; source: { type: "base64" | "url"; data?: string; url?: string; media_type?: string } }
	| { type: "tool_use"; id: string; name: string; input: Record<string, any> }
	| { type: "tool_result"; tool_use_id: string; content: string | any[] };

export type AnthropicTool = {
	name: string;
	description?: string;
	input_schema: Record<string, any>;
};

export type AnthropicToolChoice =
	| { type: "auto" }
	| { type: "any" }
	| { type: "tool"; name: string };

/**
 * Decode Anthropic Messages request to IR format
 *
 * Anthropic differences:
 * - System message is a separate field (not in messages array)
 * - Tools use input_schema instead of parameters
 * - Tool calls are content blocks with type="tool_use"
 * - Tool results are in user messages as content blocks with type="tool_result"
 *
 * @param req - Anthropic Messages request
 * @returns IR chat request
 */
export function decodeAnthropicMessagesRequest(req: AnthropicMessagesRequest): IRChatRequest {
	const messages: IRMessage[] = [];

	// Handle system message (can be string or content blocks)
	if (req.system) {
		const systemContent =
			typeof req.system === "string"
				? [{ type: "text" as const, text: req.system }]
				: req.system.map(normalizeAnthropicContent);

		messages.push({
			role: "system",
			content: systemContent,
		});
	}

	// Transform messages
	for (const msg of req.messages) {
		if (msg.role === "user") {
			if (typeof msg.content === "string") {
				messages.push({
					role: "user",
					content: [{ type: "text", text: msg.content }],
				});
				continue;
			}

			const contentParts: IRContentPart[] = [];
			const toolResults: IRToolResult[] = [];

			for (const block of msg.content) {
				if (block.type === "tool_result") {
					toolResults.push({
						toolCallId: block.tool_use_id,
						content: normalizeToolResultContent(block.content),
					});
					continue;
				}

				const normalized = normalizeAnthropicContent(block);
				if (normalized) {
					contentParts.push(normalized);
				}
			}

			if (contentParts.length > 0) {
				messages.push({
					role: "user",
					content: contentParts,
				});
			}

			if (toolResults.length === 0 && contentParts.length === 0) {
				messages.push({
					role: "user",
					content: [],
				});
			}

			if (toolResults.length > 0) {
				messages.push({
					role: "tool",
					toolResults,
				});
			}
		} else if (msg.role === "assistant") {
			// Extract text content and tool calls from assistant message
			const content = normalizeAnthropicMessageContent(msg.content);
			const toolCalls: IRToolCall[] = [];

			// Separate tool_use blocks from text content
			const textContent: IRContentPart[] = [];
			for (const part of content) {
				if ((part as any).type === "tool_use") {
					const toolUse = part as any;
					toolCalls.push({
						id: toolUse.id,
						name: toolUse.name,
						arguments: JSON.stringify(toolUse.input),
					});
				} else {
					textContent.push(part);
				}
			}

			messages.push({
				role: "assistant",
				content: textContent,
				toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
			});
		}
	}

	// Transform tools
	const tools: IRTool[] | undefined = req.tools?.map((t) => ({
		name: t.name,
		description: t.description,
		parameters: t.input_schema,
	}));

	// Transform tool choice
	const toolChoice = normalizeAnthropicToolChoice(req.tool_choice);

	return {
		messages,
		model: req.model,
		stream: req.stream ?? false,

		// Generation parameters
		maxTokens: req.max_tokens ?? (req as any).max_output_tokens,
		temperature: req.temperature,
		topP: req.top_p,
		topK: req.top_k,

		// Tool calling
		tools,
		toolChoice,

		// Reasoning / thinking
		reasoning: resolveRequestedReasoning(req),

		// Advanced parameters
		stop: req.stop_sequences,
		metadata: req.metadata,
		speed: typeof req.speed === "string" ? req.speed : undefined,
		serviceTier: resolveRequestedServiceTier(req),
		modalities: Array.isArray((req as any).modalities) ? (req as any).modalities : undefined,
	};
}

function resolveRequestedReasoning(req: AnthropicMessagesRequest): IRChatRequest["reasoning"] {
	const outputConfigEffort = req.output_config?.effort;
	const anthropicReasoningEffort = req.reasoning?.effort;
	const thinkingEffort = req.thinking?.effort;
	const effort = mapAnthropicEffortToIr(outputConfigEffort ?? anthropicReasoningEffort ?? thinkingEffort);
	const enabled = req.thinking ? req.thinking.type === "enabled" : undefined;
	const maxTokens = req.thinking?.budget_tokens;

	if (effort === undefined && enabled === undefined && maxTokens === undefined) {
		return undefined;
	}

	return {
		effort,
		enabled,
		maxTokens,
	};
}

/**
 * Normalize Anthropic message content to IR content parts
 */
function normalizeAnthropicMessageContent(
	content: string | AnthropicContentBlock[],
): IRContentPart[] {
	if (typeof content === "string") {
		return [{ type: "text", text: content }];
	}

	return content.map(normalizeAnthropicContent);
}

/**
 * Normalize single Anthropic content block to IR content part
 */
function normalizeAnthropicContent(block: AnthropicContentBlock): IRContentPart | any {
	if (block.type === "text") {
		return { type: "text", text: block.text };
	}

	if (block.type === "image") {
		if (block.source.type === "url") {
			return {
				type: "image",
				source: "url" as const,
				data: block.source.url || "",
				mimeType: block.source.media_type,
			};
		} else {
			return {
				type: "image",
				source: "data" as const,
				data: block.source.data || "",
				mimeType: block.source.media_type,
			};
		}
	}

	if (block.type === "tool_use") {
		// Pass through tool_use blocks - will be extracted in parent function
		return block as any;
	}

	if (block.type === "tool_result") {
		// Tool results will be handled separately
		return undefined;
	}

	// Fallback: unknown type -> text
	return { type: "text", text: String(block) };
}

function normalizeToolResultContent(content: string | any[]): string {
	if (typeof content === "string") {
		return content;
	}

	if (Array.isArray(content)) {
		return content
			.map((part) => (part && part.type === "text" ? part.text : ""))
			.join("");
	}

	return String(content);
}

/**
 * Normalize Anthropic tool choice to IR format
 */
function normalizeAnthropicToolChoice(choice: any): IRChatRequest["toolChoice"] {
	if (!choice) return undefined;

	if (typeof choice === "object") {
		if (choice.type === "auto") return "auto";
		if (choice.type === "any") return "required";
		if (choice.type === "tool" && choice.name) {
			return { name: choice.name };
		}
	}

	return undefined;
}

function resolveRequestedServiceTier(req: AnthropicMessagesRequest): string | undefined {
	const speed = typeof req.speed === "string" ? req.speed.toLowerCase() : undefined;
	if (speed === "fast") return "priority";
	return typeof req.service_tier === "string" ? req.service_tier : undefined;
}

