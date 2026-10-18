// Purpose: Re-encode a stream whose wire shape differs from the client's protocol.
// Why: Encoding each canonical event on its own cannot keep a protocol's grammar: a
//      Messages stream needs content_block_start/stop around its deltas and a final
//      message_stop, a Responses stream needs output_item.added before deltas and one
//      terminal event, and neither should carry the foreign snapshot frame.
// How: Wrap the per-event encoder with the little state each grammar needs. Frames the
//      client protocol has no place for are dropped; terminal frames wait for usage
//      that some sources (Chat) send after the finish.

import { encodeUnifiedStreamEvent, type EncodedStreamFrame, type StreamProtocol } from "@protocols/stream/encode";
import { normalizeFinishReason, responsesStatusFor, anthropicStopReasonFor } from "@core/finish-reason";
import { createToolCallKeyResolver, type UnifiedStreamEvent } from "./stream-events";

export type StreamSourceFrame = { eventName?: string | null; frame: any };

export type StreamReencoder = {
	/** Client frames for the canonical events of one source frame. */
	encode(events: UnifiedStreamEvent[], source?: StreamSourceFrame): EncodedStreamFrame[];
	/** Frames still owed when the source ends (a terminal waiting for usage). */
	flush(): EncodedStreamFrame[];
};

type EncodeContext = { requestId?: string | null; model?: string | null };

type ArgumentsSent = "none" | "delta" | "full";

function reasoningItemText(item: any): string {
	const parts = [
		...(Array.isArray(item?.content) ? item.content : []),
		...(Array.isArray(item?.summary) ? item.summary : []),
	];
	return parts.map((part: any) => (typeof part?.text === "string" ? part.text : "")).join("");
}

/**
 * Reasoning text in Responses frames the canonical events do not cover: the legacy
 * `response.reasoning.delta` and summary deltas, and a reasoning item that arrives
 * whole in `output_item.done` (Messages clients get it as a thinking block).
 */
function reasoningFromResponsesFrame(source: StreamSourceFrame | undefined, sawThinking: boolean): UnifiedStreamEvent[] {
	const name = String(source?.eventName ?? source?.frame?.type ?? "");
	const frame = source?.frame;
	if (
		(name === "response.reasoning.delta" || name === "response.reasoning_summary_text.delta") &&
		typeof frame?.delta === "string" && frame.delta.length > 0
	) {
		return [{ type: "delta_text", channel: "reasoning_text", text: frame.delta, choiceIndex: 0 }];
	}
	if (name === "response.output_item.done" && frame?.item?.type === "reasoning" && !sawThinking) {
		const text = reasoningItemText(frame.item);
		if (text) return [{ type: "delta_text", channel: "reasoning_text", text, choiceIndex: 0 }];
	}
	return [];
}

/**
 * The tool arguments to send for one event, once per call: streamed deltas, or one full
 * `arguments` (an added or done event) when no delta carried them. Sources send both.
 */
function argumentsToSend(call: { sent: ArgumentsSent }, event: Extract<UnifiedStreamEvent, { type: "delta_tool" }>): string | null {
	if (event.argumentsDelta) {
		if (call.sent === "full") return null;
		call.sent = "delta";
		return event.argumentsDelta;
	}
	if (typeof event.arguments === "string" && event.arguments.length > 0 && call.sent === "none") {
		call.sent = "full";
		return event.arguments;
	}
	return null;
}

