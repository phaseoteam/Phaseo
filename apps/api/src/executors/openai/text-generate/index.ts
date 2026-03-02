// Purpose: Executor for openai / text-generate.
// Why: Isolates provider-specific behavior per capability.
// How: Transforms IR to OpenAI-compatible APIs and normalizes usage.

import type { IRChatRequest, IRReasoning } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, Bill, ProviderExecutor } from "@executors/types";
import { computeBill } from "@pipeline/pricing/engine";
import { normalizeTextUsageForPricing } from "@executors/_shared/usage/text";
import { irToOpenAIResponses, openAIResponsesToIR } from "@executors/_shared/text-generate/openai-compat/transform";
import { irToOpenAIChat, openAIChatToIR } from "@executors/_shared/text-generate/openai-compat/transform-chat";
import { irToOpenAICompletions, openAICompletionsToIR } from "@executors/_shared/text-generate/openai-compat/transform-legacy";
import { bufferStreamToIR, resolveStreamForProtocol } from "@executors/_shared/text-generate/openai-compat";
import { sanitizeOpenAICompatRequest } from "@executors/_shared/text-generate/openai-compat/provider-policy";
import {
	openAICompatHeaders,
	openAICompatUrl,
	resolveOpenAICompatKey,
	resolveOpenAICompatRoute,
} from "@providers/openai-compatible/config";

type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

const REASONING_EFFORT_ORDER: ReasoningEffort[] = [
	"none",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
];

const REASONING_EFFORT_TO_PERCENT: Record<ReasoningEffort, number> = {
	none: 0.0,
	minimal: 0.15,
	low: 0.30,
	medium: 0.50,
	high: 0.75,
	xhigh: 0.90,
	max: 1.0,
};

const OPENAI_REASONING_EFFORT_SUPPORT: Record<string, Set<ReasoningEffort>> = {
	"gpt-5": new Set(["minimal", "low", "medium", "high"]),
	"gpt-5-pro": new Set(["minimal", "low", "medium", "high"]),
	"gpt-5-pro-preview": new Set(["minimal", "low", "medium", "high"]),
	"gpt-5.1": new Set(["none", "minimal", "low", "medium", "high"]),
	"gpt-5.1-codex-max": new Set(["none", "minimal", "low", "medium", "high", "xhigh"]),
	"gpt-5.2": new Set(["none", "minimal", "low", "medium", "high", "xhigh"]),
	"gpt-5.2-codex": new Set(["none", "minimal", "low", "medium", "high", "xhigh"]),
	"gpt-5.3": new Set(["none", "minimal", "low", "medium", "high", "xhigh"]),
	"gpt-5.3-codex": new Set(["none", "minimal", "low", "medium", "high", "xhigh"]),
	"o1": new Set(["low", "medium", "high"]),
	"o1-preview": new Set(["low", "medium", "high"]),
	"o1-mini": new Set(["low", "medium", "high"]),
	"o3-mini": new Set(["low", "medium", "high"]),
};

const OPENAI_WEBSOCKET_RECOVERABLE_ERRORS = new Set([
	"session_timeout",
	"concurrency_limit_exceeded",
	"websocket_connection_limit_reached",
]);
const OPENAI_WEBSOCKET_MAX_RECONNECTS = 1;
const OPENAI_WEBSOCKET_HANDSHAKE_MAX_RETRIES = 1;
const OPENAI_INTERNAL_REQUEST_ID_METADATA_KEY = "aistats_request_id";

function buildOpenAIResponsesWebSocketUrl(providerId: string): string {
	// Cloudflare Workers WebSocket fetch upgrade expects https:// URL.
	return openAICompatUrl(providerId, "/responses");
}

function normalizeResponsesRequestForWebSocket(request: Record<string, any>): Record<string, any> {
	const next: Record<string, any> = { ...request };
	// WebSocket mode is realtime by default and rejects these HTTP-oriented flags.
	delete next.stream;
	delete next.stream_options;
	delete next.background;
	// Enforce non-store for ZDR-style behavior in gateway-managed mode.
	next.store = false;
	return next;
}

