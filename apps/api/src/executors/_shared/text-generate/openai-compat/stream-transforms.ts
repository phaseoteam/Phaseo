import type { ExecutorExecuteArgs } from "@executors/types";
import type { IRChatResponse, IRContentPart } from "@core/ir";
import { irUsageToOpenAIStyle } from "@core/cache-usage";
import { openAIResponsesToIR } from "./transform";
import { openAIChatToIR } from "./transform-chat";
import { getProviderQuirks } from "./quirks";
import { parseMinimaxInterleavedText } from "./providers/minimax/quirks";
import { encodeOpenAIChatResponse } from "@protocols/openai-chat/encode";
import { encodeOpenAIResponsesResponse } from "@protocols/openai-responses/encode";
import { SseParser } from "@core/sse-parser";
import type { GatewayReasoningDetail } from "@core/types";
import { toChatAnnotations, toResponsesAnnotations } from "@protocols/shared/citations";
import {
	isSealedReasoningValue,
	openReasoningState,
	reasoningFormatForRoute,
	sealReasoningState,
} from "@core/reasoning-state";

export type StreamAdapterState = {
	requestId: string;
	providerId: string;
	choiceStates: Map<number, { reasoningChunks: string[] }>;
	aionStates?: Map<number, any>;
};

function applyStreamQuirks(chunk: any, state: StreamAdapterState, providerId: string) {
	const quirks = getProviderQuirks(providerId);
	if (quirks.transformStreamChunk) {
		try {
			quirks.transformStreamChunk({ chunk, accumulated: state });
		} catch {
			// ignore quirk errors to avoid breaking stream
		}
	}
}

function normalizeResponsesEvent(event: string | null): string | null {
	if (!event) return event;
	if (event === "response.reasoning.delta") return "response.reasoning_text.delta";
	if (event === "response.reasoning_summary_text.delta") return "response.reasoning_text.delta";
	if (event === "response.reasoning_summary.delta") return "response.reasoning_text.delta";
	if (event === "response.output.delta") return "response.output_text.delta";
	if (event === "response.text.delta") return "response.output_text.delta";
	return event;
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

export function transformChatStream(
	stream: ReadableStream<Uint8Array>,
	args: ExecutorExecuteArgs,
	state: StreamAdapterState,
): ReadableStream<Uint8Array> {
	const reader = stream.getReader();
	const parser = new SseParser();
	const encoder = new TextEncoder();

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;

					for (const frame of parser.pushBytes(value)) {
						const { data } = frame;
						if (!data || data === "[DONE]") continue;
						let payload: any;
						try {
							payload = JSON.parse(data);
						} catch {
							continue;
						}

						applyStreamQuirks(payload, state, args.providerId);
						controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
					}
				}
			} catch (err) {
				console.error("openai compat chat stream transform failed:", err);
			} finally {
				controller.close();
			}
		},
	});
}