function createMessagesReencoder(ctx: EncodeContext): StreamReencoder {
	let started = false;
	let nextIndex = 0;
	let open: { index: number; kind: "text" | "thinking" | "tool_use" } | null = null;
	let usage: any = null;
	let pendingStop: string | null | undefined;
	let finished = false;
	const toolKey = createToolCallKeyResolver();
	const calls = new Map<string, { index: number; sent: ArgumentsSent }>();

	const start = (out: EncodedStreamFrame[]) => {
		if (started) return;
		started = true;
		out.push({
			eventName: "message_start",
			frame: {
				type: "message_start",
				message: {
					id: ctx.requestId ?? undefined,
					type: "message",
					role: "assistant",
					model: ctx.model ?? undefined,
					content: [],
					stop_reason: null,
					stop_sequence: null,
					usage: { input_tokens: 0, output_tokens: 0 },
				},
			},
		});
	};
	const close = (out: EncodedStreamFrame[]) => {
		if (!open) return;
		out.push({ eventName: "content_block_stop", frame: { type: "content_block_stop", index: open.index } });
		open = null;
	};
	const openBlock = (out: EncodedStreamFrame[], kind: "text" | "thinking" | "tool_use", block: Record<string, any>) => {
		start(out);
		close(out);
		open = { index: nextIndex++, kind };
		out.push({ eventName: "content_block_start", frame: { type: "content_block_start", index: open.index, content_block: block } });
		return open.index;
	};
	const terminal = (out: EncodedStreamFrame[]) => {
		if (finished || pendingStop === undefined) return;
		finished = true;
		start(out);
		close(out);
		const { finishReason, finishDetail } = normalizeFinishReason(pendingStop);
		out.push({
			eventName: "message_delta",
			frame: {
				type: "message_delta",
				delta: { stop_reason: anthropicStopReasonFor(finishReason, finishDetail), stop_sequence: null },
				...(usage ? { usage } : {}),
			},
		});
		out.push({ eventName: "message_stop", frame: { type: "message_stop" } });
	};

	let sawThinking = false;
	return {
		encode(events, source) {
			const out: EncodedStreamFrame[] = [];
			for (const event of [...reasoningFromResponsesFrame(source, sawThinking), ...events]) {
				if (finished && event.type !== "error") continue;
				switch (event.type) {
					case "start":
						start(out);
						break;
					case "delta_text": {
						const kind = event.channel === "reasoning_text" ? "thinking" : "text";
						if (kind === "thinking") sawThinking = true;
						const index = open?.kind === kind
							? open.index
							: openBlock(out, kind, kind === "thinking" ? { type: "thinking", thinking: "" } : { type: "text", text: "" });
						out.push({
							eventName: "content_block_delta",
							frame: {
								type: "content_block_delta",
								index,
								delta: kind === "thinking" ? { type: "thinking_delta", thinking: event.text } : { type: "text_delta", text: event.text },
							},
						});
						break;
					}
					case "delta_tool": {
						const key = toolKey(event);
						let call = calls.get(key);
						if (!call) {
							const index = openBlock(out, "tool_use", { type: "tool_use", id: event.toolCallId, name: event.toolName, input: {} });
							call = { index, sent: "none" };
							calls.set(key, call);
						}
						const partial = argumentsToSend(call, event);
						if (partial && open?.index === call.index) {
							out.push({
								eventName: "content_block_delta",
								frame: { type: "content_block_delta", index: call.index, delta: { type: "input_json_delta", partial_json: partial } },
							});
						}
						break;
					}
					case "usage":
						usage = event.usage;
						if (pendingStop !== undefined) terminal(out);
						break;
					case "stop":
						if (event.finishReason === null) break;
						if (pendingStop === undefined) pendingStop = event.finishReason ?? "stop";
						if (usage) terminal(out);
						break;
					case "error": {
						const encoded = encodeUnifiedStreamEvent("anthropic.messages", event, ctx);
						if (encoded) out.push(encoded);
						break;
					}
					default:
						// Snapshots, reasoning state and content parts have no Messages frame here.
						break;
				}
			}
			return out;
		},
		flush() {
			const out: EncodedStreamFrame[] = [];
			if (started && pendingStop === undefined) pendingStop = "stop";
			terminal(out);
			return out;
		},
	};
}

