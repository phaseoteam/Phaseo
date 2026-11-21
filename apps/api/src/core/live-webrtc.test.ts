import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIVE_VOICE_CARD } from "./__fixtures__/live-price-cards";
import { priceLiveUsage, type LiveConfig } from "./live-sessions";
import { liveBackendSettingsSchema } from "./live-settings";
import {
	LIVE_SESSIONS_URL,
	LIVE_WEBRTC_ALLOWED_CLIENT_EVENTS,
	liveSdpOfferError,
	liveWebRTCCloseReason,
	liveWebRTCCreateBody,
	parseLiveWebRTCCreateResponse,
} from "./live-webrtc";
import { LIVE_HANGUP_RETRY_MS, LIVE_TOOL_CALL_WAIT_MS, LIVE_WEBRTC_HANGUP_AFTER_MS, LIVE_WEBRTC_HEARTBEAT_MS, RealtimeRelayDurableObject } from "./realtime-relay-durable-object";
import { createLiveSessionSchema } from "@/routes/v1/data/realtime-sessions";

const mocks = vi.hoisted(() => ({
	claim: vi.fn(),
	connected: vi.fn(),
	settle: vi.fn(),
	unresolved: vi.fn(),
	usage: vi.fn(),
	getRow: vi.fn(),
}));

vi.mock("@/runtime/env", () => ({ configureRuntime: vi.fn() }));
vi.mock("@observability/otlp-export", () => ({ enqueueAsyncGenAiOtlpExport: vi.fn(async () => undefined) }));
vi.mock("@pipeline/pricing/loader", () => ({ loadPriceCard: vi.fn(async () => null) }));
vi.mock("@core/realtime-sessions", async (importOriginal) => ({
	...(await importOriginal<typeof import("./realtime-sessions")>()),
	claimRealtimeSessionForRelay: mocks.claim,
	markRealtimeSessionConnected: mocks.connected,
	settleRealtimeSession: mocks.settle,
	markRealtimeSessionBillingUnresolved: mocks.unresolved,
	updateRealtimeSessionUsage: mocks.usage,
	getRealtimeSessionForInternal: mocks.getRow,
	resolveOpenAIKey: () => "sk-test",
	realtimeReconciliationToken: async () => "internal-token",
}));

const config: LiveConfig = {
	backendModel: "openai/gpt-5.6-luna",
	voiceCard: LIVE_VOICE_CARD,
	settings: liveBackendSettingsSchema.parse({ web_search: true }),
	backendCard: { ...LIVE_VOICE_CARD, model: "openai/gpt-5.6-luna", endpoint: "text.generate", rules: [
		["input_text_tokens", "1"], ["cached_read_text_tokens", "0.1"], ["cached_write_text_tokens_30m", "1.25"], ["output_text_tokens", "10"],
	].map(([meter, price]) => ({ ...LIVE_VOICE_CARD.rules[0], meter: meter as any, unit: "token", unit_size: 1_000_000, price_per_unit: price })) },
};
const OFFER = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=mid:0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n";
const ANSWER = "v=0\r\no=- 3 4 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";
const TOKEN = `rtsec_${"0".repeat(52)}`;
const SESSION_ID = "rt_01jabcdefghjkmnpqrstvwxyz0";

// OpenAI's sideband events from the 2026-11-20 live test (gpt-live-1.1, standby on).
const started = { event_id: "event_started", type: "session.started", session: { id: "live_test", status: "active" } };
const paused = { event_id: "event_paused", type: "session.paused" };
const usage1 = { event_id: "event_usage_1", type: "session.usage.updated", usage: { active_seconds: 14, paused_seconds: 1, seconds: 15 } };
const usage2 = { event_id: "event_usage_2", type: "session.usage.updated", usage: { active_seconds: 11, paused_seconds: 7, seconds: 18 } };
const closed = (reason = "close_requested") => ({ event_id: `event_closed_${reason}`, type: "session.closed", reason,
	usage: { active_seconds: 11, paused_seconds: 11, seconds: 22 } });

class FakeSocket {
	readyState = 1;
	bufferedAmount = 0;
	sent: any[] = [];
	private listeners: Record<string, Array<(event: any) => void>> = {};
	accept() {}
	addEventListener(type: string, listener: (event: any) => void) { (this.listeners[type] ??= []).push(listener); }
	send(data: string) { this.sent.push(JSON.parse(data)); }
	close() { this.readyState = 3; }
	emit(event: unknown) { for (const listener of this.listeners.message ?? []) listener({ data: JSON.stringify(event) }); }
	drop() { this.readyState = 3; for (const listener of this.listeners.close ?? []) listener({ code: 1006 }); }
}