export function transformResponsesStreamToChat(
	stream: ReadableStream<Uint8Array>,
	args: ExecutorExecuteArgs,
	state: StreamAdapterState,
): ReadableStream<Uint8Array> {
	const reader = stream.getReader();
	const parser = new SseParser();
	const encoder = new TextEncoder();

	// State tracking for the response
	let nativeResponseId: string | null = null;
	let created = Math.floor(Date.now() / 1000);
	let finalResponse: any = null;
	// Buffer tool calls across deltas (Responses API sends tool calls incrementally).
	// OpenAI often uses item_id (fc_*) in argument-delta events and call_id (call_*) in output-item events.
	// We alias both to a canonical tool id (prefer call_id) so chat deltas stay consistent.
	// Chat clients concatenate streamed tool-call fields, so each chunk carries only
	// the unsent argument suffix, and id/type/name are sent once per tool call.
	type ToolBufferEntry = {
		arguments: string;
		name?: string;
		output_index: number;
		tool_index: number;
		emitted: string;
		announced: boolean;
		diverged?: boolean;
	};
	const toolBuffer = new Map<string, ToolBufferEntry>();
	const toolAlias = new Map<string, string>();
	const toolIndexById = new Map<string, number>();
	let nextToolIndex = 0;
	let nextReasoningDetailIndex = 0;

	const ensureToolIndex = (id: string): number => {
		const existing = toolIndexById.get(id);
		if (typeof existing === "number") return existing;
		const idx = nextToolIndex++;
		toolIndexById.set(id, idx);
		return idx;
	};

	const aliasToolId = (rawId: unknown, canonicalId: string) => {
		if (typeof rawId !== "string" || !rawId) return;
		toolAlias.set(rawId, canonicalId);
	};

	const canonicalToolId = (rawId: unknown): string | null => {
		if (typeof rawId !== "string" || !rawId) return null;
		return toolAlias.get(rawId) ?? rawId;
	};

	const emit = async (payload: any, controller: ReadableStreamDefaultController<Uint8Array>) => {
		applyStreamQuirks(payload, state, args.providerId);
		controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
	};

	const emitDelta = async (
		delta: Record<string, unknown>,
		controller: ReadableStreamDefaultController<Uint8Array>,
		index = 0,
		extra?: Record<string, unknown>,
	) => {
		const chunk = {
			object: "chat.completion.chunk",
			nativeResponseId,
			created,
			model: args.providerModelSlug ?? args.ir.model,
			provider: args.providerId,
			choices: [{
				index,
				delta,
				finish_reason: null,
				...(extra ?? {}),
			}],
		};
		await emit(chunk, controller);
	};

	const flushToolArguments = async (
		toolId: string,
		entry: ToolBufferEntry,
		controller: ReadableStreamDefaultController<Uint8Array>,
	) => {
		const full = entry.arguments ?? "";
		let fragment = "";
		if (full.startsWith(entry.emitted)) {
			fragment = full.slice(entry.emitted.length);
		} else if (!entry.diverged) {
			// Emitted chunks cannot be retracted; keep the client-side value stable.
			entry.diverged = true;
			console.warn("openai_compat_tool_arguments_diverged", {
				provider: args.providerId,
				requestId: args.requestId,
			});
		}
		if (entry.announced && !fragment) return;
		const toolCall = entry.announced
			? { index: entry.tool_index, function: { arguments: fragment } }
			: {
				index: entry.tool_index,
				id: toolId,
				type: "function",
				function: { name: entry.name ?? "", arguments: fragment },
			};
		entry.announced = true;
		entry.emitted += fragment;
		await emitDelta({ role: "assistant", tool_calls: [toolCall] }, controller, 0);
	};

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;

					for (const frame of parser.pushBytes(value)) {
						const { event, data } = frame;
						if (!data || data === "[DONE]") continue;
						let payload: any;
						try {
							payload = JSON.parse(data);
						} catch {
							continue;
						}

						// Some providers stream chat chunks even on /responses
						if (payload?.object === "chat.completion.chunk" || payload?.object === "chat.completion") {
							await emit(payload, controller);
							continue;
						}

						switch (normalizeResponsesEvent(event)) {
							case "response.created":
								nativeResponseId = payload?.response?.id ?? payload?.id ?? nativeResponseId;
								created = payload?.response?.created_at ?? payload?.created_at ?? created;
								break;
							case "response.output_text.delta":
								if (typeof payload?.delta === "string") {
									await emitDelta({ role: "assistant", content: payload.delta }, controller, 0, payload?.logprobs ? { logprobs: payload.logprobs } : undefined);
								}
								break;
							case "response.reasoning_text.delta":
								if (typeof payload?.delta === "string") {
									await emitDelta({ role: "assistant", reasoning_content: payload.delta }, controller, 0);
								}
								break;
							case "response.refusal.delta":
								if (typeof payload?.delta === "string" && payload.delta.length > 0) {
									await emitDelta({ role: "assistant", refusal: payload.delta }, controller, 0);
								}
								break;
							case "response.output_text.annotation.added": {
								const annotations = toChatAnnotations([payload?.annotation]);
								if (annotations.length > 0) {
									await emitDelta({ role: "assistant", annotations }, controller, 0);
								}
								break;
							}
							case "response.function_call_arguments.delta": {
								const resolvedId = canonicalToolId(payload?.item_id);
								if (!resolvedId) break;
								const entry = toolBuffer.get(resolvedId);
								if (!entry) break;
								if (typeof payload?.delta === "string") {
									entry.arguments += payload.delta;
								}
								await flushToolArguments(resolvedId, entry, controller);
								break;
							}
							case "response.output_item.added":
							case "response.output_item.done": {
								const item = payload?.item;
								if (normalizeResponsesEvent(event) === "response.output_item.done" && item?.type === "reasoning") {
									const detail = buildReasoningDetailDelta(item, args, nextReasoningDetailIndex);
									if (detail) {
										nextReasoningDetailIndex += 1;
										await emitDelta({ role: "assistant", reasoning_details: [detail] }, controller, 0);
									}
									break;
								}
								if (!isExecutableResponseToolItem(item)) break;
								const itemName = readResponseToolCallName(item);
								const canonicalId =
									canonicalToolId(item?.call_id) ??
									canonicalToolId(item?.id) ??
									canonicalToolId(item?.tool_call_id) ??
									canonicalToolId(payload?.item_id);
								if (!canonicalId || !itemName) break;
								aliasToolId(item?.call_id, canonicalId);
								aliasToolId(item?.id, canonicalId);
								aliasToolId(item?.tool_call_id, canonicalId);
								aliasToolId(payload?.item_id, canonicalId);
								const entry: ToolBufferEntry = toolBuffer.get(canonicalId) ?? {
									arguments: "",
									output_index: 0,
									tool_index: ensureToolIndex(canonicalId),
									emitted: "",
									announced: false,
								};
								entry.name = itemName;
								const itemArguments = readResponseToolCallArguments(item);
								if (itemArguments !== undefined) entry.arguments = itemArguments;
								toolBuffer.set(canonicalId, entry);
								await flushToolArguments(canonicalId, entry, controller);
								break;
							}
							case "response.function_call_arguments.done": {
								const resolvedId = canonicalToolId(payload?.item_id);
								const payloadName =
									typeof payload?.name === "string" && payload.name.trim().length > 0
										? payload.name.trim()
										: undefined;
								if (!resolvedId) break;
								const entry: ToolBufferEntry = toolBuffer.get(resolvedId) ?? {
									arguments: "",
									output_index: 0,
									tool_index: ensureToolIndex(resolvedId),
									emitted: "",
									announced: false,
								};
								if (typeof payload?.arguments === "string") {
									entry.arguments = payload.arguments;
								}
								if (payloadName && payloadName !== "tool_call") {
									entry.name = payloadName;
								}
								if (!entry.name || entry.name === "tool_call") break;
								toolBuffer.set(resolvedId, entry);
								await flushToolArguments(resolvedId, entry, controller);
								break;
							}
							case "response.completed":
								finalResponse = payload?.response ?? finalResponse;
								break;
							case "response.failed":
							case "error":
								await emit({ object: "error", message: payload?.error?.message ?? "stream_error" }, controller);
								break;
							default:
								break;
						}
					}
				}

				if (finalResponse) {
					const ir = openAIResponsesToIR(finalResponse, args.requestId, args.ir.model, args.providerId);
					const finalChunk = encodeOpenAIChatResponse(ir, args.requestId);
					await emit(finalChunk, controller);
				}
			} catch (err) {
				console.error("openai compat responses->chat stream transform failed:", err);
			} finally {
				controller.close();
			}
		},
	});
}

type ResponsesStreamChoiceState = {
	text: string;
	reasoning: string;
	refusal: string;
	// Responses-shaped url_citation annotations on the message's output_text.
	annotations: Array<Record<string, any>>;
	emittedAnnotations: number;
	mediaParts: Array<Extract<IRContentPart, { type: "image" | "audio" }>>;
	finishReason?: string | null;
	messageOutputIndex?: number;
	reasoningOutputIndex?: number;
	messageItemId?: string;
	reasoningItemId?: string;
	toolCalls: Map<number, { id: string; name: string; arguments: string; outputIndex: number; emittedAdded?: boolean }>;
	emittedText?: boolean;
	emittedReasoning?: boolean;
};

