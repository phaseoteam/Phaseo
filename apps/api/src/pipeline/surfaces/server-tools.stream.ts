// Purpose: Stream synthesis and stream-to-IR normalization for server tools.

import type { IRChatResponse, IRContentPart, IRToolCall, IRUsage } from "@core/ir";
import type { Protocol } from "@protocols/detect";
import { encodeUnifiedStreamEvent, type StreamProtocol } from "@protocols/stream/encode";
import { extractUnifiedStreamEvents, type UnifiedStreamEvent } from "../after/stream-events";

export type ServerToolTraceItem = {
	id: string;
	name: string;
	arguments?: string;
	output?: unknown;
	isError?: boolean;
};

function toStreamProtocol(protocol: Protocol): StreamProtocol | null {
	switch (protocol) {
		case "openai.chat.completions":
		case "openai.responses":
		case "google.interactions":
		case "anthropic.messages":
			return protocol;
		default:
			return null;
	}
}

function buildServerToolTraceEvents(
	traceItems: readonly ServerToolTraceItem[] | undefined,
): UnifiedStreamEvent[] {
	if (!traceItems?.length) return [];
	const events: UnifiedStreamEvent[] = [];
	for (let index = 0; index < traceItems.length; index += 1) {
		const item = traceItems[index];
		if (!item.id || !item.name || item.name === "tool_call") continue;
		events.push({
			type: "delta_tool",
			toolCallId: item.id,
			toolName: item.name,
			arguments: item.arguments ?? "",
			choiceIndex: 0,
			toolIndex: index,
			payload:
				item.output !== undefined || item.isError
					? {
							server_tool_result: {
								...(item.output !== undefined ? { output: item.output } : {}),
								...(item.isError ? { is_error: true } : {}),
							},
						}
					: undefined,
		});
	}
	return events;
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

function readResponseToolCallId(item: any): string | undefined {
	const candidates = [item?.call_id, item?.id, item?.tool_call_id];
	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			return candidate;
		}
	}
	return undefined;
}

function isExecutableResponseToolItem(item: any): boolean {
	const itemType = String(item?.type ?? "").toLowerCase();
	return (itemType === "function_call" || itemType === "tool_call") && readResponseToolCallName(item) !== null;
}

function buildUnifiedEventsFromChatCompletionsPayload(payload: any): UnifiedStreamEvent[] {
	const events: UnifiedStreamEvent[] = [
		{ type: "start", protocol: "openai.chat.completions", payload },
	];
	const choices = Array.isArray(payload?.choices) ? payload.choices : [];
	for (let choiceIndex = 0; choiceIndex < choices.length; choiceIndex += 1) {
		const choice = choices[choiceIndex] ?? {};
		const message = choice?.message ?? {};
		const reasoningDetails = Array.isArray(message?.reasoning_details) ? message.reasoning_details : [];
		for (const detail of reasoningDetails) {
			if (typeof detail?.text === "string" && detail.text.length > 0) {
				events.push({
					type: "delta_text",
					channel: "reasoning_text",
					text: detail.text,
					choiceIndex,
				});
			}
		}
		if (reasoningDetails.length === 0 && typeof message?.reasoning_content === "string" && message.reasoning_content.length > 0) {
			events.push({
				type: "delta_text",
				channel: "reasoning_text",
				text: message.reasoning_content,
				choiceIndex,
			});
		}
		if (typeof message?.content === "string" && message.content.length > 0) {
			events.push({
				type: "delta_text",
				channel: "output_text",
				text: message.content,
				choiceIndex,
			});
		}
		for (const part of parseChatMediaParts(message?.images)) {
			events.push({
				type: "delta_content_part",
				part,
				choiceIndex,
			});
		}
		for (const part of parseChatMediaParts(message?.audios)) {
			events.push({
				type: "delta_content_part",
				part,
				choiceIndex,
			});
		}
		const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
		for (let toolIndex = 0; toolIndex < toolCalls.length; toolIndex += 1) {
			const toolCall = toolCalls[toolIndex] ?? {};
			events.push({
				type: "delta_tool",
				toolCallId: typeof toolCall?.id === "string" ? toolCall.id : undefined,
				toolName: typeof toolCall?.function?.name === "string" ? toolCall.function.name : undefined,
				arguments:
					typeof toolCall?.function?.arguments === "string"
						? toolCall.function.arguments
						: undefined,
				choiceIndex,
				toolIndex,
			});
		}
	}
	if (payload?.usage && typeof payload.usage === "object") {
		events.push({ type: "usage", usage: payload.usage, payload });
	}
	events.push({
		type: "stop",
		finishReason: String(choices?.[0]?.finish_reason ?? "stop"),
		payload,
	});
	return events;
}

