// src/routes/v1/data/responses-ws.ts
// Purpose: OpenAI-only websocket endpoint for Responses API sessions.
// Why: Preserve long-lived websocket continuation benefits without changing default HTTP routes.
// How: Authenticates once, opens one upstream OpenAI websocket, and forwards response.create turns sequentially.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { withRuntime, json } from "../../utils";
import { guardAuth, guardContext } from "@pipeline/before/guards";
import { resolveCapabilityFromEndpoint } from "@/lib/config/capabilityToEndpoints";
import { openAICompatUrl, resolveOpenAICompatKey } from "@providers/openai-compatible/config";
import type { PriceCard } from "@pipeline/pricing";
import { calculatePricing } from "@pipeline/after/pricing";
import { shapeUsageForClient } from "@pipeline/usage";
import { recordUsageAndCharge } from "@pipeline/pricing/persist";

const OPENAI_WEBSOCKET_RECOVERABLE_ERRORS = new Set([
	"session_timeout",
	"concurrency_limit_exceeded",
	"websocket_connection_limit_reached",
]);
const OPENAI_WEBSOCKET_MAX_RECONNECTS = 1;

type NormalizedResponseCreate = {
	ok: true;
	gatewayModel: string;
	payload: Record<string, any>;
} | {
	ok: false;
	error: string;
};

type WsState = {
	requestId: string;
	teamId: string;
	apiKeyId: string;
	internal?: boolean;
	closed: boolean;
	inFlight: boolean;
	model: string | null;
	reconnectAttempts: number;
	restartedFromPreviousNotFound: boolean;
	lastResponseCreatePayload: Record<string, any> | null;
	upstreamWs: WebSocket | null;
	upstreamKey: string | null;
	pricingCard: PriceCard | null;
	teamTier: string | null;
	chargedResponseIds: Set<string>;
};

export function normalizeOpenAIWsResponseCreateEvent(raw: unknown): NormalizedResponseCreate {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return { ok: false, error: "payload must be a JSON object" };
	}
	const payload = { ...(raw as Record<string, any>) };
	if (payload.type !== "response.create") {
		return { ok: false, error: "only type=response.create is supported" };
	}
	if (typeof payload.model !== "string" || !payload.model.trim()) {
		return { ok: false, error: "model is required" };
	}
	const modelRaw = payload.model.trim();
	if (modelRaw.includes("/") && !modelRaw.startsWith("openai/")) {
		return { ok: false, error: "only OpenAI models are supported on this endpoint" };
	}
	const upstreamModel = modelRaw.startsWith("openai/") ? modelRaw.slice("openai/".length) : modelRaw;
	if (!upstreamModel) {
		return { ok: false, error: "invalid OpenAI model" };
	}
	payload.model = upstreamModel;
	payload.store = false;
	delete payload.stream;
	delete payload.stream_options;
	delete payload.background;
	return {
		ok: true,
		gatewayModel: `openai/${upstreamModel}`,
		payload,
	};
}

