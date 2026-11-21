import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveSessionsRoutes, realtimeSessionsRoutes } from "./realtime-sessions";
import { LIVE_VOICES } from "@core/live-settings";

const mocks = vi.hoisted(() => ({ auth: {} as any, create: vi.fn(), context: vi.fn(), policy: null as any, cache: undefined as any,
	openGates: new Set(["chat", "api", "webrtc"]), relayFetch: vi.fn(), row: null as any }));
vi.mock("../../utils", () => ({ withRuntime: (handler: any) => (c: any) => handler(c.req.raw) }));
vi.mock("@/runtime/env", () => ({ getBindings: () => ({ CHAT_ROUTE_KEY_SEED: "test-seed", GATEWAY_CACHE: mocks.cache, GATEWAY_CONTROL_SECRET: "control",
	REALTIME_RELAY: { idFromName: (name: string) => name, get: (id: string) => ({ fetch: (request: Request) => mocks.relayFetch(id, request) }) } }) }));
vi.mock("@pipeline/before/guards", () => ({ guardAuth: async () => ({ ok: true, value: mocks.auth }),
	guardJson: async (req: Request) => ({ ok: true, value: await req.json() }), guardContext: mocks.context }));
vi.mock("@core/feature-flags", () => ({
	isRealtimeVoiceAccessEnabled: async (_auth: unknown, _bindings: unknown, source: "api" | "chat" = "api") => mocks.openGates.has(source),
	getRealtimeVoiceFeatureGateName: (_bindings: unknown, source: "api" | "chat" = "api") => source === "chat" ? "chat_realtime_voice" : "gateway_realtime_voice",
	isLiveWebRTCAccessEnabled: async () => mocks.openGates.has("webrtc"),
	getLiveWebRTCFeatureGateName: () => "live_webrtc",
}));
vi.mock("@pipeline/before/workspacePolicy", async (original) => ({
	...await original<typeof import("@pipeline/before/workspacePolicy")>(), fetchWorkspacePolicy: async () => mocks.policy,
}));
vi.mock("@core/realtime-sessions", async (original) => ({
	...await original<typeof import("@core/realtime-sessions")>(), createRealtimeSession: mocks.create,
	publicRealtimeSessionPayload: (created: unknown) => created,
	getRealtimeSessionForInternal: async () => { if (!mocks.row) throw new Error("realtime_session_not_found"); return mocks.row; },
}));

const userId = "11111111-1111-4111-8111-111111111111";
const SESSION = "rt_01jabcdefghjkmnpqrstvwxyz0";
const OFFER = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";
const ANSWER = "v=0\r\no=- 3 4 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";
const workspaceId = "6108396e-0e12-425d-91ff-a02d39a346e0";
const request = { source: "chat", model: "openai/gpt-live-1", provider: "openai", metadata: { userId } };
function post(body: unknown, live = true) {
	return (live ? liveSessionsRoutes : realtimeSessionsRoutes).request("https://test/", {
		method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
	});
}
beforeEach(() => {
	vi.clearAllMocks(); mocks.policy = null; mocks.cache = undefined; mocks.openGates = new Set(["chat", "api", "webrtc"]); mocks.row = null;
	const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	mocks.auth = { workspaceId, apiKeyId: "key", requestId: "request", authMethod: "api_key",
		apiKeyKid: Array.from(createHash("sha256").update(`test-seed:kid:${workspaceId}:${userId}:0`).digest())
			.map((byte) => alphabet[byte % 62]).join("").slice(0, 12) };
	mocks.context.mockResolvedValue({ ok: true, value: { resolvedModel: "openai/gpt-5.6-luna",
		providers: [{ providerId: "openai", apiModelId: "openai/gpt-5.6-luna" }], context: {} } });
	mocks.create.mockResolvedValue({ id: "rt_created", session: { session_id: SESSION, status: "created" }, clientSecret: "rtsec_secret",
		connect: { transport: "websocket", url: `/v1/live/sessions/${SESSION}/relay` } });
	mocks.relayFetch.mockImplementation(async () => Response.json({ sdp: ANSWER, session: { session_id: SESSION, status: "connected" } }, { status: 201 }));
});