function buildUnifiedEventsFromResponsesPayload(payload: any): UnifiedStreamEvent[] {
	const events: UnifiedStreamEvent[] = [
		{ type: "start", protocol: "openai.responses", payload },
	];
	const outputItems = Array.isArray(payload?.output)
		? payload.output
		: (Array.isArray(payload?.output_items) ? payload.output_items : []);
	for (let outputIndex = 0; outputIndex < outputItems.length; outputIndex += 1) {
		const item = outputItems[outputIndex] ?? {};
		const itemType = String(item?.type ?? "").toLowerCase();
		if (itemType === "message") {
			const contentParts = Array.isArray(item?.content) ? item.content : [];
			for (const part of contentParts) {
				if (part?.type === "output_text" && typeof part?.text === "string" && part.text.length > 0) {
					events.push({
						type: "delta_text",
						channel: "output_text",
						text: part.text,
						choiceIndex: 0,
					});
				}
				if (part?.type === "reasoning_text" && typeof part?.text === "string" && part.text.length > 0) {
					events.push({
						type: "delta_text",
						channel: "reasoning_text",
						text: part.text,
						choiceIndex: 0,
					});
				}
				for (const mediaPart of parseResponsesMediaParts([part])) {
					events.push({
						type: "delta_content_part",
						part: mediaPart,
						choiceIndex: 0,
					});
				}
			}
		}
		if (itemType === "reasoning") {
			const contentParts = Array.isArray(item?.content) ? item.content : [];
			for (const part of contentParts) {
				if (part?.type === "output_text" && typeof part?.text === "string" && part.text.length > 0) {
					events.push({
						type: "delta_text",
						channel: "reasoning_text",
						text: part.text,
						choiceIndex: 0,
					});
				}
			}
		}
		if (isExecutableResponseToolItem(item)) {
			events.push({
				type: "delta_tool",
				toolCallId: readResponseToolCallId(item),
				toolName: readResponseToolCallName(item) ?? undefined,
				arguments: readResponseToolCallArguments(item),
				choiceIndex: 0,
			});
		}
	}
	if (payload?.usage && typeof payload.usage === "object") {
		events.push({ type: "usage", usage: payload.usage, payload });
	} else {
		events.push({
			type: "stop",
			finishReason: String(payload?.status ?? "completed"),
			payload,
		});
	}
	return events;
}

