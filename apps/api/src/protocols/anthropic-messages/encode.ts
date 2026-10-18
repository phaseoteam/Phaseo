// Purpose: Protocol adapter for client-facing payloads.
// Why: Keeps protocol encoding/decoding separate from provider logic.
// How: Maps between protocol payloads and IR structures.

// Anthropic Messages Protocol - Encoder
// Transforms IR -> Anthropic Messages Response

import type { IRChatResponse, IRContentPart } from "@core/ir";
import { irUsageToAnthropicStyle } from "@core/cache-usage";
import { anthropicStopReasonFor, type AnthropicStopReason } from "@core/finish-reason";
import { encodeAnthropicThinkingBlock, type ReasoningResponseOrigin } from "../shared/reasoning";

import { sealToolCallSignature } from "../shared/reasoning";

/**
 * Anthropic Messages response type
 *
 * Extended with gateway fields for consistent ID tracking:
 * - id: Gateway request ID (consistent across all protocols)
 * - nativeResponseId: Provider's original response ID (for debugging)
 */
export type AnthropicMessagesResponse = {
	id: string; // Gateway request ID
	nativeResponseId?: string | null; // Provider's original response ID
	type: "message";
	role: "assistant";
	content: AnthropicResponseContent[];
	model: string;
	stop_reason: AnthropicStopReason | null;
	stop_sequence: string | null;
	usage: {
		cache_creation: any | null;
		cache_creation_input_tokens: number | null;
		cache_read_input_tokens: number | null;
		input_tokens: number;
		output_tokens: number;
		server_tool_use: any | null;
		service_tier: "standard" | "priority" | "batch" | null;
	};
};

export type AnthropicResponseContent =
	| { type: "text"; text: string; citations: any[] | null }
	| {
		type: "image";
		source: {
			type: "base64" | "url";
			media_type?: string;
			data?: string;
			url?: string;
		};
	}
	| { type: "thinking"; thinking: string; signature: string }
	| { type: "tool_use"; id: string; name: string; input: Record<string, any> }
	| Record<string, any>;

/**
 * Encode IR response to Anthropic Messages format
 *
 * Key fix: This properly emits tool_use blocks in the content array!
 *
 * @param ir - IR chat response
 * @returns Anthropic Messages response
 */
