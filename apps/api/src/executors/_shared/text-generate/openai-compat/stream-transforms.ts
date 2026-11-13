import type { ExecutorExecuteArgs } from "@executors/types";
import type { IRChatResponse, IRContentPart } from "@core/ir";
import { irUsageToOpenAIStyle, openAICacheWriteTtlDetails } from "@core/cache-usage";
import { gatewayStopEntry } from "@core/finish-reason";
import { openAIResponsesToIR } from "./transform";
import { openAIChatToIR } from "./transform-chat";
import { getProviderQuirks } from "./quirks";
import { parseMinimaxInterleavedText } from "./providers/minimax/quirks";
import { encodeOpenAIChatResponse } from "@protocols/openai-chat/encode";
import { encodeOpenAIResponsesResponse } from "@protocols/openai-responses/encode";
import { SseParser } from "@core/sse-parser";
import { isBareChatErrorFrame, readUpstreamStreamError } from "@core/stream-errors";
import { chatStreamErrorFrame } from "@core/error-object";
import type { GatewayReasoningDetail } from "@core/types";
import { toChatAnnotations, toResponsesAnnotations } from "@protocols/shared/citations";
import { keepsReasoningPosition } from "@protocols/shared/reasoning";
import {
	ANTHROPIC_REASONING_FORMAT,
	isSealedReasoningValue,
	openReasoningState,
	reasoningFormatForRoute,
	sealReasoningState,
} from "@core/reasoning-state";

export type StreamAdapterState = {
	requestId: string;
	providerId: string;
	/** Gateway model id of the request, recorded on sealed reasoning state. */
	model?: string | null;
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

/**
 * Responses SSE frames name their event twice: on the `event:` line and in the
 * payload's `type`. Nebius Token Factory sends data-only frames, so fall back
 * to `type` when the line is missing.
 * https://docs.tokenfactory.nebius.com/api-reference/inference/create-a-response
 */
function responsesFrameEvent(event: string | null, payload: any): string | null {
	if (event) return event;
	return typeof payload?.type === "string" && payload.type ? payload.type : null;
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

/**
 * Upstream readers whose downstream stream the client cancelled. The adapters read
 * eagerly, so their loops end early on a cancel; they skip the failure log and close.
 */
export const cancelledReaders = new WeakSet<object>();

/**
 * Reads the upstream. A transport error after the protocol's completion boundary (`[DONE]`, a
 * terminal Responses event, message_stop) ends the stream like EOF: the output was complete, so
 * the adapter still emits its final events and billing sees a finished stream.
 */
export async function readUntilFailure(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	completed: () => boolean,
): Promise<ReadableStreamReadResult<Uint8Array>> {
	try {
		return await reader.read();
	} catch (err) {
		if (completed()) return { done: true, value: undefined };
		throw err;
	}
}

type ChoiceProgress = { open: Set<number>; finished: Set<number> };

/**
 * Whether a Chat chunk completes the stream (as `[DONE]` does): a full chat.completion
 * snapshot, or usage once every choice seen has finished. One finished choice is not enough.
 */
function chatChunkCompletes(payload: any, choices: ChoiceProgress): boolean {
	for (const choice of Array.isArray(payload?.choices) ? payload.choices : []) {
		const index = Number(choice?.index ?? 0);
		choices.open.add(index);
		if (choice?.finish_reason) choices.finished.add(index);
	}
	if (payload?.object === "chat.completion") return true;
	return Boolean(payload?.usage) && choices.finished.size > 0 && [...choices.open].every((index) => choices.finished.has(index));
}

/**
 * The first delta of each streamed tool call must carry an id and a name. Some hosts
 * (Together gpt-oss) send later parallel calls with neither, and a client that sends
 * such a call back gets a 400. Fills them in with the same ids the buffered path uses.
 */
function repairChatToolCallDeltas(payload: any, seen: Set<string>, args: ExecutorExecuteArgs, fallbackName: string | null) {
	for (const choice of Array.isArray(payload?.choices) ? payload.choices : []) {
		const calls = choice?.delta?.tool_calls;
		if (!Array.isArray(calls)) continue;
		const choiceIndex = Number(choice.index ?? 0);
		for (const [position, call] of calls.entries()) {
			if (!call || typeof call !== "object") continue;
			const toolIndex = Number(call.index ?? position);
			const key = `${choiceIndex}:${toolIndex}`;
			if (seen.has(key)) continue;
			seen.add(key);
			// Only a first delta without an id is repaired. A stream that sends the id first and
			// the name in a later delta is valid and passes through unchanged, so the name is
			// filled in only when the id is missing too (Together).
			if (call.id) continue;
			call.id = `call_${args.requestId}_${choiceIndex}_${toolIndex}`;
			if (!call.type) call.type = "function";
			call.function ??= {};
			if (!call.function.name && fallbackName) call.function.name = fallbackName;
		}
	}
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
			let upstreamError: unknown;
			// Set at the protocol's completion boundary; a transport error after it is only teardown.
			let upstreamCompleted = false;
			const choices: ChoiceProgress = { open: new Set(), finished: new Set() };
			const seenToolCalls = new Set<string>();
			const fallbackToolName = singleFunctionToolName(args.ir.tools);
			try {
				while (true) {
					const { value, done } = await readUntilFailure(reader, () => upstreamCompleted);
					if (done) break;

					for (const frame of parser.pushBytes(value)) {
						const { data } = frame;
						if (data === "[DONE]") upstreamCompleted = true;
						if (!data || data === "[DONE]") continue;
						let payload: any;
						try {
							payload = JSON.parse(data);
						} catch {
							continue;
						}

						applyStreamQuirks(payload, state, args.providerId);
						repairChatToolCallDeltas(payload, seenToolCalls, args, fallbackToolName);
						if (chatChunkCompletes(payload, choices)) upstreamCompleted = true;
						controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
					}
				}
			} catch (err) {
				// A client cancel ends the read loop early; that is not a failure.
				if (!cancelledReaders.has(reader) && !upstreamCompleted) {
					console.error("openai compat chat stream transform failed:", err);
					upstreamError = err;
				}
			} finally {
				// A genuine upstream failure (a reset connection) errors this stream too, so billing
				// sees a broken stream rather than a normal end; our own cancel just stops.
				if (!cancelledReaders.has(reader)) {
					if (upstreamError !== undefined) controller.error(upstreamError);
					else controller.close();
				}
			}
		},
		// Pass a client cancel on to the stream this one reads, so the upstream stops too.
		cancel(reason) {
			cancelledReaders.add(reader);
		return reader.cancel(reason);
		},
	});
}

