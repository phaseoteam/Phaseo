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
	shouldFallbackToChatFromError,
} from "./retry-policy";

const RESPONSES_CHAT_FALLBACK_BLOCKLIST = new Set<string>(["alibaba-cloud"]);
const ALIBABA_COMPAT_PROVIDER_IDS = new Set<string>(["alibaba-cloud", "alibaba", "qwen"]);
const OPENAI_COMPAT_MAX_ADAPTIVE_RETRIES = 1;
const OPENAI_COMPAT_TRANSIENT_RETRY_PROVIDERS = new Set<string>([
	"baseten",
	"groq",
	"fireworks",
	"weights-and-biases",
	"venice",
	"akashml",
	"ionrouter",
	"gmicloud",
	"nebius-token-factory",
	"nebius-token-factory-eu-north-1",
	"nebius-token-factory-us-central-1",
]);
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
	let route: "responses" | "chat" = resolvePreferredRoute(args, defaultRoute);

	const endpointForRoute = (targetRoute: "responses" | "chat") =>
		targetRoute === "responses" ? "/responses" : "/chat/completions";

	const buildPayloadForRoute = (targetRoute: "responses" | "chat"): Record<string, any> => {
		const requestPayload = targetRoute === "responses"
			? irToOpenAIResponses(args.ir, args.providerModelSlug, args.providerId, args.capabilityParams)
			: irToOpenAIChat(args.ir, args.providerModelSlug, args.providerId, args.capabilityParams);

		const payload: Record<string, any> = {
			...requestPayload,
			stream: true,
		};
		if (targetRoute === "chat") {
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
		const response = await fetch(openAICompatUrl(args.providerId, endpointForRoute(targetRoute)), {
			method: "POST",
			headers: openAICompatHeaders(args.providerId, keyInfo.key, upstreamTestHeaders(args.meta)),
			body: requestBody,
		});

		return {
			response,
			requestBody,
			request: sanitized.request,
			requestBuildMs: Math.max(0, fetchStartMs - requestBuildStartMs),
			upstreamHeadersMs: Math.max(0, Date.now() - fetchStartMs),
		};
	};

	const maxTransientRetries = OPENAI_COMPAT_TRANSIENT_RETRY_PROVIDERS.has(args.providerId)
		? OPENAI_COMPAT_MAX_TRANSIENT_RETRIES
		: 0;

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
	let upstreamHeadersMs = attempt.upstreamHeadersMs;
	let transientRetryDelayMs = attempt.transientRetryDelayMs;

	let adaptiveRetryCount = 0;
	while (!res.ok && adaptiveRetryCount < OPENAI_COMPAT_MAX_ADAPTIVE_RETRIES) {
		const { errorText, errorPayload } = await readErrorPayload(res);

		// Some providers advertise OpenAI compatibility but don't implement /responses yet.
		// Fallback once to /chat/completions when /responses endpoint is unavailable.
		if (
			shouldFallbackToChatFromError({ route, status: res.status, errorText }) &&
			route === "responses" &&
			!RESPONSES_CHAT_FALLBACK_BLOCKLIST.has(args.providerId)
		) {
			route = "chat";
			attempt = await sendPayloadWithRetry(route, buildPayloadForRoute(route));
			res = attempt.response;
			requestBody = attempt.requestBody;
			mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest) ? requestBody : undefined;
			requestBuildMs = attempt.requestBuildMs;
			upstreamHeadersMs = attempt.upstreamHeadersMs;
			transientRetryDelayMs = attempt.transientRetryDelayMs;
			adaptiveRetryCount += 1;
			continue;
		}

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
			timing: {
				requestBuildMs,
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
				upstreamHeadersMs,
				transientRetryDelayMs,
			},
		};
	} else {
		// Buffer the stream and return complete response
		const { ir, usage, rawResponse, firstByteMs, totalMs } = await bufferStreamToIR(res, args, route, upstreamStartMs);
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
				latencyMs: firstByteMs ?? totalMs,
				generationMs: firstByteMs === null ? 0 : Math.max(0, totalMs - firstByteMs),
				requestBuildMs,
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

function resolvePreferredRoute(
	args: ExecutorExecuteArgs,
	defaultRoute: "responses" | "chat",
): "responses" | "chat" {
	// Keep Alibaba/Qwen upstream routing simple and stable: always use chat completions.
	if (isAlibabaCompatProvider(args.providerId)) return "chat";

	// SpaceXAI compatibility currently has stricter /responses validation for structured output.
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

function isAlibabaCompatProvider(providerId: string): boolean {
	return ALIBABA_COMPAT_PROVIDER_IDS.has(providerId);
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

export async function bufferStreamToIR(
	res: Response,
	args: ExecutorExecuteArgs,
	route: "responses" | "chat",
	upstreamStartMs: number,
): Promise<{ ir: IRChatResponse; usage: any; rawResponse: any; firstByteMs: number | null; totalMs: number }> {
	if (!res.body) {
		throw new Error("openai_stream_missing_body");
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buf = "";
	let finalResponse: any = null;
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
			applyStreamPayload(payload);
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

		if (data && data !== "[DONE]") {
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
		console.error(`Missing final response for provider ${args.providerId}, route: ${route}, buf length: ${buf.length}`);
		throw new Error("openai_stream_missing_response");
	}

	const isChatLikeResponse = isChatCompletionResponse(finalResponse);

	// Convert to IR using appropriate transformer
	const ir = route === "responses"
		? (isChatLikeResponse ? openAIChatToIR(finalResponse, args.requestId, args.ir.model, args.providerId) : openAIResponsesToIR(finalResponse, args.requestId, args.ir.model, args.providerId))
		: openAIChatToIR(finalResponse, args.requestId, args.ir.model, args.providerId);

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