export function encodeAnthropicMessagesResponse(ir: IRChatResponse): AnthropicMessagesResponse {
	const content: AnthropicResponseContent[] = [];

	// Anthropic Messages API doesn't support multiple choices
	// Take the first choice
	const mainChoice = ir.choices[0];

	if (!mainChoice) {
		// Fallback: empty response
		return {
			id: ir.id,
			nativeResponseId: ir.nativeId,
			type: "message",
			role: "assistant",
			content: [{ type: "text", text: "", citations: null }],
			model: ir.model,
			stop_reason: "end_turn",
			stop_sequence: null,
			usage: encodeUsage(ir.usage, ir.serviceTier),
		};
	}

	const hasToolCalls = (mainChoice.message.toolCalls?.length ?? 0) > 0;
	const contentParts = mainChoice.message.content as IRContentPart[];
	const reasoningCount = countReasoningParts(contentParts);

	if (typeof mainChoice.message.refusal === "string") {
		content.push({
			type: "text",
			text: mainChoice.message.refusal,
			citations: null,
		});
	}
	const origin = { provider: ir.provider, model: ir.model };
	// Thinking generated after an earlier tool call goes back in front of the
	// call it preceded: Claude checks the order of its thinking blocks.
	const toolCallIds = new Set((mainChoice.message.toolCalls ?? []).map((call) => call.id));
	const anchored = new Map<string, IRContentPart[]>();
	const inline: IRContentPart[] = [];
	for (const part of Array.isArray(contentParts) ? contentParts : []) {
		if (part.type === "reasoning_text" && part.beforeToolCallId && toolCallIds.has(part.beforeToolCallId)) {
			anchored.set(part.beforeToolCallId, [...(anchored.get(part.beforeToolCallId) ?? []), part]);
		} else {
			inline.push(part);
		}
	}
	if (typeof mainChoice.message.refusal !== "string") {
		content.push(...encodeOrderedContentParts(inline, origin));
	}

	// CRITICAL FIX: Add tool_use blocks from tool calls
	if (mainChoice.message.toolCalls && mainChoice.message.toolCalls.length > 0) {
		for (const toolCall of mainChoice.message.toolCalls) {
			content.push(...encodeOrderedContentParts(anchored.get(toolCall.id) ?? [], origin));
			content.push({
				type: "tool_use",
				id: toolCall.id,
				name: toolCall.name,
				input: safeParseToolArguments(toolCall.arguments),
			});
		}
		// Gemini function-call signatures go back as signature-only thinking blocks after the
		// calls, as the stream sends them, so the next request can return each to its call.
		for (const toolCall of mainChoice.message.toolCalls) {
			const signature = sealToolCallSignature(toolCall, origin);
			if (signature) content.push({ type: "thinking", thinking: "", signature });
		}
	}

	if (content.length === 0 && !hasToolCalls && reasoningCount === 0) {
		content.push({ type: "text", text: "", citations: null });
	}

	// Map finish reason (stop_sequence, pause_turn and refusal ride on finishDetail)
	const stopReason = anthropicStopReasonFor(
		mainChoice.finishReason,
		mainChoice.finishDetail ?? (mainChoice.stopSequence ? "stop_sequence" : undefined),
	);

	return {
		id: ir.id,
		nativeResponseId: ir.nativeId,
		type: "message",
		role: "assistant",
		content,
		model: ir.model,
		stop_reason: stopReason,
		stop_sequence: mainChoice.stopSequence ?? null,
		usage: encodeUsage(ir.usage, ir.serviceTier),
	};
}