async function decodeWebSocketMessageData(data: unknown): Promise<string | null> {
	if (typeof data === "string") return data;
	if (data instanceof ArrayBuffer) {
		return new TextDecoder().decode(new Uint8Array(data));
	}
	if (ArrayBuffer.isView(data)) {
		return new TextDecoder().decode(
			new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
		);
	}
	if (typeof Blob !== "undefined" && data instanceof Blob) {
		return await data.text();
	}
	return null;
}

function resolveWebSocketErrorCode(payload: any): string | null {
	if (!payload || typeof payload !== "object") return null;
	if (typeof payload.code === "string") return payload.code;
	if (typeof payload.error?.code === "string") return payload.error.code;
	return null;
}

async function createOpenAIResponsesWebSocketStream(args: {
	executorArgs: ExecutorExecuteArgs;
	providerId: string;
	key: string;
	request: Record<string, any>;
	initialBill: Bill;
}): Promise<{
	ok: true;
	upstream: Response;
	usageFinalizer: () => Promise<Bill | null>;
	mappedRequestBody: string;
} | {
	ok: false;
	upstream: Response;
	mappedRequestBody: string;
}> {
	const wsRequest = normalizeResponsesRequestForWebSocket(args.request);
	const wsEnvelope = {
		type: "response.create",
		...wsRequest,
	};
	const mappedRequestBody = JSON.stringify(wsEnvelope);

	const connectWebSocket = async (): Promise<{
		handshake: Response;
		upstreamId?: string;
		ws?: WebSocket;
	}> => {
		const baseUrl = buildOpenAIResponsesWebSocketUrl(args.providerId);
		for (let attempt = 0; attempt <= OPENAI_WEBSOCKET_HANDSHAKE_MAX_RETRIES; attempt += 1) {
			const handshake = await fetch(baseUrl, {
				headers: {
					Authorization: `Bearer ${args.key}`,
					Upgrade: "websocket",
				},
			});
			const ws = (handshake as Response & { webSocket?: WebSocket }).webSocket;
			if (handshake.status === 101 && ws) {
				ws.accept();
				return {
					handshake,
					upstreamId: handshake.headers.get("x-request-id") || undefined,
					ws,
				};
			}

			const retryable = handshake.status >= 500;
			const hasAttemptsLeft = attempt < OPENAI_WEBSOCKET_HANDSHAKE_MAX_RETRIES;
			if (!retryable || !hasAttemptsLeft) {
				return { handshake };
			}

			await new Promise((resolve) => setTimeout(resolve, 50));
		}

		// Unreachable; loop always returns.
		return { handshake: new Response(null, { status: 500 }) };
	};

	const initialConnection = await connectWebSocket();
	if (!initialConnection.ws) {
		return {
			ok: false,
			upstream: initialConnection.handshake,
			mappedRequestBody,
		};
	}
	let upstreamId = initialConnection.upstreamId;

	let settled = false;
	let finalResponsePayload: any = null;
	let finishReason: string | null = null;
	let reconnectAttempts = 0;
	let activeWs: WebSocket | null = initialConnection.ws;

	let resolveBillPromise: (value: Bill | null) => void = () => { };
	const billPromise = new Promise<Bill | null>((resolve) => {
		resolveBillPromise = resolve;
	});

	const settle = () => {
		if (settled) return;
		settled = true;

		const bill: Bill = {
			...args.initialBill,
			upstream_id:
				(typeof finalResponsePayload?.id === "string" && finalResponsePayload.id) ||
				upstreamId ||
				args.initialBill.upstream_id ||
				null,
			finish_reason: finishReason ?? args.initialBill.finish_reason ?? null,
		};

		const usageMeters = normalizeTextUsageForPricing(finalResponsePayload?.usage);
		if (usageMeters) {
			const priced = computeBill(usageMeters, args.executorArgs.pricingCard);
			bill.cost_cents = priced.pricing.total_cents;
			bill.currency = priced.pricing.currency;
			bill.usage = priced;
		}

		resolveBillPromise(bill);
	};

	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const emitFrame = (payload: any) => {
				if (!payload) return;
				const eventName = typeof payload?.type === "string" ? payload.type : null;
				const encoded = JSON.stringify(payload);
				const frame = eventName
					? `event: ${eventName}\ndata: ${encoded}\n\n`
					: `data: ${encoded}\n\n`;
				try {
					controller.enqueue(encoder.encode(frame));
				} catch {
					// Downstream closed; ignore.
				}
			};

			const closeStream = () => {
				if (!settled) {
					try {
						controller.enqueue(encoder.encode("data: [DONE]\n\n"));
					} catch {
						// Ignore if downstream is already closed.
					}
				}
				try {
					controller.close();
				} catch {
					// Ignore duplicate closes.
				}
				settle();
			};

			const attachSocket = (socket: WebSocket) => {
				socket.addEventListener("message", (event: MessageEvent) => {
					void (async () => {
						if (socket !== activeWs) return;
						const text = await decodeWebSocketMessageData((event as MessageEvent).data);
						if (!text) return;

						let payload: any;
						try {
							payload = JSON.parse(text);
						} catch {
							return;
						}

						emitFrame(payload);

						const type = typeof payload?.type === "string" ? payload.type : "";
						if (type === "response.completed" && payload?.response) {
							finalResponsePayload = payload.response;
							try {
								const ir = openAIResponsesToIR(
									payload.response,
									args.executorArgs.requestId,
									(args.executorArgs.ir as IRChatRequest).model,
									args.executorArgs.providerId,
								);
								finishReason = ir?.choices?.[0]?.finishReason ?? null;
							} catch {
								finishReason = null;
							}
							closeStream();
							try {
								socket.close(1000, "response_completed");
							} catch {
								// no-op
							}
							return;
						}

						if (type === "response.failed") {
							finishReason = "error";
							closeStream();
							try {
								socket.close(1011, "response_failed");
							} catch {
								// no-op
							}
							return;
						}

						if (type === "error") {
							const errorCode = resolveWebSocketErrorCode(payload);
							const canReconnect =
								typeof errorCode === "string" &&
								OPENAI_WEBSOCKET_RECOVERABLE_ERRORS.has(errorCode) &&
								reconnectAttempts < OPENAI_WEBSOCKET_MAX_RECONNECTS;

							if (canReconnect) {
								reconnectAttempts += 1;
								const reconnect = await connectWebSocket();
								if (reconnect.ws) {
									const previous = activeWs;
									activeWs = reconnect.ws;
									if (reconnect.upstreamId) {
										upstreamId = reconnect.upstreamId;
									}
									attachSocket(reconnect.ws);
									try {
										reconnect.ws.send(mappedRequestBody);
									} catch {
										finishReason = "error";
										closeStream();
										try {
											reconnect.ws.close(1011, "reconnect_send_failed");
										} catch {
											// no-op
										}
									}
									try {
										previous?.close(1000, "reconnecting");
									} catch {
										// no-op
									}
									return;
								}
							}

							finishReason = "error";
							closeStream();
							try {
								socket.close(1011, "response_error");
							} catch {
								// no-op
							}
						}
					})();
				});

				socket.addEventListener("close", () => {
					if (socket !== activeWs) return;
					closeStream();
				});

				socket.addEventListener("error", () => {
					if (socket !== activeWs) return;
					finishReason = "error";
					closeStream();
				});
			};

			if (!activeWs) {
				finishReason = "error";
				closeStream();
				return;
			}

			attachSocket(activeWs);
			try {
				activeWs.send(mappedRequestBody);
			} catch {
				finishReason = "error";
				closeStream();
				try {
					activeWs.close(1011, "send_failed");
				} catch {
					// no-op
				}
			}
		},
		cancel() {
			settle();
			try {
				activeWs?.close(1000, "client_cancelled");
			} catch {
				// no-op
			}
		},
	});

	return {
		ok: true,
		upstream: new Response(stream, {
			status: 200,
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-store",
			},
		}),
		usageFinalizer: () => billPromise,
		mappedRequestBody,
	};
}

