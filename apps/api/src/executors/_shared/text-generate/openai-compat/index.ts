// Purpose: Shared OpenAI wire-format primitives for provider-owned executors.
// Why: Keep IR/SSE behavior consistent without using a generic provider adapter.
// How: Provider executors supply policy; this module maps wire formats and streams.

// OpenAI-Compatible Executor
// Handles: OpenAI, Groq, DeepSeek, Together, Fireworks, and other OpenAI-compatible providers
// Uses OpenAI Responses API format upstream for consistency

import type { ExecutorExecuteArgs, ExecutorResult, Bill } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import type { IRChatResponse } from "@core/ir";
import { irToOpenAIResponses, openAIResponsesToIR } from "./transform";
import { irToOpenAIChat, openAIChatToIR } from "./transform-chat";
import {
	openAICompatHeaders,
	openAICompatUrl,
	resolveOpenAICompatKey,
	resolveOpenAICompatModel,
	resolveOpenAICompatRoute,
} from "@providers/openai-compatible/config";
import { resolveProviderKey } from "@providers/keys";
import { upstreamTestHeaders } from "@providers/shared/testing";
import { normalizeTextUsageForPricing } from "@executors/_shared/usage/text";
import { sanitizeOpenAICompatRequest } from "./provider-policy";
import {
	transformChatStream,
	transformChatStreamToResponses,
	transformResponsesStreamToChat,
} from "./stream-transforms";
import {
	adaptRequestFromUpstreamError,
	readErrorPayload,
} from "./retry-policy";

const OPENAI_COMPAT_MAX_ADAPTIVE_RETRIES = 1;
const OPENAI_COMPAT_MAX_TRANSIENT_RETRIES = 1;
const OPENAI_COMPAT_TRANSIENT_RETRY_BASE_DELAY_MS = 120;
const OPENAI_COMPAT_TRANSIENT_RETRY_MAX_DELAY_MS = 600;
const OPENAI_COMPAT_MAX_RETRY_AFTER_MS = 10_000;

function shouldRetryOpenAICompatStatus(status: number): boolean {
	if (status === 408 || status === 409 || status === 429) return true;
	return status >= 500;
}

function parseRetryAfterMs(value: string | null): number | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;

	const seconds = Number(trimmed);
	if (Number.isFinite(seconds) && seconds >= 0) {
		return Math.min(Math.round(seconds * 1000), OPENAI_COMPAT_MAX_RETRY_AFTER_MS);
	}

	const at = Date.parse(trimmed);
	if (!Number.isFinite(at)) return null;
	const delta = at - Date.now();
	if (delta <= 0) return 0;
	return Math.min(delta, OPENAI_COMPAT_MAX_RETRY_AFTER_MS);
}

async function sleep(ms: number): Promise<void> {
	if (ms <= 0) return;
	await new Promise((resolve) => setTimeout(resolve, ms));
}

export type OpenAIWirePolicy = {
	forceChat?: boolean;
	useClientStreamingMode?: boolean;
	transientRetries?: 0 | 1;
	urlProviderId?: string;
	emptyDoneBehavior?: "length";
};

