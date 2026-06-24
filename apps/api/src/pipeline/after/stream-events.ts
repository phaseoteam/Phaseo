// Purpose: Unified internal stream event model for text protocols.
// Why: Keeps stream accounting and lifecycle handling protocol-agnostic.
// How: Parses protocol stream frames (chat/responses/messages) into canonical events.

import type { IRContentPart } from "@core/ir";

type StopReason = string | null | undefined;

export type UnifiedStreamEvent =
	| { type: "start"; protocol: "openai.chat.completions" | "openai.responses" | "google.interactions" | "anthropic.messages"; payload?: any }
	| {
			type: "delta_text";
			channel: "output_text" | "reasoning_text";
			text: string;
			choiceIndex?: number;
			payload?: any;
	  }
	| {
			type: "delta_tool";
			toolCallKey?: string;
			toolCallId?: string;
			toolName?: string;
			argumentsDelta?: string;
			arguments?: string;
			choiceIndex?: number;
			toolIndex?: number;
			payload?: any;
	  }
	| {
			type: "delta_content_part";
			part: Extract<IRContentPart, { type: "image" | "audio" }>;
			choiceIndex?: number;
			payload?: any;
	  }
	| { type: "usage"; usage: any; payload?: any }
	| { type: "stop"; finishReason?: string | null; payload?: any }
	| { type: "error"; message?: string; payload?: any }
	| { type: "snapshot"; isFinal: boolean; payload: any };

export type StreamEventExtractArgs = {
	protocol?: string;
	eventName?: string | null;
	frame: any;
};

function normalizeProtocol(args: StreamEventExtractArgs):
	| "openai.chat.completions"
	| "openai.responses"
	| "google.interactions"
	| "anthropic.messages"
	| null {
	const explicit = args.protocol;
	if (
		explicit === "openai.chat.completions" ||
		explicit === "openai.responses" ||
		explicit === "google.interactions" ||
		explicit === "anthropic.messages"
	) {
		return explicit;
	}

	const eventName = String(args.eventName ?? "");
	if (eventName.startsWith("response.")) return "openai.responses";
	if (eventName.startsWith("interaction.") || eventName.startsWith("step.")) return "google.interactions";
	if (eventName.startsWith("message_") || eventName.startsWith("content_block_")) {
		return "anthropic.messages";
	}

	if (args.frame?.object === "chat.completion" || args.frame?.object === "chat.completion.chunk") {
		return "openai.chat.completions";
	}
	if (args.frame?.object === "response" || args.frame?.response?.object === "response") {
		return "openai.responses";
	}
	if (
		args.frame?.object === "interaction" ||
		args.frame?.interaction?.object === "interaction" ||
		typeof args.frame?.event_type === "string" && (
			args.frame.event_type.startsWith("interaction.") ||
			args.frame.event_type.startsWith("step.")
		) ||
		typeof args.frame?.id === "string" && args.frame.id.startsWith("interactions/")
	) {
		return "google.interactions";
	}
	if (
		typeof args.frame?.type === "string" &&
		(args.frame.type.startsWith("message_") || args.frame.type.startsWith("content_block_"))
	) {
		return "anthropic.messages";
	}

	return null;
}

function isTerminalResponsesStatus(status: string | null | undefined): boolean {
	return status === "completed" || status === "failed" || status === "incomplete";
}

function readResponseToolCallName(item: any): string | null {
	const candidates = [
		item?.name,
		item?.function?.name,
		item?.tool_name,
		item?.tool?.name,
	];
	for (const candidate of candidates) {
		if (typeof candidate !== "string") continue;
		const trimmed = candidate.trim();
		if (trimmed && trimmed !== "tool_call") return trimmed;
	}
	return null;
}

function readResponseToolCallArguments(item: any): string | undefined {
	const raw =
		item?.arguments ??
		item?.function?.arguments ??
		item?.args ??
		item?.input;
	if (typeof raw === "string") return raw;
	if (raw == null) return undefined;
	try {
		return JSON.stringify(raw);
	} catch {
		return undefined;
	}
}