it("uses the separate Live route and validates backend availability before reserving credit", async () => {
	expect((await post(request)).status).toBe(201);
	expect(mocks.context).toHaveBeenCalledWith(expect.objectContaining({ model: "openai/gpt-5.6-luna", capability: "text.generate" }));
	expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ model: "openai/gpt-live-1", liveBackendModel: "openai/gpt-5.6-luna",
		source: "chat", relay: true, auth: expect.objectContaining({ userId }) }));
});

it("creates GPT Live API sessions for an ordinary key, with function tools", async () => {
	mocks.auth.apiKeyKid = "ordinary-key";
	const tools = [{ type: "function", name: "get_time", parameters: { type: "object", properties: {} } }];
	const response = await post({ model: "openai/gpt-live-1", provider: "openai", voice: "cedar", backend_settings: { tools } });
	expect(response.status).toBe(201);
	expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ model: "openai/gpt-live-1", source: "api", relay: true,
		voice: "cedar", liveBackendSettings: expect.objectContaining({ tools }), auth: expect.objectContaining({ userId: null }) }));
});

it("opens Chat sessions on the Chat gate while API sessions stay behind the API gate", async () => {
	mocks.openGates = new Set(["chat"]);
	expect((await post(request)).status).toBe(201);
	mocks.auth.apiKeyKid = "ordinary-key";
	const api = await post({ model: "openai/gpt-live-1", provider: "openai" });
	expect(api.status).toBe(401);
	expect(await api.json()).toMatchObject({ reason: "realtime_voice_feature_flag_disabled", feature_gate: "gateway_realtime_voice" });
	expect(mocks.create).toHaveBeenCalledTimes(1);
});

it("names the Chat gate when Chat sessions are closed", async () => {
	mocks.openGates = new Set(["api"]);
	const response = await post(request);
	expect(await response.json()).toMatchObject({ reason: "realtime_voice_feature_flag_disabled", feature_gate: "chat_realtime_voice" });
	expect(mocks.create).not.toHaveBeenCalled();
});

it.each(["openai/gpt-live-1", "gpt-live-1.1", "openai/gpt-live-1.1"])("points %s on the Realtime endpoint at the Live endpoint", async (model) => {
	const response = await post({ model, provider: "openai" }, false);
	expect(await response.json()).toMatchObject({ reason: "live_sessions_endpoint_required" });
	expect(mocks.create).not.toHaveBeenCalled();
});

it.each(["gpt-live-1.1", "openai/gpt-live-1.1"])("creates GPT Live 1.1 sessions from %s", async (model) => {
	mocks.auth.apiKeyKid = "ordinary-key";
	expect((await post({ model, provider: "openai" })).status).toBe(201);
	expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ model: "openai/gpt-live-1.1", liveBackendModel: "openai/gpt-5.6-luna" }));
});

it("explains a Live model with no published price", async () => {
	mocks.auth.apiKeyKid = "ordinary-key";
	mocks.create.mockRejectedValueOnce(new Error("live_price_card_missing"));
	const response = await post({ model: "openai/gpt-live-1.1", provider: "openai" });
	expect(response.status).toBe(400);
	expect(await response.json()).toMatchObject({ reason: "live_price_card_missing" });
});

it("rejects ordinary keys even when they claim to be a playground user", async () => {
	mocks.auth.apiKeyKid = "ordinary-key";
	expect((await post(request)).status).toBeGreaterThanOrEqual(400);
	expect(mocks.create).not.toHaveBeenCalled();
});

it("explains an unresolved billing admission block without starting a provider call", async () => {
	mocks.create.mockRejectedValueOnce(new Error("realtime_billing_review_required"));
	const response = await post(request);
	expect(response.status).toBeGreaterThanOrEqual(400);
	expect(await response.text()).toContain("realtime_billing_review_required");
});

it.each([true, false])("rejects models fallbacks for realtime sessions (live=%s)", async (live) => {
	const response = await post({ ...request, models: ["openai/gpt-realtime-mini"] }, live);
	expect(response.status).toBe(400);
	expect(await response.json()).toMatchObject({ code: "validation_error", reason: "models_not_supported_for_endpoint" });
	expect(mocks.context).not.toHaveBeenCalled();
	expect(mocks.create).not.toHaveBeenCalled();
});