type OpenAIMock = { create: any[]; hangups: string[]; sockets: FakeSocket[]; createResponse: () => Response; attachFails: boolean;
	attachHangs: boolean; hangupResponse: () => Response | Promise<Response> };
let openai: OpenAIMock;

function sessionRow(overrides: Record<string, unknown> = {}) {
	return { session_id: SESSION_ID, workspace_id: "workspace", key_id: "key", user_id: null, source: "api", provider: "openai",
		model_id: "openai/gpt-live-1.1", provider_model_id: "gpt-live-1.1", voice: "cedar", status: "connecting",
		metadata: { live: config, instructions: "Be brief.", live_transport: "webrtc", relay: true },
		reserved_nanos: 5_000_000_000, estimated_cost_nanos: 0, expires_at: new Date(Date.now() + 1_500_000).toISOString(), ...overrides };
}

function relay() {
	const data = new Map<string, unknown>();
	const waits: Promise<unknown>[] = [];
	const storage = {
		put: vi.fn(async (key: string | Record<string, unknown>, value?: unknown) => {
			if (typeof key === "string") data.set(key, structuredClone(value));
			else for (const [entry, item] of Object.entries(key)) data.set(entry, structuredClone(item));
		}),
		get: vi.fn(async (key: string) => structuredClone(data.get(key))),
		delete: vi.fn(async (key: string) => data.delete(key)),
		setAlarm: vi.fn(async (_at: number) => undefined),
		deleteAll: vi.fn(async () => data.clear()),
		deleteAlarm: vi.fn(async () => undefined),
	};
	const object = new RealtimeRelayDurableObject({ waitUntil: (promise: Promise<unknown>) => { waits.push(promise); }, storage } as any, {} as any) as any;
	const settled = async () => {
		for (let round = 0; round < 5; round += 1) {
			await Promise.allSettled(waits.splice(0));
			await object.upstreamEvents;
		}
	};
	return { object, storage, data, settled };
}

function start(object: any, standby: unknown = { wake_policy: { type: "speech" }, idle_timeout_s: 30 }) {
	return object.fetch(new Request("https://realtime.internal/internal/live-webrtc", {
		method: "POST", headers: { "x-realtime-reconcile-token": "internal-token", "Content-Type": "application/json" },
		body: JSON.stringify({ session_id: SESSION_ID, token: TOKEN, sdp: OFFER, standby }),
	}));
}