function isExecutableResponseToolItem(item: any): boolean {
	const itemType = String(item?.type ?? "").toLowerCase();
	return (itemType === "function_call" || itemType === "tool_call") && readResponseToolCallName(item) !== null;
}

function deriveResponsesStopReason(response: any): StopReason {
	const status = String(response?.status ?? "").toLowerCase();
	if (status === "failed") return "error";
	if (status === "incomplete") {
		const reason = String(response?.incomplete_details?.reason ?? "").toLowerCase();
		if (!reason) return "length";
		if (reason.includes("max")) return "length";
		if (reason.includes("tool")) return "tool_calls";
		if (reason.includes("content")) return "content_filter";
		return reason;
	}

	const outputItems = Array.isArray(response?.output)
		? response.output
		: (Array.isArray(response?.output_items) ? response.output_items : []);
	const hasToolCalls = outputItems.some((item: any) => isExecutableResponseToolItem(item));
	if (hasToolCalls) return "tool_calls";
	return status || "stop";
}

function parseChatMediaParts(value: any): Array<Extract<IRContentPart, { type: "image" | "audio" }>> {
	if (!Array.isArray(value)) return [];
	const parts: Array<Extract<IRContentPart, { type: "image" | "audio" }>> = [];
	for (const item of value) {
		if (!item || typeof item !== "object") continue;
		const type = String(item.type ?? "").toLowerCase();
		if (type === "image_url") {
			const rawUrl =
				typeof item.image_url === "string"
					? item.image_url
					: (typeof item.image_url?.url === "string" ? item.image_url.url : null);
			if (!rawUrl) continue;
			if (rawUrl.startsWith("data:")) {
				const match = rawUrl.match(/^data:([^;,]+)?;base64,(.+)$/i);
				if (!match) continue;
				parts.push({
					type: "image",
					source: "data",
					data: match[2],
					mimeType:
						(typeof item.mime_type === "string" ? item.mime_type : match[1]) || "image/png",
				});
				continue;
			}
			parts.push({
				type: "image",
				source: "url",
				data: rawUrl,
				...(typeof item.mime_type === "string" ? { mimeType: item.mime_type } : {}),
			});
			continue;
		}
		if (type === "audio_url") {
			const rawUrl =
				typeof item.audio_url === "string"
					? item.audio_url
					: (typeof item.audio_url?.url === "string" ? item.audio_url.url : null);
			if (!rawUrl) continue;
			if (rawUrl.startsWith("data:")) {
				const match = rawUrl.match(/^data:([^;,]+)?;base64,(.+)$/i);
				if (!match) continue;
				parts.push({
					type: "audio",
					source: "data",
					data: match[2],
					format: item.format,
				});
				continue;
			}
			parts.push({
				type: "audio",
				source: "url",
				data: rawUrl,
				format: item.format,
			});
		}
	}
	return parts;
}

function parseResponsesMediaParts(value: any): Array<Extract<IRContentPart, { type: "image" | "audio" }>> {
	if (!Array.isArray(value)) return [];
	const parts: Array<Extract<IRContentPart, { type: "image" | "audio" }>> = [];
	for (const item of value) {
		if (!item || typeof item !== "object") continue;
		const type = String(item.type ?? "").toLowerCase();
		if (type === "output_image" || type === "image" || type === "image_url") {
			if (typeof item.b64_json === "string" && item.b64_json.length > 0) {
				parts.push({
					type: "image",
					source: "data",
					data: item.b64_json,
					...(typeof item.mime_type === "string" ? { mimeType: item.mime_type } : {}),
				});
				continue;
			}
			const rawUrl =
				typeof item.image_url === "string"
					? item.image_url
					: (typeof item.image_url?.url === "string" ? item.image_url.url : null);
			if (!rawUrl) continue;
			parts.push({
				type: "image",
				source: "url",
				data: rawUrl,
				...(typeof item.mime_type === "string" ? { mimeType: item.mime_type } : {}),
			});
			continue;
		}
		if (type === "output_audio" || type === "audio" || type === "audio_url") {
			if (typeof item.b64_json === "string" && item.b64_json.length > 0) {
				parts.push({
					type: "audio",
					source: "data",
					data: item.b64_json,
					format: item.format,
				});
				continue;
			}
			const rawUrl =
				typeof item.audio_url === "string"
					? item.audio_url
					: (typeof item.audio_url?.url === "string" ? item.audio_url.url : null);
			if (!rawUrl) continue;
			parts.push({
				type: "audio",
				source: "url",
				data: rawUrl,
				format: item.format,
			});
		}
	}
	return parts;
}