it("does not expose Live through the existing Realtime endpoint", async () => {
	expect((await post(request, false)).status).toBeGreaterThanOrEqual(400);
	expect(mocks.create).not.toHaveBeenCalled();
});

it("enforces the voice model allowlist independently of the backend", async () => {
	mocks.policy = { allowedApiModels: ["openai/gpt-5.6-luna"] };
	expect((await post(request)).status).toBeGreaterThanOrEqual(400);
	expect(mocks.create).not.toHaveBeenCalled();
});

it("passes all built-in voices and validated delegation settings to session creation", async () => {
	for (const voice of LIVE_VOICES) {
		expect((await post({ ...request, voice, backend_settings: { web_search: true, reasoning_effort: "high", max_output_tokens: 8192 } })).status).toBe(201);
		expect(mocks.create).toHaveBeenLastCalledWith(expect.objectContaining({ voice,
			liveBackendSettings: expect.objectContaining({ web_search: true, reasoning_effort: "high", max_output_tokens: 8192 }) }));
	}
});

it.each([{ model: "arbitrary" }, { service_tier: "auto" }, { tools: [{ type: "function" }] }, { final_cost_nanos: 0 }])("rejects untrusted nested settings before reserving credit: %j", async (settings) => {
	expect((await post({ ...request, backend_settings: settings })).status).toBeGreaterThanOrEqual(400);
	expect(mocks.create).not.toHaveBeenCalled();
});

it.each([true, false])("refuses new sessions during a realtime maintenance window (live=%s)", async (live) => {
	const until = new Date(Date.now() + 20 * 60_000).toISOString();
	mocks.cache = { get: vi.fn(async (key: string) => key === "realtime:maintenance:v1"
		? { enabled: true, until, message: "Realtime voice is being upgraded." } : null) };
	const response = await post(live ? request : { model: "openai/gpt-realtime-2.1", provider: "openai" }, live);
	expect(response.status).toBe(503);
	const retryAfter = Number(response.headers.get("Retry-After"));
	expect(retryAfter).toBeGreaterThan(19 * 60);
	expect(retryAfter).toBeLessThanOrEqual(20 * 60);
	expect(await response.json()).toMatchObject({ reason: "realtime_maintenance", maintenance_until: until,
		message: "Realtime voice is being upgraded." });
	expect(mocks.create).not.toHaveBeenCalled();
});

it("starts sessions when the maintenance switch is off or can't be read", async () => {
	mocks.cache = { get: vi.fn(async () => ({ enabled: false })) };
	expect((await post(request)).status).toBe(201);
	mocks.cache = { get: vi.fn(async () => { throw new Error("kv unavailable"); }) };
	const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
	try { expect((await post(request)).status).toBe(201); } finally { error.mockRestore(); }
});

const webrtcRequest = { model: "openai/gpt-live-1.1", provider: "openai", transport: { type: "webrtc", sdp: OFFER },
	wake_policy: { type: "speech" }, idle_timeout_s: 30 };