beforeEach(() => {
	openai = { create: [], hangups: [], sockets: [], attachFails: false, attachHangs: false,
		hangupResponse: () => new Response("{}", { status: 200 }),
		createResponse: () => Response.json({ session: { id: "live_test" }, transport: { type: "webrtc", sdp: ANSWER } }, { status: 201 }) };
	mocks.claim.mockImplementation(async () => sessionRow());
	mocks.connected.mockImplementation(async () => sessionRow({ status: "connected" }));
	mocks.settle.mockImplementation(async () => ({ session: { final_cost_nanos: 0 }, settlement: { final_cost_nanos: 0, debt_nanos: 0, uncollected_nanos: 0 } }));
	mocks.unresolved.mockImplementation(async () => sessionRow({ status: "billing_unresolved" }));
	mocks.usage.mockImplementation(async () => sessionRow({ status: "connected" }));
	vi.stubGlobal("fetch", vi.fn(async (input: string | Request, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input.url;
		if (url === LIVE_SESSIONS_URL) {
			openai.create.push(JSON.parse(String(init?.body)));
			return openai.createResponse();
		}
		if (url === "https://api.openai.com/v1/live/sessions/live_test/attach") {
			if (openai.attachHangs) return new Promise(() => undefined);
			if (openai.attachFails) return { status: 404, text: async () => "session not found" };
			const socket = new FakeSocket();
			openai.sockets.push(socket);
			return { status: 101, webSocket: socket };
		}
		if (url === "https://api.openai.com/v1/live/sessions/live_test/hangup") {
			openai.hangups.push(url);
			return openai.hangupResponse();
		}
		throw new Error(`unexpected fetch ${url}`);
	}));
	vi.spyOn(console, "warn").mockImplementation(() => undefined);
	vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
	vi.clearAllMocks();
	vi.unstubAllGlobals();
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("GPT Live WebRTC requests", () => {
	it("accepts standby only with a WebRTC transport and within OpenAI's limits", () => {
		const base = { model: "openai/gpt-live-1.1", provider: "openai" };
		const webrtc = { ...base, transport: { type: "webrtc", sdp: OFFER } };
		expect(createLiveSessionSchema.safeParse(base).success).toBe(true);
		expect(createLiveSessionSchema.safeParse({ ...base, transport: { type: "websocket" } }).success).toBe(true);
		expect(createLiveSessionSchema.safeParse({ ...webrtc, wake_policy: { type: "speech", vad_threshold: 0.7 }, idle_timeout_s: 30 }).success).toBe(true);
		for (const invalid of [
			{ ...base, wake_policy: { type: "speech" } },
			{ ...base, transport: { type: "websocket" }, wake_policy: { type: "speech" }, idle_timeout_s: 10 },
			{ ...webrtc, idle_timeout_s: 30 },
			{ ...webrtc, wake_policy: { type: "speech" }, idle_timeout_s: 4 },
			{ ...webrtc, wake_policy: { type: "speech" }, idle_timeout_s: 61 },
			{ ...webrtc, wake_policy: { type: "speech" }, idle_timeout_s: 10.5 },
			{ ...webrtc, wake_policy: { type: "speech", vad_threshold: 1.5 } },
			{ ...webrtc, wake_policy: { type: "always" } },
			{ ...base, transport: { type: "webrtc" } },
			{ ...base, transport: { type: "webrtc", sdp: "x".repeat(64 * 1024 + 1) } },
			{ ...base, transport: { type: "sip" } },
		]) {
			expect(createLiveSessionSchema.safeParse(invalid).success, JSON.stringify(invalid).slice(0, 120)).toBe(false);
		}
	});

	it("checks the SDP offer's shape and size", () => {
		expect(liveSdpOfferError(OFFER)).toBeNull();
		expect(liveSdpOfferError("hello")).toBe("live_webrtc_sdp_invalid");
		expect(liveSdpOfferError("v=0\r\nm=video 9 UDP 96\r\n")).toBe("live_webrtc_sdp_audio_missing");
		expect(liveSdpOfferError(`${OFFER}a=x:\u0000\r\n`)).toBe("live_webrtc_sdp_invalid");
		expect(liveSdpOfferError(`${OFFER}<script>\r\n`)).toBe("live_webrtc_sdp_invalid");
		expect(liveSdpOfferError(`${OFFER}${"a=x\r\n".repeat(14_000)}`)).toBe("live_webrtc_sdp_too_large");
	});

	it("creates the session with the WebSocket path's configuration, standby and a locked-down data channel", () => {
		const body = liveWebRTCCreateBody({ config, voice: "cedar", instructions: "Be brief.", model: "openai/gpt-live-1.1",
			standby: { wake_policy: { type: "speech" }, idle_timeout_s: 30 }, sdp: OFFER });
		expect(body.transport).toEqual({ type: "webrtc", sdp: OFFER });
		expect(body.session).toMatchObject({ model: "gpt-live-1.1", instructions: "Be brief.", store: false,
			audio: { output: { voice: "cedar" } }, wake_policy: { type: "speech" }, idle_timeout_s: 30,
			delegation: { type: "responses", responses: { model: "gpt-5.6-luna", tools: [{ type: "web_search" }] } } });
		// WebRTC negotiates the audio format over SDP.
		expect(body.session.audio).not.toHaveProperty("format");
		// The browser can end or mute the call but never change the session (backend, tier, tools).
		expect(body.session.client.data_channel.allowed_client_events).toEqual([...LIVE_WEBRTC_ALLOWED_CLIENT_EVENTS]);
		expect(LIVE_WEBRTC_ALLOWED_CLIENT_EVENTS).not.toContain("session.update");
		const plain = liveWebRTCCreateBody({ config, voice: "marin", model: "openai/gpt-live-1", sdp: OFFER });
		expect(plain.session).not.toHaveProperty("wake_policy");
		expect(plain.session).not.toHaveProperty("idle_timeout_s");
	});

	it("reads OpenAI's create response and maps how the browser ended the call", () => {
		expect(parseLiveWebRTCCreateResponse({ session: { id: "live_x" }, transport: { type: "webrtc", sdp: ANSWER } })).toEqual({ liveSessionId: "live_x", sdp: ANSWER });
		expect(parseLiveWebRTCCreateResponse({ session: { id: "live x" }, transport: { sdp: ANSWER } })).toBeNull();
		expect(parseLiveWebRTCCreateResponse({ session: { id: "live_x" }, transport: { sdp: "nope" } })).toBeNull();
		expect(liveWebRTCCloseReason("close_requested")).toBe("client_requested_end");
		expect(liveWebRTCCloseReason("remote_hangup")).toBe("client_requested_end");
		expect(liveWebRTCCloseReason("connection_lost")).toBe("client_disconnected");
		expect(liveWebRTCCloseReason("expired")).toBe("live_session_expired");
	});
});

describe("GPT Live WebRTC relay", () => {
	it("creates the call with our key, returns only the SDP answer and attaches the sideband", async () => {
		const { object, data, settled } = relay();
		const response = await start(object);
		expect(response.status).toBe(201);
		const body = await response.json() as any;
		expect(body.sdp).toBe(ANSWER);
		expect(JSON.stringify(body)).not.toContain("sk-test");
		expect(openai.create).toHaveLength(1);
		expect(openai.create[0].session).toMatchObject({ model: "gpt-live-1.1", audio: { output: { voice: "cedar" } }, wake_policy: { type: "speech" }, idle_timeout_s: 30,
			delegation: { type: "responses" } });
		const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
		expect(mocks.claim).toHaveBeenCalledWith({ sessionId: SESSION_ID, token: TOKEN });
		expect(mocks.connected).toHaveBeenCalledWith(expect.objectContaining({ providerSessionId: "live_test" }));
		await settled();
		expect(openai.sockets).toHaveLength(1);
		expect(object.upstream).toBe(openai.sockets[0]);
		expect(data.get("live_transport")).toBe("webrtc");
		expect(data.get("usage")).toMatchObject({ live_started: true });
	});

	it("refuses requests without the internal token", async () => {
		const { object } = relay();
		const response = await object.fetch(new Request("https://realtime.internal/internal/live-webrtc", { method: "POST", body: "{}" }));
		expect(response.status).toBe(403);
		expect(mocks.claim).not.toHaveBeenCalled();
	});

	it("bills nothing and releases the hold when OpenAI rejects the offer", async () => {
		openai.createResponse = () => Response.json({ error: { message: "Invalid SDP offer." } }, { status: 400 });
		const { object, settled } = relay();
		const response = await start(object);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "live_webrtc_offer_rejected", message: "Invalid SDP offer." });
		await settled();
		expect(mocks.settle).toHaveBeenCalledOnce();
		const settlement = mocks.settle.mock.calls[0][0];
		expect(settlement).toMatchObject({ status: "cancelled", disconnectReason: "live_webrtc_create_failed" });
		expect(settlement.usage.live_started).toBe(false);
		expect((priceLiveUsage(settlement.usage, config).pricing as any).total_nanos).toBe(0);
		expect(openai.sockets).toHaveLength(0);
		expect(mocks.unresolved).not.toHaveBeenCalled();
	});

	it("bills nothing when the create never answers", async () => {
		openai.createResponse = () => { throw new Error("network down"); };
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const { object } = relay();
		expect((await start(object)).status).toBe(502);
		expect(mocks.settle).toHaveBeenCalledWith(expect.objectContaining({ status: "cancelled", usage: expect.objectContaining({ live_started: false }) }));
	});

	it("bills OpenAI's active and standby split from the sideband", async () => {
		const { object, settled } = relay();
		await start(object);
		await settled();
		const sideband = openai.sockets[0];
		for (const event of [started, paused, usage1, usage2, closed("close_requested")]) sideband.emit(event);
		await settled();
		expect(object.liveStandby).toBe(true);
		expect(mocks.usage).toHaveBeenCalled();
		expect(mocks.settle).toHaveBeenCalledOnce();
		const settlement = mocks.settle.mock.calls[0][0];
		// The browser closed its data channel: a normal end, not a failure.
		expect(settlement).toMatchObject({ status: "completed", disconnectReason: "client_requested_end" });
		expect(settlement.usage).toMatchObject({ live_seconds: 22, live_active_seconds: 11, live_paused_seconds: 11, live_final: true });
		const lines = (priceLiveUsage(settlement.usage, config).pricing as any).lines;
		// 11 s at $0.05/min active and 11 s at $0.02/min standby.
		expect(lines.map((line: any) => [line.dimension, line.line_nanos])).toEqual([["audio_minutes", 9_166_667], ["standby_audio_minutes", 3_666_667]]);
		expect(openai.hangups).toHaveLength(0);
	});

	it("keeps the call going when the browser's own event is refused", async () => {
		const { object, settled } = relay();
		await start(object);
		await settled();
		// Recorded 2026-11-20: a bad session.update on the data channel, mirrored on the sideband.
		openai.sockets[0].emit({ type: "error", event_id: "event_error", error: { type: "invalid_request_error", code: "unknown_parameter",
			message: "Unknown parameter: 'session.instructions'.", param: "session.instructions" } });
		await settled();
		expect(openai.sockets[0].sent).toEqual([]);
		expect(mocks.settle).not.toHaveBeenCalled();
		expect(object.liveClosing).toBe(false);
	});

	it("reattaches a dropped sideband and ingests the replayed events once", async () => {
		const { object, settled } = relay();
		await start(object);
		await settled();
		openai.sockets[0].emit(usage1);
		openai.sockets[0].emit(usage2);
		await settled();
		openai.sockets[0].drop();
		await settled();
		expect(openai.sockets).toHaveLength(2);
		expect(object.upstream).toBe(openai.sockets[1]);
		// The reattach replays the last 3 s, including a usage snapshot older than the latest.
		openai.sockets[1].emit(usage1);
		openai.sockets[1].emit(usage2);
		await settled();
		expect(object.usage.live_billing_error).toBeUndefined();
		expect(object.usage.live_seconds).toBe(18);
		expect(mocks.settle).not.toHaveBeenCalled();
		openai.sockets[1].emit(closed("remote_hangup"));
		await settled();
		expect(mocks.settle).toHaveBeenCalledWith(expect.objectContaining({ status: "completed", disconnectReason: "client_requested_end" }));
	});

	it("survives a relay restart: the heartbeat reattaches from stored state", async () => {
		const first = relay();
		await start(first.object);
		await first.settled();
		openai.sockets[0].emit(usage1);
		await first.settled();
		// A deploy: a fresh instance over the same storage, woken by the heartbeat alarm.
		const second = relay();
		for (const [key, value] of first.data) second.data.set(key, value);
		mocks.claim.mockClear();
		mocks.getRow.mockImplementation(async () => sessionRow({ status: "connected" }));
		await second.object.alarm();
		await second.settled();
		expect(openai.sockets).toHaveLength(2);
		expect(second.object.upstream).toBe(openai.sockets[1]);
		openai.sockets[1].emit(usage1);
		openai.sockets[1].emit(usage2);
		await second.settled();
		expect(second.object.usage).toMatchObject({ live_seconds: 18 });
		expect(second.object.usage.live_billing_error).toBeUndefined();
	});

	it("hangs up and sends the call to billing review when the sideband can't be reattached", async () => {
		vi.useFakeTimers();
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const { object, settled } = relay();
		await start(object);
		await vi.advanceTimersByTimeAsync(0);
		await settled();
		openai.sockets[0].emit(usage1);
		await settled();
		openai.attachFails = true;
		openai.sockets[0].drop();
		await vi.advanceTimersByTimeAsync(20_000);
		await settled();
		expect(openai.hangups).toHaveLength(1);
		expect(mocks.unresolved).toHaveBeenCalledWith(expect.objectContaining({ reason: "live_sideband_lost",
			usage: expect.objectContaining({ live_seconds: 15 }) }));
		expect(mocks.settle).not.toHaveBeenCalled();
	});

	it("ends the call when the key is revoked: session.close, then hangup, then settles from session.closed", async () => {
		vi.useFakeTimers();
		const { object, settled } = relay();
		await start(object);
		await vi.advanceTimersByTimeAsync(0);
		await settled();
		mocks.usage.mockImplementation(async () => sessionRow({ status: "ending", disconnect_reason: "realtime_key_revoked" }));
		openai.sockets[0].emit(usage1);
		await settled();
		expect(openai.sockets[0].sent).toEqual([{ type: "session.close" }]);
		await vi.advanceTimersByTimeAsync(LIVE_WEBRTC_HANGUP_AFTER_MS);
		await settled();
		expect(openai.hangups).toHaveLength(1);
		openai.sockets[0].emit(closed("close_requested"));
		await settled();
		expect(mocks.settle).toHaveBeenCalledWith(expect.objectContaining({ status: "cancelled", disconnectReason: "realtime_key_revoked" }));
		expect(object.end).toEqual({ reason: "key_revoked", initiatedBy: "gateway" });
	});

	it("ends the call at the duration cap from the heartbeat", async () => {
		const { object, storage, settled } = relay();
		await start(object);
		await settled();
		expect(storage.setAlarm).toHaveBeenLastCalledWith(expect.any(Number));
		const next = storage.setAlarm.mock.calls.at(-1)[0] as number;
		expect(next - Date.now()).toBeLessThanOrEqual(LIVE_WEBRTC_HEARTBEAT_MS);
		object.deadlineMs = Date.now() - 1;
		await object.alarm();
		expect(openai.sockets[0].sent).toEqual([{ type: "session.close" }]);
		openai.sockets[0].emit(closed("close_requested"));
		await settled();
		expect(mocks.settle).toHaveBeenCalledWith(expect.objectContaining({ status: "expired", disconnectReason: "realtime_max_duration" }));
	});

	it("keeps warnings for the status endpoint and closes through the gateway", async () => {
		const { object, settled } = relay();
		await start(object);
		await settled();
		object.deadlineMs = Date.now() + 100_000;
		object.warnDurationApproaching(Date.now());
		const status = await object.fetch(new Request(`https://realtime.internal/internal/live-status/${SESSION_ID}`, {
			headers: { "x-realtime-reconcile-token": "internal-token" } }));
		expect(await status.json()).toMatchObject({ active: true, sideband: "attached",
			warnings: [expect.objectContaining({ type: "session.warning", code: "max_duration_approaching" })] });
		const close = await object.fetch(new Request(`https://realtime.internal/internal/live-close/${SESSION_ID}`, {
			method: "POST", headers: { "x-realtime-reconcile-token": "internal-token" } }));
		expect(close.status).toBe(202);
		expect(openai.sockets[0].sent).toEqual([{ type: "session.close" }]);
		openai.sockets[0].emit(closed("close_requested"));
		await settled();
		expect(mocks.settle).toHaveBeenCalledWith(expect.objectContaining({ status: "completed", disconnectReason: "client_requested_end" }));
	});

	describe("function tools", () => {
		// The backend's call as the 2026-11-21 live test delivered it on the sideband (no response id).
		const functionCall = (callId: string) => ({ event_id: `event_fc_${callId}`, type: "response.event", delegation_id: "item_delegation",
			event: { type: "response.output_item.done", sequence_number: 12, output_index: 1,
				item: { type: "function_call", id: `fc_${callId}`, call_id: callId, name: "lookup_code", arguments: "{\"topic\":\"pelicans\"}", status: "completed" } } });
		const output = (object: any, body: Record<string, unknown>) => object.fetch(new Request(`https://realtime.internal/internal/live-tool-output/${SESSION_ID}`, {
			method: "POST", headers: { "x-realtime-reconcile-token": "internal-token", "Content-Type": "application/json" }, body: JSON.stringify(body) }));

		it("sends an output for the backend's call on the sideband, then asks for the reply, once per call", async () => {
			const { object, settled } = relay();
			await start(object);
			await settled();
			openai.sockets[0].emit(functionCall("call_1"));
			await settled();
			const response = await output(object, { call_id: "call_1", output: "{\"code\":\"PELICAN-42\"}" });
			expect(response.status).toBe(202);
			expect(await response.json()).toEqual({ status: "accepted", response_requested: true });
			expect(openai.sockets[0].sent).toEqual([
				{ type: "response.item.create", item: { type: "function_call_output", call_id: "call_1", output: "{\"code\":\"PELICAN-42\"}" } },
				{ type: "response.create" },
			]);
			const again = await output(object, { call_id: "call_1", output: "again" });
			expect(again.status).toBe(409);
			expect(await again.json()).toEqual({ error: "live_function_call_already_answered" });
			expect(openai.sockets[0].sent).toHaveLength(2);
		});

		it("holds the reply until the last of several outputs", async () => {
			const { object, settled } = relay();
			await start(object);
			await settled();
			openai.sockets[0].emit(functionCall("call_1"));
			openai.sockets[0].emit(functionCall("call_2"));
			await settled();
			expect((await output(object, { call_id: "call_1", output: "a", create_response: false })).status).toBe(202);
			expect(openai.sockets[0].sent.map((event) => event.type)).toEqual(["response.item.create"]);
			expect((await output(object, { call_id: "call_2", output: "b" })).status).toBe(202);
			expect(openai.sockets[0].sent.map((event) => event.type)).toEqual(["response.item.create", "response.item.create", "response.create"]);
		});

		it("waits for a call the sideband delivers just after the output", async () => {
			const { object, settled } = relay();
			await start(object);
			await settled();
			const pending = output(object, { call_id: "call_late", output: "ok" });
			setTimeout(() => openai.sockets[0].emit(functionCall("call_late")), 250);
			expect((await pending).status).toBe(202);
			expect(openai.sockets[0].sent[0]).toMatchObject({ item: { call_id: "call_late" } });
		});

		it("refuses an output for a call the backend never made", async () => {
			const { object, settled } = relay();
			await start(object);
			await settled();
			const startedAt = Date.now();
			const response = await output(object, { call_id: "call_made_up", output: "x" });
			expect(response.status).toBe(404);
			expect(await response.json()).toEqual({ error: "live_function_call_unknown" });
			expect(Date.now() - startedAt).toBeGreaterThanOrEqual(LIVE_TOOL_CALL_WAIT_MS - 50);
			expect(openai.sockets[0].sent).toEqual([]);
		}, 10_000);

		it("refuses while the sideband is reattaching, and for a WebSocket session", async () => {
			const { object, settled } = relay();
			await start(object);
			await settled();
			openai.sockets[0].emit(functionCall("call_1"));
			await settled();
			openai.attachHangs = true;
			openai.sockets[0].drop();
			const response = await output(object, { call_id: "call_1", output: "x" });
			expect(response.status).toBe(503);
			expect(await response.json()).toEqual({ error: "live_sideband_reattaching" });
			const websocket = relay();
			websocket.data.set("session_id", SESSION_ID);
			mocks.getRow.mockImplementation(async () => sessionRow({ status: "connected", metadata: { live: config } }));
			expect(await (await output(websocket.object, { call_id: "call_1", output: "x" })).json()).toEqual({ error: "live_webrtc_session_required" });
		});

		it("remembers answered calls across a relay restart", async () => {
			const first = relay();
			await start(first.object);
			await first.settled();
			openai.sockets[0].emit(functionCall("call_1"));
			await first.settled();
			expect((await output(first.object, { call_id: "call_1", output: "a", create_response: false })).status).toBe(202);
			await first.object.checkpointUsage(true);
			const second = relay();
			for (const [key, value] of first.data) second.data.set(key, value);
			mocks.getRow.mockImplementation(async () => sessionRow({ status: "connected" }));
			await second.object.alarm();
			await second.settled();
			const again = await output(second.object, { call_id: "call_1", output: "b" });
			expect(await again.json()).toEqual({ error: "live_function_call_already_answered" });
			expect(openai.sockets[1].sent).toEqual([]);
		});
	});

	it("bounds a stalled sideband attach by the reattach budget, then hangs up and reviews the bill", async () => {
		vi.useFakeTimers();
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const { object, settled } = relay();
		await start(object);
		await vi.advanceTimersByTimeAsync(0);
		await settled();
		openai.sockets[0].emit(usage1);
		await settled();
		// The upgrade never answers.
		openai.attachHangs = true;
		openai.sockets[0].drop();
		await vi.advanceTimersByTimeAsync(16_000);
		await settled();
		expect(openai.hangups).toHaveLength(1);
		expect(mocks.unresolved).toHaveBeenCalledWith(expect.objectContaining({ reason: "live_sideband_lost" }));
		expect(object.settled).toBe(true);
	});

	it("keeps retrying an unconfirmed hangup from the alarm after the bill goes to review", async () => {
		vi.useFakeTimers();
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const first = relay();
		await start(first.object);
		await vi.advanceTimersByTimeAsync(0);
		await first.settled();
		openai.sockets[0].emit(usage1);
		await first.settled();
		openai.hangupResponse = () => new Response("upstream", { status: 503 });
		openai.attachFails = true;
		openai.sockets[0].drop();
		await vi.advanceTimersByTimeAsync(20_000);
		await first.settled();
		expect(mocks.unresolved).toHaveBeenCalledOnce();
		const hangupsBefore = openai.hangups.length;
		expect(hangupsBefore).toBeGreaterThanOrEqual(1);
		// Billing review is recorded, but the hangup retry survives it.
		expect(first.data.get("live_hangup")).toMatchObject({ billing_done: true, last_status: "503" });
		expect(first.data.get("live_session_id")).toBe("live_test");
		expect(first.storage.deleteAlarm).not.toHaveBeenCalled();
		const scheduled = first.storage.setAlarm.mock.calls.at(-1)![0] as number;
		expect(scheduled).toBe((first.data.get("live_hangup") as any).next_at_ms);
		// A fresh instance (eviction) runs the retries.
		const second = relay();
		for (const [key, value] of first.data) second.data.set(key, value);
		// Before the backoff is up, nothing is sent.
		await second.object.alarm();
		expect(openai.hangups).toHaveLength(hangupsBefore);
		const outcomes: Array<[() => Response | Promise<Response>, string | null]> = [
			[() => new Response("upstream", { status: 503 }), "503"],
			[() => Promise.reject(Object.assign(new Error("The operation timed out."), { name: "TimeoutError" })), "timeout"],
			[() => new Response("slow down", { status: 429 }), "429"],
			[() => new Response("{}", { status: 200 }), null],
		];
		for (const [response, status] of outcomes) {
			openai.hangupResponse = response;
			vi.setSystemTime(Date.now() + LIVE_HANGUP_RETRY_MS.at(-1)!);
			await second.object.alarm();
			if (status) {
				expect(second.data.get("live_hangup")).toMatchObject({ billing_done: true, last_status: status });
				expect(second.storage.deleteAlarm).not.toHaveBeenCalled();
			}
		}
		expect(openai.hangups).toHaveLength(hangupsBefore + 4);
		expect(second.data.size).toBe(0);
		expect(second.storage.deleteAlarm).toHaveBeenCalled();
		expect(mocks.unresolved).toHaveBeenCalledOnce();
		expect(mocks.settle).not.toHaveBeenCalled();
	});

	it("treats a hangup for a session OpenAI no longer has as confirmed", async () => {
		vi.useFakeTimers();
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const { object, data, storage, settled } = relay();
		await start(object);
		await vi.advanceTimersByTimeAsync(0);
		await settled();
		openai.hangupResponse = () => new Response("not found", { status: 404 });
		openai.attachFails = true;
		openai.sockets[0].drop();
		await vi.advanceTimersByTimeAsync(20_000);
		await settled();
		expect(mocks.unresolved).toHaveBeenCalledOnce();
		expect(data.size).toBe(0);
		expect(storage.deleteAlarm).toHaveBeenCalled();
	});

	it("sends the bill to review when the sideband was away longer than OpenAI's replay", async () => {
		vi.useFakeTimers();
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const { object, settled } = relay();
		await start(object);
		await vi.advanceTimersByTimeAsync(0);
		await settled();
		openai.sockets[0].emit(usage1);
		await settled();
		openai.attachFails = true;
		openai.sockets[0].drop();
		await vi.advanceTimersByTimeAsync(7_000);
		openai.attachFails = false;
		await vi.advanceTimersByTimeAsync(1_000);
		await settled();
		expect(openai.sockets).toHaveLength(2);
		expect(object.usage.live_sideband_gap_ms).toBeGreaterThanOrEqual(7_000);
		openai.sockets[1].emit(closed("remote_hangup"));
		await settled();
		expect(mocks.settle).not.toHaveBeenCalled();
		expect(mocks.unresolved).toHaveBeenCalledWith(expect.objectContaining({ reason: "live_sideband_continuity_gap",
			usage: expect.objectContaining({ live_seconds: 22, live_final: true }) }));
		// The call had already ended at OpenAI: no hangup needed.
		expect(openai.hangups).toHaveLength(0);
	});

	it("settles normally after a reattach inside the replay window", async () => {
		vi.useFakeTimers();
		const { object, settled } = relay();
		await start(object);
		await vi.advanceTimersByTimeAsync(0);
		await settled();
		openai.attachFails = true;
		openai.sockets[0].drop();
		await vi.advanceTimersByTimeAsync(200);
		openai.attachFails = false;
		await vi.advanceTimersByTimeAsync(300);
		await settled();
		expect(openai.sockets).toHaveLength(2);
		expect(object.usage.live_sideband_gap_ms).toBeUndefined();
		openai.sockets[1].emit(closed("remote_hangup"));
		await settled();
		expect(mocks.unresolved).not.toHaveBeenCalled();
		expect(mocks.settle).toHaveBeenCalledWith(expect.objectContaining({ status: "completed", disconnectReason: "client_requested_end" }));
	});

	it("sees a sideband gap across a relay restart from the stored last sighting", async () => {
		vi.useFakeTimers();
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const first = relay();
		await start(first.object);
		await vi.advanceTimersByTimeAsync(0);
		await first.settled();
		// The old instance dies; the next alarm only wakes a fresh one 7 s later.
		vi.setSystemTime(Date.now() + 7_000);
		const second = relay();
		for (const [key, value] of first.data) second.data.set(key, value);
		mocks.getRow.mockImplementation(async () => sessionRow({ status: "connected" }));
		await second.object.alarm();
		await second.settled();
		expect(second.object.upstream).toBe(openai.sockets[1]);
		expect(second.object.usage.live_sideband_gap_ms).toBeGreaterThanOrEqual(7_000);
	});

	it("keeps heartbeats spaced after the duration cap while session.closed is withheld", async () => {
		const { object, storage, settled } = relay();
		await start(object);
		await settled();
		object.deadlineMs = Date.now() - 1;
		await object.alarm();
		expect(openai.sockets[0].sent).toEqual([{ type: "session.close" }]);
		for (let beat = 0; beat < 3; beat += 1) {
			await object.alarm();
			const next = storage.setAlarm.mock.calls.at(-1)![0] as number;
			expect(next - Date.now()).toBeGreaterThan(LIVE_WEBRTC_HEARTBEAT_MS - 100);
		}
		expect(mocks.settle).not.toHaveBeenCalled();
		openai.sockets[0].emit(closed("close_requested"));
		await settled();
		expect(mocks.settle).toHaveBeenCalledWith(expect.objectContaining({ status: "expired", disconnectReason: "realtime_max_duration" }));
	});
});