export async function executeOpenAIWire(
	args: ExecutorExecuteArgs,
	policy: OpenAIWirePolicy = {},
): Promise<ExecutorResult> {
	// Resolve API key (gateway or BYOK)
	const keyInfo = args.privateEndpoint
		? resolveProviderKey(
			{ providerId: args.providerId, byokMeta: args.byokMeta },
			() => undefined,
		)
		: resolveOpenAICompatKey({
			providerId: args.providerId,
			byokMeta: args.byokMeta,
		} as any);

	// Choose endpoint based on provider capabilities
	const modelForRouting = resolveOpenAICompatModel(
		args.providerId,
		args.providerModelSlug?.trim() || args.ir.model,
	);
	const defaultRoute = args.privateEndpoint
		? (args.privateEndpoint.supportsResponses ? "responses" : "chat")
		: resolveOpenAICompatRoute(args.providerId, modelForRouting);
	let route: "responses" | "chat" = policy.forceChat ? "chat" : defaultRoute;

	const endpointForRoute = (targetRoute: "responses" | "chat") =>
		targetRoute === "responses" ? "/responses" : "/chat/completions";

	const buildPayloadForRoute = (targetRoute: "responses" | "chat"): Record<string, any> => {
		const requestPayload = targetRoute === "responses"
			? irToOpenAIResponses(args.ir, modelForRouting, args.providerId, args.capabilityParams)
			: irToOpenAIChat(args.ir, modelForRouting, args.providerId, args.capabilityParams);

		const upstreamStream = policy.useClientStreamingMode ? args.ir.stream : true;
		const payload: Record<string, any> = {
			...requestPayload,
			stream: upstreamStream,
		};
		if (targetRoute === "chat" && upstreamStream && args.providerId !== "ai21" && args.providerId !== "mancer") {
			payload.stream_options = {
				...(payload.stream_options ?? {}),
				include_usage: true,
			};
		}
		return payload;
	};

	const sendPayload = async (
		targetRoute: "responses" | "chat",
		payload: Record<string, any>,
	) => {
		const requestBuildStartMs = Date.now();
		const sanitized = sanitizeOpenAICompatRequest({
			providerId: args.providerId,
			route: targetRoute,
			model: modelForRouting,
			request: payload,
		});
		const requestBody = JSON.stringify(sanitized.request);
		if (args.meta.debug?.enabled && sanitized.dropped.length > 0) {
			console.log("[gateway-debug] provider request sanitized", {
				provider: args.providerId,
				route: targetRoute,
				dropped: sanitized.dropped,
			});
		}
		try {
			(args.ir as any).rawRequest = sanitized.request;
		} catch {
			// ignore if readonly
		}

		const fetchStartMs = Date.now();
		const bytePlusMcpBeta = args.providerId === "byteplus"
			&& Array.isArray(sanitized.request.tools)
			&& sanitized.request.tools.some((tool: any) => tool?.type === "mcp");
		const upstreamUrl = args.privateEndpoint
			? `${args.privateEndpoint.baseUrl.replace(/\/+$/, "")}${endpointForRoute(targetRoute)}`
			: openAICompatUrl(policy.urlProviderId ?? args.providerId, endpointForRoute(targetRoute));
		const upstreamHeaders = args.privateEndpoint
			? {
				Authorization: `Bearer ${keyInfo.key}`,
				"Content-Type": "application/json",
				...upstreamTestHeaders(args.meta),
			}
			: openAICompatHeaders(args.providerId, keyInfo.key, {
				...upstreamTestHeaders(args.meta),
				...(bytePlusMcpBeta ? { "ark-beta-mcp": "true" } : {}),
			});
		const response = await fetchUpstream(args, upstreamUrl, {
			method: "POST",
			...(args.privateEndpoint ? { redirect: "manual" as const } : {}),
			headers: upstreamHeaders,
			body: requestBody,
		});

		return {
			response,
			fetchStartMs,
			requestBody,
			request: sanitized.request,
			requestBuildMs: Math.max(0, fetchStartMs - requestBuildStartMs),
			upstreamHeadersMs: Math.max(0, Date.now() - fetchStartMs),
		};
	};

	const maxTransientRetries = policy.transientRetries ?? 0;

	const sendPayloadWithRetry = async (
		targetRoute: "responses" | "chat",
		payload: Record<string, any>,
	) => {
		let delayMs = OPENAI_COMPAT_TRANSIENT_RETRY_BASE_DELAY_MS;
		let totalRetryDelayMs = 0;
		for (let transientAttempt = 0; transientAttempt <= maxTransientRetries; transientAttempt += 1) {
			try {
				const result = await sendPayload(targetRoute, payload);
				const hasRetryLeft = transientAttempt < maxTransientRetries;
				if (!hasRetryLeft || !shouldRetryOpenAICompatStatus(result.response.status)) {
					return {
						...result,
						transientRetryDelayMs: totalRetryDelayMs,
					};
				}

				const retryAfterMs = parseRetryAfterMs(result.response.headers.get("retry-after"));
				const sleepMs = retryAfterMs ?? delayMs;
				totalRetryDelayMs += sleepMs;
				await sleep(sleepMs);
				delayMs = Math.min(delayMs * 2, OPENAI_COMPAT_TRANSIENT_RETRY_MAX_DELAY_MS);
			} catch (error) {
				const hasRetryLeft = transientAttempt < maxTransientRetries;
				if (!hasRetryLeft) {
					throw error;
				}
				totalRetryDelayMs += delayMs;
				await sleep(delayMs);
				delayMs = Math.min(delayMs * 2, OPENAI_COMPAT_TRANSIENT_RETRY_MAX_DELAY_MS);
			}
		}

		const finalResult = await sendPayload(targetRoute, payload);
		return {
			...finalResult,
			transientRetryDelayMs: totalRetryDelayMs,
		};
	};

	let attempt = await sendPayloadWithRetry(route, buildPayloadForRoute(route));
	let res = attempt.response;
	let requestBody = attempt.requestBody;
	let mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest) ? requestBody : undefined;
	let requestBuildMs = attempt.requestBuildMs;
	const upstreamFetchStartMs = attempt.fetchStartMs;
	let upstreamHeadersMs = attempt.upstreamHeadersMs;
	let transientRetryDelayMs = attempt.transientRetryDelayMs;

	let adaptiveRetryCount = 0;
	while (!res.ok && adaptiveRetryCount < OPENAI_COMPAT_MAX_ADAPTIVE_RETRIES) {
		const { errorText, errorPayload } = await readErrorPayload(res);

		const adapted = adaptRequestFromUpstreamError({
			providerId: args.providerId,
			route,
			request: attempt.request,
			errorText,
			errorPayload,
		});
		if (!adapted.changed) {
			break;
		}

		if (args.meta.debug?.enabled) {
			console.log("[gateway-debug] provider request adapted from upstream error", {
				provider: args.providerId,
				route,
				status: res.status,
				dropped: adapted.dropped,
			});
		}

		attempt = await sendPayloadWithRetry(route, adapted.request);
		res = attempt.response;
		requestBody = attempt.requestBody;
		mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest) ? requestBody : undefined;
		requestBuildMs = attempt.requestBuildMs;
		upstreamHeadersMs = attempt.upstreamHeadersMs;
		transientRetryDelayMs = attempt.transientRetryDelayMs;
		adaptiveRetryCount += 1;
	}

	const bill: Bill = {
		cost_cents: 0,
		currency: "USD",
		usage: undefined,
		upstream_id: res.headers.get("x-request-id") || res.headers.get("inference-id") || undefined,
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
			timing: {
				requestBuildMs,
				upstreamFetchStartMs,
				upstreamHeadersMs,
				transientRetryDelayMs,
			},
		};
	}

	const upstreamIsStreaming = attempt.request.stream === true;
	if (!upstreamIsStreaming) {
		const json = await res.json();
		const ir = route === "responses"
			? openAIResponsesToIR(json, args.requestId, modelForRouting, args.providerId)
			: openAIChatToIR(json, args.requestId, modelForRouting, args.providerId);
		const usageMeters = normalizeTextUsageForPricing(ir?.usage ?? json?.usage);
		if (usageMeters) bill.usage = usageMeters;
		return {
			kind: "completed",
			ir,
			bill,
			upstream: res,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
			rawResponse: json,
			timing: {
				requestBuildMs,
				upstreamFetchStartMs,
				upstreamHeadersMs,
				transientRetryDelayMs,
			},
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
				requestBuildMs,
				upstreamFetchStartMs,
				upstreamHeadersMs,
				transientRetryDelayMs,
			},
		};
	} else {
		// Buffer the stream and return complete response
		const selectedDispatchAtMs =
			args.upstreamTiming?.timingFor(res)?.dispatchAtMs ?? Date.now();
		const { ir, usage, rawResponse, firstByteMs, totalMs } = await bufferStreamToIR(
			res,
			args,
			route,
			selectedDispatchAtMs,
			policy.emptyDoneBehavior,
		);
		if (ir) {
			(ir as any).rawResponse = rawResponse;
		}

		// Calculate pricing
		const usageMeters = normalizeTextUsageForPricing(ir?.usage ?? usage);
		if (usageMeters) {
			bill.usage = usageMeters;
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
			latencyMs: firstByteMs ?? undefined,
				generationMs: totalMs,
				requestBuildMs,
				upstreamFetchStartMs,
				upstreamHeadersMs,
				transientRetryDelayMs,
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
	route: "responses" | "chat",
): ReadableStream<Uint8Array> {
	if (!res.body) {
		throw new Error("openai_stream_missing_body");
	}

	const protocol = args.protocol ?? (args.endpoint === "responses" ? "openai.responses" : "openai.chat.completions");
	const state = createStreamAdapterState(args);

	if (protocol === "openai.chat.completions") {
		if (route === "responses") {
			return transformResponsesStreamToChat(res.body, args, state);
		}
		return transformChatStream(res.body, args, state);
	}

	if (protocol === "openai.responses") {
		return transformChatStreamToResponses(res.body, args, state);
	}

	if (protocol === "anthropic.messages") {
		// Always normalize through chat->responses adapter first.
		// This keeps /messages streaming compatible whether upstream emits responses events
		// or chat-completion chunks on a responses route.
		const responsesStream = transformChatStreamToResponses(res.body, args, state);
		return transformResponsesStreamToAnthropic(responsesStream, args);
	}

	// Default: passthrough (responses protocol or unknown)
	return res.body;
}

function transformResponsesStreamToAnthropic(
	stream: ReadableStream<Uint8Array>,
	args: ExecutorExecuteArgs,
): ReadableStream<Uint8Array> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let buf = "";

	const emit = (
		controller: ReadableStreamDefaultController<Uint8Array>,
		eventName: string,
		payload: any,
	) => {
		controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`));
	};

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			let messageStarted = false;
			let nextBlockIndex = 0;
			let terminalEmitted = false;
			let latestResponse: any = null;
			type AnthropicBlock = {
				index: number;
				type: "text" | "thinking" | "tool_use";
				open: boolean;
				emittedContent: boolean;
				toolId?: string;
				toolName?: string;
			};
			const blocksByAlias = new Map<string, AnthropicBlock>();
			const blocks: AnthropicBlock[] = [];
			let activeBlock: AnthropicBlock | null = null;

			const aliasesFor = (value: {
				id?: unknown;
				itemId?: unknown;
				callId?: unknown;
				outputIndex?: unknown;
			}) => {
				const aliases: string[] = [];
				const add = (prefix: string, candidate: unknown) => {
					if (candidate !== undefined && candidate !== null && candidate !== "") {
						aliases.push(`${prefix}:${String(candidate)}`);
					}
				};
				add("id", value.id);
				add("id", value.itemId);
				add("call", value.callId);
				add("output", value.outputIndex);
				return aliases;
			};

			const ensureMessageStart = (response?: any) => {
				if (messageStarted) return;
				messageStarted = true;
				emit(controller, "message_start", {
					type: "message_start",
					message: {
						id: response?.nativeResponseId ?? response?.id ?? args.requestId,
						type: "message",
						role: "assistant",
						model: response?.model ?? args.providerModelSlug ?? args.ir.model,
						content: [],
						stop_reason: null,
						stop_sequence: null,
						usage: normalizeUsageToAnthropic(response?.usage),
					},
				});
			};

			const ensureBlock = (
				aliases: string[],
				type: "text" | "thinking" | "tool_use",
				tool?: { id?: string; name?: string },
			) => {
				const existing = aliases.map((alias) => blocksByAlias.get(alias)).find(Boolean);
				if (existing) {
					for (const alias of aliases) blocksByAlias.set(alias, existing);
					if (tool?.id) existing.toolId = tool.id;
					if (tool?.name) existing.toolName = tool.name;
					if (activeBlock !== existing) {
						if (activeBlock) stopBlock(activeBlock);
						activeBlock = existing.open ? existing : null;
					}
					return existing;
				}
				ensureMessageStart();
				if (activeBlock) stopBlock(activeBlock);
				const block = {
					index: nextBlockIndex++,
					type,
					open: true,
					emittedContent: false,
					toolId: tool?.id,
					toolName: tool?.name,
				};
				blocks.push(block);
				for (const alias of aliases) blocksByAlias.set(alias, block);
				activeBlock = block;
				emit(controller, "content_block_start", {
					type: "content_block_start",
					index: block.index,
					content_block: type === "tool_use"
						? {
							type: "tool_use",
							id: block.toolId ?? `tool_${args.requestId}_${block.index}`,
							name: block.toolName ?? "tool",
							input: {},
						}
						: type === "thinking"
							? { type: "thinking", thinking: "" }
							: { type: "text", text: "" },
				});
				return block;
			};

			function stopBlock(block: { index: number; open: boolean }) {
				if (!block.open) return;
				block.open = false;
				if (activeBlock === block) activeBlock = null;
				emit(controller, "content_block_stop", {
					type: "content_block_stop",
					index: block.index,
				});
			}

			const finishMessage = (response: any) => {
				if (terminalEmitted) return;
				terminalEmitted = true;
				ensureMessageStart(response);

				const outputItems = Array.isArray(response?.output)
					? response.output
					: (Array.isArray(response?.output_items) ? response.output_items : []);
				let hasToolUse = false;
				for (let outputIndex = 0; outputIndex < outputItems.length; outputIndex += 1) {
					const item = outputItems[outputIndex];
					const itemType = String(item?.type ?? "").toLowerCase();
					if (itemType === "reasoning" || itemType === "message") {
						const blockType = itemType === "reasoning" ? "thinking" : "text";
						const block = ensureBlock(aliasesFor({ id: item?.id, outputIndex }), blockType);
						if (!block.emittedContent) {
							const text = extractOutputText(item?.content);
							if (text) {
								emit(controller, "content_block_delta", {
									type: "content_block_delta",
									index: block.index,
									delta: blockType === "thinking"
										? { type: "thinking_delta", thinking: text }
										: { type: "text_delta", text },
								});
								block.emittedContent = true;
							}
						}
						stopBlock(block);
						continue;
					}

					if (itemType === "function_call" || itemType === "tool_call") {
						hasToolUse = true;
						const toolId = item?.call_id ?? item?.id ?? `tool_${outputIndex}`;
						const block = ensureBlock(aliasesFor({
							id: item?.id,
							callId: item?.call_id,
							outputIndex,
						}), "tool_use", {
							id: toolId,
							name: item?.name ?? "tool",
						});
						if (!block.emittedContent && typeof item?.arguments === "string" && item.arguments.length > 0) {
							emit(controller, "content_block_delta", {
								type: "content_block_delta",
								index: block.index,
								delta: { type: "input_json_delta", partial_json: item.arguments },
							});
							block.emittedContent = true;
						}
						stopBlock(block);
					}
				}

				for (const block of blocks) stopBlock(block);
				hasToolUse ||= blocks.some((block) => block.type === "tool_use");
				const usage = normalizeUsageToAnthropic(response?.usage);
				emit(controller, "message_delta", {
					type: "message_delta",
					delta: {
						stop_reason: mapResponsesStatusToAnthropicStopReason(response, hasToolUse),
						stop_sequence: null,
					},
					usage,
				});
				emit(controller, "message_stop", { type: "message_stop" });
			};

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
						if (normalizedEvent === "response.created") {
							latestResponse = payload?.response ?? payload;
							ensureMessageStart(latestResponse);
							continue;
						}
						if (normalizedEvent === "response.output_text.delta" && typeof payload?.delta === "string") {
							const block = ensureBlock(aliasesFor({
								itemId: payload?.item_id,
								outputIndex: payload?.output_index ?? 0,
							}), "text");
							emit(controller, "content_block_delta", {
								type: "content_block_delta",
								index: block.index,
								delta: { type: "text_delta", text: payload.delta },
							});
							block.emittedContent = true;
							continue;
						}
						if (normalizedEvent === "response.reasoning_text.delta" && typeof payload?.delta === "string") {
							const block = ensureBlock(aliasesFor({
								itemId: payload?.item_id,
								outputIndex: payload?.output_index ?? 0,
							}), "thinking");
							emit(controller, "content_block_delta", {
								type: "content_block_delta",
								index: block.index,
								delta: { type: "thinking_delta", thinking: payload.delta },
							});
							block.emittedContent = true;
							continue;
						}
						if (normalizedEvent === "response.output_item.added") {
							const item = payload?.item;
							const itemType = String(item?.type ?? "").toLowerCase();
							if (itemType === "function_call" || itemType === "tool_call") {
								const toolId = item?.call_id ?? item?.id ?? payload?.item_id;
								ensureBlock(aliasesFor({
									id: item?.id,
									itemId: payload?.item_id,
									callId: item?.call_id,
									outputIndex: payload?.output_index,
								}), "tool_use", { id: toolId, name: item?.name });
							}
							continue;
						}
						if (normalizedEvent === "response.function_call_arguments.delta" && typeof payload?.delta === "string") {
							const toolId = payload?.call_id ?? payload?.item_id ?? payload?.output_index ?? 0;
							const block = ensureBlock(aliasesFor({
								itemId: payload?.item_id,
								callId: payload?.call_id,
								outputIndex: payload?.output_index,
							}), "tool_use", { id: payload?.call_id ?? toolId });
							emit(controller, "content_block_delta", {
								type: "content_block_delta",
								index: block.index,
								delta: { type: "input_json_delta", partial_json: payload.delta },
							});
							block.emittedContent = true;
							continue;
						}
						if (
							normalizedEvent === "response.output_text.done" ||
							normalizedEvent === "response.reasoning_text.done" ||
							normalizedEvent === "response.output_item.done"
						) {
							const item = payload?.item;
							const block = aliasesFor({
								id: item?.id,
								itemId: payload?.item_id,
								callId: item?.call_id ?? payload?.call_id,
								outputIndex: payload?.output_index,
							}).map((alias) => blocksByAlias.get(alias)).find(Boolean);
							if (block) stopBlock(block);
							continue;
						}
						if (normalizedEvent === "response.completed") {
							latestResponse = payload?.response ?? payload;
							finishMessage(latestResponse);
							continue;
						}
						if (!normalizedEvent && payload?.object === "response") {
							latestResponse = payload;
							finishMessage(payload);
						}
					}
				}
			} catch (err) {
				console.error("openai compat responses->anthropic stream transform failed:", err);
			} finally {
				if (messageStarted && !terminalEmitted) {
					finishMessage({ ...latestResponse, status: "incomplete" });
				}
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

export async function bufferStreamToIR(
	res: Response,
	args: ExecutorExecuteArgs,
	route: "responses" | "chat",
	upstreamStartMs: number,
	emptyDoneBehavior?: "length",
): Promise<{ ir: IRChatResponse; usage: any; rawResponse: any; firstByteMs: number | null; totalMs: number }> {
	if (!res.body) {
		throw new Error("openai_stream_missing_body");
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buf = "";
	let finalResponse: any = null;
	let sawDone = false;
	const applyStreamPayload = (payload: any) => {
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
	};

	let firstByteMs: number | null = null;
	let terminalAtMs: number | null = null;
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buf += decoder.decode(value, { stream: true });
		const frames = buf.split(/\r?\n\r?\n/);
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
			if (firstByteMs === null) {
				firstByteMs = Math.max(0, Date.now() - upstreamStartMs);
			}
			applyStreamPayload(payload);
			if (
				payload?.type === "response.completed" ||
				payload?.response?.status === "completed" ||
				payload?.choices?.some?.((choice: any) => choice?.finish_reason != null)
			) {
				terminalAtMs = Date.now();
			}
		}
	}
	buf += decoder.decode();
	const trailing = buf.trim();
	if (trailing.length > 0) {
		const lines = trailing.split("\n");
		let data = "";

		for (const line of lines) {
			const trimmed = line.replace(/\r$/, "");
			if (trimmed.startsWith("data:")) {
				data += trimmed.slice(5).trimStart();
			}
		}

		if (data === "[DONE]") {
			sawDone = true;
		} else if (data) {
			try {
				const payload = JSON.parse(data);
				applyStreamPayload(payload);
			} catch {
				// Fall through to raw JSON parse below when applicable.
			}
		}
	}

	if (!finalResponse) {
		// Some providers ignore stream=true and return a regular JSON response body.
		const fallbackText = trailing;
		if (fallbackText) {
			try {
				const parsed = JSON.parse(fallbackText);
				if (route === "responses" && parsed?.response) {
					finalResponse = parsed.response;
				} else {
					finalResponse = parsed;
				}
			} catch {
				// Keep existing error path below.
			}
		}
	}

	if (!finalResponse) {
		if (route === "chat" && sawDone && emptyDoneBehavior === "length") {
			finalResponse = {
				id: args.requestId,
				object: "chat.completion",
				created: Math.floor(Date.now() / 1000),
				model: args.providerModelSlug ?? args.ir.model,
				choices: [{
					index: 0,
					message: { role: "assistant", content: "" },
					finish_reason: "length",
				}],
			};
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
		: openAIChatToIR(finalResponse, args.requestId, args.ir.model, args.providerId);

	const totalMs = Math.max(0, (terminalAtMs ?? Date.now()) - upstreamStartMs);
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
				...(Array.isArray(message.audios) ? { audios: message.audios } : Array.isArray(previousMessage.audios) ? { audios: previousMessage.audios } : {}),
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

	return response;
}