const TERMINAL_RESPONSES_EVENTS = new Set(["response.completed", "response.incomplete"]);

/**
 * Apply a provider's normalizeStreamedResponse quirk to the response carried by a native
 * Responses stream's terminal event. Every other frame is forwarded byte for byte.
 */
export function normalizeTerminalResponsesFrames(
	stream: ReadableStream<Uint8Array>,
	providerId: string,
): ReadableStream<Uint8Array> {
	const normalize = getProviderQuirks(providerId).normalizeStreamedResponse;
	if (!normalize) return stream;
	const parser = new SseParser();
	const encoder = new TextEncoder();
	const forward = (frame: { event: string | null; data: string; raw: string }, controller: TransformStreamDefaultController<Uint8Array>) => {
		let payload: any;
		if (frame.data && frame.data !== "[DONE]") {
			try {
				payload = JSON.parse(frame.data);
			} catch {
				payload = undefined;
			}
		}
		const type = frame.event ?? payload?.type;
		if (payload?.response && typeof payload.response === "object" && TERMINAL_RESPONSES_EVENTS.has(type)) {
			try {
				normalize({ response: payload.response });
				controller.enqueue(encoder.encode(`${frame.event ? `event: ${frame.event}\n` : ""}data: ${JSON.stringify(payload)}\n\n`));
				return;
			} catch {
				// Forward the frame unchanged rather than break the stream.
			}
		}
		controller.enqueue(encoder.encode(`${frame.raw}\n\n`));
	};
	return stream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			for (const frame of parser.pushBytes(chunk)) forward(frame, controller);
		},
		flush(controller) {
			for (const frame of parser.flush()) forward(frame, controller);
		},
	}));
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
	// Where each reasoning item sat among the text and calls already streamed, so
	// a Chat client sending it back lets the gateway put it back in place.
	let streamedTextChars = 0;
	let lastStreamedCallId: string | undefined;

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
			let upstreamError: unknown;
			// Set at the protocol's completion boundary; a transport error after it is only teardown.
			let upstreamCompleted = false;
			try {
				while (true) {
					const { value, done } = await readUntilFailure(reader, () => upstreamCompleted);
					if (done) break;

					for (const frame of parser.pushBytes(value)) {
						const { data } = frame;
						if (data === "[DONE]") upstreamCompleted = true;
						if (!data || data === "[DONE]") continue;
						let payload: any;
						try {
							payload = JSON.parse(data);
						} catch {
							continue;
						}
						const event = responsesFrameEvent(frame.event, payload);

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
									streamedTextChars += payload.delta.length;
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
									const detail = buildReasoningDetailDelta(item, args, nextReasoningDetailIndex, lastStreamedCallId
										? { afterCallId: lastStreamedCallId }
										: streamedTextChars > 0 ? { textOffset: streamedTextChars } : undefined);
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
								lastStreamedCallId = canonicalId;
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
							// response.incomplete is terminal too (max_output_tokens or content
							// filter): it carries the final usage and the finish reason, so
							// the client gets its final chunk and the request is billed.
							case "response.completed":
							case "response.incomplete":
								finalResponse = payload?.response ?? finalResponse;
								upstreamCompleted = true;
								break;
							case "response.failed":
							case "error":
								{
									const failure = readUpstreamStreamError(payload);
									await emit(chatStreamErrorFrame({ message: failure.message, code: failure.code }), controller);
								}
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
				// A client cancel ends the read loop early; that is not a failure.
				if (!cancelledReaders.has(reader) && !upstreamCompleted) {
					console.error("openai compat responses->chat stream transform failed:", err);
					upstreamError = err;
				}
			} finally {
				// A genuine upstream failure (a reset connection) errors this stream too, so billing
				// sees a broken stream rather than a normal end; our own cancel just stops.
				if (!cancelledReaders.has(reader)) {
					if (upstreamError !== undefined) controller.error(upstreamError);
					else controller.close();
				}
			}
		},
		// Pass a client cancel on to the stream this one reads, so the upstream stops too.
		cancel(reason) {
			cancelledReaders.add(reader);
		return reader.cancel(reason);
		},
	});
}