function buildUnifiedEventsFromAnthropicPayload(payload: any): UnifiedStreamEvent[] {
	const events: UnifiedStreamEvent[] = [
		{ type: "start", protocol: "anthropic.messages", payload },
	];
	const contentBlocks = Array.isArray(payload?.content) ? payload.content : [];
	for (let index = 0; index < contentBlocks.length; index += 1) {
		const block = contentBlocks[index] ?? {};
		const blockType = String(block?.type ?? "").toLowerCase();
		if (blockType === "text" && typeof block?.text === "string" && block.text.length > 0) {
			events.push({
				type: "delta_text",
				channel: "output_text",
				text: block.text,
				choiceIndex: 0,
			});
		}
		if (blockType === "thinking" && typeof block?.thinking === "string" && block.thinking.length > 0) {
			events.push({
				type: "delta_text",
				channel: "reasoning_text",
				text: block.thinking,
				choiceIndex: 0,
			});
		}
		if (blockType === "tool_use") {
			events.push({
				type: "delta_tool",
				toolCallId: typeof block?.id === "string" ? block.id : undefined,
				toolName: typeof block?.name === "string" ? block.name : undefined,
				arguments: block?.input != null ? JSON.stringify(block.input) : "{}",
				choiceIndex: 0,
			});
		}
	}
	if (payload?.usage && typeof payload.usage === "object") {
		events.push({ type: "usage", usage: payload.usage, payload });
	}
	events.push({
		type: "stop",
		finishReason: String(payload?.stop_reason ?? "end_turn"),
		payload,
	});
	return events;
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
		const uri = typeof value.uri === "string" ? value.uri : (typeof value.url === "string" ? value.url : null);
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
		const uri = typeof value.uri === "string" ? value.uri : (typeof value.url === "string" ? value.url : null);
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

function googleText(value: any): string {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.map(googleText).filter(Boolean).join("");
	if (!value || typeof value !== "object") return "";
	if (typeof value.text === "string") return value.text;
	if (value.content !== undefined) return googleText(value.content);
	if (value.summary !== undefined) return googleText(value.summary);
	return "";
}

function buildUnifiedEventsFromGoogleInteractionsPayload(payload: any): UnifiedStreamEvent[] {
	const events: UnifiedStreamEvent[] = [
		{ type: "start", protocol: "google.interactions", payload },
	];
	const steps = Array.isArray(payload?.steps) ? payload.steps : [];
	for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
		const step = steps[stepIndex] ?? {};
		const stepType = String(step?.type ?? "").toLowerCase();
		if (stepType === "model_output") {
			const content = Array.isArray(step?.content) ? step.content : [];
			for (const block of content) {
				if (block?.type === "text" && typeof block?.text === "string" && block.text.length > 0) {
					events.push({
						type: "delta_text",
						channel: "output_text",
						text: block.text,
						choiceIndex: stepIndex,
					});
					continue;
				}
				const mediaPart = parseGoogleInteractionMediaPart(block);
				if (mediaPart) {
					events.push({
						type: "delta_content_part",
						part: mediaPart,
						choiceIndex: stepIndex,
					});
				}
			}
		}
		if (stepType === "thought") {
			const text = googleText(step?.summary ?? step?.content ?? step?.text);
			if (text) {
				events.push({
					type: "delta_text",
					channel: "reasoning_text",
					text,
					choiceIndex: stepIndex,
				});
			}
		}
		if (stepType === "function_call") {
			events.push({
				type: "delta_tool",
				toolCallId: typeof step?.id === "string" ? step.id : undefined,
				toolName: typeof step?.name === "string" ? step.name : undefined,
				arguments:
					step?.arguments != null
						? (typeof step.arguments === "string" ? step.arguments : JSON.stringify(step.arguments))
						: undefined,
				choiceIndex: stepIndex,
			});
		}
	}
	if (payload?.usage && typeof payload.usage === "object") {
		events.push({ type: "usage", usage: payload.usage, payload });
	}
	events.push({
		type: "stop",
		finishReason: String(payload?.status ?? "completed"),
		payload,
	});
	return events;
}

function buildUnifiedEventsFromPayload(protocol: StreamProtocol, payload: any): UnifiedStreamEvent[] {
	switch (protocol) {
		case "openai.chat.completions":
			return buildUnifiedEventsFromChatCompletionsPayload(payload);
		case "openai.responses":
			return buildUnifiedEventsFromResponsesPayload(payload);
		case "google.interactions":
			return buildUnifiedEventsFromGoogleInteractionsPayload(payload);
		case "anthropic.messages":
			return buildUnifiedEventsFromAnthropicPayload(payload);
		default:
			return [];
	}
}

export function buildSyntheticServerToolStream(args: {
	protocol: Protocol;
	payload: any;
	requestId: string;
	model?: string | null;
	created?: number | null;
	serverToolTrace?: readonly ServerToolTraceItem[];
}): ReadableStream<Uint8Array> | null {
	const streamProtocol = toStreamProtocol(args.protocol);
	if (!streamProtocol) return null;
	const payloadEvents = buildUnifiedEventsFromPayload(streamProtocol, args.payload);
	const traceEvents = buildServerToolTraceEvents(args.serverToolTrace);
	const events =
		traceEvents.length > 0 && payloadEvents[0]?.type === "start"
			? [payloadEvents[0], ...traceEvents, ...payloadEvents.slice(1)]
			: [...traceEvents, ...payloadEvents];
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const event of events) {
				const encoded = encodeUnifiedStreamEvent(streamProtocol, event, {
					requestId: args.requestId,
					model: args.model ?? null,
					created: args.created ?? null,
				});
				if (!encoded) continue;
				const prefix = encoded.eventName ? `event: ${encoded.eventName}\n` : "";
				controller.enqueue(encoder.encode(`${prefix}data: ${JSON.stringify(encoded.frame)}\n\n`));
			}
			if (streamProtocol !== "anthropic.messages" && streamProtocol !== "google.interactions") {
				controller.enqueue(encoder.encode("data: [DONE]\n\n"));
			}
			controller.close();
		},
	});
}

type StreamChoiceAccumulator = {
	outputParts: IRContentPart[];
	reasoningParts: string[];
	toolCallsByKey: Map<string, IRToolCall>;
	toolCallOrder: string[];
	finishReason?: IRChatResponse["choices"][number]["finishReason"];
};

