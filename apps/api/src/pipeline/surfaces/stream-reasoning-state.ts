// Purpose: Keep provider reasoning state when a client-protocol stream is rebuilt into IR.
// Why: Buffered clients are served from the streamed response (materializeStreamResultToCompleted).
//      The stream carries thinking signatures, redacted thinking and encrypted reasoning, but the
//      rebuilt IR kept only the reasoning text, so a non-streaming tool loop could not replay them.
// How: Collect the reasoning entries the gateway already wrote into the stream (Chat
//      `reasoning_details`, Messages `thinking`/`redacted_thinking` blocks, Responses `reasoning`
//      items), decode them with the request-side protocol decoders, and merge them into the
//      rebuilt choice so encodeProtocol can return them again.

import type { IRChatResponse, IRContentPart } from "@core/ir";
import { isSealedReasoningValue } from "@core/reasoning-state";
import type { Protocol } from "@protocols/detect";
import {
	applyToolCallSignatures,
	decodeAnthropicThinkingBlock,
	decodeChatReasoningDetails,
	decodeResponsesReasoningItem,
	type ReasoningPart,
	type ToolCallSignature,
} from "@protocols/shared/reasoning";

type AnthropicStreamBlock =
	| { kind: "thinking"; block: { type: "thinking" | "redacted_thinking"; thinking?: string; signature?: string; data?: string } }
	| { kind: "tool_use"; id: string };

type DecodedChoiceReasoning = {
	parts: Array<{ part: ReasoningPart; nextToolUseId?: string }>;
	toolSignatures: Map<string, ToolCallSignature>;
};

function hasState(part: ReasoningPart): boolean {
	return Boolean(part.thoughtSignature || part.redactedData || part.encryptedContent);
}

function isSealedEntry(entry: any): boolean {
	return isSealedReasoningValue(entry?.signature) || isSealedReasoningValue(entry?.data);
}

export type StreamReasoningStateCollector = {
	push(eventName: string | null, payload: any): void;
	apply(ir: IRChatResponse): void;
};