function normalizeModelName(model?: string | null): string {
	if (!model) return "";
	const value = model.trim();
	if (!value) return "";
	const parts = value.split("/");
	return parts[parts.length - 1] || value;
}

function getSupportedEfforts(model: string): ReasoningEffort[] {
	const normalized = normalizeModelName(model);
	if (normalized in OPENAI_REASONING_EFFORT_SUPPORT) {
		return Array.from(OPENAI_REASONING_EFFORT_SUPPORT[normalized]).sort();
	}
	for (const [modelPrefix, efforts] of Object.entries(OPENAI_REASONING_EFFORT_SUPPORT)) {
		if (normalized.startsWith(`${modelPrefix}-`) || normalized.startsWith(`${modelPrefix}_`)) {
			return Array.from(efforts).sort();
		}
	}
	return ["low", "medium", "high"];
}

function clampEffort(requested: ReasoningEffort, supported: ReasoningEffort[]): ReasoningEffort {
	if (supported.includes(requested)) return requested;
	const supportedOrdered = REASONING_EFFORT_ORDER.filter((effort) => supported.includes(effort));
	if (supportedOrdered.length === 0) return requested;

	const requestedIndex = REASONING_EFFORT_ORDER.indexOf(requested);
	if (requestedIndex <= 0) return supportedOrdered[0];
	if (requestedIndex >= REASONING_EFFORT_ORDER.length - 1) {
		return supportedOrdered[supportedOrdered.length - 1];
	}

	return supportedOrdered.includes("medium")
		? "medium"
		: supportedOrdered[Math.floor(supportedOrdered.length / 2)];
}