type AccumulationState = {
	sawOutputTextDelta: boolean;
	sawReasoningTextDelta: boolean;
	sawToolDelta: boolean;
	sawContentPartDelta: boolean;
};

function parseSseFrame(raw: string): { eventName: string | null; data: string } {
	let eventName: string | null = null;
	let data = "";
	for (const line of raw.split("\n")) {
		const trimmed = line.replace(/\r$/, "");
		if (trimmed.startsWith("event:")) {
			eventName = trimmed.slice(6).trim() || null;
			continue;
		}
		if (trimmed.startsWith("data:")) {
			data += trimmed.slice(5).trimStart();
		}
	}
	return { eventName, data };
}

function mapStopReasonToIr(reason: string | null | undefined): IRChatResponse["choices"][number]["finishReason"] {
	const normalized = String(reason ?? "").trim().toLowerCase();
	if (!normalized) return "stop";
	if (normalized === "stop" || normalized === "end_turn" || normalized === "completed") return "stop";
	if (normalized === "max_tokens" || normalized === "length") return "length";
	if (normalized === "tool_use" || normalized === "tool_calls" || normalized === "requires_action" || normalized.includes("tool")) return "tool_calls";
	if (normalized.includes("content") || normalized.includes("refusal") || normalized.includes("safety")) return "content_filter";
	if (normalized === "error" || normalized === "failed") return "error";
	return "stop";
}

function parseUsageNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function usageRawToIR(usageRaw: any): IRUsage | undefined {
	if (!usageRaw || typeof usageRaw !== "object") return undefined;

	const inputTokens =
		parseUsageNumber(usageRaw.total_input_tokens) ??
		parseUsageNumber(usageRaw.input_tokens) ??
		parseUsageNumber(usageRaw.prompt_tokens) ??
		parseUsageNumber(usageRaw.inputTokens) ??
		0;
	const outputTokens =
		parseUsageNumber(usageRaw.total_output_tokens) ??
		parseUsageNumber(usageRaw.output_tokens) ??
		parseUsageNumber(usageRaw.completion_tokens) ??
		parseUsageNumber(usageRaw.outputTokens) ??
		0;
	const totalTokens =
		parseUsageNumber(usageRaw.total_tokens) ??
		parseUsageNumber(usageRaw.totalTokens) ??
		(inputTokens + outputTokens);
	const cachedInputTokens =
		parseUsageNumber(usageRaw.total_cached_tokens) ??
		parseUsageNumber(usageRaw.cached_read_tokens) ??
		parseUsageNumber(usageRaw.cached_input_tokens) ??
		parseUsageNumber(usageRaw.cached_tokens) ??
		parseUsageNumber(usageRaw.prompt_cache_hit_tokens) ??
		parseUsageNumber(usageRaw.prompt_tokens_details?.cached_tokens) ??
		parseUsageNumber(usageRaw.input_tokens_details?.cached_tokens);
	const reasoningTokens =
		parseUsageNumber(usageRaw.total_thought_tokens) ??
		parseUsageNumber(usageRaw.reasoning_tokens) ??
		parseUsageNumber(usageRaw.output_tokens_details?.reasoning_tokens);

	const ext: NonNullable<IRUsage["_ext"]> = {};
	const inputImageTokens =
		parseUsageNumber(usageRaw.input_tokens_details?.input_images) ??
		parseUsageNumber(usageRaw.input_image_tokens);
	if (inputImageTokens != null) ext.inputImageTokens = inputImageTokens;
	const inputAudioTokens =
		parseUsageNumber(usageRaw.input_tokens_details?.input_audio) ??
		parseUsageNumber(usageRaw.input_audio_tokens);
	if (inputAudioTokens != null) ext.inputAudioTokens = inputAudioTokens;
	const inputVideoTokens =
		parseUsageNumber(usageRaw.input_tokens_details?.input_videos) ??
		parseUsageNumber(usageRaw.input_video_tokens);
	if (inputVideoTokens != null) ext.inputVideoTokens = inputVideoTokens;
	const outputImageTokens =
		parseUsageNumber(usageRaw.output_tokens_details?.output_images) ??
		parseUsageNumber(usageRaw.output_image_tokens);
	if (outputImageTokens != null) ext.outputImageTokens = outputImageTokens;
	const outputAudioTokens =
		parseUsageNumber(usageRaw.output_tokens_details?.output_audio) ??
		parseUsageNumber(usageRaw.output_audio_tokens);
	if (outputAudioTokens != null) ext.outputAudioTokens = outputAudioTokens;
	const outputVideoTokens =
		parseUsageNumber(usageRaw.output_tokens_details?.output_videos) ??
		parseUsageNumber(usageRaw.output_video_tokens);
	if (outputVideoTokens != null) ext.outputVideoTokens = outputVideoTokens;
	const cachedWriteTokens =
		parseUsageNumber(usageRaw.output_tokens_details?.cached_tokens) ??
		parseUsageNumber(usageRaw.input_tokens_details?.cache_creation_input_tokens) ??
		parseUsageNumber(usageRaw.prompt_tokens_details?.cache_creation_input_tokens) ??
		parseUsageNumber(usageRaw.input_tokens_details?.cache_creation_tokens) ??
		parseUsageNumber(usageRaw.prompt_tokens_details?.cache_creation_tokens) ??
		parseUsageNumber(usageRaw.cache_creation_input_tokens) ??
		parseUsageNumber(usageRaw.cached_write_text_tokens) ??
		parseUsageNumber(usageRaw.cached_write_tokens);
	if (cachedWriteTokens != null) ext.cachedWriteTokens = cachedWriteTokens;
	const cachedWriteTokens5m =
		parseUsageNumber(usageRaw.cached_write_text_tokens_5m) ??
		parseUsageNumber(usageRaw.cache_creation?.ephemeral_5m_input_tokens);
	if (cachedWriteTokens5m != null) ext.cachedWriteTokens5m = cachedWriteTokens5m;
	const cachedWriteTokens1h =
		parseUsageNumber(usageRaw.cached_write_text_tokens_1h) ??
		parseUsageNumber(usageRaw.cache_creation?.ephemeral_1h_input_tokens);
	if (cachedWriteTokens1h != null) ext.cachedWriteTokens1h = cachedWriteTokens1h;
	const datetimeRequests =
		parseUsageNumber(usageRaw.server_tool_use?.datetime_requests) ??
		parseUsageNumber(usageRaw.serverToolUse?.datetime_requests);
	const webSearchRequests =
		parseUsageNumber(usageRaw.server_tool_use?.web_search_requests) ??
		parseUsageNumber(usageRaw.serverToolUse?.web_search_requests);
	const webSearchResults =
		parseUsageNumber(usageRaw.server_tool_use?.web_search_results) ??
		parseUsageNumber(usageRaw.serverToolUse?.web_search_results);
	const webSearchExtraResults =
		parseUsageNumber(usageRaw.server_tool_use?.web_search_extra_results) ??
		parseUsageNumber(usageRaw.serverToolUse?.web_search_extra_results);
	const webFetchRequests =
		parseUsageNumber(usageRaw.server_tool_use?.web_fetch_requests) ??
		parseUsageNumber(usageRaw.serverToolUse?.web_fetch_requests);
	const advisorRequests =
		parseUsageNumber(usageRaw.server_tool_use?.advisor_requests) ??
		parseUsageNumber(usageRaw.serverToolUse?.advisor_requests);
	const imageGenerationRequests =
		parseUsageNumber(usageRaw.server_tool_use?.image_generation_requests) ??
		parseUsageNumber(usageRaw.serverToolUse?.image_generation_requests);
	const applyPatchRequests =
		parseUsageNumber(usageRaw.server_tool_use?.apply_patch_requests) ??
		parseUsageNumber(usageRaw.serverToolUse?.apply_patch_requests);
	if (
		datetimeRequests != null ||
		webSearchRequests != null ||
		webSearchResults != null ||
		webSearchExtraResults != null ||
		webFetchRequests != null ||
		advisorRequests != null ||
		imageGenerationRequests != null ||
		applyPatchRequests != null
	) {
		ext.serverToolUse = {
			...(datetimeRequests != null ? { datetime_requests: datetimeRequests } : {}),
			...(webSearchRequests != null ? { web_search_requests: webSearchRequests } : {}),
			...(webSearchResults != null ? { web_search_results: webSearchResults } : {}),
			...(webSearchExtraResults != null ? { web_search_extra_results: webSearchExtraResults } : {}),
			...(webFetchRequests != null ? { web_fetch_requests: webFetchRequests } : {}),
			...(advisorRequests != null ? { advisor_requests: advisorRequests } : {}),
			...(imageGenerationRequests != null ? { image_generation_requests: imageGenerationRequests } : {}),
			...(applyPatchRequests != null ? { apply_patch_requests: applyPatchRequests } : {}),
		};
	}

	return {
		inputTokens,
		outputTokens,
		totalTokens,
		...(cachedInputTokens != null ? { cachedInputTokens } : {}),
		...(reasoningTokens != null ? { reasoningTokens } : {}),
		...(Object.keys(ext).length > 0 ? { _ext: ext } : {}),
	};
}