type ResponsesStreamChoiceState = {
	text: string;
	reasoning: string;
	// Sealed reasoning state from a Chat reasoning_details entry (a Gemini thought
	// signature), carried as the reasoning item's encrypted_content.
	reasoningEncrypted?: string;
	// The reasoning item has had its done events.
	closedReasoning?: boolean;
	refusal: string;
	// Content index of the refusal part, set when the part is announced.
	refusalContentIndex?: number;
	// Responses-shaped url_citation annotations on the message's output_text.
	annotations: Array<Record<string, any>>;
	emittedAnnotations: number;
	mediaParts: Array<Extract<IRContentPart, { type: "image" | "audio" }>>;
	finishReason?: string | null;
	messageOutputIndex?: number;
	reasoningOutputIndex?: number;
	messageItemId?: string;
	reasoningItemId?: string;
	toolCalls: Map<number, { id: string; name: string; arguments: string; outputIndex: number; emittedAdded?: boolean; fallbackName?: boolean }>;
	emittedText?: boolean;
	emittedReasoning?: boolean;
	sawRefusal?: boolean;
	announcedMessage?: boolean;
	announcedTextPart?: boolean;
	announcedReasoning?: boolean;
};

/** The only function tool's name, when the request declares exactly one. */
export function singleFunctionToolName(tools: Array<{ name?: string; type?: string }> | undefined): string | null {
	const functions = (tools ?? []).filter((tool) => !tool.type || tool.type === "function");
	return functions.length === 1 && typeof functions[0].name === "string" ? functions[0].name : null;
}

/**
 * Gives every accumulated call an id, and a name when only one tool could have
 * been called, matching the ids streamed to the client. A call with an empty id
 * or no name is rejected when the client sends it back.
 */