function tokensToEffort(tokens: number, maxReasoningTokens: number): ReasoningEffort {
	if (tokens <= 0 || maxReasoningTokens <= 0) return "none";
	const percent = tokens / maxReasoningTokens;
	let closest: ReasoningEffort = "medium";
	let minDiff = Infinity;
	for (const [effort, effortPercent] of Object.entries(REASONING_EFFORT_TO_PERCENT)) {
		const diff = Math.abs(percent - effortPercent);
		if (diff < minDiff) {
			minDiff = diff;
			closest = effort as ReasoningEffort;
		}
	}
	return closest;
}

function normalizeOpenAIReasoning(
	reasoning: IRReasoning | undefined,
	model: string | null | undefined,
	maxReasoningTokens?: number | null,
): IRReasoning | undefined {
	if (!reasoning) return undefined;
	const normalized: IRReasoning = { ...reasoning };
	const maxTokens = typeof maxReasoningTokens === "number" ? maxReasoningTokens : undefined;

	if (normalized.enabled === false) {
		normalized.effort = "none";
		delete normalized.maxTokens;
		delete normalized.enabled;
		return normalized;
	}

	if (!normalized.effort) {
		if (typeof normalized.maxTokens === "number" && maxTokens) {
			normalized.effort = tokensToEffort(normalized.maxTokens, maxTokens);
		} else if (normalized.enabled === true || normalized.maxTokens !== undefined || normalized.summary !== undefined) {
			normalized.effort = "medium";
		}
	}

	if (normalized.effort) {
		const supported = getSupportedEfforts(model ?? "");
		normalized.effort = clampEffort(normalized.effort as ReasoningEffort, supported);
		delete normalized.enabled;
	}

	delete normalized.maxTokens;
	return normalized;
}

function withNormalizedReasoning(
	ir: IRChatRequest,
	modelOverride?: string | null,
	capabilityParams?: Record<string, any> | null,
): IRChatRequest {
	const nextReasoning = normalizeOpenAIReasoning(
		ir.reasoning,
		modelOverride ?? ir.model,
		capabilityParams?.reasoning?.maxReasoningTokens,
	);
	if (nextReasoning === ir.reasoning) return ir;
	const next: IRChatRequest = { ...ir };
	if (nextReasoning) {
		next.reasoning = nextReasoning;
	} else {
		delete next.reasoning;
	}
	return next;
}

function withOpenAIRequestMetadata(
	ir: IRChatRequest,
	providerId: string,
	requestId: string,
): IRChatRequest {
	if (providerId !== "openai") return ir;
	const explicitSafetyIdentifier = typeof ir.safetyIdentifier === "string" && ir.safetyIdentifier.trim().length > 0
		? ir.safetyIdentifier.trim()
		: undefined;
	const userSafetyIdentifier = typeof ir.userId === "string" && ir.userId.trim().length > 0
		? ir.userId.trim()
		: undefined;
	const safetyIdentifier = explicitSafetyIdentifier ?? userSafetyIdentifier ?? requestId;
	const metadata = { ...(ir.metadata ?? {}) };
	if (typeof metadata[OPENAI_INTERNAL_REQUEST_ID_METADATA_KEY] !== "string" || metadata[OPENAI_INTERNAL_REQUEST_ID_METADATA_KEY].length === 0) {
		metadata[OPENAI_INTERNAL_REQUEST_ID_METADATA_KEY] = requestId;
	}
	return {
		...ir,
		metadata,
		safetyIdentifier,
	};
}