function resolveRawPayloadForUsage(payload: any): any {
	if (payload?.response && typeof payload.response === "object") return payload.response;
	if (payload?.interaction && typeof payload.interaction === "object") return payload.interaction;
	return payload;
}

function resolveNativeId(payload: any): string | undefined {
	if (typeof payload?.id === "string" && payload.id.length > 0) return payload.id;
	if (typeof payload?.response?.id === "string" && payload.response.id.length > 0) return payload.response.id;
	if (typeof payload?.interaction?.id === "string" && payload.interaction.id.length > 0) return payload.interaction.id;
	return undefined;
}

function resolveModelFromPayload(payload: any): string | undefined {
	if (typeof payload?.model === "string" && payload.model.length > 0) return payload.model;
	if (typeof payload?.response?.model === "string" && payload.response.model.length > 0) return payload.response.model;
	if (typeof payload?.interaction?.model === "string" && payload.interaction.model.length > 0) return payload.interaction.model;
	return undefined;
}

function getChoiceAccumulator(
	choices: Map<number, StreamChoiceAccumulator>,
	index: number,
): StreamChoiceAccumulator {
	const existing = choices.get(index);
	if (existing) return existing;
	const created: StreamChoiceAccumulator = {
		outputParts: [],
		reasoningParts: [],
		toolCallsByKey: new Map(),
		toolCallOrder: [],
	};
	choices.set(index, created);
	return created;
}

