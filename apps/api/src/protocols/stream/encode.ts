// Purpose: Encode canonical stream IR events to surface protocol frames.
// Why: Keeps stream formatting logic in one shared protocol boundary module.
// How: Maps UnifiedStreamEvent -> protocol event name + JSON payload.

import type { UnifiedStreamEvent } from "@pipeline/after/stream-events";

export type StreamProtocol =
	| "openai.chat.completions"
	| "openai.responses"
	| "google.interactions"
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
	if (event.type === "delta_content_part") {
		if (event.part.type === "image") {
			const url =
				event.part.source === "data"
					? `data:${event.part.mimeType || "image/png"};base64,${event.part.data}`
					: event.part.data;
			return {
				frame: {
					object: "chat.completion.chunk",
					choices: [
						{
							index: event.choiceIndex ?? 0,
							delta: {
								images: [{
									type: "image_url",
									image_url: { url },
									...(event.part.mimeType ? { mime_type: event.part.mimeType } : {}),
								}],
							},
							finish_reason: null,
						},
					],
				},
			};
		}
		const mimeType = (() => {
			if (event.part.format === "wav") return "audio/wav";
			if (event.part.format === "mp3") return "audio/mpeg";
			if (event.part.format === "flac") return "audio/flac";
			if (event.part.format === "m4a") return "audio/m4a";
			if (event.part.format === "ogg") return "audio/ogg";
			if (event.part.format === "pcm16") return "audio/l16";
			if (event.part.format === "pcm24") return "audio/l24";
			return "audio/wav";
		})();
		const url =
			event.part.source === "data"
				? `data:${mimeType};base64,${event.part.data}`
				: event.part.data;
		return {
			frame: {
				object: "chat.completion.chunk",
				choices: [
					{
						index: event.choiceIndex ?? 0,
						delta: {
							audios: [{
								type: "audio_url",
								audio_url: { url },
								mime_type: mimeType,
								...(event.part.format ? { format: event.part.format } : {}),
							}],
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
		const serverToolResult =
			event.payload &&
			typeof event.payload === "object" &&
			"server_tool_result" in event.payload
				? (event.payload as { server_tool_result?: any }).server_tool_result
				: null;
		if (serverToolResult && !hasDelta) {
			return {
				eventName: "response.output_item.done",
				frame: {
					item_id: event.toolCallId,
					output_index: event.choiceIndex ?? 0,
					item: {
						type: "function_call",
						id: event.toolCallId,
						call_id: event.toolCallId,
						name: event.toolName,
						arguments: event.arguments ?? "",
						status: serverToolResult?.is_error ? "failed" : "completed",
						...(serverToolResult?.output !== undefined
							? { output: serverToolResult.output }
							: {}),
						...(serverToolResult?.is_error
							? { error: { message: "Server tool returned an error." } }
							: {}),
					},
				},
			};
		}
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
	if (event.type === "delta_content_part") {
		if (event.part.type === "image") {
			return {
				eventName: "response.output_item.added",
				frame: {
					output_index: event.choiceIndex ?? 0,
					item: {
						type: "message",
						role: "assistant",
						status: "in_progress",
						content: [
							event.part.source === "data"
								? {
									type: "output_image",
									b64_json: event.part.data,
									mime_type: event.part.mimeType,
								}
								: {
									type: "output_image",
									image_url: { url: event.part.data },
									mime_type: event.part.mimeType,
								},
						],
					},
				},
			};
		}
		const mimeType = (() => {
			if (event.part.format === "wav") return "audio/wav";
			if (event.part.format === "mp3") return "audio/mpeg";
			if (event.part.format === "flac") return "audio/flac";
			if (event.part.format === "m4a") return "audio/m4a";
			if (event.part.format === "ogg") return "audio/ogg";
			if (event.part.format === "pcm16") return "audio/l16";
			if (event.part.format === "pcm24") return "audio/l24";
			return "audio/wav";
		})();
		return {
			eventName: "response.output_item.added",
			frame: {
				output_index: event.choiceIndex ?? 0,
				item: {
					type: "message",
					role: "assistant",
					status: "in_progress",
					content: [
						event.part.source === "data"
							? {
								type: "output_audio",
								b64_json: event.part.data,
								mime_type: mimeType,
								...(event.part.format ? { format: event.part.format } : {}),
							}
							: {
								type: "output_audio",
								audio_url: { url: event.part.data },
								mime_type: mimeType,
								...(event.part.format ? { format: event.part.format } : {}),
							},
					],
				},
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

function parseJsonObject(value: string | undefined): Record<string, any> {
	if (!value) return {};
	try {
		const parsed = JSON.parse(value);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? parsed
			: { value: parsed };
	} catch {
		return { value };
	}
}

function audioMimeType(format?: string): string {
	switch (format) {
		case "mp3":
			return "audio/mpeg";
		case "flac":
			return "audio/flac";
		case "m4a":
			return "audio/mp4";
		case "ogg":
			return "audio/ogg";
		case "pcm16":
			return "audio/L16";
		case "pcm24":
			return "audio/L24";
		case "wav":
		default:
			return "audio/wav";
	}
}

function encodeGoogleUsage(usage: any): any {
	if (!usage || typeof usage !== "object") return usage;
	const inputTokens =
		usage.total_input_tokens ??
		usage.input_tokens ??
		usage.prompt_tokens ??
		usage.inputTokens ??
		0;
	const outputTokens =
		usage.total_output_tokens ??
		usage.output_tokens ??
		usage.completion_tokens ??
		usage.outputTokens ??
		0;
	return {
		total_input_tokens: inputTokens,
		total_output_tokens: outputTokens,
		total_tokens:
			usage.total_tokens ??
			usage.totalTokens ??
			(inputTokens + outputTokens),
		...(usage.total_cached_tokens != null
			? { total_cached_tokens: usage.total_cached_tokens }
			: usage.cached_tokens != null
				? { total_cached_tokens: usage.cached_tokens }
				: {}),
		...(usage.total_thought_tokens != null
			? { total_thought_tokens: usage.total_thought_tokens }
			: usage.reasoning_tokens != null
				? { total_thought_tokens: usage.reasoning_tokens }
				: {}),
	};
}

function mapStopToGoogleStatus(stop: string | null | undefined): "completed" | "failed" | "incomplete" | "requires_action" {
	const normalized = String(stop ?? "").toLowerCase();
	if (normalized === "error" || normalized === "failed") return "failed";
	if (normalized === "length" || normalized === "incomplete" || normalized.includes("max")) return "incomplete";
	if (normalized === "tool_calls" || normalized === "tool_use" || normalized.includes("tool")) return "requires_action";
	return "completed";
}

function encodeGoogleInteractions(
	event: UnifiedStreamEvent,
	ctx: EncodeStreamContext,
): EncodedStreamFrame | null {
	if (event.type === "snapshot") {
		return { frame: event.payload as Record<string, any> };
	}
	if (event.type === "error") {
		return {
			eventName: "error",
			frame: {
				event_type: "error",
				error: { message: event.message ?? "stream_error" },
			},
		};
	}
	if (event.type === "start") {
		return {
			eventName: "interaction.created",
			frame: {
				event_type: "interaction.created",
				interaction: {
					id: ctx.requestId ?? undefined,
					object: "interaction",
					model: ctx.model ?? undefined,
					status: "in_progress",
				},
			},
		};
	}
	if (event.type === "delta_text") {
		return {
			eventName: "step.delta",
			frame: {
				event_type: "step.delta",
				index: event.choiceIndex ?? 0,
				delta: event.channel === "reasoning_text"
					? {
						type: "thought_summary",
						content: {
							type: "text",
							text: event.text,
						},
					}
					: {
						type: "text",
						text: event.text,
					},
			},
		};
	}
	if (event.type === "delta_content_part") {
		const delta = event.part.type === "image"
			? event.part.source === "data"
				? {
					type: "image",
					mime_type: event.part.mimeType ?? "image/jpeg",
					data: event.part.data,
				}
				: {
					type: "image",
					mime_type: event.part.mimeType ?? "image/jpeg",
					uri: event.part.data,
				}
			: event.part.source === "data"
				? {
					type: "audio",
					mime_type: audioMimeType(event.part.format),
					data: event.part.data,
				}
				: {
					type: "audio",
					mime_type: audioMimeType(event.part.format),
					uri: event.part.data,
				};
		return {
			eventName: "step.delta",
			frame: {
				event_type: "step.delta",
				index: event.choiceIndex ?? 0,
				delta,
			},
		};
	}
	if (event.type === "delta_tool") {
		if (typeof event.argumentsDelta === "string") {
			return {
				eventName: "step.delta",
				frame: {
					event_type: "step.delta",
					index: event.choiceIndex ?? 0,
					delta: {
						type: "arguments_delta",
						arguments: event.argumentsDelta,
					},
				},
			};
		}
		return {
			eventName: "step.start",
			frame: {
				event_type: "step.start",
				index: event.choiceIndex ?? 0,
				step: {
					type: "function_call",
					id: event.toolCallId,
					name: event.toolName,
					arguments: parseJsonObject(event.arguments),
				},
			},
		};
	}
	if (event.type === "usage") {
		return {
			eventName: "interaction.completed",
			frame: {
				event_type: "interaction.completed",
				interaction: {
					id: ctx.requestId ?? undefined,
					object: "interaction",
					model: ctx.model ?? undefined,
					status: "completed",
					usage: encodeGoogleUsage(event.usage),
				},
			},
		};
	}
	if (event.type === "stop") {
		return {
			eventName: "interaction.completed",
			frame: {
				event_type: "interaction.completed",
				interaction: {
					id: ctx.requestId ?? undefined,
					object: "interaction",
					model: ctx.model ?? undefined,
					status: mapStopToGoogleStatus(event.finishReason),
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
		case "google.interactions":
			return encodeGoogleInteractions(event, ctx);
		case "anthropic.messages":
			return encodeAnthropicMessages(event, ctx);
		default:
			return null;
	}
}