describe("GPT Live over WebRTC", () => {
	beforeEach(() => { mocks.auth.apiKeyKid = "ordinary-key"; });

	it("returns the SDP answer and our session id, never a relay secret or URL", async () => {
		const response = await post(webrtcRequest);
		expect(response.status).toBe(201);
		const body = await response.json() as any;
		expect(body).toMatchObject({ transport: { type: "webrtc", sdp: ANSWER }, session: { session_id: SESSION, status: "connected" } });
		expect(JSON.stringify(body)).not.toContain("rtsec_");
		expect(body).not.toHaveProperty("connect");
		expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ model: "openai/gpt-live-1.1", liveTransport: "webrtc", relay: true }));
		const [id, request] = mocks.relayFetch.mock.calls[0] as [string, Request];
		expect(id).toBe(SESSION);
		expect(new URL(request.url).pathname).toBe("/internal/live-webrtc");
		expect(request.headers.get("x-realtime-reconcile-token")).toMatch(/^[0-9a-f]{64}$/);
		expect(await request.json()).toEqual({ session_id: SESSION, token: "rtsec_secret", sdp: OFFER,
			standby: { wake_policy: { type: "speech" }, idle_timeout_s: 30 } });
	});

	it("keeps WebSocket the default and unchanged", async () => {
		const response = await post({ model: "openai/gpt-live-1", provider: "openai" });
		expect(await response.json()).toMatchObject({ clientSecret: "rtsec_secret", connect: { transport: "websocket" } });
		expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ liveTransport: "websocket" }));
		expect(mocks.relayFetch).not.toHaveBeenCalled();
	});

	it("names the gate when WebRTC is closed, before reserving credit", async () => {
		mocks.openGates = new Set(["chat", "api"]);
		const response = await post(webrtcRequest);
		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({ reason: "live_webrtc_feature_flag_disabled", feature_gate: "live_webrtc" });
		expect(mocks.create).not.toHaveBeenCalled();
		// The WebSocket transport is unaffected by the WebRTC gate.
		expect((await post({ model: "openai/gpt-live-1", provider: "openai" })).status).toBe(201);
	});

	it.each([
		[{ ...webrtcRequest, transport: { type: "websocket" } }, "validation_error"],
		[{ model: "openai/gpt-live-1", provider: "openai", idle_timeout_s: 30 }, "validation_error"],
		[{ ...webrtcRequest, transport: { type: "webrtc", sdp: "not sdp" } }, "live_webrtc_sdp_invalid"],
	])("rejects %j before reserving credit", async (body, reason) => {
		const response = await post(body);
		expect(response.status).toBe(400);
		const payload = await response.json() as any;
		expect(JSON.stringify(payload)).toContain(`"${reason}"`);
		expect(mocks.create).not.toHaveBeenCalled();
	});

	it("accepts web search and function tools over WebRTC", async () => {
		expect((await post({ ...webrtcRequest, backend_settings: { web_search: true } })).status).toBe(201);
		const tools = [{ type: "function", name: "get_time", parameters: { type: "object", properties: {} } }];
		expect((await post({ ...webrtcRequest, backend_settings: { tools } })).status).toBe(201);
		expect(mocks.create).toHaveBeenLastCalledWith(expect.objectContaining({ liveTransport: "webrtc",
			liveBackendSettings: expect.objectContaining({ tools }) }));
	});

	it("passes the provider's offer rejection back as a validation error", async () => {
		mocks.relayFetch.mockImplementation(async () => Response.json({ error: "live_webrtc_offer_rejected", message: "Invalid SDP offer." }, { status: 400 }));
		const response = await post(webrtcRequest);
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ reason: "live_webrtc_offer_rejected", message: "Invalid SDP offer." });
	});

	it("reports state, warnings and the final bill on GET, to the owning key only", async () => {
		mocks.row = { session_id: SESSION, workspace_id: workspaceId, key_id: "key", model_id: "openai/gpt-live-1.1",
			status: "connected", metadata: { live_transport: "webrtc" }, usage: {}, started_at: new Date().toISOString() };
		mocks.relayFetch.mockImplementation(async () => Response.json({ active: true, standby: true,
			warnings: [{ type: "session.warning", code: "funds_low" }] }));
		const get = () => liveSessionsRoutes.request(`https://test/${SESSION}`);
		const live = await (await get()).json() as any;
		expect(live).toMatchObject({ transport: { type: "webrtc" }, standby: true, warnings: [{ code: "funds_low" }], ended: null });
		mocks.row = { ...mocks.row, status: "completed", final_cost_nanos: 12_833_334, disconnect_reason: "client_requested_end",
			connected_at: "2026-11-20T10:00:00.000Z", ended_at: "2026-11-20T10:00:41.000Z",
			usage: { live_started: true, live_seconds: 22, live_active_seconds: 11, live_paused_seconds: 11, live_final: true } };
		const ended = await (await get()).json() as any;
		expect(ended.ended).toMatchObject({ type: "session.ended", reason: "client_requested", billing_status: "settled", duration_seconds: 41,
			cost: { total_nanos: 12_833_334 }, usage: { standby_audio_minutes: 11 / 60 } });
		mocks.auth.apiKeyId = "another-key";
		expect((await get()).status).toBe(404);
	});

	it("closes a WebRTC call through the relay", async () => {
		mocks.row = { session_id: SESSION, workspace_id: workspaceId, key_id: "key", model_id: "openai/gpt-live-1.1",
			status: "connected", metadata: { live_transport: "webrtc" }, usage: {}, started_at: new Date().toISOString() };
		mocks.relayFetch.mockImplementation(async () => Response.json({ status: "ending" }, { status: 202 }));
		const response = await liveSessionsRoutes.request(`https://test/${SESSION}/close`, { method: "POST" });
		expect(response.status).toBe(202);
		expect(new URL((mocks.relayFetch.mock.calls[0] as [string, Request])[1].url).pathname).toBe(`/internal/live-close/${SESSION}`);
	});

	describe("function_call_output", () => {
		const webrtcRow = () => ({ session_id: SESSION, workspace_id: workspaceId, key_id: "key", model_id: "openai/gpt-live-1.1",
			status: "connected", metadata: { live_transport: "webrtc" }, usage: {}, started_at: new Date().toISOString() });
		const send = (body: unknown) => liveSessionsRoutes.request(`https://test/${SESSION}/function_call_output`, {
			method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

		it("forwards the output to the relay, which sends it on the sideband", async () => {
			mocks.row = webrtcRow();
			mocks.relayFetch.mockImplementation(async () => Response.json({ status: "accepted", response_requested: true }, { status: 202 }));
			const response = await send({ call_id: "call_1", output: "{\"code\":\"PELICAN-42\"}" });
			expect(response.status).toBe(202);
			expect(await response.json()).toEqual({ status: "accepted", call_id: "call_1", response_requested: true });
			const [id, request] = mocks.relayFetch.mock.calls[0] as [string, Request];
			expect(id).toBe(SESSION);
			expect(new URL(request.url).pathname).toBe(`/internal/live-tool-output/${SESSION}`);
			expect(request.headers.get("x-realtime-reconcile-token")).toMatch(/^[0-9a-f]{64}$/);
			expect(await request.json()).toEqual({ call_id: "call_1", output: "{\"code\":\"PELICAN-42\"}" });
		});

		it.each([
			["live_function_call_unknown", 404],
			["live_function_call_already_answered", 409],
			["realtime_session_not_accepting_input", 409],
			["live_sideband_reattaching", 409],
		])("explains the relay refusal %s", async (reason, status) => {
			mocks.row = webrtcRow();
			mocks.relayFetch.mockImplementation(async () => Response.json({ error: reason }, { status: 409 }));
			const response = await send({ call_id: "call_1", output: "ok" });
			expect(response.status).toBe(status);
			expect(await response.json()).toMatchObject({ reason, message: expect.any(String) });
		});

		it("refuses bad bodies, other keys, WebSocket sessions and ended calls without reaching the relay", async () => {
			mocks.row = webrtcRow();
			for (const body of [{ call_id: "call_1" }, { call_id: "", output: "x" }, { call_id: "call_1", output: 1 },
				{ call_id: "call_1", output: "x", create_response: "yes" }, { call_id: "call_1", output: "x", extra: true },
				{ call_id: "call_1", output: "é".repeat(40 * 1024) }]) {
				expect((await send(body)).status, JSON.stringify(body).slice(0, 80)).toBe(400);
			}
			mocks.auth.apiKeyId = "another-key";
			expect((await send({ call_id: "call_1", output: "x" })).status).toBe(404);
			mocks.auth.apiKeyId = "key";
			mocks.row = { ...webrtcRow(), metadata: { live_transport: "websocket" } };
			expect(await (await send({ call_id: "call_1", output: "x" })).json()).toMatchObject({ reason: "live_webrtc_session_required" });
			mocks.row = { ...webrtcRow(), status: "completed" };
			const ended = await send({ call_id: "call_1", output: "x" });
			expect(ended.status).toBe(409);
			expect(await ended.json()).toMatchObject({ reason: "realtime_session_not_active" });
			expect(mocks.relayFetch).not.toHaveBeenCalled();
		});
	});
});