function applyUnifiedEventToAccumulators(args: {
	event: UnifiedStreamEvent;
	choices: Map<number, StreamChoiceAccumulator>;
	state: AccumulationState;
	setGlobalFinishReason: (reason: IRChatResponse["choices"][number]["finishReason"]) => void;
	requestId: string;
}): void {
	const { event, choices, state, setGlobalFinishReason, requestId } = args;
	if (event.type === "delta_text") {
		const index = Number.isFinite(event.choiceIndex as number)
			? Number(event.choiceIndex)
			: 0;
		const accumulator = getChoiceAccumulator(choices, index);
		if (event.channel === "reasoning_text") {
			accumulator.reasoningParts.push(event.text);
			state.sawReasoningTextDelta = true;
		} else {
			accumulator.outputParts.push({
				type: "text",
				text: event.text,
			});
			state.sawOutputTextDelta = true;
		}
		return;
	}

	if (event.type === "delta_content_part") {
		const index = Number.isFinite(event.choiceIndex as number)
			? Number(event.choiceIndex)
			: 0;
		const accumulator = getChoiceAccumulator(choices, index);
		accumulator.outputParts.push(event.part);
		state.sawContentPartDelta = true;
		return;
	}

	if (event.type === "delta_tool") {
		const index = Number.isFinite(event.choiceIndex as number)
			? Number(event.choiceIndex)
			: 0;
		const accumulator = getChoiceAccumulator(choices, index);
		const eventToolName =
			typeof event.toolName === "string" && event.toolName.trim().length > 0
				? event.toolName.trim()
				: null;
		const eventToolKey =
			typeof event.toolCallKey === "string" && event.toolCallKey.trim().length > 0
				? event.toolCallKey.trim()
				: null;
		const eventToolCallId =
			typeof event.toolCallId === "string" && event.toolCallId.trim().length > 0
				? event.toolCallId.trim()
				: null;
		const key =
			eventToolKey ??
			(Number.isFinite(event.toolIndex as number)
				? `tool_${index}_${Number(event.toolIndex)}`
				: (eventToolCallId ?? `tool_${index}_${accumulator.toolCallOrder.length}`));
		let toolCall = accumulator.toolCallsByKey.get(key);
		if (!toolCall) {
			if (!eventToolName || eventToolName === "tool_call") {
				return;
			}
			toolCall = {
				id: eventToolCallId ?? eventToolKey ?? `${requestId}_${key}`,
				name: eventToolName,
				arguments: "",
			};
			accumulator.toolCallsByKey.set(key, toolCall);
			accumulator.toolCallOrder.push(key);
		}
		if (eventToolName && eventToolName !== "tool_call") {
			toolCall.name = eventToolName;
		}
		if (eventToolCallId) {
			toolCall.id = eventToolCallId;
		}
		if (typeof event.argumentsDelta === "string") {
			toolCall.arguments += event.argumentsDelta;
		}
		if (typeof event.arguments === "string") {
			toolCall.arguments = event.arguments;
		}
		state.sawToolDelta = true;
		return;
	}

	if (event.type === "stop") {
		setGlobalFinishReason(mapStopReasonToIr(event.finishReason));
	}
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

function buildIRFromAccumulatedEvents(args: {
	requestId: string;
	model: string;
	provider: string;
	choices: Map<number, StreamChoiceAccumulator>;
	globalFinishReason: IRChatResponse["choices"][number]["finishReason"] | null;
	usageRaw: any;
	nativeId?: string;
	modelFromStream?: string;
}): IRChatResponse {
	const sortedIndices = [...args.choices.keys()].sort((a, b) => a - b);
	if (sortedIndices.length === 0) sortedIndices.push(0);

	const outputChoices: IRChatResponse["choices"] = sortedIndices.map((choiceIndex) => {
		const accumulator = args.choices.get(choiceIndex) ?? {
			outputParts: [],
			reasoningParts: [],
			toolCallsByKey: new Map<string, IRToolCall>(),
			toolCallOrder: [],
		};

		const content: IRContentPart[] = [];
		const reasoningText = accumulator.reasoningParts.join("");
		if (reasoningText.length > 0) {
			content.push({
				type: "reasoning_text",
				text: reasoningText,
			});
		}
		for (const part of accumulator.outputParts) {
			const previous = content[content.length - 1];
			if (part.type === "text" && previous?.type === "text") {
				(previous as Extract<IRContentPart, { type: "text" }>).text += part.text;
				continue;
			}
			content.push(part);
		}

		const toolCalls = accumulator.toolCallOrder
			.map((key) => accumulator.toolCallsByKey.get(key))
			.filter((value): value is IRToolCall => Boolean(value));
		const finishReason =
			accumulator.finishReason ??
			(toolCalls.length > 0 ? "tool_calls" : null) ??
			args.globalFinishReason ??
			"stop";

		return {
			index: choiceIndex,
			message: {
				role: "assistant",
				content,
				...(toolCalls.length > 0 ? { toolCalls } : {}),
			},
			finishReason,
		};
	});

	return {
		id: args.requestId,
		...(args.nativeId ? { nativeId: args.nativeId } : {}),
		created: Math.floor(Date.now() / 1000),
		model: args.modelFromStream ?? args.model,
		provider: args.provider,
		choices: outputChoices,
		usage: usageRawToIR(args.usageRaw),
	};
}

export async function consumeTextProtocolStreamToIR(args: {
	protocol: Protocol;
	stream: ReadableStream<Uint8Array>;
	requestId: string;
	model: string;
	provider: string;
	startedAtMs?: number;
}): Promise<{
	ir: IRChatResponse;
	rawResponse: any;
	usageRaw: any;
	frameCount: number;
	sawDone: boolean;
	firstFrameMs: number | null;
	totalMs: number | null;
}> {
	const reader = args.stream.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	const materializeStartMs = Date.now();
	let firstFrameMs: number | null = null;
	let frameCount = 0;
	let sawDone = false;
	let lastPayload: any = null;
	let finalSnapshot: any = null;
	let usageRaw: any = null;
	let nativeId: string | undefined;
	let modelFromStream: string | undefined;
	let globalFinishReason: IRChatResponse["choices"][number]["finishReason"] | null = null;
	const choiceAccumulators = new Map<number, StreamChoiceAccumulator>();
	const accumulationState: AccumulationState = {
		sawOutputTextDelta: false,
		sawReasoningTextDelta: false,
		sawToolDelta: false,
		sawContentPartDelta: false,
	};

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const frames = buffer.split(/\n\n/);
		buffer = frames.pop() ?? "";

		for (const raw of frames) {
			const { eventName, data } = parseSseFrame(raw);
			if (!data) continue;
			if (data === "[DONE]") {
				sawDone = true;
				continue;
			}

			let payload: any;
			try {
				payload = JSON.parse(data);
			} catch {
				continue;
			}

			frameCount += 1;
			if (firstFrameMs === null) {
				const baseStartedAt = args.startedAtMs ?? materializeStartMs;
				firstFrameMs = Math.max(0, Date.now() - baseStartedAt);
			}
			lastPayload = payload;
			const normalizedPayloadForMeta = resolveRawPayloadForUsage(payload);
			nativeId = nativeId ?? resolveNativeId(normalizedPayloadForMeta);
			modelFromStream = modelFromStream ?? resolveModelFromPayload(normalizedPayloadForMeta);
			const events = extractUnifiedStreamEvents({
				protocol: args.protocol,
				eventName,
				frame: payload,
			});

			for (const event of events) {
				if (event.type === "snapshot" && event.isFinal) {
					finalSnapshot = event.payload;
					nativeId = nativeId ?? resolveNativeId(event.payload);
					modelFromStream = modelFromStream ?? resolveModelFromPayload(event.payload);
					continue;
				}

				if (event.type === "usage") {
					usageRaw = event.usage;
					continue;
				}
				applyUnifiedEventToAccumulators({
					event,
					choices: choiceAccumulators,
					state: accumulationState,
					setGlobalFinishReason: (reason) => {
						globalFinishReason = reason;
					},
					requestId: args.requestId,
				});
			}
		}
	}

	const trailing = buffer.trim();
	if (trailing.length > 0) {
		const { eventName, data } = parseSseFrame(trailing);
		if (data === "[DONE]") {
			sawDone = true;
		} else if (data.length > 0) {
			try {
				const payload = JSON.parse(data);
				frameCount += 1;
				if (firstFrameMs === null) {
					const baseStartedAt = args.startedAtMs ?? materializeStartMs;
					firstFrameMs = Math.max(0, Date.now() - baseStartedAt);
				}
				lastPayload = payload;
				const events = extractUnifiedStreamEvents({
					protocol: args.protocol,
					eventName,
					frame: payload,
				});
				for (const event of events) {
					if (event.type === "snapshot" && event.isFinal) {
						finalSnapshot = event.payload;
						nativeId = nativeId ?? resolveNativeId(event.payload);
						modelFromStream = modelFromStream ?? resolveModelFromPayload(event.payload);
						continue;
					}
					if (event.type === "usage") {
						usageRaw = event.usage;
						continue;
					}
					applyUnifiedEventToAccumulators({
						event,
						choices: choiceAccumulators,
						state: accumulationState,
						setGlobalFinishReason: (reason) => {
							globalFinishReason = reason;
						},
						requestId: args.requestId,
					});
				}
			} catch {
				// ignore trailing invalid data frame
			}
		}
	}

	const rawResponse = finalSnapshot ?? resolveRawPayloadForUsage(lastPayload);
	const effectiveUsageRaw =
		usageRaw ??
		rawResponse?.usage ??
		lastPayload?.usage ??
		lastPayload?.response?.usage ??
		lastPayload?.interaction?.usage ??
		null;

	if (rawResponse && typeof rawResponse === "object") {
		const streamProtocol = toStreamProtocol(args.protocol);
		if (streamProtocol) {
			const fallbackEvents = buildUnifiedEventsFromPayload(streamProtocol, rawResponse);
			for (const event of fallbackEvents) {
				if (
					event.type === "delta_text" &&
					((event.channel === "output_text" && accumulationState.sawOutputTextDelta) ||
						(event.channel === "reasoning_text" && accumulationState.sawReasoningTextDelta))
				) {
					continue;
				}
				if (event.type === "delta_content_part" && accumulationState.sawContentPartDelta) {
					continue;
				}
				if (event.type === "delta_tool" && accumulationState.sawToolDelta) {
					continue;
				}
				if (event.type === "usage" && usageRaw) {
					continue;
				}
				if (event.type === "usage") {
					usageRaw = event.usage;
					continue;
				}
				applyUnifiedEventToAccumulators({
					event,
					choices: choiceAccumulators,
					state: accumulationState,
					setGlobalFinishReason: (reason) => {
						globalFinishReason = reason;
					},
					requestId: args.requestId,
				});
			}
		}
	}

	const ir = buildIRFromAccumulatedEvents({
		requestId: args.requestId,
		model: args.model,
		provider: args.provider,
		choices: choiceAccumulators,
		globalFinishReason,
		usageRaw: effectiveUsageRaw,
		nativeId,
		modelFromStream,
	});

	return {
		ir,
		rawResponse: rawResponse ?? null,
		usageRaw: effectiveUsageRaw,
		frameCount,
		sawDone,
		firstFrameMs,
		totalMs: Math.max(0, Date.now() - (args.startedAtMs ?? materializeStartMs)),
	};
}
