// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

// OpenAI-Compatible Executor
// Handles: OpenAI, Groq, DeepSeek, Together, Fireworks, and other OpenAI-compatible providers
// Uses OpenAI Responses API format upstream for consistency

import type { ExecutorExecuteArgs, ExecutorResult, Bill } from "@executors/types";
import type { IRChatResponse } from "@core/ir";
import { irToOpenAIResponses, openAIResponsesToIR } from "./transform";
import { irToOpenAIChat, openAIChatToIR } from "./transform-chat";
import {
	openAICompatHeaders,
	openAICompatUrl,
	resolveOpenAICompatKey,
	resolveOpenAICompatRoute,
} from "@providers/openai-compatible/config";
import { computeBill } from "@pipeline/pricing/engine";
import { irToOpenAICompletions, openAICompletionsToIR } from "./transform-legacy";
import { getProviderQuirks } from "./quirks";
import { parseMinimaxInterleavedText } from "./providers/minimax/quirks";
import { encodeOpenAIChatResponse } from "@protocols/openai-chat/encode";
import { encodeOpenAIResponsesResponse } from "@protocols/openai-responses/encode";
import { normalizeTextUsageForPricing } from "@executors/_shared/usage/text";
import { sanitizeOpenAICompatRequest } from "./provider-policy";

export async function executeOpenAICompat(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	// Use upstream start time from pipeline (set before executor is called)
	// Falls back to current time if not provided (backward compatibility)
	const upstreamStartMs = args.meta.upstreamStartMs ?? Date.now();
	// Resolve API key (gateway or BYOK)
	const keyInfo = resolveOpenAICompatKey({
		providerId: args.providerId,
		byokMeta: args.byokMeta,
	} as any);

	// Choose endpoint based on provider capabilities
	const modelForRouting = args.providerModelSlug ?? args.ir.model;
	const defaultRoute = resolveOpenAICompatRoute(args.providerId, modelForRouting);
	const route = resolvePreferredRoute(args, defaultRoute);
	const useResponses = route === "responses";
	const isLegacyCompletions = route === "legacy_completions";
	const endpoint = useResponses ? "/responses" : (isLegacyCompletions ? "/completions" : "/chat/completions");

	// Transform IR -> OpenAI format (Responses or Chat based on support)
	const requestPayload = useResponses
		? irToOpenAIResponses(args.ir, args.providerModelSlug, args.providerId, args.capabilityParams)
		: (isLegacyCompletions
			? irToOpenAICompletions(args.ir, args.providerModelSlug)
			: irToOpenAIChat(args.ir, args.providerModelSlug, args.providerId, args.capabilityParams));

	// Always stream upstream for first-byte latency
	const payload = {
		...requestPayload,
		stream: true,
	};
	if (!useResponses && !isLegacyCompletions) {
		payload.stream_options = {
			...(payload.stream_options ?? {}),
			include_usage: true,
		};
	}
	const sanitized = sanitizeOpenAICompatRequest({
		providerId: args.providerId,
		route,
		model: modelForRouting,
		request: payload,
	});
	const requestBody = JSON.stringify(sanitized.request);
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest) ? requestBody : undefined;
	if (args.meta.debug?.enabled && sanitized.dropped.length > 0) {
		console.log("[gateway-debug] provider request sanitized", {
			provider: args.providerId,
			route,
			dropped: sanitized.dropped,
		});
	}
	try {
		(args.ir as any).rawRequest = sanitized.request;
	} catch {
		// ignore if readonly
	}

	// Execute upstream call
	const res = await fetch(openAICompatUrl(args.providerId, endpoint), {
		method: "POST",
		headers: openAICompatHeaders(args.providerId, keyInfo.key),
		body: requestBody,
	});

	const bill: Bill = {
		cost_cents: 0,
		currency: "USD",
		usage: undefined,
		upstream_id: res.headers.get("x-request-id") || undefined,
		finish_reason: null,
	};
	if (!res.ok) {
		console.error(`Upstream error for provider ${args.providerId}: ${res.status} ${res.statusText}`);
		return {
			kind: "completed",
			ir: undefined,
			bill,
			upstream: res,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
		};
	}

	// Handle streaming vs non-streaming
	if (args.ir.stream) {
		const stream = resolveStreamForProtocol(res, args, route);
		return {
			kind: "stream",
			stream,
			usageFinalizer: createUsageFinalizer(res, args),
			bill,
			upstream: res,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
			timing: {
				latencyMs: undefined,
				generationMs: undefined,
			},
		};
	} else {
		// Buffer the stream and return complete response
		const { ir, usage, rawResponse, firstByteMs, totalMs } = await bufferStreamToIR(res, args, route, upstreamStartMs);
		if (ir) {
			(ir as any).rawResponse = rawResponse;
		}

		// Calculate pricing
		const usageMeters = normalizeTextUsageForPricing(usage);
		if (usageMeters) {
			const priced = computeBill(usageMeters, args.pricingCard);
			bill.cost_cents = priced.pricing.total_cents;
			bill.currency = priced.pricing.currency;
			bill.usage = priced;
		}

		return {
			kind: "completed",
			ir,
			bill,
			upstream: res,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
			rawResponse,
			timing: {
				latencyMs: firstByteMs,
				generationMs: totalMs,
			},
		};
	}
}