export function createStreamReasoningStateCollector(protocol: Protocol): StreamReasoningStateCollector {
	// Chat: sealed reasoning_details entries per choice, in stream order.
	const chatDetails = new Map<number, any[]>();
	const chatSeen = new Set<string>();
	// Chat: the terminal chat.completion snapshot's full reasoning_details. Deltas carry only
	// sealed entries; the snapshot also keeps the text or summary paired with each encrypted entry.
	const chatSnapshotDetails = new Map<number, any[]>();
	// Messages: thinking and tool_use blocks in the order they closed.
	const anthropicBlocks: AnthropicStreamBlock[] = [];
	const openAnthropicBlocks = new Map<number, AnthropicStreamBlock>();
	// Responses: reasoning items carrying sealed state and function calls, in output order.
	const responsesItems: Array<{ kind: "reasoning"; item: any } | { kind: "call"; id: string }> = [];
	const responsesSeen = new Set<string>();

	const closeAnthropicBlock = (index: number) => {
		const block = openAnthropicBlocks.get(index);
		if (!block) return;
		openAnthropicBlocks.delete(index);
		anthropicBlocks.push(block);
	};

	const pushChat = (payload: any) => {
		const choices = Array.isArray(payload?.choices) ? payload.choices : [];
		for (const choice of choices) {
			const details = choice?.delta?.reasoning_details ?? choice?.message?.reasoning_details;
			if (!Array.isArray(details)) continue;
			const index = Number.isFinite(Number(choice?.index)) ? Number(choice.index) : 0;
			if (Array.isArray(choice?.message?.reasoning_details) && details.some(isSealedEntry)) {
				chatSnapshotDetails.set(index, details);
			}
			for (const entry of details) {
				if (!entry || typeof entry !== "object" || !isSealedEntry(entry)) continue;
				// Terminal chat.completion snapshots repeat the entries already streamed.
				const key = `${index}:${entry.signature ?? ""}:${entry.data ?? ""}`;
				if (chatSeen.has(key)) continue;
				chatSeen.add(key);
				chatDetails.set(index, [...(chatDetails.get(index) ?? []), entry]);
			}
		}
	};

	const pushAnthropic = (eventName: string | null, payload: any) => {
		const type = String(payload?.type ?? eventName ?? "");
		const index = Number.isFinite(Number(payload?.index)) ? Number(payload.index) : 0;
		if (type === "content_block_start") {
			closeAnthropicBlock(index);
			const block = payload?.content_block;
			if (block?.type === "thinking") {
				openAnthropicBlocks.set(index, {
					kind: "thinking",
					block: {
						type: "thinking",
						thinking: typeof block.thinking === "string" ? block.thinking : "",
						signature: typeof block.signature === "string" ? block.signature : "",
					},
				});
			} else if (block?.type === "redacted_thinking" && typeof block.data === "string") {
				openAnthropicBlocks.set(index, { kind: "thinking", block: { type: "redacted_thinking", data: block.data } });
			} else if (block?.type === "tool_use" && typeof block.id === "string") {
				openAnthropicBlocks.set(index, { kind: "tool_use", id: block.id });
			}
			return;
		}
		if (type === "content_block_delta") {
			const open = openAnthropicBlocks.get(index);
			if (open?.kind !== "thinking" || open.block.type !== "thinking") return;
			const delta = payload?.delta;
			if (delta?.type === "thinking_delta" && typeof delta.thinking === "string") {
				open.block.thinking = (open.block.thinking ?? "") + delta.thinking;
			} else if (delta?.type === "signature_delta" && typeof delta.signature === "string") {
				open.block.signature = (open.block.signature ?? "") + delta.signature;
			}
			return;
		}
		if (type === "content_block_stop") closeAnthropicBlock(index);
	};

	const pushResponsesItem = (item: any) => {
		// response.completed repeats the items already announced by output_item.done.
		if (item?.type === "function_call" && typeof item.call_id === "string" && item.call_id) {
			const key = `call:${item.call_id}`;
			if (responsesSeen.has(key)) return;
			responsesSeen.add(key);
			responsesItems.push({ kind: "call", id: item.call_id });
			return;
		}
		if (item?.type !== "reasoning" || !isSealedReasoningValue(item.encrypted_content)) return;
		if (responsesSeen.has(item.encrypted_content)) return;
		responsesSeen.add(item.encrypted_content);
		responsesItems.push({ kind: "reasoning", item });
	};

	const pushResponses = (eventName: string | null, payload: any) => {
		const type = String(eventName ?? payload?.type ?? "");
		if (type === "response.output_item.done") {
			pushResponsesItem(payload?.item);
			return;
		}
		const output = payload?.response?.output ?? (payload?.object === "response" ? payload?.output : null);
		if (Array.isArray(output)) for (const item of output) pushResponsesItem(item);
	};

	const decodeChoice = (choiceIndex: number, toolCallIds: ReadonlySet<string>): DecodedChoiceReasoning | null => {
		if (protocol === "openai.chat.completions") {
			const details = chatSnapshotDetails.get(choiceIndex) ?? chatDetails.get(choiceIndex);
			if (!details?.length) return null;
			const decoded = decodeChatReasoningDetails(details, toolCallIds);
			return { parts: decoded.parts.map((part) => ({ part })), toolSignatures: decoded.toolSignatures };
		}
		if (choiceIndex !== 0) return null;
		if (protocol === "anthropic.messages") {
			for (const index of [...openAnthropicBlocks.keys()]) closeAnthropicBlock(index);
			const parts: DecodedChoiceReasoning["parts"] = [];
			const toolSignatures = new Map<string, ToolCallSignature>();
			let sawToolUse = false;
			// Thinking after an earlier tool_use belongs in front of the next one.
			const pendingAnchor: DecodedChoiceReasoning["parts"] = [];
			for (const entry of anthropicBlocks) {
				if (entry.kind === "tool_use") {
					sawToolUse = true;
					for (const anchored of pendingAnchor.splice(0)) anchored.nextToolUseId = entry.id;
					continue;
				}
				const decoded = decodeAnthropicThinkingBlock(entry.block);
				if (!decoded) continue;
				if (decoded.kind === "tool_signature") {
					toolSignatures.set(decoded.callId, decoded.signature);
					continue;
				}
				const collected: DecodedChoiceReasoning["parts"][number] = { part: decoded.part };
				parts.push(collected);
				if (sawToolUse) pendingAnchor.push(collected);
			}
			return { parts, toolSignatures };
		}
		if (protocol === "openai.responses") {
			const parts: DecodedChoiceReasoning["parts"] = [];
			const toolSignatures = new Map<string, ToolCallSignature>();
			let sawCall = false;
			// Reasoning after an earlier function_call belongs in front of the next one.
			const pendingAnchor: DecodedChoiceReasoning["parts"] = [];
			for (const entry of responsesItems) {
				if (entry.kind === "call") {
					sawCall = true;
					for (const anchored of pendingAnchor.splice(0)) anchored.nextToolUseId = entry.id;
					continue;
				}
				const decoded = decodeResponsesReasoningItem(entry.item);
				if (!decoded) continue;
				if (decoded.kind === "tool_signature") {
					toolSignatures.set(decoded.callId, decoded.signature);
					continue;
				}
				const collected: DecodedChoiceReasoning["parts"][number] = { part: decoded.part };
				parts.push(collected);
				if (sawCall) pendingAnchor.push(collected);
			}
			return { parts, toolSignatures };
		}
		return null;
	};

	return {
		push(eventName, payload) {
			if (!payload || typeof payload !== "object") return;
			if (protocol === "openai.chat.completions") pushChat(payload);
			else if (protocol === "anthropic.messages") pushAnthropic(eventName, payload);
			else if (protocol === "openai.responses") pushResponses(eventName, payload);
		},
		apply(ir) {
			for (const choice of ir.choices) {
				const toolCalls = choice.message.toolCalls;
				const toolCallIds = new Set((toolCalls ?? []).map((call) => call.id));
				const decoded = decodeChoice(choice.index, toolCallIds);
				if (!decoded) continue;
				applyToolCallSignatures(toolCalls, decoded.toolSignatures);
				// Without state there is nothing the accumulated text does not already carry.
				if (!decoded.parts.some(({ part }) => hasState(part))) continue;
				const parts: ReasoningPart[] = decoded.parts.map(({ part, nextToolUseId }) =>
					nextToolUseId && toolCallIds.has(nextToolUseId) ? { ...part, beforeToolCallId: nextToolUseId } : part);
				mergeReasoningParts(choice.message.content, parts);
			}
		},
	};
}

/**
 * Put decoded reasoning parts in place of the plain reasoning text rebuilt from
 * the stream's deltas. Parts that carry their own text replace it (the text must
 * stay paired with its signature); state-only parts attach to it.
 */
function mergeReasoningParts(content: IRContentPart[], parts: ReasoningPart[]): void {
	const plainIndex = content.findIndex((part) => part.type === "reasoning_text" && !hasState(part));
	const plain = plainIndex >= 0 ? (content[plainIndex] as ReasoningPart) : null;
	const decodedText = parts.map((part) => part.text).join("");
	if (decodedText.length > 0 || !plain) {
		content.splice(plainIndex >= 0 ? plainIndex : 0, plainIndex >= 0 ? 1 : 0, ...parts);
		return;
	}
	const [first, ...rest] = parts;
	content.splice(plainIndex, 1, { ...first, text: plain.text, ...(plain.summary && !first.summary ? { summary: plain.summary } : {}) }, ...rest);
}