function extractOpenAIChatEvents(frame: any): UnifiedStreamEvent[] {
	const events: UnifiedStreamEvent[] = [];

	if (frame?.object === "error") {
		events.push({ type: "error", message: frame?.message, payload: frame });
		return events;
	}

	if (frame?.object === "chat.completion.chunk") {
		events.push({
			type: "start",
			protocol: "openai.chat.completions",
			payload: frame,
		});

		const choices = Array.isArray(frame?.choices) ? frame.choices : [];
		for (const choice of choices) {
			const choiceIndex = typeof choice?.index === "number" ? choice.index : 0;
			const delta = choice?.delta ?? {};
			if (typeof delta?.content === "string" && delta.content.length > 0) {
				events.push({
					type: "delta_text",
					channel: "output_text",
					text: delta.content,
					choiceIndex,
					payload: choice,
				});
			}
			if (typeof delta?.reasoning_content === "string" && delta.reasoning_content.length > 0) {
				events.push({
					type: "delta_text",
					channel: "reasoning_text",
					text: delta.reasoning_content,
					choiceIndex,
					payload: choice,
				});
			}
			if (typeof delta?.reasoning === "string" && delta.reasoning.length > 0) {
				events.push({
					type: "delta_text",
					channel: "reasoning_text",
					text: delta.reasoning,
					choiceIndex,
					payload: choice,
				});
			}
			for (const part of parseChatMediaParts(delta?.images)) {
				events.push({
					type: "delta_content_part",
					part,
					choiceIndex,
					payload: choice,
				});
			}
			for (const part of parseChatMediaParts(delta?.audios)) {
				events.push({
					type: "delta_content_part",
					part,
					choiceIndex,
					payload: choice,
				});
			}

			const toolCalls = Array.isArray(delta?.tool_calls) ? delta.tool_calls : [];
			for (const toolCall of toolCalls) {
				events.push({
					type: "delta_tool",
					toolCallId:
						typeof toolCall?.id === "string" ? toolCall.id : undefined,
					toolName:
						typeof toolCall?.function?.name === "string"
							? toolCall.function.name
							: undefined,
					argumentsDelta:
						typeof toolCall?.function?.arguments === "string"
							? toolCall.function.arguments
							: undefined,
					choiceIndex,
					toolIndex:
						typeof toolCall?.index === "number" ? toolCall.index : undefined,
					payload: toolCall,
				});
			}

			if (choice?.finish_reason != null) {
				events.push({
					type: "stop",
					finishReason: String(choice.finish_reason),
					payload: choice,
				});
			}
		}

		if (frame?.usage) {
			events.push({ type: "usage", usage: frame.usage, payload: frame });
		}
		return events;
	}

	if (frame?.object === "chat.completion") {
		events.push({
			type: "snapshot",
			isFinal: true,
			payload: frame,
		});
		if (frame?.usage) {
			events.push({ type: "usage", usage: frame.usage, payload: frame });
		}
		const choice = Array.isArray(frame?.choices) ? frame.choices[0] : null;
		for (const part of parseChatMediaParts(choice?.message?.images)) {
			events.push({
				type: "delta_content_part",
				part,
				choiceIndex: 0,
				payload: choice,
			});
		}
		for (const part of parseChatMediaParts(choice?.message?.audios)) {
			events.push({
				type: "delta_content_part",
				part,
				choiceIndex: 0,
				payload: choice,
			});
		}
		const finishReason = choice?.finish_reason ?? "stop";
		events.push({
			type: "stop",
			finishReason: finishReason != null ? String(finishReason) : null,
			payload: frame,
		});
		return events;
	}

	return events;
}