export function transformChatStreamToResponses(
	stream: ReadableStream<Uint8Array>,
	args: ExecutorExecuteArgs,
	state: StreamAdapterState,
): ReadableStream<Uint8Array> {
	const reader = stream.getReader();
	const parser = new SseParser();
	const encoder = new TextEncoder();

	let mode: "unknown" | "responses" | "chat" = "unknown";
	let createdAt = Math.floor(Date.now() / 1000);
	let responseId: string | null = args.requestId ?? null;
	let nativeResponseId: string | null = null;
	let model = args.providerModelSlug ?? args.ir.model;
	let finalResponse: any = null;
	let nextOutputIndex = 0;
	const isMiniMaxToolInterop =
		(args.providerId === "minimax" || args.providerId === "minimax-lightning") &&
		((Array.isArray(args.ir.tools) && args.ir.tools.length > 0) ||
			typeof args.ir.toolChoice === "object" ||
			args.ir.toolChoice === "required");

	const choiceStates = new Map<number, ResponsesStreamChoiceState>();

	const getChoiceState = (index: number): ResponsesStreamChoiceState => {
		let entry = choiceStates.get(index);
		if (!entry) {
			entry = {
				text: "",
				reasoning: "",
				refusal: "",
				annotations: [],
				emittedAnnotations: 0,
				mediaParts: [],
				toolCalls: new Map(),
			};
			choiceStates.set(index, entry);
		}
		return entry;
	};

	const ensureMessageIndex = (choiceIndex: number, entry: ResponsesStreamChoiceState) => {
		if (entry.messageOutputIndex == null) {
			entry.messageOutputIndex = nextOutputIndex++;
			entry.messageItemId = `msg_${args.requestId}_${choiceIndex}`;
		}
		return { outputIndex: entry.messageOutputIndex, itemId: entry.messageItemId! };
	};

	const ensureReasoningIndex = (choiceIndex: number, entry: ResponsesStreamChoiceState) => {
		if (entry.reasoningOutputIndex == null) {
			entry.reasoningOutputIndex = nextOutputIndex++;
			entry.reasoningItemId = `reasoning_${args.requestId}_${choiceIndex}`;
		}
		return { outputIndex: entry.reasoningOutputIndex, itemId: entry.reasoningItemId! };
	};

	const ensureToolCallState = (
		choiceIndex: number,
		toolIndex: number,
		entry: ResponsesStreamChoiceState,
		toolId?: string,
	) => {
		let tool = entry.toolCalls.get(toolIndex);
		if (!tool) {
			tool = {
				id: toolId ?? `call_${args.requestId}_${choiceIndex}_${toolIndex}`,
				name: "",
				arguments: "",
				outputIndex: nextOutputIndex++,
				emittedAdded: false,
			};
			entry.toolCalls.set(toolIndex, tool);
		}
		return tool;
	};

	const emitEvent = async (
		eventName: string,
		payload: any,
		controller: ReadableStreamDefaultController<Uint8Array>,
	) => {
		controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`));
	};

	// Refusal text and citations belong to the message item, next to its output_text.
	const emitRefusal = async (
		choiceIndex: number,
		entry: ResponsesStreamChoiceState,
		refusal: string,
		controller: ReadableStreamDefaultController<Uint8Array>,
	) => {
		const { outputIndex, itemId } = ensureMessageIndex(choiceIndex, entry);
		if (!entry.emittedText && entry.refusal.length === 0) {
			// A refusal-only message: announce the item and its refusal part first.
			await emitEvent("response.output_item.added", {
				output_index: outputIndex,
				item: { type: "message", id: itemId, status: "in_progress", role: "assistant", content: [] },
			}, controller);
			await emitEvent("response.content_part.added", {
				item_id: itemId,
				output_index: outputIndex,
				content_index: 0,
				part: { type: "refusal", refusal: "" },
			}, controller);
		}
		entry.refusal += refusal;
		await emitEvent("response.refusal.delta", {
			item_id: itemId,
			output_index: outputIndex,
			content_index: entry.text.length > 0 ? 1 : 0,
			delta: refusal,
		}, controller);
	};

	// Annotations follow the text they cite: while the text is held back (MiniMax
	// tool interop), they wait and go out after it.
	const emitAnnotations = async (
		choiceIndex: number,
		entry: ResponsesStreamChoiceState,
		annotations: unknown,
		controller: ReadableStreamDefaultController<Uint8Array>,
	) => {
		entry.annotations.push(...toResponsesAnnotations(annotations));
		if (!entry.emittedText) return;
		const { outputIndex, itemId } = ensureMessageIndex(choiceIndex, entry);
		for (; entry.emittedAnnotations < entry.annotations.length; entry.emittedAnnotations += 1) {
			await emitEvent("response.output_text.annotation.added", {
				item_id: itemId,
				output_index: outputIndex,
				content_index: 0,
				annotation_index: entry.emittedAnnotations,
				annotation: entry.annotations[entry.emittedAnnotations],
			}, controller);
		}
	};

	const emitCreated = async (controller: ReadableStreamDefaultController<Uint8Array>) => {
		await emitEvent("response.created", {
			response: {
				id: responseId ?? args.requestId,
				created_at: createdAt,
				model,
			},
		}, controller);
	};

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			let createdEmitted = false;
			try {
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;

					for (const frame of parser.pushBytes(value)) {
						const { event, data } = frame;
						if (!data || data === "[DONE]") continue;
						let payload: any;
						try {
							payload = JSON.parse(data);
						} catch {
							continue;
						}

						const isChatPayload =
							payload?.object === "chat.completion.chunk" ||
							payload?.object === "chat.completion" ||
							Array.isArray(payload?.choices);
						const isResponsesPayload =
							(event && event.startsWith("response.")) ||
							payload?.object === "response" ||
							payload?.response;

						if (mode === "unknown") {
							if (isResponsesPayload && !isChatPayload) mode = "responses";
							else if (isChatPayload) mode = "chat";
						}

						if (mode === "responses" && !isChatPayload) {
							const normalized = normalizeResponsesEvent(event) ?? "response.event";
							if (sealResponsesReasoningPayload(payload, args)) {
								controller.enqueue(encoder.encode(`event: ${normalized}\ndata: ${JSON.stringify(payload)}\n\n`));
								continue;
							}
							// The payload is not modified here, so when the event name is
							// already normalized and the data is a single line, forward
							// the upstream JSON text instead of re-stringifying it. For
							// compact upstream JSON (and for gateway-encoded streams) the
							// bytes are identical; every consumer re-parses the frame.
							const forwardData = normalized === event && frame.dataLines === 1
								? data
								: JSON.stringify(payload);
							controller.enqueue(
								encoder.encode(`event: ${normalized}\ndata: ${forwardData}\n\n`)
							);
							continue;
						}

						if (!isChatPayload) continue;

						mode = "chat";
						applyStreamQuirks(payload, state, args.providerId);

						if (!createdEmitted) {
							if (payload?.id) responseId = payload.id;
							if (payload?.created) createdAt = payload.created;
							if (payload?.model) model = payload.model;
							await emitCreated(controller);
							createdEmitted = true;
						}

						if (payload?.id) nativeResponseId = payload.id;
						if (payload?.created) createdAt = payload.created;
						if (payload?.model) model = payload.model;

						finalResponse = accumulateChatCompletion(finalResponse, payload);

						if (Array.isArray(payload?.choices)) {
							for (const choice of payload.choices) {
								const choiceIndex = Number(choice.index ?? 0);
								const entry = getChoiceState(choiceIndex);
								if (choice?.finish_reason) {
									entry.finishReason = choice.finish_reason;
								}

								const deltaContent = choice?.delta?.content;
								if (typeof deltaContent === "string" && deltaContent.length > 0) {
									entry.text += deltaContent;
									if (!isMiniMaxToolInterop) {
										entry.emittedText = true;
										const { outputIndex, itemId } = ensureMessageIndex(choiceIndex, entry);
										await emitEvent("response.output_text.delta", {
											delta: deltaContent,
											output_index: outputIndex,
											item_id: itemId,
										}, controller);
									}
								}

								if (typeof choice?.delta?.refusal === "string" && choice.delta.refusal.length > 0) {
									await emitRefusal(choiceIndex, entry, choice.delta.refusal, controller);
								}
								if (Array.isArray(choice?.delta?.annotations)) {
									await emitAnnotations(choiceIndex, entry, choice.delta.annotations, controller);
								}

								const deltaReasoning = choice?.delta?.reasoning_content;
								if (typeof deltaReasoning === "string" && deltaReasoning.length > 0) {
									entry.reasoning += deltaReasoning;
									entry.emittedReasoning = true;
									const { outputIndex, itemId } = ensureReasoningIndex(choiceIndex, entry);
									await emitEvent("response.reasoning_text.delta", {
										delta: deltaReasoning,
										output_index: outputIndex,
										item_id: itemId,
									}, controller);
								}

								for (const part of parseChatMediaParts(choice?.delta?.images)) {
									entry.mediaParts.push(part);
									ensureMessageIndex(choiceIndex, entry);
								}
								for (const part of parseChatMediaParts(choice?.delta?.audios)) {
									entry.mediaParts.push(part);
									ensureMessageIndex(choiceIndex, entry);
								}

								const toolDeltas = Array.isArray(choice?.delta?.tool_calls) ? choice.delta.tool_calls : [];
								for (const toolDelta of toolDeltas) {
									const toolIndex = Number(toolDelta?.index ?? 0);
									const tool = ensureToolCallState(choiceIndex, toolIndex, entry, toolDelta?.id);
									if (typeof toolDelta?.function?.name === "string") {
										tool.name += toolDelta.function.name;
									}
									if (typeof toolDelta?.function?.arguments === "string") {
										tool.arguments += toolDelta.function.arguments;
										if (!tool.emittedAdded) {
											await emitEvent("response.output_item.added", {
												output_index: tool.outputIndex,
												item: {
													type: "function_call",
													id: tool.id,
													call_id: tool.id,
													name: tool.name,
													arguments: tool.arguments,
													status: "in_progress",
												},
											}, controller);
											tool.emittedAdded = true;
										}
										await emitEvent("response.function_call_arguments.delta", {
											item_id: tool.id,
											output_index: tool.outputIndex,
											delta: toolDelta.function.arguments,
										}, controller);
									}
								}

								const message = choice?.message;
								if (message && payload?.object === "chat.completion") {
									if (typeof message.content === "string" && message.content.length > 0) {
										if (entry.text.length === 0) {
											entry.text = message.content;
											ensureMessageIndex(choiceIndex, entry);
										}
									}
									if (typeof message.reasoning_content === "string" && message.reasoning_content.length > 0) {
										if (entry.reasoning.length === 0) {
											entry.reasoning = message.reasoning_content;
											ensureReasoningIndex(choiceIndex, entry);
										}
									}
									if (typeof message.refusal === "string" && message.refusal.length > 0 && entry.refusal.length === 0) {
										await emitRefusal(choiceIndex, entry, message.refusal, controller);
									}
									if (Array.isArray(message.annotations) && entry.annotations.length === 0) {
										await emitAnnotations(choiceIndex, entry, message.annotations, controller);
									}
									if (Array.isArray(message.tool_calls)) {
										for (const toolCall of message.tool_calls) {
											const toolIndex = Number(toolCall?.index ?? 0);
											const tool = ensureToolCallState(choiceIndex, toolIndex, entry, toolCall?.id);
											if (typeof toolCall?.function?.name === "string") {
												tool.name = toolCall.function.name;
											}
											if (typeof toolCall?.function?.arguments === "string") {
												tool.arguments = toolCall.function.arguments;
											}
											if (!tool.emittedAdded) {
												await emitEvent("response.output_item.added", {
													output_index: tool.outputIndex,
													item: {
														type: "function_call",
														id: tool.id,
														call_id: tool.id,
														name: tool.name,
														arguments: tool.arguments,
														status: "in_progress",
													},
												}, controller);
												tool.emittedAdded = true;
											}
										}
									}
									for (const part of parseChatMediaParts(message.images)) {
										entry.mediaParts.push(part);
										ensureMessageIndex(choiceIndex, entry);
									}
									for (const part of parseChatMediaParts(message.audios)) {
										entry.mediaParts.push(part);
										ensureMessageIndex(choiceIndex, entry);
									}
								}
							}
						}
					}
				}

				if (mode === "chat") {
					// MiniMax can emit XML-style tool invocations (<invoke ...>) in text.
					// For tool requests, parse text at the end so /responses stream emits canonical function_call events.
					if (isMiniMaxToolInterop) {
						for (const [choiceIndex, entry] of choiceStates.entries()) {
							const parsed = parseMinimaxInterleavedText(entry.text);
							entry.text = parsed.main;
							if (entry.reasoning.length === 0 && parsed.reasoning.length > 0) {
								entry.reasoning = parsed.reasoning.join("");
							}
							if (entry.toolCalls.size === 0 && parsed.toolCalls.length > 0) {
								parsed.toolCalls.forEach((toolCall, toolIndex) => {
									const tool = ensureToolCallState(choiceIndex, toolIndex, entry);
									tool.name = toolCall.name;
									tool.arguments = toolCall.arguments;
								});
								entry.finishReason = entry.finishReason ?? "tool_calls";
							}
						}
					}

					for (const [choiceIndex, entry] of choiceStates.entries()) {
						if (entry.text.length > 0 && !entry.emittedText) {
							const { outputIndex, itemId } = ensureMessageIndex(choiceIndex, entry);
							await emitEvent("response.output_text.delta", {
								delta: entry.text,
								output_index: outputIndex,
								item_id: itemId,
							}, controller);
							entry.emittedText = true;
						}
						if (entry.emittedText) await emitAnnotations(choiceIndex, entry, [], controller);
						if (entry.reasoning.length > 0 && !entry.emittedReasoning) {
							const { outputIndex, itemId } = ensureReasoningIndex(choiceIndex, entry);
							await emitEvent("response.reasoning_text.delta", {
								delta: entry.reasoning,
								output_index: outputIndex,
								item_id: itemId,
							}, controller);
							entry.emittedReasoning = true;
						}
					}

					for (const entry of choiceStates.values()) {
						for (const tool of entry.toolCalls.values()) {
							if (!tool.emittedAdded) {
								await emitEvent("response.output_item.added", {
									output_index: tool.outputIndex,
									item: {
										type: "function_call",
										id: tool.id,
										call_id: tool.id,
										name: tool.name,
										arguments: tool.arguments,
										status: "in_progress",
									},
								}, controller);
								tool.emittedAdded = true;
							}
							await emitEvent("response.function_call_arguments.done", {
								item_id: tool.id,
								output_index: tool.outputIndex,
								name: tool.name,
								arguments: tool.arguments,
							}, controller);
							await emitEvent("response.output_item.done", {
								output_index: tool.outputIndex,
								item: {
									type: "function_call",
									id: tool.id,
									call_id: tool.id,
									name: tool.name,
									arguments: tool.arguments,
									status: "completed",
								},
							}, controller);
						}
					}

					if (!createdEmitted) {
						await emitCreated(controller);
						createdEmitted = true;
					}

					if (finalResponse) {
						const ir = openAIChatToIR(finalResponse, args.requestId, args.ir.model, args.providerId);
						const usage = encodeResponsesUsageFromIR(ir.usage);
						const completion = deriveResponsesCompletionFromFinish(ir.choices?.[0]?.finishReason);
						const encoded = encodeOpenAIResponsesResponse(ir, args.requestId);
						const output =
							Array.isArray(encoded.output) && encoded.output.length > 0
								? encoded.output
								: buildResponsesOutputFromState(choiceStates, args.requestId);
						const indexed = assignStreamedOutputIndexes(output, choiceStates, () => nextOutputIndex++);
						for (const { index, item, streamed } of indexed) {
							if ((item as any)?.type !== "reasoning" || !(item as any).encrypted_content) continue;
							// Items the stream never announced (for example a Gemini function-call
							// signature) get a full added/done pair at a fresh index.
							if (!streamed) {
								await emitEvent("response.output_item.added", { output_index: index, item }, controller);
							}
							await emitEvent("response.output_item.done", { output_index: index, item }, controller);
						}
						const response = {
							id: args.requestId,
							object: "response",
							created_at: ir.created ?? createdAt,
							status: completion.status,
							...(completion.incompleteDetails ? { incomplete_details: completion.incompleteDetails } : {}),
							model: ir.model ?? model,
							output: [...indexed].sort((left, right) => left.index - right.index).map(({ item }) => item),
							usage,
							nativeResponseId: ir.nativeId ?? nativeResponseId,
							...(encoded.citations ? { citations: encoded.citations } : {}),
							...(encoded.search_results ? { search_results: encoded.search_results } : {}),
							...(encoded.images ? { images: encoded.images } : {}),
							...(encoded.related_questions ? { related_questions: encoded.related_questions } : {}),
							...(encoded.reasoning_steps ? { reasoning_steps: encoded.reasoning_steps } : {}),
						};
						await emitEvent("response.completed", { response }, controller);
					}
				}
			} catch (err) {
				console.error("openai compat chat->responses stream transform failed:", err);
			} finally {
				controller.close();
			}
		},
	});
}

/**
 * Seal raw `encrypted_content` on reasoning items in a forwarded Responses
 * event with the provider and model that issued it, so the gateway can later
 * replay it only to that provider family. Returns true when it changed.
 */
function sealResponsesReasoningPayload(payload: any, args: ExecutorExecuteArgs): boolean {
	const format = reasoningFormatForRoute(args.providerId, args.providerModelSlug ?? args.ir.model);
	if (!format || !payload || typeof payload !== "object") return false;
	let changed = false;
	const sealItem = (item: any) => {
		if (item?.type !== "reasoning" || typeof item.encrypted_content !== "string" || !item.encrypted_content) return;
		if (isSealedReasoningValue(item.encrypted_content)) return;
		item.encrypted_content = sealReasoningState({
			format,
			kind: "encrypted",
			value: item.encrypted_content,
			model: args.providerModelSlug ?? args.ir.model,
			provider: args.providerId,
		});
		changed = true;
	};
	sealItem(payload.item);
	const output = payload.response?.output ?? payload.output;
	if (Array.isArray(output)) for (const item of output) sealItem(item);
	return changed;
}

/**
 * A Chat `reasoning_details` entry for a completed Responses reasoning item.
 * It carries the full text with the sealed signature or encrypted content, so
 * clients that merge reasoning_details deltas by index end up with one entry.
 */
function buildReasoningDetailDelta(item: any, args: ExecutorExecuteArgs, index: number): GatewayReasoningDetail | null {
	const model = args.providerModelSlug ?? args.ir.model;
	const raw = typeof item?.encrypted_content === "string" && item.encrypted_content ? item.encrypted_content : null;
	if (!raw) return null;
	const state = openReasoningState(raw, { format: reasoningFormatForRoute(args.providerId, model), kind: "encrypted" });
	if (!state) return null;
	const sealed = sealReasoningState({
		format: state.format,
		kind: state.kind,
		value: state.value,
		model: state.model ?? model,
		provider: state.provider ?? args.providerId,
		...(state.callId ? { callId: state.callId } : {}),
	});
	const text = [item?.content, item?.summary]
		.map((parts) => Array.isArray(parts) ? parts.map((part: any) => (typeof part?.text === "string" ? part.text : "")).join("") : "")
		.find((value) => value.length > 0) ?? "";
	const id = typeof item?.id === "string" && item.id ? item.id : `${args.requestId}-reasoning-${index + 1}`;
	if (state.kind === "signature" && !state.callId) {
		return { id, index, type: "reasoning.text", text, signature: sealed, format: state.format };
	}
	return { id: state.callId ?? id, index, type: "reasoning.encrypted", data: sealed, format: state.format };
}

/**
 * Match each final output item to the output_index the stream already used for it, so
 * the completed response and the streamed events agree. Function calls match by
 * call id (then by order), messages and text reasoning by their choice's indexes.
 * Anything the stream never emitted takes the next free index.
 */
function assignStreamedOutputIndexes(
	output: any[],
	choiceStates: Map<number, ResponsesStreamChoiceState>,
	allocateIndex: () => number,
): Array<{ index: number; item: any; streamed: boolean }> {
	const tools = [...choiceStates.values()].flatMap((entry) => [...entry.toolCalls.values()]);
	const toolIndexByCallId = new Map(tools.map((tool) => [tool.id, tool.outputIndex]));
	const firstChoice = choiceStates.get(0) ?? choiceStates.values().next().value;
	const used = new Set<number>();
	const streamedIndexFor = (item: any): number | undefined => {
		if (item?.type === "function_call") {
			const byId = toolIndexByCallId.get(item.call_id ?? item.id);
			if (byId !== undefined && !used.has(byId)) return byId;
			return tools.map((tool) => tool.outputIndex).find((index) => !used.has(index));
		}
		if (item?.type === "message") return firstChoice?.messageOutputIndex;
		if (item?.type === "reasoning") {
			const hasText = (item.content?.length ?? 0) > 0 || (item.summary?.length ?? 0) > 0;
			return hasText ? firstChoice?.reasoningOutputIndex : undefined;
		}
		return undefined;
	};
	return output.map((item) => {
		const candidate = streamedIndexFor(item);
		const streamed = candidate !== undefined && candidate !== null && !used.has(candidate);
		const index = streamed ? candidate! : allocateIndex();
		used.add(index);
		return { index, item, streamed };
	});
}

function buildResponsesOutputFromState(
	choiceStates: Map<number, ResponsesStreamChoiceState>,
	requestId: string,
) {
	const outputItems: Array<{ index: number; item: any }> = [];
	for (const [choiceIndex, entry] of choiceStates.entries()) {
		if (entry.reasoningOutputIndex != null && entry.reasoning.length > 0) {
			outputItems.push({
				index: entry.reasoningOutputIndex,
				item: {
					type: "reasoning",
					id: entry.reasoningItemId ?? `reasoning_${requestId}_${choiceIndex}`,
					status: "completed",
					content: [{ type: "output_text", text: entry.reasoning, annotations: [] }],
				},
			});
		}
		if (entry.messageOutputIndex != null && (entry.text.length > 0 || entry.refusal.length > 0 || entry.mediaParts.length > 0)) {
			outputItems.push({
				index: entry.messageOutputIndex,
				item: {
					type: "message",
					id: entry.messageItemId ?? `msg_${requestId}_${choiceIndex}`,
					status: "completed",
					role: "assistant",
					content: [
						...(entry.text.length > 0 ? [{ type: "output_text", text: entry.text, annotations: entry.annotations }] : []),
						...(entry.refusal.length > 0 ? [{ type: "refusal", refusal: entry.refusal }] : []),
						...entry.mediaParts.map((part) => {
							if (part.type === "image") {
								if (part.source === "data") {
									return {
										type: "output_image",
										b64_json: part.data,
										mime_type: part.mimeType,
									};
								}
								return {
									type: "output_image",
									image_url: { url: part.data },
									mime_type: part.mimeType,
								};
							}
							const mimeType = (() => {
								if (part.format === "wav") return "audio/wav";
								if (part.format === "mp3") return "audio/mpeg";
								if (part.format === "flac") return "audio/flac";
								if (part.format === "m4a") return "audio/m4a";
								if (part.format === "ogg") return "audio/ogg";
								if (part.format === "pcm16") return "audio/l16";
								if (part.format === "pcm24") return "audio/l24";
								return "audio/wav";
							})();
							if (part.source === "data") {
								return {
									type: "output_audio",
									b64_json: part.data,
									mime_type: mimeType,
									...(part.format ? { format: part.format } : {}),
								};
							}
							return {
								type: "output_audio",
								audio_url: { url: part.data },
								mime_type: mimeType,
								...(part.format ? { format: part.format } : {}),
							};
						}),
					],
				},
			});
		}
		for (const tool of entry.toolCalls.values()) {
			outputItems.push({
				index: tool.outputIndex,
				item: {
					type: "function_call",
					call_id: tool.id,
					name: tool.name,
					arguments: tool.arguments,
				},
			});
		}
	}
	outputItems.sort((a, b) => a.index - b.index);
	return outputItems.map((entry) => entry.item);
}

function deriveResponsesCompletionFromFinish(finishReason?: string | null): {
	status: "completed" | "incomplete" | "failed";
	incompleteDetails?: { reason: string };
} {
	if (finishReason === "error") {
		return { status: "failed" };
	}
	if (finishReason === "length" || finishReason === "max_tokens") {
		return {
			status: "incomplete",
			incompleteDetails: { reason: "max_output_tokens" },
		};
	}
	if (finishReason === "content_filter") {
		return {
			status: "incomplete",
			incompleteDetails: { reason: "content_filter" },
		};
	}
	return { status: "completed" };
}

function encodeResponsesUsageFromIR(usage?: IRChatResponse["usage"]) {
	if (!usage) return undefined;
	const inputDetails: Record<string, number> = {};
	const outputDetails: Record<string, number> = {};
	// OpenAI semantics: input_tokens includes cache reads and writes.
	const cache = irUsageToOpenAIStyle(usage);
	if (typeof cache.readTokens === "number") {
		inputDetails.cached_tokens = cache.readTokens;
	}
	if (typeof cache.writeTokens === "number") {
		inputDetails.cache_write_tokens = cache.writeTokens;
	}
	if (typeof usage._ext?.inputImageTokens === "number") {
		inputDetails.input_images = usage._ext.inputImageTokens;
	}
	if (typeof usage._ext?.inputAudioTokens === "number") {
		inputDetails.input_audio = usage._ext.inputAudioTokens;
	}
	if (typeof usage._ext?.inputVideoTokens === "number") {
		inputDetails.input_videos = usage._ext.inputVideoTokens;
	}
	if (typeof usage.reasoningTokens === "number") {
		outputDetails.reasoning_tokens = usage.reasoningTokens;
	}
	if (typeof usage._ext?.outputImageTokens === "number") {
		outputDetails.output_images = usage._ext.outputImageTokens;
	}
	if (typeof usage._ext?.outputAudioTokens === "number") {
		outputDetails.output_audio = usage._ext.outputAudioTokens;
	}
	if (typeof usage._ext?.outputVideoTokens === "number") {
		outputDetails.output_videos = usage._ext.outputVideoTokens;
	}

	const out: any = {
		input_tokens: cache.inputTokens,
		output_tokens: usage.outputTokens,
		total_tokens: cache.totalTokens,
	};
	if (typeof cache.write5mTokens === "number") out.cached_write_text_tokens_5m = cache.write5mTokens;
	if (typeof cache.write1hTokens === "number") out.cached_write_text_tokens_1h = cache.write1hTokens;
	if (typeof cache.writeTokens === "number") out.cached_write_tokens_are_subset_of_input = true;
	if (typeof usage._ext?.citationTokens === "number") out.citation_tokens = usage._ext.citationTokens;
	if (typeof usage._ext?.numSearchQueries === "number") out.num_search_queries = usage._ext.numSearchQueries;
	if (typeof usage._ext?.searchContextSize === "string") out.search_context_size = usage._ext.searchContextSize;
	if (usage._ext?.providerCost) out.cost = usage._ext.providerCost;
	if (typeof cache.readTokens === "number") {
		out.cached_read_tokens_are_subset_of_input = true;
	}
	if (Object.keys(inputDetails).length) out.input_tokens_details = inputDetails;
	if (Object.keys(outputDetails).length) out.output_tokens_details = outputDetails;
	return out;
}

function isChatCompletionResponse(payload: any): boolean {
	if (!payload || !Array.isArray(payload.choices)) return false;
	return payload.choices.some((choice: any) => choice?.message || choice?.delta);
}

function parseUsageNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function mergeUsageDetails(prev: any, next: any): any {
	if (!prev || typeof prev !== "object") return next;
	if (!next || typeof next !== "object") return prev;
	const merged: Record<string, any> = { ...prev, ...next };
	const keys = new Set<string>([
		...Object.keys(prev),
		...Object.keys(next),
	]);
	for (const key of keys) {
		const prevValue = parseUsageNumber(prev[key]);
		const nextValue = parseUsageNumber(next[key]);
		if (prevValue == null && nextValue == null) continue;
		if (prevValue == null) {
			merged[key] = nextValue;
			continue;
		}
		if (nextValue == null) {
			merged[key] = prevValue;
			continue;
		}
		merged[key] = Math.max(prevValue, nextValue);
	}
	return merged;
}

function mergeUsageSnapshots(prev: any, next: any): any {
	if (!prev || typeof prev !== "object") return next;
	if (!next || typeof next !== "object") return prev;

	const merged: Record<string, any> = { ...prev, ...next };
	const numericFields = [
		"prompt_tokens",
		"completion_tokens",
		"total_tokens",
		"input_tokens",
		"output_tokens",
		"input_text_tokens",
		"output_text_tokens",
	];
	for (const field of numericFields) {
		const prevValue = parseUsageNumber(prev[field]);
		const nextValue = parseUsageNumber(next[field]);
		if (prevValue == null && nextValue == null) continue;
		if (prevValue == null) {
			merged[field] = nextValue;
			continue;
		}
		if (nextValue == null) {
			merged[field] = prevValue;
			continue;
		}
		merged[field] = Math.max(prevValue, nextValue);
	}

	const detailFields = [
		"input_tokens_details",
		"output_tokens_details",
		"prompt_tokens_details",
		"completion_tokens_details",
	];
	for (const field of detailFields) {
		merged[field] = mergeUsageDetails(prev[field], next[field]);
		if (!merged[field] || typeof merged[field] !== "object") {
			delete merged[field];
		}
	}

	const inputTokens = parseUsageNumber(merged.input_tokens) ?? parseUsageNumber(merged.prompt_tokens) ?? 0;
	const outputTokens = parseUsageNumber(merged.output_tokens) ?? parseUsageNumber(merged.completion_tokens) ?? 0;
	const minTotal = inputTokens + outputTokens;
	const mergedTotal = parseUsageNumber(merged.total_tokens);
	if (mergedTotal == null || mergedTotal < minTotal) {
		merged.total_tokens = minTotal;
	}

	// Reconcile conflicting aliases only when both aliases are already present.
	// Do not synthesize new alias fields into raw upstream payloads.
	const inputAliasA = parseUsageNumber(merged.input_tokens);
	const inputAliasB = parseUsageNumber(merged.prompt_tokens);
	if (inputAliasA != null && inputAliasB != null) {
		const canonical = Math.max(inputAliasA, inputAliasB);
		merged.input_tokens = canonical;
		merged.prompt_tokens = canonical;
	}

	const outputAliasA = parseUsageNumber(merged.output_tokens);
	const outputAliasB = parseUsageNumber(merged.completion_tokens);
	if (outputAliasA != null && outputAliasB != null) {
		const canonical = Math.max(outputAliasA, outputAliasB);
		merged.output_tokens = canonical;
		merged.completion_tokens = canonical;
	}

	return merged;
}

function accumulateChatCompletion(finalResponse: any, payload: any): any {
	if (!payload || !Array.isArray(payload?.choices)) {
		if (payload?.usage && finalResponse) {
			finalResponse.usage = mergeUsageSnapshots(finalResponse.usage, payload.usage);
		}
		if (finalResponse) {
			for (const field of ["citations", "search_results", "images", "related_questions", "reasoning_steps"]) {
				if (Array.isArray(payload?.[field])) finalResponse[field] = payload[field];
			}
		}
		return finalResponse;
	}

	let response = finalResponse;
	if (!response) {
		response = {
			id: payload.id,
			object: payload.object ?? "chat.completion",
			created: payload.created,
			model: payload.model,
			choices: [],
		};
	}

	for (const chunk of payload.choices) {
		const idx = chunk.index || 0;
		if (!response.choices[idx]) {
			response.choices[idx] = {
				index: idx,
				message: { role: "assistant", content: "" },
				finish_reason: null,
			};
		}
		const choice = response.choices[idx];

		if (chunk.message) {
			const message = chunk.message;
			const previousMessage = choice.message ?? { role: "assistant", content: "" };
			choice.message = {
				role: message.role || previousMessage.role || "assistant",
				content: message.content ?? previousMessage.content ?? "",
				// A quirk's partial message on the final chunk (Z.ai, MiniMax) must not
				// drop the tool calls accumulated from earlier deltas.
				...(message.tool_calls
					? { tool_calls: message.tool_calls }
					: previousMessage.tool_calls ? { tool_calls: previousMessage.tool_calls } : {}),
				...(message.reasoning_content ? { reasoning_content: message.reasoning_content } : previousMessage.reasoning_content ? { reasoning_content: previousMessage.reasoning_content } : {}),
				...(message.reasoning ? { reasoning: message.reasoning } : previousMessage.reasoning ? { reasoning: previousMessage.reasoning } : {}),
				...(Array.isArray(message.images) ? { images: message.images } : Array.isArray(previousMessage.images) ? { images: previousMessage.images } : {}),
				...(Array.isArray(message.audios) ? { audios: message.audios } : Array.isArray(previousMessage.audios) ? { audios: previousMessage.audios } : {}),
				...(Array.isArray(message.reasoning_details)
					? { reasoning_details: message.reasoning_details }
					: Array.isArray(previousMessage.reasoning_details) ? { reasoning_details: previousMessage.reasoning_details } : {}),
				...(Array.isArray(message._contentParts)
					? { _contentParts: message._contentParts }
					: Array.isArray(previousMessage._contentParts)
						? { _contentParts: previousMessage._contentParts }
						: {}),
				...(typeof (message.refusal ?? previousMessage.refusal) === "string" ? { refusal: message.refusal ?? previousMessage.refusal } : {}),
				...(Array.isArray(message.annotations)
					? { annotations: message.annotations }
					: Array.isArray(previousMessage.annotations) ? { annotations: previousMessage.annotations } : {}),
			};
		}

		if (chunk.delta?.content) {
			choice.message.content = (choice.message.content || "") + chunk.delta.content;
		}
		if (typeof chunk.delta?.refusal === "string" && chunk.delta.refusal) {
			choice.message.refusal = (choice.message.refusal || "") + chunk.delta.refusal;
		}
		if (Array.isArray(chunk.delta?.annotations) && chunk.delta.annotations.length > 0) {
			choice.message.annotations = [...(choice.message.annotations ?? []), ...chunk.delta.annotations];
		}
		if (chunk.delta?.reasoning_content) {
			choice.message.reasoning_content =
				(choice.message.reasoning_content || "") + chunk.delta.reasoning_content;
		}
		if (chunk.delta?.reasoning) {
			choice.message.reasoning =
				(choice.message.reasoning || "") + chunk.delta.reasoning;
		}
		// Keep reasoning state the gateway sealed into stream deltas (Gemini
		// thought signatures) for the final response.
		if (Array.isArray(chunk.delta?.reasoning_details)) {
			const sealedDetails = chunk.delta.reasoning_details.filter((entry: any) =>
				isSealedReasoningValue(entry?.signature) || isSealedReasoningValue(entry?.data));
			if (sealedDetails.length > 0) {
				choice.message.reasoning_details = [...(choice.message.reasoning_details ?? []), ...sealedDetails];
			}
		}
		if (chunk.delta?.tool_calls) {
			if (!choice.message.tool_calls) choice.message.tool_calls = [];
			// Accumulate tool calls
			for (const tcDelta of chunk.delta.tool_calls) {
				const tcIdx = tcDelta.index || 0;
				if (!choice.message.tool_calls[tcIdx]) {
					choice.message.tool_calls[tcIdx] = {
						id: tcDelta.id || "",
						type: "function",
						function: { name: "", arguments: "" },
					};
				}
				const tc = choice.message.tool_calls[tcIdx];
				if (tcDelta.id) tc.id = tcDelta.id;
				if (tcDelta.function?.name) tc.function.name += tcDelta.function.name;
				if (tcDelta.function?.arguments) tc.function.arguments += tcDelta.function.arguments;
			}
		}
		if (Array.isArray(chunk.delta?.images) && chunk.delta.images.length > 0) {
			if (!Array.isArray(choice.message.images)) {
				choice.message.images = [];
			}
			choice.message.images.push(...chunk.delta.images);
		}
		if (Array.isArray(chunk.delta?.audios) && chunk.delta.audios.length > 0) {
			if (!Array.isArray(choice.message.audios)) {
				choice.message.audios = [];
			}
			choice.message.audios.push(...chunk.delta.audios);
		}
		if (chunk.finish_reason) {
			choice.finish_reason = chunk.finish_reason;
		}
		if (chunk.logprobs) {
			choice.logprobs = chunk.logprobs;
		}
	}

	if (payload?.usage) {
		response.usage = mergeUsageSnapshots(response.usage, payload.usage);
	}
	for (const field of ["citations", "search_results", "images", "related_questions", "reasoning_steps"]) {
		if (Array.isArray(payload?.[field])) response[field] = payload[field];
	}

	return response;
}