export function repairStreamedToolCalls(
	response: any,
	fallbackId: (choiceIndex: number, toolIndex: number) => string,
	fallbackName: string | null,
): void {
	for (const choice of Array.isArray(response?.choices) ? response.choices : []) {
		const calls = choice?.message?.tool_calls;
		if (!Array.isArray(calls)) continue;
		calls.forEach((call: any, toolIndex: number) => {
			if (!call || typeof call !== "object") return;
			if (!call.id) call.id = fallbackId(Number(choice.index ?? 0), toolIndex);
			if (call.function && !call.function.name && fallbackName) call.function.name = fallbackName;
		});
	}
}

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
	const fallbackToolName = singleFunctionToolName(args.ir.tools);
	const fallbackToolId = (choiceIndex: number, toolIndex: number) => `call_${args.requestId}_${choiceIndex}_${toolIndex}`;
	// Some hosts (Together gpt-oss) stream a later call with an empty id and no name.
	// A real name arriving later replaces the fallback rather than appending to it.
	const withToolName = <T extends { name: string; fallbackName?: boolean }>(tool: T): T => {
		if (!tool.name && fallbackToolName) {
			tool.name = fallbackToolName;
			tool.fallbackName = true;
		}
		return tool;
	};

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

	// Responses streams announce an item (output_item.added, and the text part of a
	// message) before any delta for it.
	const announceMessage = async (
		choiceIndex: number,
		entry: ResponsesStreamChoiceState,
		controller: ReadableStreamDefaultController<Uint8Array>,
	) => {
		const { outputIndex, itemId } = ensureMessageIndex(choiceIndex, entry);
		if (!entry.announcedMessage) {
			await closeSignedReasoningBeforeOutput(entry, controller);
			entry.announcedMessage = true;
			await emitEvent("response.output_item.added", {
				output_index: outputIndex,
				item: { type: "message", id: itemId, status: "in_progress", role: "assistant", content: [] },
			}, controller);
		}
		if (!entry.announcedTextPart) {
			entry.announcedTextPart = true;
			await emitEvent("response.content_part.added", {
				item_id: itemId,
				output_index: outputIndex,
				content_index: 0,
				part: { type: "output_text", text: "", annotations: [] },
			}, controller);
		}
		return { outputIndex, itemId };
	};

	const announceReasoning = async (
		choiceIndex: number,
		entry: ResponsesStreamChoiceState,
		controller: ReadableStreamDefaultController<Uint8Array>,
	) => {
		const { outputIndex, itemId } = ensureReasoningIndex(choiceIndex, entry);
		if (!entry.announcedReasoning) {
			entry.announcedReasoning = true;
			await emitEvent("response.output_item.added", {
				output_index: outputIndex,
				item: { type: "reasoning", id: itemId, summary: [], content: [] },
			}, controller);
			await emitEvent("response.content_part.added", {
				item_id: itemId,
				output_index: outputIndex,
				content_index: 0,
				part: { type: "reasoning_text", text: "" },
			}, controller);
		}
		return { outputIndex, itemId };
	};

	const ensureToolCallState = (
		choiceIndex: number,
		toolIndex: number,
		entry: ResponsesStreamChoiceState,
		toolId?: string,
	) => {
		let tool = entry.toolCalls.get(toolIndex);
		if (tool && toolId && !tool.emittedAdded && tool.id === fallbackToolId(choiceIndex, toolIndex)) tool.id = toolId;
		if (!tool) {
			tool = {
				id: toolId || fallbackToolId(choiceIndex, toolIndex),
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
		if (entry.refusalContentIndex === undefined) {
			// The refusal part follows the output_text part when there is text.
			entry.refusalContentIndex = entry.text.length > 0 ? 1 : 0;
			if (!entry.announcedMessage) {
				// No text delta has opened the message yet: announce the item first.
				entry.announcedMessage = true;
				await emitEvent("response.output_item.added", {
					output_index: outputIndex,
					item: { type: "message", id: itemId, status: "in_progress", role: "assistant", content: [] },
				}, controller);
			}
			// Always announce the refusal part before its first delta, including
			// after streamed text.
			await emitEvent("response.content_part.added", {
				item_id: itemId,
				output_index: outputIndex,
				content_index: entry.refusalContentIndex,
				part: { type: "refusal", refusal: "" },
			}, controller);
		}
		entry.refusal += refusal;
		await emitEvent("response.refusal.delta", {
			item_id: itemId,
			output_index: outputIndex,
			content_index: entry.refusalContentIndex,
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

	// The SDK stream helpers build their snapshot from response.created.response and
	// push each output_item.added item into its output, so it carries an empty output.
	// Its id is the one the terminal response carries: the helpers reject a changed id.
	const emitCreated = async (controller: ReadableStreamDefaultController<Uint8Array>) => {
		await emitEvent("response.created", {
			response: {
				id: args.requestId,
				object: "response",
				created_at: createdAt,
				model,
				status: "in_progress",
				output: [],
			},
		}, controller);
	};

	// Close the reasoning item with its done events, once. Returns its output index.
	const closeReasoningItem = async (
		entry: ResponsesStreamChoiceState,
		finalItemAt: (outputIndex: number) => any,
		controller: ReadableStreamDefaultController<Uint8Array>,
	): Promise<number | null> => {
		if (!entry.announcedReasoning || entry.reasoningOutputIndex == null) return null;
		if (entry.closedReasoning) return entry.reasoningOutputIndex;
		entry.closedReasoning = true;
		{
			const outputIndex = entry.reasoningOutputIndex;
			const itemId = entry.reasoningItemId!;
			const part = { type: "reasoning_text", text: entry.reasoning };
			await emitEvent("response.reasoning_text.done", {
				item_id: itemId,
				output_index: outputIndex,
				content_index: 0,
				text: entry.reasoning,
			}, controller);
			await emitEvent("response.content_part.done", {
				item_id: itemId,
				output_index: outputIndex,
				content_index: 0,
				part,
			}, controller);
			const finalItem = finalItemAt(outputIndex);
			// Keep the sealed reasoning state when the final output carries it, under the
			// id the stream announced (SDK stream helpers reject a changed item id).
			const item = finalItem?.type === "reasoning" && finalItem.encrypted_content
				? { ...finalItem, id: itemId }
				: {
					type: "reasoning",
					id: itemId,
					status: "completed",
					summary: [],
					content: [part],
					...(entry.reasoningEncrypted ? { encrypted_content: entry.reasoningEncrypted } : {}),
				};
			await emitEvent("response.output_item.done", { output_index: outputIndex, item }, controller);
			return outputIndex;
		}
	};

	// A signed reasoning item (a Gemini thought signature) closes as soon as the answer
	// or a tool call starts, as Responses streams order them, so a Messages client gets
	// the signature on its thinking block before that block ends.
	const closeSignedReasoningBeforeOutput = async (
		entry: ResponsesStreamChoiceState,
		controller: ReadableStreamDefaultController<Uint8Array>,
	) => {
		if (entry.reasoningEncrypted) await closeReasoningItem(entry, () => null, controller);
	};

	// Close each announced message and reasoning item with its done events, using the
	// accumulated text, as the Anthropic transformer does at content_block_stop.
	// Returns the output indexes it closed.
	const closeAnnouncedItems = async (
		entry: ResponsesStreamChoiceState,
		finalItemAt: (outputIndex: number) => any,
		controller: ReadableStreamDefaultController<Uint8Array>,
	): Promise<number[]> => {
		const closed: number[] = [];
		const reasoningIndex = await closeReasoningItem(entry, finalItemAt, controller);
		if (reasoningIndex != null) closed.push(reasoningIndex);
		if (entry.announcedMessage && entry.messageOutputIndex != null) {
			const outputIndex = entry.messageOutputIndex;
			const itemId = entry.messageItemId!;
			if (entry.announcedTextPart) {
				const part = { type: "output_text", text: entry.text, annotations: entry.annotations };
				await emitEvent("response.output_text.done", {
					item_id: itemId,
					output_index: outputIndex,
					content_index: 0,
					text: entry.text,
				}, controller);
				await emitEvent("response.content_part.done", {
					item_id: itemId,
					output_index: outputIndex,
					content_index: 0,
					part,
				}, controller);
			}
			if (entry.refusalContentIndex !== undefined) {
				await emitEvent("response.refusal.done", {
					item_id: itemId,
					output_index: outputIndex,
					content_index: entry.refusalContentIndex,
					refusal: entry.refusal,
				}, controller);
				await emitEvent("response.content_part.done", {
					item_id: itemId,
					output_index: outputIndex,
					content_index: entry.refusalContentIndex,
					part: { type: "refusal", refusal: entry.refusal },
				}, controller);
			}
			await emitEvent("response.output_item.done", {
				output_index: outputIndex,
				item: {
					type: "message",
					id: itemId,
					status: "completed",
					role: "assistant",
					content: messageContentFromState(entry),
				},
			}, controller);
			closed.push(outputIndex);
		}
		return closed;
	};

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			let upstreamError: unknown;
			// Set at the protocol's completion boundary; a transport error after it is only teardown.
			let upstreamCompleted = false;
			const choices: ChoiceProgress = { open: new Set(), finished: new Set() };
			let createdEmitted = false;
			let upstreamFailure: { code: string | null; message: string } | null = null;
			try {
				while (true) {
					const { value, done } = await readUntilFailure(reader, () => upstreamCompleted);
					if (done) break;

					for (const frame of parser.pushBytes(value)) {
						const { data } = frame;
						if (data === "[DONE]") upstreamCompleted = true;
						if (!data || data === "[DONE]") continue;
						let payload: any;
						try {
							payload = JSON.parse(data);
						} catch {
							continue;
						}
						const event = responsesFrameEvent(frame.event, payload);

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
							// Set before the frame is queued: a later reset must not error the stream and
							// discard the queued terminal frame.
							if (normalized === "response.completed" || normalized === "response.incomplete" || normalized === "response.failed") {
								upstreamCompleted = true;
							}
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

						if (!isChatPayload) {
							// A Chat upstream that fails after the stream started sends a bare
							// error frame; the stream then ends as response.failed below.
							if (mode !== "responses" && isBareChatErrorFrame(payload)) {
								upstreamFailure ??= readUpstreamStreamError(payload);
							}
							continue;
						}

						mode = "chat";
						applyStreamQuirks(payload, state, args.providerId);

						if (!createdEmitted) {
							if (payload?.created) createdAt = payload.created;
							if (payload?.model) model = payload.model;
							await emitCreated(controller);
							createdEmitted = true;
						}

						if (payload?.id) nativeResponseId = payload.id;
						if (payload?.created) createdAt = payload.created;
						if (payload?.model) model = payload.model;
						if (chatChunkCompletes(payload, choices)) upstreamCompleted = true;

						finalResponse = accumulateChatCompletion(finalResponse, payload);

						if (Array.isArray(payload?.choices)) {
							for (const choice of payload.choices) {
								const choiceIndex = Number(choice.index ?? 0);
								const entry = getChoiceState(choiceIndex);
								if (choice?.finish_reason) {
									entry.finishReason = choice.finish_reason;
								}
								// An OpenAI-style refusal ends with finish_reason "stop"; Messages
								// clients need it as stop_reason "refusal".
								const refusal = choice?.delta?.refusal ?? choice?.message?.refusal;
								if (typeof refusal === "string" && refusal.length > 0) {
									entry.sawRefusal = true;
								}

								const deltaContent = choice?.delta?.content;
								if (typeof deltaContent === "string" && deltaContent.length > 0) {
									entry.text += deltaContent;
									if (!isMiniMaxToolInterop) {
										entry.emittedText = true;
										const { outputIndex, itemId } = await announceMessage(choiceIndex, entry, controller);
										await emitEvent("response.output_text.delta", {
											delta: deltaContent,
											output_index: outputIndex,
											item_id: itemId,
											content_index: 0,
										}, controller);
									} else {
										// The text is held back to parse tool calls out of it, but it was written
										// first: keep its place ahead of later function_call items.
										ensureMessageIndex(choiceIndex, entry);
									}
								}

								if (typeof choice?.delta?.refusal === "string" && choice.delta.refusal.length > 0) {
									await emitRefusal(choiceIndex, entry, choice.delta.refusal, controller);
								}
								if (Array.isArray(choice?.delta?.annotations)) {
									await emitAnnotations(choiceIndex, entry, choice.delta.annotations, controller);
								}

								// gpt-oss hosts (Cerebras, Groq Chat) stream the reasoning as `reasoning`.
								const deltaReasoning = typeof choice?.delta?.reasoning_content === "string" && choice.delta.reasoning_content.length > 0
									? choice.delta.reasoning_content
									: choice?.delta?.reasoning;
								if (typeof deltaReasoning === "string" && deltaReasoning.length > 0) {
									entry.reasoning += deltaReasoning;
									entry.emittedReasoning = true;
									const { outputIndex, itemId } = await announceReasoning(choiceIndex, entry, controller);
									await emitEvent("response.reasoning_text.delta", {
										delta: deltaReasoning,
										output_index: outputIndex,
										item_id: itemId,
										content_index: 0,
									}, controller);
								}

								// A thought signature without a tool-call id belongs to the reasoning
								// item, so Responses and Messages clients can return it next turn.
								for (const detail of Array.isArray(choice?.delta?.reasoning_details) ? choice.delta.reasoning_details : []) {
									// A Gemini signature from a text part goes in its own item after the
									// message (from the final output), not on the thought item.
									if (detail?.type === "reasoning.encrypted" && !detail.id && typeof detail.data === "string" && detail.data
										&& !openReasoningState(detail.data)?.signsText) {
										entry.reasoningEncrypted = detail.data;
										await announceReasoning(choiceIndex, entry, controller);
									}
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
									if (typeof toolDelta?.function?.name === "string" && toolDelta.function.name) {
										if (tool.fallbackName) {
											tool.name = toolDelta.function.name;
											tool.fallbackName = false;
										} else {
											tool.name += toolDelta.function.name;
										}
									}
									if (typeof toolDelta?.function?.arguments === "string") {
										tool.arguments += toolDelta.function.arguments;
										withToolName(tool);
										if (!tool.emittedAdded) {
											await closeSignedReasoningBeforeOutput(entry, controller);
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
									const messageReasoning = typeof message.reasoning_content === "string" && message.reasoning_content.length > 0
										? message.reasoning_content
										: message.reasoning;
									if (typeof messageReasoning === "string" && messageReasoning.length > 0) {
										if (entry.reasoning.length === 0) {
											entry.reasoning = messageReasoning;
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
										for (const [position, toolCall] of message.tool_calls.entries()) {
											// A complete message lists its calls without an index.
											const toolIndex = Number(toolCall?.index ?? position);
											const tool = ensureToolCallState(choiceIndex, toolIndex, entry, toolCall?.id);
											if (typeof toolCall?.function?.name === "string") {
												tool.name = toolCall.function.name;
											}
											if (typeof toolCall?.function?.arguments === "string") {
												tool.arguments = toolCall.function.arguments;
											}
											withToolName(tool);
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
							const { outputIndex, itemId } = await announceMessage(choiceIndex, entry, controller);
							await emitEvent("response.output_text.delta", {
								delta: entry.text,
								output_index: outputIndex,
								item_id: itemId,
								content_index: 0,
							}, controller);
							entry.emittedText = true;
						}
						if (entry.emittedText) await emitAnnotations(choiceIndex, entry, [], controller);
						if (entry.reasoning.length > 0 && !entry.emittedReasoning) {
							const { outputIndex, itemId } = await announceReasoning(choiceIndex, entry, controller);
							await emitEvent("response.reasoning_text.delta", {
								delta: entry.reasoning,
								output_index: outputIndex,
								item_id: itemId,
								content_index: 0,
							}, controller);
							entry.emittedReasoning = true;
						}
					}

					// The final output is built first so a reasoning item's done event can
					// carry its sealed state.
					const final = finalResponse ? (() => {
						repairStreamedToolCalls(finalResponse, fallbackToolId, fallbackToolName);
						const ir = openAIChatToIR(finalResponse, args.requestId, args.ir.model, args.providerId);
						const encoded = encodeOpenAIResponsesResponse(ir, args.requestId);
						const output =
							Array.isArray(encoded.output) && encoded.output.length > 0
								? encoded.output
								: buildResponsesOutputFromState(choiceStates, args.requestId);
						const indexed = assignStreamedOutputIndexes(output, choiceStates, () => nextOutputIndex++);
						return { ir, encoded, indexed };
					})() : null;
					const finalItemAt = (outputIndex: number) => final?.indexed.find(({ index }) => index === outputIndex)?.item;

					// Close announced message and reasoning items before tool calls and the
					// terminal event.
					const closedIndexes = new Set<number>();
					for (const entry of choiceStates.values()) {
						for (const index of await closeAnnouncedItems(entry, finalItemAt, controller)) closedIndexes.add(index);
					}

					for (const entry of choiceStates.values()) {
						for (const tool of entry.toolCalls.values()) {
							withToolName(tool);
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

					if (final) {
						const { ir, encoded, indexed } = final;
						const usage = encodeResponsesUsageFromIR(ir.usage);
						const completion = deriveResponsesCompletionFromFinish(ir.choices?.[0]?.finishReason);
						const firstChoice = ir.choices?.[0];
						const refusalStop = choiceStates.get(firstChoice?.index ?? 0)?.sawRefusal === true &&
							(firstChoice?.finishReason === "stop" || firstChoice?.finishReason === "content_filter");
						for (const { index, item, streamed } of indexed) {
							if ((item as any)?.type !== "reasoning" || !(item as any).encrypted_content) continue;
							// Already closed with the streamed reasoning text above.
							if (closedIndexes.has(index)) continue;
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
							status: upstreamFailure ? "failed" : completion.status,
							...(upstreamFailure
								? { error: { code: upstreamFailure.code ?? "server_error", message: upstreamFailure.message } }
								: (completion.incompleteDetails ? { incomplete_details: completion.incompleteDetails } : {})),
							// Internal: stripped before the client sees the frame.
							...gatewayStopEntry(refusalStop ? "refusal" : firstChoice?.finishDetail, firstChoice?.stopSequence),
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
						// One terminal event: response.failed when the upstream failed, response.incomplete
						// for length and content filter, otherwise response.completed.
						await emitEvent(
							upstreamFailure ? "response.failed" : completion.status === "incomplete" ? "response.incomplete" : "response.completed",
							{ response },
							controller,
						);
					}
				}
				if (upstreamFailure && mode === "unknown") {
					// The upstream failed before sending any chunk.
					if (!createdEmitted) {
						await emitCreated(controller);
						createdEmitted = true;
					}
					await emitEvent("response.failed", {
						response: {
							id: args.requestId,
							object: "response",
							created_at: createdAt,
							status: "failed",
							error: { code: upstreamFailure.code ?? "server_error", message: upstreamFailure.message },
							model,
							output: [],
						},
					}, controller);
				}
			} catch (err) {
				// A client cancel ends the read loop early; that is not a failure.
				if (!cancelledReaders.has(reader) && !upstreamCompleted) {
					console.error("openai compat chat->responses stream transform failed:", err);
					upstreamError = err;
				}
			} finally {
				// A genuine upstream failure (a reset connection) errors this stream too, so billing
				// sees a broken stream rather than a normal end; our own cancel just stops.
				if (!cancelledReaders.has(reader)) {
					if (upstreamError !== undefined) controller.error(upstreamError);
					else controller.close();
				}
			}
		},
		// Pass a client cancel on to the stream this one reads, so the upstream stops too.
		cancel(reason) {
			cancelledReaders.add(reader);
		return reader.cancel(reason);
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
function buildReasoningDetailDelta(
	item: any,
	args: ExecutorExecuteArgs,
	index: number,
	streamedPosition?: { afterCallId?: string; textOffset?: number },
): GatewayReasoningDetail | null {
	const model = args.providerModelSlug ?? args.ir.model;
	const raw = typeof item?.encrypted_content === "string" && item.encrypted_content ? item.encrypted_content : null;
	if (!raw) return null;
	const state = openReasoningState(raw, { format: reasoningFormatForRoute(args.providerId, model), kind: "encrypted" });
	if (!state) return null;
	// Claude streams record their own position; others take where the stream was.
	const position = state.afterCallId || state.textOffset || state.format === ANTHROPIC_REASONING_FORMAT || !keepsReasoningPosition(state.format)
		? { afterCallId: state.afterCallId, textOffset: state.textOffset }
		: streamedPosition ?? {};
	const sealed = sealReasoningState({
		format: state.format,
		kind: state.kind,
		value: state.value,
		model: state.model ?? model,
		provider: state.provider ?? args.providerId,
		...(state.callId ? { callId: state.callId } : {}),
		...(position.afterCallId ? { afterCallId: position.afterCallId } : {}),
		...(position.textOffset ? { textOffset: position.textOffset } : {}),
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
					content: [{ type: "reasoning_text", text: entry.reasoning }],
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
					content: messageContentFromState(entry),
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

/** A message item's content parts from the streamed choice state. */
function messageContentFromState(entry: ResponsesStreamChoiceState): any[] {
	return [
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
	];
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
	const inputDetails: Record<string, any> = {};
	const outputDetails: Record<string, number> = {};
	// OpenAI semantics: input_tokens includes cache reads and writes.
	const cache = irUsageToOpenAIStyle(usage);
	if (typeof cache.readTokens === "number") {
		inputDetails.cached_tokens = cache.readTokens;
	}
	if (typeof cache.writeTokens === "number") {
		inputDetails.cache_write_tokens = cache.writeTokens;
	}
	const writeTtlDetails = openAICacheWriteTtlDetails(cache);
	if (writeTtlDetails) inputDetails.cache_write_tokens_details = writeTtlDetails;
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
	if (typeof cache.write30mTokens === "number") out.cached_write_text_tokens_30m = cache.write30mTokens;
	if (typeof cache.write12hTokens === "number") out.cached_write_text_tokens_12h = cache.write12hTokens;
	if (typeof cache.writeTokens === "number") out.cached_write_tokens_are_subset_of_input = true;
	if (typeof usage._ext?.citationTokens === "number") out.citation_tokens = usage._ext.citationTokens;
	if (typeof usage._ext?.numSearchQueries === "number") out.num_search_queries = usage._ext.numSearchQueries;
	// Server-tool counts (web searches) are billed per call; client usage shaping passes
	// server_tool_use through to pricing, so streamed Responses usage keeps it.
	if (usage._ext?.serverToolUse) out.server_tool_use = { ...usage._ext.serverToolUse };
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