function extractOpenAIResponsesEvents(
	eventName: string | null | undefined,
	frame: any,
): UnifiedStreamEvent[] {
	const events: UnifiedStreamEvent[] = [];
	const event = String(eventName ?? "");

	if (event === "response.created") {
		events.push({
			type: "start",
			protocol: "openai.responses",
			payload: frame,
		});
		return events;
	}

	if (event === "response.output_text.delta" && typeof frame?.delta === "string") {
		events.push({
			type: "delta_text",
			channel: "output_text",
			text: frame.delta,
			choiceIndex: 0,
			payload: frame,
		});
		return events;
	}

	if (event === "response.reasoning_text.delta" && typeof frame?.delta === "string") {
		events.push({
			type: "delta_text",
			channel: "reasoning_text",
			text: frame.delta,
			choiceIndex: 0,
			payload: frame,
		});
		return events;
	}

	if (event === "response.function_call_arguments.delta") {
		events.push({
			type: "delta_tool",
			toolCallKey:
				typeof frame?.item_id === "string" ? frame.item_id : undefined,
			toolCallId:
				typeof frame?.call_id === "string" ? frame.call_id : undefined,
			toolName: typeof frame?.name === "string" ? frame.name : undefined,
			argumentsDelta:
				typeof frame?.delta === "string" ? frame.delta : undefined,
			choiceIndex: 0,
			payload: frame,
		});
		return events;
	}

	if (
		event === "response.output_item.added" ||
		event === "response.output_item.done"
	) {
		const item = frame?.item;
		const itemType = String(item?.type ?? "").toLowerCase();
		if (itemType === "message") {
			for (const part of parseResponsesMediaParts(item?.content)) {
				events.push({
					type: "delta_content_part",
					part,
					choiceIndex: 0,
					payload: frame,
				});
			}
		}
		if (isExecutableResponseToolItem(item)) {
			events.push({
				type: "delta_tool",
				toolCallKey:
					typeof item?.id === "string"
						? item.id
						: (typeof frame?.item_id === "string" ? frame.item_id : undefined),
				toolCallId:
					typeof item?.call_id === "string"
						? item.call_id
						: (typeof item?.tool_call_id === "string"
							? item.tool_call_id
							: (typeof item?.id === "string" ? item.id : undefined)),
				toolName: readResponseToolCallName(item) ?? undefined,
				arguments: readResponseToolCallArguments(item),
				choiceIndex: 0,
				payload: frame,
			});
		}
		return events;
	}

	if (event === "response.function_call_arguments.done") {
		const toolName =
			typeof frame?.name === "string" && frame.name.trim().length > 0
				? frame.name.trim()
				: undefined;
		if (toolName === "tool_call") {
			return events;
		}
		events.push({
			type: "delta_tool",
			toolCallKey:
				typeof frame?.item_id === "string" ? frame.item_id : undefined,
			toolCallId:
				typeof frame?.call_id === "string" ? frame.call_id : undefined,
			toolName,
			arguments:
				typeof frame?.arguments === "string" ? frame.arguments : undefined,
			choiceIndex: 0,
			payload: frame,
		});
		return events;
	}

	if (event === "response.failed" || event === "error") {
		events.push({
			type: "error",
			message:
				typeof frame?.error?.message === "string"
					? frame.error.message
					: (typeof frame?.message === "string" ? frame.message : "stream_error"),
			payload: frame,
		});
		events.push({
			type: "stop",
			finishReason: "error",
			payload: frame,
		});
		return events;
	}

	if (event === "response.completed") {
		const response = frame?.response ?? frame;
		events.push({
			type: "snapshot",
			isFinal: true,
			payload: response,
		});
		if (response?.usage) {
			events.push({
				type: "usage",
				usage: response.usage,
				payload: response,
			});
		}
		events.push({
			type: "stop",
			finishReason: deriveResponsesStopReason(response) ?? "stop",
			payload: response,
		});
		return events;
	}

	if (frame?.object === "response") {
		const status = String(frame?.status ?? "").toLowerCase();
		const isFinal = isTerminalResponsesStatus(status);
		events.push({
			type: "snapshot",
			isFinal,
			payload: frame,
		});
		if (frame?.usage) {
			events.push({ type: "usage", usage: frame.usage, payload: frame });
		}
		if (isFinal) {
			events.push({
				type: "stop",
				finishReason: deriveResponsesStopReason(frame) ?? "stop",
				payload: frame,
			});
		}
	}

	return events;
}

