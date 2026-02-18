// Purpose: Encode canonical stream IR events to surface protocol frames.
// Why: Keeps stream formatting logic in one shared protocol boundary module.
// How: Maps UnifiedStreamEvent -> protocol event name + JSON payload.

import type { UnifiedStreamEvent } from "@pipeline/after/stream-events";

export type StreamProtocol =
	| "openai.chat.completions"
	| "openai.responses"
	| "anthropic.messages";

export type EncodedStreamFrame = {
	eventName?: string | null;
	frame: Record<string, any>;
};

export type EncodeStreamContext = {
	requestId?: string | null;
	model?: string | null;
	created?: number | null;
};

function mapStopToAnthropic(stop: string | null | undefined): string | null {
	switch (String(stop ?? "").toLowerCase()) {
		case "tool_calls":
			return "tool_use";
		case "length":
			return "max_tokens";
		case "content_filter":
			return "refusal";
		case "stop":
		case "end_turn":
			return "end_turn";
		case "error":
			return null;
		default:
			return stop == null ? null : String(stop);
	}
}

function encodeOpenAIChat(
	event: UnifiedStreamEvent,
	ctx: EncodeStreamContext,
): EncodedStreamFrame | null {
	if (event.type === "snapshot") {
		return { frame: event.payload as Record<string, any> };
	}
	if (event.type === "error") {
		return {
			frame: {
				object: "error",
				message: event.message ?? "stream_error",
			},
		};
	}
	if (event.type === "start") {
		return {
			frame: {
				id: ctx.requestId ?? undefined,
				object: "chat.completion.chunk",
				created: ctx.created ?? Math.floor(Date.now() / 1000),
				model: ctx.model ?? undefined,
				choices: [],
			},
		};
	}
	if (event.type === "usage") {
		return {
			frame: {
				object: "chat.completion.chunk",
				choices: [],
				usage: event.usage,
			},
		};
	}
	if (event.type === "delta_text") {
		return {
			frame: {
				object: "chat.completion.chunk",
				choices: [
					{
						index: event.choiceIndex ?? 0,
						delta:
							event.channel === "reasoning_text"
								? { reasoning_content: event.text }
								: { content: event.text },
						finish_reason: null,
					},
				],
			},
		};
	}
	if (event.type === "delta_tool") {
		return {
			frame: {
				object: "chat.completion.chunk",
				choices: [
					{
						index: event.choiceIndex ?? 0,
						delta: {
							tool_calls: [
								{
									index: event.toolIndex ?? 0,
									id: event.toolCallId,
									type: "function",
									function: {
										name: event.toolName,
										arguments: event.argumentsDelta ?? event.arguments ?? "",
									},
								},
							],
						},
						finish_reason: null,
					},
				],
			},
		};
	}
	if (event.type === "stop") {
		return {
			frame: {
				object: "chat.completion.chunk",
				choices: [
					{
						index: 0,
						delta: {},
						finish_reason: event.finishReason ?? "stop",
					},
				],
			},
		};
	}
	return null;
}