type StreamAdapterState = {
	requestId: string;
	providerId: string;
	choiceStates: Map<number, { reasoningChunks: string[] }>;
	aionStates?: Map<number, any>;
};

function createStreamAdapterState(args: ExecutorExecuteArgs): StreamAdapterState {
	return {
		requestId: args.requestId,
		providerId: args.providerId,
		choiceStates: new Map(),
	};
}

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

function parseSseBlock(block: string): { event: string | null; data: string } {
	const lines = block.split("\n");
	let event: string | null = null;
	let data = "";
	for (const rawLine of lines) {
		const line = rawLine.replace(/\r$/, "");
		if (line.startsWith("event:")) {
			event = line.slice(6).trim();
		} else if (line.startsWith("data:")) {
			data += line.slice(5).trimStart();
		}
	}
	return { event, data };
}

/**
 * Normalize Responses API SSE event names to unified format
 *
 * OpenAI sends multiple different event names for reasoning content:
 * - response.reasoning.delta (older format)
 * - response.reasoning_summary_text.delta (reasoning summaries)
 *
 * We normalize all to response.reasoning_text.delta for consistency across providers.
 * This ensures clients receive unified events regardless of which provider is used.
 *
 * @see https://platform.openai.com/docs/api-reference/responses-streaming
 */
function normalizeResponsesEvent(event: string | null): string | null {
	if (!event) return event;

	// Normalize all reasoning-related events to unified format
	if (event === "response.reasoning.delta") return "response.reasoning_text.delta";
	if (event === "response.reasoning_summary_text.delta") return "response.reasoning_text.delta";
	if (event === "response.reasoning_summary.delta") return "response.reasoning_text.delta";

	// Normalize text output events (should already be standardized, but just in case)
	if (event === "response.output.delta") return "response.output_text.delta";
	if (event === "response.text.delta") return "response.output_text.delta";

	return event;
}

