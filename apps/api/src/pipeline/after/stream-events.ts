// Purpose: Unified internal stream event model for text protocols.
// Why: Keeps stream accounting and lifecycle handling protocol-agnostic.
// How: Parses protocol stream frames (chat/responses/messages) into canonical events.

type StopReason = string | null | undefined;

export type UnifiedStreamEvent =
	| { type: "start"; protocol: "openai.chat.completions" | "openai.responses" | "anthropic.messages"; payload?: any }
	| {
			type: "delta_text";
			channel: "output_text" | "reasoning_text";
			text: string;
			choiceIndex?: number;
			payload?: any;
	  }
	| {
			type: "delta_tool";
			toolCallId?: string;
			toolName?: string;
			argumentsDelta?: string;
			arguments?: string;
			choiceIndex?: number;
			toolIndex?: number;
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
	| "anthropic.messages"
	| null {
	const explicit = args.protocol;
	if (
		explicit === "openai.chat.completions" ||
		explicit === "openai.responses" ||
		explicit === "anthropic.messages"
	) {
		return explicit;
	}

	const eventName = String(args.eventName ?? "");
	if (eventName.startsWith("response.")) return "openai.responses";
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
	const hasToolCalls = outputItems.some((item: any) => {
		const type = String(item?.type ?? "").toLowerCase();
		return type === "function_call" || type === "tool_call";
	});
	if (hasToolCalls) return "tool_calls";
	return status || "stop";
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
			choiceIndex:
				typeof frame?.output_index === "number" ? frame.output_index : undefined,
			payload: frame,
		});
		return events;
	}

	if (event === "response.reasoning_text.delta" && typeof frame?.delta === "string") {
		events.push({
			type: "delta_text",
			channel: "reasoning_text",
			text: frame.delta,
			choiceIndex:
				typeof frame?.output_index === "number" ? frame.output_index : undefined,
			payload: frame,
		});
		return events;
	}

	if (event === "response.function_call_arguments.delta") {
		events.push({
			type: "delta_tool",
			toolCallId:
				typeof frame?.item_id === "string" ? frame.item_id : undefined,
			toolName: typeof frame?.name === "string" ? frame.name : undefined,
			argumentsDelta:
				typeof frame?.delta === "string" ? frame.delta : undefined,
			choiceIndex:
				typeof frame?.output_index === "number" ? frame.output_index : undefined,
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
		if (itemType === "function_call" || itemType === "tool_call") {
			events.push({
				type: "delta_tool",
				toolCallId:
					typeof item?.call_id === "string"
						? item.call_id
						: (typeof item?.id === "string" ? item.id : undefined),
				toolName: typeof item?.name === "string" ? item.name : undefined,
				arguments:
					typeof item?.arguments === "string" ? item.arguments : undefined,
				choiceIndex:
					typeof frame?.output_index === "number" ? frame.output_index : undefined,
				payload: frame,
			});
		}
		return events;
	}

	if (event === "response.function_call_arguments.done") {
		events.push({
			type: "delta_tool",
			toolCallId:
				typeof frame?.item_id === "string" ? frame.item_id : undefined,
			toolName: typeof frame?.name === "string" ? frame.name : undefined,
			arguments:
				typeof frame?.arguments === "string" ? frame.arguments : undefined,
			choiceIndex:
				typeof frame?.output_index === "number" ? frame.output_index : undefined,
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
				choiceIndex:
					typeof frame?.index === "number" ? frame.index : undefined,
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
				choiceIndex:
					typeof frame?.index === "number" ? frame.index : undefined,
				payload: frame,
			});
		} else if (
			deltaType === "input_json_delta" &&
			typeof frame?.delta?.partial_json === "string"
		) {
			events.push({
				type: "delta_tool",
				argumentsDelta: frame.delta.partial_json,
				choiceIndex:
					typeof frame?.index === "number" ? frame.index : undefined,
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
				choiceIndex:
					typeof frame?.index === "number" ? frame.index : undefined,
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
			| "anthropic.messages",
	): UnifiedStreamEvent[] => {
		switch (target) {
			case "openai.chat.completions":
				return extractOpenAIChatEvents(args.frame);
			case "openai.responses":
				return extractOpenAIResponsesEvents(args.eventName, args.frame);
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
	| "anthropic.messages"
	| null {
	return normalizeProtocol(args);
}