function googleStatusToStopReason(status: unknown): StopReason {
	const normalized = String(status ?? "").toLowerCase();
	if (normalized === "failed" || normalized === "cancelled" || normalized === "expired") return "error";
	if (normalized === "incomplete") return "length";
	if (normalized === "requires_action") return "tool_calls";
	return normalized || "stop";
}

function parseGoogleInteractionMediaPart(value: any): Extract<IRContentPart, { type: "image" | "audio" }> | null {
	if (!value || typeof value !== "object") return null;
	const type = String(value.type ?? "").toLowerCase();
	if (type === "image") {
		if (typeof value.data === "string" && value.data.length > 0) {
			return {
				type: "image",
				source: "data",
				data: value.data,
				...(typeof value.mime_type === "string" ? { mimeType: value.mime_type } : {}),
			};
		}
		const uri = typeof value.uri === "string"
			? value.uri
			: typeof value.url === "string"
				? value.url
				: null;
		if (!uri) return null;
		return {
			type: "image",
			source: "url",
			data: uri,
			...(typeof value.mime_type === "string" ? { mimeType: value.mime_type } : {}),
		};
	}
	if (type === "audio") {
		const format = (() => {
			const mimeType = String(value.mime_type ?? "").toLowerCase();
			if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
			if (mimeType.includes("flac")) return "flac";
			if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
			if (mimeType.includes("ogg")) return "ogg";
			if (mimeType.includes("l16") || mimeType.includes("pcm16")) return "pcm16";
			if (mimeType.includes("l24") || mimeType.includes("pcm24")) return "pcm24";
			if (mimeType.includes("wav")) return "wav";
			return undefined;
		})();
		if (typeof value.data === "string" && value.data.length > 0) {
			return {
				type: "audio",
				source: "data",
				data: value.data,
				format,
			};
		}
		const uri = typeof value.uri === "string"
			? value.uri
			: typeof value.url === "string"
				? value.url
				: null;
		if (!uri) return null;
		return {
			type: "audio",
			source: "url",
			data: uri,
			format,
		};
	}
	return null;
}

function googleInteractionText(value: any): string {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.map(googleInteractionText).filter(Boolean).join("");
	if (!value || typeof value !== "object") return "";
	if (typeof value.text === "string") return value.text;
	if (value.content !== undefined) return googleInteractionText(value.content);
	if (value.summary !== undefined) return googleInteractionText(value.summary);
	return "";
}

function googleArgumentsToString(value: any): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value);
	} catch {
		return "{}";
	}
}