export function resolveStreamForProtocol(
	res: Response,
	args: ExecutorExecuteArgs,
	route: "responses" | "chat" | "legacy_completions",
): ReadableStream<Uint8Array> {
	if (!res.body) {
		throw new Error("openai_stream_missing_body");
	}

	const protocol = args.protocol ?? (args.endpoint === "responses" ? "openai.responses" : "openai.chat.completions");
	const state = createStreamAdapterState(args);

	if (protocol === "openai.chat.completions") {
		if (route === "legacy_completions") {
			return transformLegacyCompletionsStream(res.body, args);
		}
		if (route === "responses") {
			return transformResponsesStreamToChat(res.body, args, state);
		}
		return transformChatStream(res.body, args, state);
	}

	if (protocol === "openai.responses") {
		if (route === "legacy_completions") {
			const legacyStream = transformLegacyCompletionsStream(res.body, args);
			return transformChatStreamToResponses(legacyStream, args, state);
		}
		return transformChatStreamToResponses(res.body, args, state);
	}

	if (protocol === "anthropic.messages") {
		if (route === "legacy_completions") {
			const legacyStream = transformLegacyCompletionsStream(res.body, args);
			const responsesStream = transformChatStreamToResponses(legacyStream, args, state);
			return transformResponsesStreamToAnthropic(responsesStream, args);
		}
		if (route === "chat") {
			const responsesStream = transformChatStreamToResponses(res.body, args, state);
			return transformResponsesStreamToAnthropic(responsesStream, args);
		}
		return transformResponsesStreamToAnthropic(res.body, args);
	}

	// Default: passthrough (responses protocol or unknown)
	return res.body;
}

function resolvePreferredRoute(
	args: ExecutorExecuteArgs,
	defaultRoute: "responses" | "chat" | "legacy_completions",
): "responses" | "chat" | "legacy_completions" {
	// xAI compatibility currently has stricter /responses validation for structured output.
	// Route structured requests via chat/completions for better interoperability.
	if (
		(args.providerId === "x-ai" || args.providerId === "xai") &&
		defaultRoute === "responses" &&
		args.ir?.responseFormat &&
		args.ir.responseFormat.type !== "text"
	) {
		return "chat";
	}

	return defaultRoute;
}