function createResponsesReencoder(ctx: EncodeContext): StreamReencoder {
	let created = false;
	let nextOutputIndex = 0;
	const items = new Map<string, number>();
	const toolKey = createToolCallKeyResolver();
	const sentArguments = new Map<string, { sent: ArgumentsSent }>();
	let usage: any = null;
	let pendingStop: string | null | undefined;
	let finished = false;

	const ensureCreated = (out: EncodedStreamFrame[]) => {
		if (created) return;
		created = true;
		out.push({
			eventName: "response.created",
			frame: {
				type: "response.created",
				response: { id: ctx.requestId ?? undefined, object: "response", model: ctx.model ?? undefined, status: "in_progress", output: [] },
			},
		});
	};
	const ensureItem = (out: EncodedStreamFrame[], key: string, item: Record<string, any>): number => {
		ensureCreated(out);
		const existing = items.get(key);
		if (existing !== undefined) return existing;
		const outputIndex = nextOutputIndex++;
		items.set(key, outputIndex);
		out.push({
			eventName: "response.output_item.added",
			frame: { type: "response.output_item.added", output_index: outputIndex, item: { id: `${key}_${ctx.requestId ?? "item"}`, status: "in_progress", ...item } },
		});
		return outputIndex;
	};
	const terminal = (out: EncodedStreamFrame[]) => {
		if (finished || pendingStop === undefined) return;
		finished = true;
		ensureCreated(out);
		const { status, incompleteDetails } = responsesStatusFor(normalizeFinishReason(pendingStop).finishReason);
		const eventName = status === "incomplete" ? "response.incomplete" : status === "failed" ? "response.failed" : "response.completed";
		out.push({
			eventName,
			frame: {
				type: eventName,
				response: {
					id: ctx.requestId ?? undefined,
					object: "response",
					model: ctx.model ?? undefined,
					status,
					...(incompleteDetails ? { incomplete_details: incompleteDetails } : {}),
					...(usage ? { usage } : {}),
				},
			},
		});
	};

	return {
		encode(events) {
			const out: EncodedStreamFrame[] = [];
			for (const event of events) {
				if (finished && event.type !== "error") continue;
				switch (event.type) {
					case "start":
						ensureCreated(out);
						break;
					case "delta_text": {
						const reasoning = event.channel === "reasoning_text";
						const key = `${reasoning ? "rs" : "msg"}_${event.choiceIndex ?? 0}`;
						const outputIndex = ensureItem(out, key, reasoning
							? { type: "reasoning", summary: [], content: [] }
							: { type: "message", role: "assistant", content: [] });
						out.push({
							eventName: reasoning ? "response.reasoning_text.delta" : "response.output_text.delta",
							frame: { type: reasoning ? "response.reasoning_text.delta" : "response.output_text.delta", item_id: `${key}_${ctx.requestId ?? "item"}`, output_index: outputIndex, delta: event.text },
						});
						break;
					}
					case "delta_tool": {
						const key = `fc_${toolKey(event).replace(/[^A-Za-z0-9_-]/g, "_")}`;
						const outputIndex = ensureItem(out, key, { type: "function_call", call_id: event.toolCallId, name: event.toolName, arguments: "" });
						const itemId = `${key}_${ctx.requestId ?? "item"}`;
						const call = sentArguments.get(key) ?? { sent: "none" as ArgumentsSent };
						sentArguments.set(key, call);
						const partial = argumentsToSend(call, event);
						if (partial) {
							out.push({
								eventName: "response.function_call_arguments.delta",
								frame: { type: "response.function_call_arguments.delta", item_id: itemId, output_index: outputIndex, delta: partial },
							});
						}
						break;
					}
					case "delta_content_part": {
						const encoded = encodeUnifiedStreamEvent("openai.responses", event, ctx);
						if (encoded) {
							ensureCreated(out);
							out.push({ ...encoded, frame: { ...encoded.frame, output_index: nextOutputIndex++ } });
						}
						break;
					}
					case "usage":
						usage = event.usage;
						if (pendingStop !== undefined) terminal(out);
						break;
					case "stop":
						if (event.finishReason === null) break;
						if (pendingStop === undefined) pendingStop = event.finishReason ?? "stop";
						if (usage) terminal(out);
						break;
					case "error": {
						const encoded = encodeUnifiedStreamEvent("openai.responses", event, ctx);
						if (encoded) out.push(encoded);
						break;
					}
					default:
						break;
				}
			}
			return out;
		},
		flush() {
			const out: EncodedStreamFrame[] = [];
			if (created && pendingStop === undefined) pendingStop = "stop";
			terminal(out);
			return out;
		},
	};
}

function createChatReencoder(ctx: EncodeContext): StreamReencoder {
	const finished = new Set<number>();
	return {
		encode(events) {
			const out: EncodedStreamFrame[] = [];
			for (const event of events) {
				// The foreign snapshot is not a chunk; its usage and stop follow as events.
				if (event.type === "snapshot") continue;
				if (event.type === "stop") {
					if (event.finishReason === null) continue;
					const index = event.choiceIndex ?? 0;
					if (finished.has(index)) continue;
					finished.add(index);
				}
				const encoded = encodeUnifiedStreamEvent("openai.chat.completions", event, ctx);
				if (encoded) out.push(encoded);
			}
			return out;
		},
		flush: () => [],
	};
}

export function createStreamReencoder(target: StreamProtocol, ctx: EncodeContext): StreamReencoder {
	switch (target) {
		case "anthropic.messages":
			return createMessagesReencoder(ctx);
		case "openai.responses":
			return createResponsesReencoder(ctx);
		default:
			return createChatReencoder(ctx);
	}
}