export function resolveWebSocketErrorCode(payload: any): string | null {
	if (!payload || typeof payload !== "object") return null;
	if (typeof payload.code === "string") return payload.code;
	if (typeof payload.error?.code === "string") return payload.error.code;
	return null;
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

function sendSocketJson(socket: WebSocket, payload: Record<string, any>) {
	try {
		socket.send(JSON.stringify(payload));
	} catch {
		// Ignore send failures; socket lifecycle handlers will close.
	}
}

async function resolveOpenAIGatewayKey(state: WsState, model: string): Promise<{
	ok: true;
	key: string;
	pricingCard: PriceCard;
	teamTier: string | null;
} | {
	ok: false;
	errorResponse: Response;
}> {
	const capability = resolveCapabilityFromEndpoint("responses");
	const ctx = await guardContext({
		teamId: state.teamId,
		apiKeyId: state.apiKeyId,
		endpoint: "responses",
		capability,
		model,
		requestId: state.requestId,
		internal: state.internal,
	});
	if (!ctx.ok) {
		return { ok: false, errorResponse: ctx.response };
	}
	const openAICandidate = ctx.value.providers.find((provider) => provider.providerId === "openai");
	if (!openAICandidate) {
		return {
			ok: false,
			errorResponse: json({
				error: {
					type: "invalid_request_error",
					code: "openai_provider_unavailable",
					message: "Model is not routable to OpenAI on /v1/responses/ws.",
				},
			}, 400),
		};
	}
	if (!openAICandidate.pricingCard) {
		return {
			ok: false,
			errorResponse: json({
				error: {
					type: "invalid_request_error",
					code: "pricing_unavailable",
					message: "Pricing is unavailable for this OpenAI model on /v1/responses/ws.",
				},
			}, 503),
		};
	}
	const keyInfo = resolveOpenAICompatKey({
		providerId: "openai",
		byokMeta: openAICandidate.byokMeta,
	} as any);
	return {
		ok: true,
		key: keyInfo.key,
		pricingCard: openAICandidate.pricingCard,
		teamTier: ctx.value.context?.teamEnrichment?.tier ?? null,
	};
}

type CompletedResponseUsage = {
	responseId: string | null;
	usage: Record<string, any> | null;
};

export function extractCompletedResponseUsage(payload: any): CompletedResponseUsage {
	if (!payload || typeof payload !== "object") {
		return { responseId: null, usage: null };
	}
	if (payload.type !== "response.completed") {
		return { responseId: null, usage: null };
	}
	const response = payload.response;
	if (!response || typeof response !== "object") {
		return { responseId: null, usage: null };
	}
	const responseId = typeof response.id === "string" && response.id.trim()
		? response.id
		: null;
	const usageCandidate = response.usage ?? payload.usage;
	const usage = usageCandidate && typeof usageCandidate === "object" && !Array.isArray(usageCandidate)
		? usageCandidate as Record<string, any>
		: null;
	return { responseId, usage };
}

async function maybeChargeCompletedResponse(state: WsState, payload: any): Promise<void> {
	const { responseId, usage } = extractCompletedResponseUsage(payload);
	if (!usage) return;
	if (!state.pricingCard) return;
	if (responseId && state.chargedResponseIds.has(responseId)) return;

	const shapedUsage = shapeUsageForClient(usage, {
		endpoint: "responses",
		body: state.lastResponseCreatePayload ?? undefined,
	});
	const { totalNanos } = calculatePricing(
		shapedUsage,
		state.pricingCard,
		state.lastResponseCreatePayload ?? {},
		state.teamTier,
	);
	if (!Number.isFinite(totalNanos) || totalNanos <= 0) {
		if (responseId) state.chargedResponseIds.add(responseId);
		return;
	}

	try {
		await recordUsageAndCharge({
			requestId: responseId ?? state.requestId,
			teamId: state.teamId,
			cost_nanos: Math.round(totalNanos),
		});
		if (responseId) state.chargedResponseIds.add(responseId);
	} catch (error) {
		console.error("[responses-ws] billing failed", {
			requestId: state.requestId,
			responseId,
			teamId: state.teamId,
			totalNanos,
			error,
		});
	}
}

async function connectUpstreamOpenAIWebSocket(key: string): Promise<{
	ok: true;
	ws: WebSocket;
} | {
	ok: false;
	response: Response;
}> {
	for (let attempt = 0; attempt <= OPENAI_WEBSOCKET_MAX_RECONNECTS; attempt += 1) {
		const handshake = await fetch(openAICompatUrl("openai", "/responses"), {
			headers: {
				Authorization: `Bearer ${key}`,
				Upgrade: "websocket",
			},
		});
		const ws = (handshake as Response & { webSocket?: WebSocket }).webSocket;
		if (handshake.status === 101 && ws) {
			ws.accept();
			return { ok: true, ws };
		}
		const retryable = handshake.status >= 500;
		const hasAttemptsLeft = attempt < OPENAI_WEBSOCKET_MAX_RECONNECTS;
		if (!retryable || !hasAttemptsLeft) {
			return { ok: false, response: handshake };
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	return { ok: false, response: new Response(null, { status: 500 }) };
}

const responsesWsHandler = async (req: Request): Promise<Response> => {
	if ((req.headers.get("upgrade") || "").toLowerCase() !== "websocket") {
		return json({
			error: {
				type: "invalid_request_error",
				code: "websocket_upgrade_required",
				message: "Use WebSocket upgrade for /v1/responses/ws.",
			},
		}, 426);
	}

	const auth = await guardAuth(req);
	if (!auth.ok) return auth.response;
	const state: WsState = {
		requestId: auth.value.requestId,
		teamId: auth.value.teamId,
		apiKeyId: auth.value.apiKeyId,
		internal: auth.value.internal,
		closed: false,
		inFlight: false,
		model: null,
		reconnectAttempts: 0,
		restartedFromPreviousNotFound: false,
		lastResponseCreatePayload: null,
		upstreamWs: null,
		upstreamKey: null,
		pricingCard: null,
		teamTier: null,
		chargedResponseIds: new Set<string>(),
	};

	const pair = new WebSocketPair();
	const clientWs = pair[0];
	const gatewayWs = pair[1];
	gatewayWs.accept();

	const closeGatewaySocket = (code = 1000, reason = "closed") => {
		if (state.closed) return;
		state.closed = true;
		try {
			gatewayWs.close(code, reason);
		} catch {
			// no-op
		}
		try {
			state.upstreamWs?.close(code, reason);
		} catch {
			// no-op
		}
		state.upstreamWs = null;
	};

	const attachUpstreamSocket = (upstreamWs: WebSocket) => {
		upstreamWs.addEventListener("message", (event: MessageEvent) => {
			void (async () => {
				if (state.closed) return;
				if (upstreamWs !== state.upstreamWs) return;
				const text = await decodeWebSocketMessageData(event.data);
				if (!text) return;
				try {
					gatewayWs.send(text);
				} catch {
					closeGatewaySocket(1011, "gateway_send_failed");
					return;
				}

				let payload: any;
				try {
					payload = JSON.parse(text);
				} catch {
					return;
				}
				const type = typeof payload?.type === "string" ? payload.type : "";
				if (type === "response.completed") {
					void maybeChargeCompletedResponse(state, payload);
				}
				if (type === "response.completed" || type === "response.failed") {
					state.inFlight = false;
					state.reconnectAttempts = 0;
					state.restartedFromPreviousNotFound = false;
					return;
				}
				if (type !== "error") {
					return;
				}

				const errorCode = resolveWebSocketErrorCode(payload);
				if (
					errorCode === "previous_response_not_found" &&
					state.lastResponseCreatePayload &&
					state.lastResponseCreatePayload.previous_response_id != null &&
					Array.isArray(state.lastResponseCreatePayload.input) &&
					!state.restartedFromPreviousNotFound
				) {
					state.restartedFromPreviousNotFound = true;
					const restartedPayload = {
						...state.lastResponseCreatePayload,
						previous_response_id: null,
						store: false,
					};
					state.lastResponseCreatePayload = restartedPayload;
					try {
						upstreamWs.send(JSON.stringify(restartedPayload));
						return;
					} catch {
						// Fall through to reconnect path below.
					}
				}

				const canReconnect =
					typeof errorCode === "string" &&
					OPENAI_WEBSOCKET_RECOVERABLE_ERRORS.has(errorCode) &&
					state.reconnectAttempts < OPENAI_WEBSOCKET_MAX_RECONNECTS &&
					Boolean(state.upstreamKey) &&
					Boolean(state.lastResponseCreatePayload);

				if (canReconnect) {
					state.reconnectAttempts += 1;
					const reconnect = await connectUpstreamOpenAIWebSocket(state.upstreamKey as string);
					if (reconnect.ok) {
						const previous = state.upstreamWs;
						state.upstreamWs = reconnect.ws;
						attachUpstreamSocket(reconnect.ws);
						try {
							reconnect.ws.send(JSON.stringify(state.lastResponseCreatePayload));
							try {
								previous?.close(1000, "reconnecting");
							} catch {
								// no-op
							}
							return;
						} catch {
							state.inFlight = false;
							sendSocketJson(gatewayWs, {
								type: "error",
								status: 500,
								error: {
									type: "gateway_error",
									code: "upstream_reconnect_send_failed",
									message: "Failed to resend request after websocket reconnect.",
								},
							});
							closeGatewaySocket(1011, "upstream_reconnect_send_failed");
							return;
						}
					}
				}

				state.inFlight = false;
			})();
		});

		upstreamWs.addEventListener("close", (event: CloseEvent) => {
			void (async () => {
				if (upstreamWs !== state.upstreamWs) return;
				const hadInFlight = state.inFlight;
				state.inFlight = false;
				state.upstreamWs = null;
				if (state.closed) return;

				const canReconnect =
					hadInFlight &&
					state.reconnectAttempts < OPENAI_WEBSOCKET_MAX_RECONNECTS &&
					Boolean(state.upstreamKey) &&
					Boolean(state.lastResponseCreatePayload);

				if (canReconnect) {
					state.reconnectAttempts += 1;
					const reconnect = await connectUpstreamOpenAIWebSocket(state.upstreamKey as string);
					if (reconnect.ok) {
						state.upstreamWs = reconnect.ws;
						attachUpstreamSocket(reconnect.ws);
						try {
							reconnect.ws.send(JSON.stringify(state.lastResponseCreatePayload));
							return;
						} catch {
							// fall through and emit a deterministic error below
						}
					}
				}

				if (hadInFlight) {
					sendSocketJson(gatewayWs, {
						type: "error",
						status: 502,
						error: {
							type: "gateway_error",
							code: "upstream_websocket_closed",
							message: `Upstream websocket closed unexpectedly (${event.code || 1006}).`,
						},
					});
				}
			})();
		});

		upstreamWs.addEventListener("error", () => {
			if (upstreamWs !== state.upstreamWs) return;
			state.inFlight = false;
			sendSocketJson(gatewayWs, {
				type: "error",
				status: 502,
				error: {
					type: "gateway_error",
					code: "upstream_websocket_error",
					message: "Upstream websocket errored.",
				},
			});
		});
	};

	const ensureUpstreamSocket = async (model: string): Promise<boolean> => {
		if (state.upstreamWs) return true;
		const keyResolution = await resolveOpenAIGatewayKey(state, model);
		if (!keyResolution.ok) {
			let detail = "OpenAI routing unavailable";
			try {
				detail = (await keyResolution.errorResponse.clone().text()).slice(0, 500) || detail;
			} catch {
				// no-op
			}
			sendSocketJson(gatewayWs, {
				type: "error",
				status: keyResolution.errorResponse.status || 400,
				error: {
					type: "invalid_request_error",
					code: "openai_routing_failed",
					message: detail,
				},
			});
			return false;
		}
		state.upstreamKey = keyResolution.key;
		state.pricingCard = keyResolution.pricingCard;
		state.teamTier = keyResolution.teamTier;
		const upstream = await connectUpstreamOpenAIWebSocket(keyResolution.key);
		if (!upstream.ok) {
			let detail = "";
			try {
				detail = (await upstream.response.clone().text()).slice(0, 500);
			} catch {
				// no-op
			}
			sendSocketJson(gatewayWs, {
				type: "error",
				status: upstream.response.status || 502,
				error: {
					type: "gateway_error",
					code: "upstream_websocket_handshake_failed",
					message: detail || "OpenAI websocket handshake failed.",
				},
			});
			return false;
		}
		state.upstreamWs = upstream.ws;
		attachUpstreamSocket(upstream.ws);
		return true;
	};

	gatewayWs.addEventListener("message", (event: MessageEvent) => {
		void (async () => {
			if (state.closed) return;
			const text = await decodeWebSocketMessageData(event.data);
			if (!text) {
				sendSocketJson(gatewayWs, {
					type: "error",
					status: 400,
					error: {
						type: "invalid_request_error",
						code: "invalid_message_payload",
						message: "Expected JSON text message.",
					},
				});
				return;
			}

			let rawPayload: unknown;
			try {
				rawPayload = JSON.parse(text);
			} catch {
				sendSocketJson(gatewayWs, {
					type: "error",
					status: 400,
					error: {
						type: "invalid_request_error",
						code: "invalid_json",
						message: "Message must be valid JSON.",
					},
				});
				return;
			}

			const normalized = normalizeOpenAIWsResponseCreateEvent(rawPayload);
			if (!normalized.ok) {
				sendSocketJson(gatewayWs, {
					type: "error",
					status: 400,
					error: {
						type: "invalid_request_error",
						code: "invalid_response_create",
						message: normalized.error,
					},
				});
				return;
			}

			if (state.inFlight) {
				sendSocketJson(gatewayWs, {
					type: "error",
					status: 409,
					error: {
						type: "invalid_request_error",
						code: "response_already_in_flight",
						message: "Only one in-flight response is allowed per websocket connection.",
					},
				});
				return;
			}

			if (state.model && state.model !== normalized.gatewayModel) {
				sendSocketJson(gatewayWs, {
					type: "error",
					status: 400,
					error: {
						type: "invalid_request_error",
						code: "model_mismatch",
						message: `Model must stay constant per websocket session (expected ${state.model}).`,
					},
				});
				return;
			}

			if (!state.model) {
				state.model = normalized.gatewayModel;
			}

			const ready = await ensureUpstreamSocket(normalized.gatewayModel);
			if (!ready || !state.upstreamWs) return;

			state.inFlight = true;
			state.reconnectAttempts = 0;
			state.restartedFromPreviousNotFound = false;
			state.lastResponseCreatePayload = normalized.payload;

			try {
				state.upstreamWs.send(JSON.stringify(normalized.payload));
			} catch {
				state.inFlight = false;
				sendSocketJson(gatewayWs, {
					type: "error",
					status: 502,
					error: {
						type: "gateway_error",
						code: "upstream_send_failed",
						message: "Failed sending request to upstream websocket.",
					},
				});
				closeGatewaySocket(1011, "upstream_send_failed");
			}
		})();
	});

	gatewayWs.addEventListener("close", () => {
		closeGatewaySocket(1000, "client_closed");
	});
	gatewayWs.addEventListener("error", () => {
		closeGatewaySocket(1011, "client_error");
	});

	return new Response(null, {
		status: 101,
		webSocket: clientWs,
	} as ResponseInit);
};

export const responsesWsRoutes = new Hono<Env>();

responsesWsRoutes.get("/", withRuntime(responsesWsHandler));