function extractGoogleInteractionsEvents(
	eventName: string | null | undefined,
	frame: any,
): UnifiedStreamEvent[] {
	const events: UnifiedStreamEvent[] = [];
	const event = String(eventName ?? frame?.event_type ?? "");

	if (event === "interaction.created") {
		events.push({
			type: "start",
			protocol: "google.interactions",
			payload: frame,
		});
		return events;
	}

	if (event === "step.start") {
		const step = frame?.step ?? frame;
		const stepType = String(step?.type ?? "").toLowerCase();
		if (stepType === "function_call") {
			events.push({
				type: "delta_tool",
				toolCallId: typeof step?.id === "string" ? step.id : undefined,
				toolName: typeof step?.name === "string" ? step.name : undefined,
				arguments: googleArgumentsToString(step?.arguments ?? step?.args),
				choiceIndex: typeof frame?.index === "number" ? frame.index : undefined,
				payload: frame,
			});
		}
		if (stepType === "model_output" && Array.isArray(step?.content)) {
			for (const block of step.content) {
				if (block?.type === "text" && typeof block?.text === "string") {
					events.push({
						type: "delta_text",
						channel: "output_text",
						text: block.text,
						choiceIndex: typeof frame?.index === "number" ? frame.index : undefined,
						payload: frame,
					});
					continue;
				}
				const mediaPart = parseGoogleInteractionMediaPart(block);
				if (mediaPart) {
					events.push({
						type: "delta_content_part",
						part: mediaPart,
						choiceIndex: typeof frame?.index === "number" ? frame.index : undefined,
						payload: frame,
					});
				}
			}
		}
		return events;
	}

	if (event === "step.delta") {
		const delta = frame?.delta ?? frame;
		const deltaType = String(delta?.type ?? "").toLowerCase();
		if (deltaType === "text" && typeof delta?.text === "string") {
			events.push({
				type: "delta_text",
				channel: "output_text",
				text: delta.text,
				choiceIndex: typeof frame?.index === "number" ? frame.index : undefined,
				payload: frame,
			});
			return events;
		}
		if (deltaType === "thought_summary" || deltaType === "reasoning_text") {
			const text = googleInteractionText(delta?.content ?? delta?.summary ?? delta?.text);
			if (text) {
				events.push({
					type: "delta_text",
					channel: "reasoning_text",
					text,
					choiceIndex: typeof frame?.index === "number" ? frame.index : undefined,
					payload: frame,
				});
			}
			return events;
		}
		if (deltaType === "arguments_delta") {
			events.push({
				type: "delta_tool",
				argumentsDelta:
					typeof delta?.arguments === "string"
						? delta.arguments
						: typeof delta?.arguments_delta === "string"
							? delta.arguments_delta
							: undefined,
				choiceIndex: typeof frame?.index === "number" ? frame.index : undefined,
				payload: frame,
			});
			return events;
		}
		const mediaPart = parseGoogleInteractionMediaPart(delta);
		if (mediaPart) {
			events.push({
				type: "delta_content_part",
				part: mediaPart,
				choiceIndex: typeof frame?.index === "number" ? frame.index : undefined,
				payload: frame,
			});
		}
		return events;
	}

	if (event === "interaction.completed" || frame?.object === "interaction" || frame?.interaction?.object === "interaction") {
		const interaction = frame?.interaction ?? frame;
		events.push({
			type: "snapshot",
			isFinal: true,
			payload: interaction,
		});
		if (interaction?.usage) {
			events.push({
				type: "usage",
				usage: interaction.usage,
				payload: interaction,
			});
		}
		events.push({
			type: "stop",
			finishReason: googleStatusToStopReason(interaction?.status),
			payload: interaction,
		});
		return events;
	}

	if (event === "error") {
		events.push({
			type: "error",
			message:
				typeof frame?.error?.message === "string"
					? frame.error.message
					: (typeof frame?.message === "string" ? frame.message : "stream_error"),
			payload: frame,
		});
		events.push({ type: "stop", finishReason: "error", payload: frame });
	}

	return events;
}

