// Purpose: Give the audit a whole Messages reply for streamed /v1/messages requests.
// Why: A Messages stream ends with message_delta and message_stop, which carry no
//      content. Without this, the audit saw no text or tool_use blocks, so the I/O
//      log lost the reply and structured-output and tool-call checks could not run.
// How: Fold the events the client received into a `message` as they pass, the same
//      way chat-stream-log-snapshot.ts folds Chat chunks, under the same size cap.

import { MAX_ACCUMULATED_BYTES, utf8Length, utf8Prefix } from "./chat-stream-log-snapshot";

type BlockState = {
	index: number;
	block: Record<string, any>;
	text: string;
	partialJson: string;
};

export type MessagesEventAccumulator = {
	add: (frame: unknown) => void;
	toMessage: () => Record<string, unknown> | null;
};

export function createMessagesEventAccumulator(): MessagesEventAccumulator {
	const blocks = new Map<number, BlockState>();
	let header: Record<string, unknown> = {};
	let stopReason: unknown = null;
	let stopSequence: unknown = null;
	let usage: Record<string, unknown> | null = null;
	let sawEvent = false;
	let bytes = 0;
	let truncated = false;

	const append = (current: string, next: unknown): string => {
		if (typeof next !== "string" || next.length === 0) return current;
		const size = utf8Length(next);
		if (bytes + size <= MAX_ACCUMULATED_BYTES) {
			bytes += size;
			return current + next;
		}
		truncated = true;
		const piece = utf8Prefix(next, MAX_ACCUMULATED_BYTES - bytes);
		bytes = MAX_ACCUMULATED_BYTES;
		return current + piece;
	};

	return {
		add(frame) {
			const event = frame as Record<string, any> | null;
			if (!event || typeof event !== "object" || typeof event.type !== "string") return;
			switch (event.type) {
				case "message_start": {
					sawEvent = true;
					const { content: _content, ...message } = event.message ?? {};
					header = message;
					if (message.usage && typeof message.usage === "object") usage = { ...message.usage };
					return;
				}
				case "content_block_start": {
					sawEvent = true;
					const index = typeof event.index === "number" ? event.index : blocks.size;
					const block = event.content_block && typeof event.content_block === "object" ? { ...event.content_block } : {};
					blocks.set(index, {
						index,
						block,
						text: typeof block.text === "string" ? append("", block.text) : typeof block.thinking === "string" ? append("", block.thinking) : "",
						partialJson: "",
					});
					return;
				}
				case "content_block_delta": {
					sawEvent = true;
					const index = typeof event.index === "number" ? event.index : 0;
					let state = blocks.get(index);
					if (!state) {
						state = { index, block: { type: "text" }, text: "", partialJson: "" };
						blocks.set(index, state);
					}
					const delta = event.delta ?? {};
					if (delta.type === "text_delta") state.text = append(state.text, delta.text);
					else if (delta.type === "thinking_delta") state.text = append(state.text, delta.thinking);
					else if (delta.type === "input_json_delta") state.partialJson = append(state.partialJson, delta.partial_json);
					else if (delta.type === "signature_delta" && typeof delta.signature === "string") state.block.signature = delta.signature;
					return;
				}
				case "message_delta": {
					sawEvent = true;
					if (event.delta?.stop_reason !== undefined) stopReason = event.delta.stop_reason;
					if (event.delta?.stop_sequence !== undefined) stopSequence = event.delta.stop_sequence;
					if (event.usage && typeof event.usage === "object") usage = { ...(usage ?? {}), ...event.usage };
					return;
				}
				default:
					return;
			}
		},
		toMessage() {
			if (!sawEvent) return null;
			const content = Array.from(blocks.values())
				.sort((a, b) => a.index - b.index)
				.map(({ block, text, partialJson }) => {
					if (block.type === "text") return { ...block, text };
					if (block.type === "thinking") return { ...block, thinking: text };
					if (block.type === "tool_use" || block.type === "server_tool_use") {
						// A tool call's input arrives as JSON fragments. Unparseable input is kept
						// as text, so the tool-call check reports it as invalid JSON.
						let input: unknown = block.input ?? {};
						if (partialJson.length > 0) {
							try {
								input = JSON.parse(partialJson);
							} catch {
								input = partialJson;
							}
						}
						return { ...block, input };
					}
					return block;
				});
			return {
				...header,
				type: "message",
				role: header.role ?? "assistant",
				content,
				stop_reason: stopReason,
				stop_sequence: stopSequence,
				...(usage ? { usage } : {}),
				...(truncated ? { gateway_log_truncated: true } : {}),
			};
		},
	};
}

/**
 * The response the audit should record: the stream's own final snapshot when it
 * is a whole message, otherwise the message assembled from the events.
 */
export function resolveMessagesStreamAuditResponse(
	snapshot: unknown,
	accumulator: MessagesEventAccumulator,
): unknown {
	const message = snapshot as Record<string, unknown> | null;
	if (message?.type === "message" && Array.isArray(message.content)) return snapshot;
	return accumulator.toMessage() ?? snapshot;
}