function openAIRequestHeaders(providerId: string, requestId: string): Record<string, string> | undefined {
	if (providerId !== "openai") return undefined;
	return {
		"Idempotency-Key": requestId,
	};
}

function cherryPickIRParams(
	ir: IRChatRequest,
	capabilityParams?: Record<string, any> | null,
): IRChatRequest {
	const rawAllowlist =
		capabilityParams?.request?.allowlist ??
		capabilityParams?.request?.params ??
		capabilityParams?.params;
	let allowlist: string[] = [];
	if (Array.isArray(rawAllowlist)) {
		allowlist = rawAllowlist.filter((entry) => typeof entry === "string");
	} else if (rawAllowlist && typeof rawAllowlist === "object") {
		for (const [key, value] of Object.entries(rawAllowlist)) {
			if (key === "reasoning" && value && typeof value === "object" && !Array.isArray(value)) {
				for (const subKey of Object.keys(value)) {
					allowlist.push(`reasoning.${subKey}`);
				}
				continue;
			}
			allowlist.push(key);
		}
	}
	if (allowlist.length === 0) return ir;

	const next: IRChatRequest = {
		messages: ir.messages,
		model: ir.model,
		stream: ir.stream,
	};

	let reasoning: IRReasoning | undefined = undefined;
	let responseFormat: IRChatRequest["responseFormat"] | undefined = undefined;

	for (const entry of allowlist) {
		if (typeof entry !== "string") continue;
		if (entry.includes(".")) {
			const [root, leaf] = entry.split(".", 2);
			if (root === "reasoning") {
				reasoning ??= {};
				if (leaf === "effort") reasoning.effort = ir.reasoning?.effort;
				if (leaf === "summary") reasoning.summary = ir.reasoning?.summary;
				if (leaf === "enabled") reasoning.enabled = ir.reasoning?.enabled;
				if (leaf === "maxTokens" || leaf === "max_tokens") reasoning.maxTokens = ir.reasoning?.maxTokens;
			}
			if (root === "responseFormat") {
				responseFormat = ir.responseFormat;
			}
			continue;
		}
		const mappedKey = (() => {
			switch (entry) {
				case "max_tokens":
				case "max_output_tokens":
					return "maxTokens";
				case "temperature":
					return "temperature";
				case "top_p":
					return "topP";
				case "top_k":
					return "topK";
				case "seed":
					return "seed";
				case "stop":
					return "stop";
				case "logit_bias":
					return "logitBias";
				case "logprobs":
					return "logprobs";
				case "top_logprobs":
					return "topLogprobs";
				case "frequency_penalty":
					return "frequencyPenalty";
				case "presence_penalty":
					return "presencePenalty";
				case "tools":
					return "tools";
				case "tool_choice":
					return "toolChoice";
				case "parallel_tool_calls":
					return "parallelToolCalls";
				case "max_tool_calls":
					return "maxToolCalls";
				case "response_format":
					return "responseFormat";
				case "background":
					return "background";
				case "service_tier":
					return "serviceTier";
				case "prompt_cache_key":
					return "promptCacheKey";
				case "safety_identifier":
					return "safetyIdentifier";
				case "user":
				case "user_id":
					return "userId";
				default:
					return entry;
			}
		})();

		if (mappedKey in ir) {
			(next as any)[mappedKey] = (ir as any)[mappedKey];
		}
	}

	if (reasoning && Object.keys(reasoning).length > 0) {
		next.reasoning = reasoning;
	}
	if (responseFormat) {
		next.responseFormat = responseFormat;
	}

	const openAIContextManagement = (ir.vendor as any)?.openai?.context_management;
	if (openAIContextManagement && typeof openAIContextManagement === "object") {
		(next as any).vendor = {
			...((next as any).vendor ?? {}),
			openai: {
				...(((next as any).vendor?.openai as Record<string, any> | undefined) ?? {}),
				context_management: openAIContextManagement,
			},
		};
	}

	if (ir.reasoning && !next.reasoning) {
		next.reasoning = ir.reasoning;
	}

	return next;
}