function extractAnthropicMessagesEvents(
	eventName: string | null | undefined,
	frame: any,
): UnifiedStreamEvent[] {
	const events: UnifiedStreamEvent[] = [];
	const event = String(eventName ?? "");
	const type = String(frame?.type ?? "");

	if (event === "message_start" || type === "message_start") {
		events.push({
			type: "start",
			protocol: "anthropic.messages",
			payload: frame,
		});
		const usage = frame?.message?.usage;
		if (usage) {
			events.push({ type: "usage", usage, payload: frame });
		}
		return events;
	}

	if (event === "content_block_delta" || type === "content_block_delta") {
		const deltaType = String(frame?.delta?.type ?? "");
		if (deltaType === "text_delta" && typeof frame?.delta?.text === "string") {
			events.push({
				type: "delta_text",
				channel: "output_text",
				text: frame.delta.text,
				choiceIndex: 0,
				payload: frame,
			});
		} else if (
			deltaType === "thinking_delta" &&
			typeof frame?.delta?.thinking === "string"
		) {
			events.push({
				type: "delta_text",
				channel: "reasoning_text",
				text: frame.delta.thinking,
				choiceIndex: 0,
				payload: frame,
			});
		} else if (
			deltaType === "input_json_delta" &&
			typeof frame?.delta?.partial_json === "string"
		) {
			events.push({
				type: "delta_tool",
				argumentsDelta: frame.delta.partial_json,
				choiceIndex: 0,
				payload: frame,
			});
		}
		return events;
	}

	if (event === "content_block_start" || type === "content_block_start") {
		const blockType = String(frame?.content_block?.type ?? "");
		if (blockType === "tool_use") {
			events.push({
				type: "delta_tool",
				toolCallId:
					typeof frame?.content_block?.id === "string"
						? frame.content_block.id
						: undefined,
				toolName:
					typeof frame?.content_block?.name === "string"
						? frame.content_block.name
						: undefined,
				arguments:
					frame?.content_block?.input != null
						? JSON.stringify(frame.content_block.input)
						: undefined,
				choiceIndex: 0,
				payload: frame,
			});
		}
		return events;
	}

	if (event === "message_delta" || type === "message_delta") {
		if (frame?.usage) {
			events.push({ type: "usage", usage: frame.usage, payload: frame });
		}
		const stopReason = frame?.delta?.stop_reason;
		if (stopReason != null) {
			events.push({
				type: "stop",
				finishReason: String(stopReason),
				payload: frame,
			});
		}
		return events;
	}

	if (event === "message_stop" || type === "message_stop") {
		events.push({
			type: "stop",
			finishReason: "end_turn",
			payload: frame,
		});
		return events;
	}

	if (event === "error" || type === "error") {
		events.push({
			type: "error",
			message: frame?.error?.message ?? frame?.message ?? "stream_error",
			payload: frame,
		});
		events.push({
			type: "stop",
			finishReason: "error",
			payload: frame,
		});
	}

	return events;
}

export function extractUnifiedStreamEvents(
	args: StreamEventExtractArgs,
): UnifiedStreamEvent[] {
	const protocol = normalizeProtocol(args);
	if (!protocol) return [];

	const extractForProtocol = (
		target:
			| "openai.chat.completions"
			| "openai.responses"
			| "google.interactions"
			| "anthropic.messages",
	): UnifiedStreamEvent[] => {
		switch (target) {
			case "openai.chat.completions":
				return extractOpenAIChatEvents(args.frame);
			case "openai.responses":
				return extractOpenAIResponsesEvents(args.eventName, args.frame);
			case "google.interactions":
				return extractGoogleInteractionsEvents(args.eventName, args.frame);
			case "anthropic.messages":
				return extractAnthropicMessagesEvents(args.eventName, args.frame);
			default:
				return [];
		}
	};

	const events = extractForProtocol(protocol);
	// Some providers stream a different wire shape than the requested surface.
	// Fall back to auto-detection so accounting/finalization remains consistent.
	if (events.length > 0 || !args.protocol) {
		return events;
	}

	const autoProtocol = normalizeProtocol({ ...args, protocol: undefined });
	if (!autoProtocol || autoProtocol === protocol) {
		return events;
	}

	return extractForProtocol(autoProtocol);
}

export function detectStreamProtocol(
	args: StreamEventExtractArgs,
):
	| "openai.chat.completions"
	| "openai.responses"
	| "google.interactions"
	| "anthropic.messages"
	| null {
	return normalizeProtocol(args);
}