function encodeOpenAIResponses(
	event: UnifiedStreamEvent,
	ctx: EncodeStreamContext,
): EncodedStreamFrame | null {
	if (event.type === "snapshot") {
		return { frame: event.payload as Record<string, any> };
	}
	if (event.type === "error") {
		return {
			eventName: "error",
			frame: { error: { message: event.message ?? "stream_error" } },
		};
	}
	if (event.type === "start") {
		return {
			eventName: "response.created",
			frame: {
				response: {
					id: ctx.requestId ?? undefined,
					object: "response",
					model: ctx.model ?? undefined,
					status: "in_progress",
				},
			},
		};
	}
	if (event.type === "delta_text") {
		return {
			eventName:
				event.channel === "reasoning_text"
					? "response.reasoning_text.delta"
					: "response.output_text.delta",
			frame: {
				delta: event.text,
				output_index: event.choiceIndex ?? 0,
			},
		};
	}
	if (event.type === "delta_tool") {
		const hasDelta = typeof event.argumentsDelta === "string";
		return {
			eventName: hasDelta
				? "response.function_call_arguments.delta"
				: "response.function_call_arguments.done",
			frame: {
				item_id: event.toolCallId,
				name: event.toolName,
				output_index: event.choiceIndex ?? 0,
				...(hasDelta
					? { delta: event.argumentsDelta }
					: { arguments: event.arguments ?? "" }),
			},
		};
	}
	if (event.type === "usage") {
		return {
			eventName: "response.completed",
			frame: {
				response: {
					id: ctx.requestId ?? undefined,
					object: "response",
					model: ctx.model ?? undefined,
					status: "completed",
					usage: event.usage,
				},
			},
		};
	}
	if (event.type === "stop") {
		return {
			eventName: "response.completed",
			frame: {
				response: {
					id: ctx.requestId ?? undefined,
					object: "response",
					model: ctx.model ?? undefined,
					status: event.finishReason === "error" ? "failed" : "completed",
				},
			},
		};
	}
	return null;
}

function encodeAnthropicMessages(
	event: UnifiedStreamEvent,
	ctx: EncodeStreamContext,
): EncodedStreamFrame | null {
	if (event.type === "snapshot") {
		return {
			frame: (event.payload as Record<string, any>) ?? {},
		};
	}
	if (event.type === "error") {
		return {
			eventName: "error",
			frame: {
				type: "error",
				error: { message: event.message ?? "stream_error" },
			},
		};
	}
	if (event.type === "start") {
		return {
			eventName: "message_start",
			frame: {
				type: "message_start",
				message: {
					id: ctx.requestId ?? undefined,
					type: "message",
					role: "assistant",
					model: ctx.model ?? undefined,
				},
			},
		};
	}
	if (event.type === "delta_text") {
		return {
			eventName: "content_block_delta",
			frame: {
				type: "content_block_delta",
				index: event.choiceIndex ?? 0,
				delta:
					event.channel === "reasoning_text"
						? { type: "thinking_delta", thinking: event.text }
						: { type: "text_delta", text: event.text },
			},
		};
	}
	if (event.type === "delta_tool") {
		const hasDelta = typeof event.argumentsDelta === "string";
		return {
			eventName: hasDelta ? "content_block_delta" : "content_block_start",
			frame: hasDelta
				? {
						type: "content_block_delta",
						index: event.choiceIndex ?? 0,
						delta: {
							type: "input_json_delta",
							partial_json: event.argumentsDelta,
						},
					}
				: {
						type: "content_block_start",
						index: event.choiceIndex ?? 0,
						content_block: {
							type: "tool_use",
							id: event.toolCallId,
							name: event.toolName,
							input: (() => {
								try {
									return JSON.parse(event.arguments ?? "{}");
								} catch {
									return {};
								}
							})(),
						},
					},
		};
	}
	if (event.type === "usage") {
		return {
			eventName: "message_delta",
			frame: {
				type: "message_delta",
				usage: event.usage,
			},
		};
	}
	if (event.type === "stop") {
		return {
			eventName: "message_delta",
			frame: {
				type: "message_delta",
				delta: {
					stop_reason: mapStopToAnthropic(event.finishReason),
				},
			},
		};
	}
	return null;
}

export function encodeUnifiedStreamEvent(
	protocol: StreamProtocol,
	event: UnifiedStreamEvent,
	ctx: EncodeStreamContext = {},
): EncodedStreamFrame | null {
	switch (protocol) {
		case "openai.chat.completions":
			return encodeOpenAIChat(event, ctx);
		case "openai.responses":
			return encodeOpenAIResponses(event, ctx);
		case "anthropic.messages":
			return encodeAnthropicMessages(event, ctx);
		default:
			return null;
	}
}