function encodeUsage(
	usage: IRChatResponse["usage"] | undefined,
	serviceTier: IRChatResponse["serviceTier"] | undefined,
): AnthropicMessagesResponse["usage"] {
	const anyUsage = (usage ?? {}) as any;
	const inputTokens = anyUsage.inputTokens ?? anyUsage.promptTokens;
	const outputTokens = anyUsage.outputTokens ?? anyUsage.completionTokens;
	const tier =
		serviceTier === "fast"
			? "priority"
			: serviceTier === "standard" || serviceTier === "priority" || serviceTier === "batch"
				? serviceTier
				: null;
	// Anthropic semantics: input_tokens excludes cache reads and writes, reported beside it.
	const cache = irUsageToAnthropicStyle({ ...anyUsage, inputTokens: inputTokens ?? 0 });
	const hasWriteSplit = typeof cache.write5mTokens === "number" || typeof cache.write1hTokens === "number";
	return {
		cache_creation: hasWriteSplit
			? {
				ephemeral_5m_input_tokens: cache.write5mTokens ?? 0,
				ephemeral_1h_input_tokens: cache.write1hTokens ?? 0,
			}
			: null,
		cache_creation_input_tokens: cache.writeTokens ?? null,
		cache_read_input_tokens: cache.readTokens ?? null,
		input_tokens: inputTokens == null ? 0 : cache.inputTokens,
		output_tokens: outputTokens ?? 0,
		server_tool_use:
			typeof anyUsage?._ext?.serverToolUse?.datetime_requests === "number" ||
			typeof anyUsage?._ext?.serverToolUse?.web_search_requests === "number" ||
			typeof anyUsage?._ext?.serverToolUse?.web_search_results === "number" ||
			typeof anyUsage?._ext?.serverToolUse?.web_search_extra_results === "number" ||
			typeof anyUsage?._ext?.serverToolUse?.web_fetch_requests === "number" ||
			typeof anyUsage?._ext?.serverToolUse?.advisor_requests === "number" ||
			typeof anyUsage?._ext?.serverToolUse?.image_generation_requests === "number" ||
			typeof anyUsage?._ext?.serverToolUse?.apply_patch_requests === "number" ||
			typeof anyUsage?._ext?.serverToolUse?.subagent_requests === "number" || typeof anyUsage?._ext?.serverToolUse?.fusion_requests === "number" || typeof anyUsage?._ext?.serverToolUse?.search_models_requests === "number"
				? {
					...(typeof anyUsage?._ext?.serverToolUse?.datetime_requests === "number"
						? { datetime_requests: anyUsage._ext.serverToolUse.datetime_requests }
						: {}),
					...(typeof anyUsage?._ext?.serverToolUse?.web_search_requests === "number"
						? { web_search_requests: anyUsage._ext.serverToolUse.web_search_requests }
						: {}),
					...(typeof anyUsage?._ext?.serverToolUse?.web_search_results === "number"
						? { web_search_results: anyUsage._ext.serverToolUse.web_search_results }
						: {}),
					...(typeof anyUsage?._ext?.serverToolUse?.web_search_extra_results === "number"
						? { web_search_extra_results: anyUsage._ext.serverToolUse.web_search_extra_results }
						: {}),
					...(typeof anyUsage?._ext?.serverToolUse?.web_fetch_requests === "number"
						? { web_fetch_requests: anyUsage._ext.serverToolUse.web_fetch_requests }
						: {}),
					...(typeof anyUsage?._ext?.serverToolUse?.advisor_requests === "number"
						? { advisor_requests: anyUsage._ext.serverToolUse.advisor_requests }
						: {}),
					...(typeof anyUsage?._ext?.serverToolUse?.image_generation_requests === "number"
						? { image_generation_requests: anyUsage._ext.serverToolUse.image_generation_requests }
						: {}),
					...(typeof anyUsage?._ext?.serverToolUse?.apply_patch_requests === "number"
						? { apply_patch_requests: anyUsage._ext.serverToolUse.apply_patch_requests }
						: {}),
					...(typeof anyUsage?._ext?.serverToolUse?.subagent_requests === "number" ? { subagent_requests: anyUsage._ext.serverToolUse.subagent_requests } : {}),
					...(typeof anyUsage?._ext?.serverToolUse?.fusion_requests === "number" ? { fusion_requests: anyUsage._ext.serverToolUse.fusion_requests } : {}),
					...(typeof anyUsage?._ext?.serverToolUse?.search_models_requests === "number" ? { search_models_requests: anyUsage._ext.serverToolUse.search_models_requests } : {}),
				}
			: null,
		service_tier: tier,
	};
}

function safeParseToolArguments(raw: string): Record<string, any> {
	try {
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}

function countReasoningParts(parts: IRContentPart[]): number {
	if (!Array.isArray(parts)) return 0;
	return parts.filter((part) => part.type === "reasoning_text").length;
}

function encodeOrderedContentParts(parts: IRContentPart[], origin?: ReasoningResponseOrigin): AnthropicResponseContent[] {
	if (!Array.isArray(parts)) return [];
	const content: AnthropicResponseContent[] = [];
	for (const part of parts) {
		if (part.type === "text") {
			if (part.text.length > 0) {
				content.push({
					type: "text",
					text: part.text,
					citations: null,
				});
			}
			continue;
		}
		if (part.type === "reasoning_text") {
			// Thinking with an empty text (display "omitted") still carries the
			// signature the client must send back.
			const block = encodeAnthropicThinkingBlock(part, origin);
			if (block) content.push(block);
			continue;
		}
		if (part.type === "image") {
			if (part.source === "data") {
				content.push({
					type: "image",
					source: {
						type: "base64",
						media_type: part.mimeType,
						data: part.data,
					},
				});
				continue;
			}
			content.push({
				type: "image",
				source: {
					type: "url",
					media_type: part.mimeType,
					url: part.data,
				},
			});
			continue;
		}
		if (part.type === "provider_block") {
			content.push(part.block);
		}
	}
	return content;
}