function transformChatStream(
	stream: ReadableStream<Uint8Array>,
	args: ExecutorExecuteArgs,
	state: StreamAdapterState,
): ReadableStream<Uint8Array> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let buf = "";

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					buf += decoder.decode(value, { stream: true });
					const frames = buf.split(/\n\n/);
					buf = frames.pop() ?? "";

					for (const raw of frames) {
						const { data } = parseSseBlock(raw);
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

/**
 * Transform OpenAI Responses API stream to Chat Completions format
 *
 * Responses API uses SSE events like:
 * - response.created
 * - response.output_text.delta (regular text)
 * - response.reasoning_text.delta (reasoning/thinking)
 * - response.function_call_arguments.delta (tool calls)
 *
 * We convert these to Chat Completions chunks with delta.content, delta.reasoning_content, etc.
 */
function transformResponsesStreamToChat(
	stream: ReadableStream<Uint8Array>,
	args: ExecutorExecuteArgs,
	state: StreamAdapterState,
): ReadableStream<Uint8Array> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let buf = "";

	// State tracking for the response
	let nativeResponseId: string | null = null;
	let created = Math.floor(Date.now() / 1000);
	let finalResponse: any = null;
	// Buffer tool calls across deltas (Responses API sends tool calls incrementally).
	// OpenAI often uses item_id (fc_*) in argument-delta events and call_id (call_*) in output-item events.
	// We alias both to a canonical tool id (prefer call_id) so chat deltas stay consistent.
	const toolBuffer = new Map<string, { arguments: string; name?: string; output_index: number; tool_index: number }>();
	const toolAlias = new Map<string, string>();
	const toolIndexById = new Map<string, number>();
	let nextToolIndex = 0;

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

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					buf += decoder.decode(value, { stream: true });
					const frames = buf.split(/\n\n/);
					buf = frames.pop() ?? "";

					for (const raw of frames) {
						const { event, data } = parseSseBlock(raw);
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
									await emitDelta({ role: "assistant", content: payload.delta }, controller, payload?.output_index ?? 0, payload?.logprobs ? { logprobs: payload.logprobs } : undefined);
								}
								break;
							case "response.reasoning_text.delta":
								if (typeof payload?.delta === "string") {
									await emitDelta({ role: "assistant", reasoning_content: payload.delta }, controller, payload?.output_index ?? 0);
								}
								break;
							case "response.function_call_arguments.delta": {
								const resolvedId = canonicalToolId(payload?.item_id);
								if (!resolvedId) break;
								const entry: { arguments: string; name?: string; output_index: number; tool_index: number } =
									toolBuffer.get(resolvedId) ?? {
									arguments: "",
									output_index: payload?.output_index ?? 0,
									tool_index: ensureToolIndex(resolvedId),
								};
								if (typeof payload?.delta === "string") {
									entry.arguments += payload.delta;
								}
								toolBuffer.set(resolvedId, entry);
								await emitDelta({
									role: "assistant",
									tool_calls: [{
										index: entry.tool_index,
										id: resolvedId,
										type: "function",
										function: {
											name: entry.name ?? "",
											arguments: entry.arguments ?? "",
										},
									}],
								}, controller, entry.output_index ?? 0);
								break;
							}
							case "response.output_item.added":
							case "response.output_item.done": {
								const item = payload?.item;
								const itemType = String(item?.type ?? "").toLowerCase();
								if (itemType !== "function_call" && itemType !== "tool_call") break;
								const canonicalId =
									canonicalToolId(item?.call_id) ??
									canonicalToolId(item?.id) ??
									canonicalToolId(payload?.item_id);
								if (!canonicalId) break;
								aliasToolId(item?.call_id, canonicalId);
								aliasToolId(item?.id, canonicalId);
								aliasToolId(payload?.item_id, canonicalId);
								const entry: { arguments: string; name?: string; output_index: number; tool_index: number } =
									toolBuffer.get(canonicalId) ?? {
									arguments: "",
									output_index: payload?.output_index ?? 0,
									tool_index: ensureToolIndex(canonicalId),
								};
								if (typeof item?.name === "string") {
									entry.name = item.name;
								}
								if (typeof item?.arguments === "string") {
									entry.arguments = item.arguments;
								}
								toolBuffer.set(canonicalId, entry);
								await emitDelta({
									role: "assistant",
									tool_calls: [{
										index: entry.tool_index,
										id: canonicalId,
										type: "function",
										function: {
											name: entry.name ?? "",
											arguments: entry.arguments ?? "",
										},
									}],
								}, controller, entry.output_index ?? 0);
								break;
							}
							case "response.function_call_arguments.done": {
								const resolvedId = canonicalToolId(payload?.item_id);
								if (!resolvedId) break;
								const entry: { arguments: string; name?: string; output_index: number; tool_index: number } =
									toolBuffer.get(resolvedId) ?? {
									arguments: "",
									output_index: payload?.output_index ?? 0,
									tool_index: ensureToolIndex(resolvedId),
								};
								if (typeof payload?.arguments === "string") {
									entry.arguments = payload.arguments;
								}
								if (typeof payload?.name === "string") {
									entry.name = payload.name;
								}
								toolBuffer.set(resolvedId, entry);
								await emitDelta({
									role: "assistant",
									tool_calls: [{
										index: entry.tool_index,
										id: resolvedId,
										type: "function",
										function: {
											name: entry.name ?? "",
											arguments: entry.arguments ?? "",
										},
									}],
								}, controller, entry.output_index ?? 0);
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

/**
 * State tracking for each choice when transforming Chat -> Responses format
 *
 * Responses API requires output_items with index numbers, so we track:
 * - text: Accumulated regular content
 * - reasoning: Accumulated reasoning/thinking content
 * - toolCalls: Map of tool calls with their output indices
 * - messageOutputIndex/reasoningOutputIndex: Position in output array
 * - emittedText/emittedReasoning: Track if we've sent deltas for these
 */
type ResponsesStreamChoiceState = {
	text: string;
	reasoning: string;
	finishReason?: string | null;
	messageOutputIndex?: number;
	reasoningOutputIndex?: number;
	messageItemId?: string;
	reasoningItemId?: string;
	toolCalls: Map<number, { id: string; name: string; arguments: string; outputIndex: number; emittedAdded?: boolean }>;
	emittedText?: boolean;
	emittedReasoning?: boolean;
};

/**
 * Transform Chat Completions stream to OpenAI Responses API format
 *
 * Chat Completions uses delta.content and delta.reasoning_content in chunks
 * Responses API uses separate output items (message, reasoning, function_call)
 *
 * We accumulate deltas and emit them as Responses API SSE events:
 * - response.output_text.delta
 * - response.reasoning_text.delta
 * - response.function_call_arguments.delta
 */
function transformChatStreamToResponses(
	stream: ReadableStream<Uint8Array>,
	args: ExecutorExecuteArgs,
	state: StreamAdapterState,
): ReadableStream<Uint8Array> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let buf = "";

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
					buf += decoder.decode(value, { stream: true });
					const frames = buf.split(/\n\n/);
					buf = frames.pop() ?? "";

					for (const raw of frames) {
						const { event, data } = parseSseBlock(raw);
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
							controller.enqueue(
								encoder.encode(`event: ${normalized}\ndata: ${JSON.stringify(payload)}\n\n`)
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
						const response = {
							id: args.requestId,
							object: "response",
							created_at: ir.created ?? createdAt,
							status: completion.status,
							...(completion.incompleteDetails ? { incomplete_details: completion.incompleteDetails } : {}),
							model: ir.model ?? model,
							output,
							usage,
							nativeResponseId: ir.nativeId ?? nativeResponseId,
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

function transformResponsesStreamToAnthropic(
	stream: ReadableStream<Uint8Array>,
	args: ExecutorExecuteArgs,
): ReadableStream<Uint8Array> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let buf = "";

	const emit = async (
		controller: ReadableStreamDefaultController<Uint8Array>,
		eventName: string,
		payload: any,
	) => {
		controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`));
	};

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			let finalResponse: any = null;
			try {
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					buf += decoder.decode(value, { stream: true });
					const frames = buf.split(/\n\n/);
					buf = frames.pop() ?? "";

					for (const raw of frames) {
						const { event, data } = parseSseBlock(raw);
						if (!data || data === "[DONE]") continue;
						let payload: any;
						try {
							payload = JSON.parse(data);
						} catch {
							continue;
						}

						const normalizedEvent = normalizeResponsesEvent(event);
						if (normalizedEvent === "response.completed") {
							finalResponse = payload?.response ?? payload;
							continue;
						}

						if (!normalizedEvent && payload?.object === "response") {
							finalResponse = payload;
						}
					}
				}

				if (!finalResponse) return;

				const outputItems = Array.isArray(finalResponse?.output)
					? finalResponse.output
					: (Array.isArray(finalResponse?.output_items) ? finalResponse.output_items : []);
				const usage = normalizeUsageToAnthropic(finalResponse?.usage);
				const messageId = finalResponse?.nativeResponseId ?? finalResponse?.id ?? args.requestId;
				const model = finalResponse?.model ?? args.providerModelSlug ?? args.ir.model;

				await emit(controller, "message_start", {
					type: "message_start",
					message: {
						id: messageId,
						type: "message",
						role: "assistant",
						model,
						content: [],
						stop_reason: null,
						stop_sequence: null,
						usage,
					},
				});

				let blockIndex = 0;
				let hasToolUse = false;

				for (const item of outputItems) {
					const type = String(item?.type ?? "").toLowerCase();

					if (type === "reasoning") {
						const text = extractOutputText(item?.content);
						const idx = blockIndex++;
						await emit(controller, "content_block_start", {
							type: "content_block_start",
							index: idx,
							content_block: { type: "thinking", thinking: "" },
						});
						if (text) {
							await emit(controller, "content_block_delta", {
								type: "content_block_delta",
								index: idx,
								delta: { type: "thinking_delta", thinking: text },
							});
						}
						await emit(controller, "content_block_stop", {
							type: "content_block_stop",
							index: idx,
						});
						continue;
					}

					if (type === "message") {
						const content = Array.isArray(item?.content) ? item.content : [];
						for (const part of content) {
							const text = extractTextPart(part);
							if (!text) continue;
							const idx = blockIndex++;
							await emit(controller, "content_block_start", {
								type: "content_block_start",
								index: idx,
								content_block: { type: "text", text: "" },
							});
							await emit(controller, "content_block_delta", {
								type: "content_block_delta",
								index: idx,
								delta: { type: "text_delta", text },
							});
							await emit(controller, "content_block_stop", {
								type: "content_block_stop",
								index: idx,
							});
						}
						continue;
					}

					if (type === "function_call" || type === "tool_call") {
						hasToolUse = true;
						const idx = blockIndex++;
						await emit(controller, "content_block_start", {
							type: "content_block_start",
							index: idx,
							content_block: {
								type: "tool_use",
								id: item?.call_id ?? item?.id ?? `tool_${idx}`,
								name: item?.name ?? "tool",
								input: parseFunctionArguments(item?.arguments),
							},
						});
						await emit(controller, "content_block_stop", {
							type: "content_block_stop",
							index: idx,
						});
					}
				}

				const stopReason = mapResponsesStatusToAnthropicStopReason(finalResponse, hasToolUse);
				await emit(controller, "message_delta", {
					type: "message_delta",
					delta: {
						stop_reason: stopReason,
						stop_sequence: null,
					},
					usage: {
						input_tokens: usage.input_tokens,
						output_tokens: usage.output_tokens,
					},
				});
				await emit(controller, "message_stop", { type: "message_stop" });
			} catch (err) {
				console.error("openai compat responses->anthropic stream transform failed:", err);
			} finally {
				controller.close();
			}
		},
	});
}

function normalizeUsageToAnthropic(usage: any): { input_tokens: number; output_tokens: number } {
	const inputTokens = Number(
		usage?.input_tokens ??
		usage?.prompt_tokens ??
		usage?.inputTokens ??
		0,
	);
	const outputTokens = Number(
		usage?.output_tokens ??
		usage?.completion_tokens ??
		usage?.outputTokens ??
		0,
	);
	return {
		input_tokens: Number.isFinite(inputTokens) ? inputTokens : 0,
		output_tokens: Number.isFinite(outputTokens) ? outputTokens : 0,
	};
}

function extractOutputText(content: any): string {
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => extractTextPart(part))
		.filter((part) => part.length > 0)
		.join("");
}

function extractTextPart(part: any): string {
	if (!part || typeof part !== "object") return "";
	if (typeof part.text === "string") return part.text;
	if (part.type === "output_text" && typeof part.text === "string") return part.text;
	return "";
}

function parseFunctionArguments(argumentsRaw: unknown): Record<string, any> {
	if (argumentsRaw && typeof argumentsRaw === "object" && !Array.isArray(argumentsRaw)) {
		return argumentsRaw as Record<string, any>;
	}
	if (typeof argumentsRaw === "string" && argumentsRaw.length > 0) {
		try {
			const parsed = JSON.parse(argumentsRaw);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				return parsed as Record<string, any>;
			}
		} catch {
			// ignore parse errors
		}
	}
	return {};
}

function mapResponsesStatusToAnthropicStopReason(
	response: any,
	hasToolUse: boolean,
): "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | "refusal" | null {
	const status = String(response?.status ?? "").toLowerCase();
	if (status === "failed") return null;
	if (hasToolUse) return "tool_use";
	if (status === "incomplete") {
		const reason = String(response?.incomplete_details?.reason ?? "").toLowerCase();
		if (reason.includes("stop_sequence")) return "stop_sequence";
		if (reason.includes("content")) return "refusal";
		return "max_tokens";
	}
	return "end_turn";
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
		if (entry.messageOutputIndex != null && entry.text.length > 0) {
			outputItems.push({
				index: entry.messageOutputIndex,
				item: {
					type: "message",
					id: entry.messageItemId ?? `msg_${requestId}_${choiceIndex}`,
					status: "completed",
					role: "assistant",
					content: [{ type: "output_text", text: entry.text, annotations: [] }],
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
	if (typeof usage.cachedInputTokens === "number") {
		inputDetails.cached_tokens = usage.cachedInputTokens;
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
	if (typeof usage._ext?.cachedWriteTokens === "number") {
		outputDetails.cached_tokens = usage._ext.cachedWriteTokens;
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
		input_tokens: usage.inputTokens,
		output_tokens: usage.outputTokens,
		total_tokens: usage.totalTokens,
	};
	if (Object.keys(inputDetails).length) out.input_tokens_details = inputDetails;
	if (Object.keys(outputDetails).length) out.output_tokens_details = outputDetails;
	return out;
}

/**
 * Buffer OpenAI stream and convert to IR
 * Handles both Responses and Chat Completions formats
 */
export async function bufferStreamToIR(
	res: Response,
	args: ExecutorExecuteArgs,
	route: "responses" | "chat" | "legacy_completions",
	upstreamStartMs: number,
): Promise<{ ir: IRChatResponse; usage: any; rawResponse: any; firstByteMs: number | null; totalMs: number }> {
	if (!res.body) {
		throw new Error("openai_stream_missing_body");
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buf = "";
	let finalResponse: any = null;

	let firstByteMs: number | null = null;
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		if (firstByteMs === null) {
			firstByteMs = Date.now() - upstreamStartMs;
		}

		buf += decoder.decode(value, { stream: true });
		const frames = buf.split(/\n\n/);
		buf = frames.pop() ?? "";

		for (const raw of frames) {
			const lines = raw.split("\n");
			let data = "";

			for (const line of lines) {
				const l = line.replace(/\r$/, "");
				if (l.startsWith("data:")) {
					data += l.slice(5).trimStart();
				}
			}

			if (!data || data === "[DONE]") continue;

			let payload: any;
			try {
				payload = JSON.parse(data);
			} catch {
				continue;
			}

			// Responses API sends response in payload.response
			if (route === "responses" && payload?.response) {
				finalResponse = payload.response;
			}
			// Some providers return chat completions even on /responses
			else if (route === "responses" && Array.isArray(payload?.choices)) {
				finalResponse = accumulateChatCompletion(finalResponse, payload);
			}
			// Chat Completions streaming: accumulate chunks into final response
			else if (route === "chat") {
				finalResponse = accumulateChatCompletion(finalResponse, payload);
			}
			else if (route === "legacy_completions") {
				if (!finalResponse) {
					finalResponse = {
						id: payload.id,
						object: payload.object ?? "text_completion",
						created: payload.created,
						model: payload.model,
						choices: [],
					};
				}
				if (Array.isArray(payload?.choices)) {
					for (const chunk of payload.choices) {
						const idx = chunk.index || 0;
						if (!finalResponse.choices[idx]) {
							finalResponse.choices[idx] = {
								index: idx,
								text: "",
								finish_reason: null,
								logprobs: null,
							};
						}
						const choice = finalResponse.choices[idx];
						if (typeof chunk.text === "string") {
							choice.text = (choice.text || "") + chunk.text;
						}
						if (chunk.finish_reason) {
							choice.finish_reason = chunk.finish_reason;
						}
					}
				}
				if (payload?.usage) {
					finalResponse.usage = payload.usage;
				}
			}
		}
	}

	if (!finalResponse) {
		console.error(`Missing final response for provider ${args.providerId}, route: ${route}, buf length: ${buf.length}`);
		throw new Error("openai_stream_missing_response");
	}

	const isChatLikeResponse = isChatCompletionResponse(finalResponse);

	// Convert to IR using appropriate transformer
	const ir = route === "responses"
		? (isChatLikeResponse ? openAIChatToIR(finalResponse, args.requestId, args.ir.model, args.providerId) : openAIResponsesToIR(finalResponse, args.requestId, args.ir.model, args.providerId))
		: (route === "legacy_completions"
			? openAICompletionsToIR(finalResponse, args.requestId, args.ir.model, args.providerId)
			: openAIChatToIR(finalResponse, args.requestId, args.ir.model, args.providerId));

	const totalMs = Math.max(0, Date.now() - upstreamStartMs);
	return {
		ir,
		usage: finalResponse.usage,
		rawResponse: finalResponse,
		firstByteMs,
		totalMs,
	};
}

/**
 * Create finalizer for streaming responses
 * This is called after the stream completes to get final usage
 */
function createUsageFinalizer(
	res: Response,
	args: ExecutorExecuteArgs,
): () => Promise<Bill | null> {
	return async () => {
		// For streaming, we don't have final usage until the stream completes
		// This is handled by the existing streaming infrastructure in pipeline/after/stream.ts
		// For now, return null and let the existing finalizer handle it
		return null;
	};
}

function transformLegacyCompletionsStream(
	stream: ReadableStream<Uint8Array>,
	args: ExecutorExecuteArgs,
): ReadableStream<Uint8Array> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let buf = "";

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					buf += decoder.decode(value, { stream: true });
					const frames = buf.split(/\n\n/);
					buf = frames.pop() ?? "";

					for (const raw of frames) {
						let data = "";
						for (const line of raw.split(/\n/)) {
							const l = line.replace(/\r$/, "");
							if (l.startsWith("data:")) data += l.slice(5).trimStart();
						}
						if (!data || data === "[DONE]") continue;

						let payload: any;
						try {
							payload = JSON.parse(data);
						} catch {
							continue;
						}

						if (!Array.isArray(payload?.choices)) continue;

						const chunk = {
							id: payload.id ?? args.requestId,
							object: "chat.completion.chunk",
							created: payload.created ?? Math.floor(Date.now() / 1000),
							model: payload.model ?? args.ir.model,
							choices: payload.choices.map((choice: any) => ({
								index: choice.index ?? 0,
								delta: { content: choice.text ?? "" },
								finish_reason: choice.finish_reason ?? null,
							})),
							...(payload.usage ? { usage: payload.usage } : {}),
						};

						controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
					}
				}
			} catch (err) {
				console.error("openai legacy completions stream transform failed:", err);
			} finally {
				controller.close();
			}
		},
	});
}

function isChatCompletionResponse(payload: any): boolean {
	if (!payload || !Array.isArray(payload.choices)) return false;
	return payload.choices.some((choice: any) => choice?.message || choice?.delta);
}

function accumulateChatCompletion(finalResponse: any, payload: any): any {
	if (!payload || !Array.isArray(payload?.choices)) {
		if (payload?.usage && finalResponse) {
			finalResponse.usage = payload.usage;
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
				...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
				...(message.reasoning_content ? { reasoning_content: message.reasoning_content } : previousMessage.reasoning_content ? { reasoning_content: previousMessage.reasoning_content } : {}),
				...(message.reasoning ? { reasoning: message.reasoning } : previousMessage.reasoning ? { reasoning: previousMessage.reasoning } : {}),
				...(Array.isArray(message.images) ? { images: message.images } : Array.isArray(previousMessage.images) ? { images: previousMessage.images } : {}),
				...(Array.isArray(message._contentParts)
					? { _contentParts: message._contentParts }
					: Array.isArray(previousMessage._contentParts)
						? { _contentParts: previousMessage._contentParts }
						: {}),
			};
		}

		if (chunk.delta?.content) {
			choice.message.content = (choice.message.content || "") + chunk.delta.content;
		}
		if (chunk.delta?.reasoning_content) {
			choice.message.reasoning_content =
				(choice.message.reasoning_content || "") + chunk.delta.reasoning_content;
		}
		if (chunk.delta?.reasoning) {
			choice.message.reasoning =
				(choice.message.reasoning || "") + chunk.delta.reasoning;
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
		if (chunk.finish_reason) {
			choice.finish_reason = chunk.finish_reason;
		}
		if (chunk.logprobs) {
			choice.logprobs = chunk.logprobs;
		}
	}

	if (payload?.usage) {
		response.usage = payload.usage;
	}

	return response;
}