async function executeOpenAIProvider(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const upstreamStartMs = args.meta.upstreamStartMs ?? Date.now();
	const keyInfo = resolveOpenAICompatKey({
		providerId: args.providerId,
		byokMeta: args.byokMeta,
	} as any);

	const modelForRouting = args.providerModelSlug ?? (args.ir as IRChatRequest).model;
	const irWithRequestMetadata = withOpenAIRequestMetadata(
		args.ir as IRChatRequest,
		args.providerId,
		args.requestId,
	);
	const route = args.providerId === "openai"
		? "responses"
		: resolveOpenAICompatRoute(args.providerId, modelForRouting);
	const endpoint = route === "responses" ? "/responses" : (route === "legacy_completions" ? "/completions" : "/chat/completions");

	const requestPayload = route === "responses"
		? irToOpenAIResponses(irWithRequestMetadata, modelForRouting, args.providerId, args.capabilityParams)
		: (route === "legacy_completions"
			? irToOpenAICompletions(irWithRequestMetadata, modelForRouting)
			: irToOpenAIChat(irWithRequestMetadata, modelForRouting, args.providerId, args.capabilityParams));

	if (irWithRequestMetadata.stream) {
		requestPayload.stream = true;
		if (route === "chat") {
			requestPayload.stream_options = {
				...(requestPayload.stream_options ?? {}),
				include_usage: true,
			};
		}
	}
	const sanitized = sanitizeOpenAICompatRequest({
		providerId: args.providerId,
		route,
		model: modelForRouting,
		request: requestPayload,
	});
	const requestBody = JSON.stringify(sanitized.request);
	const captureRequest = Boolean(
		args.meta.returnUpstreamRequest ||
		args.meta.echoUpstreamRequest ||
		args.meta.debug?.return_upstream_request ||
		args.meta.debug?.trace,
	);
	const mappedRequest = captureRequest ? requestBody : undefined;
	try {
		(args.ir as any).rawRequest = sanitized.request;
	} catch {
		// ignore if readonly
	}

	const res = await fetch(openAICompatUrl(args.providerId, endpoint), {
		method: "POST",
		headers: openAICompatHeaders(
			args.providerId,
			keyInfo.key,
			openAIRequestHeaders(args.providerId, args.requestId),
		),
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

	if (irWithRequestMetadata.stream) {
		const stream = resolveStreamForProtocol(res, args, route);
		return {
			kind: "stream",
			stream,
			usageFinalizer: async () => null,
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
	}

	const json = await res.json().catch(() => null);
	const ir = json
		? (route === "responses"
			? openAIResponsesToIR(json, args.requestId, irWithRequestMetadata.model, args.providerId)
			: (route === "legacy_completions"
				? openAICompletionsToIR(json, args.requestId, irWithRequestMetadata.model, args.providerId)
				: openAIChatToIR(json, args.requestId, irWithRequestMetadata.model, args.providerId)))
		: undefined;

	if (ir) {
		(ir as any).rawResponse = json;
	}

	const usageMeters = normalizeTextUsageForPricing(json?.usage);
	if (usageMeters) {
		const priced = computeBill(usageMeters, args.pricingCard);
		bill.cost_cents = priced.pricing.total_cents;
		bill.currency = priced.pricing.currency;
		bill.usage = priced;
	}

	const totalMs = Math.max(0, Date.now() - upstreamStartMs);

	return {
		kind: "completed",
		ir,
		bill,
		upstream: res,
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
		mappedRequest,
		rawResponse: json ?? null,
		timing: {
			latencyMs: totalMs,
			generationMs: totalMs,
		},
	};
}

export const executor: ProviderExecutor = async (execArgs: ExecutorExecuteArgs) => {
	const normalized = withNormalizedReasoning(
		execArgs.ir as IRChatRequest,
		execArgs.providerModelSlug ?? (execArgs.ir as IRChatRequest).model,
		execArgs.capabilityParams,
	);
	const processed = cherryPickIRParams(normalized, execArgs.capabilityParams);
	return executeOpenAIProvider({ ...execArgs, ir: processed });
};
