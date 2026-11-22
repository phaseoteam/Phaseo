import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/chat/proxy", async (original) => ({
	...await original<typeof import("@/chat/proxy")>(),
	resolveGatewayKeys: async () => ({ apiKey: "test-key", userId: "user-1", workspaceId: "workspace-1" }),
}));
import { chatRouter } from "./chat";
const query = vi.hoisted(() => ({ select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@/data/supabase", () => ({ getDataClient: () => ({ from: () => query }) }));
afterEach(() => vi.unstubAllGlobals());

it("registers audio polling only once alongside both session surfaces", () => {
	expect(chatRouter.routes.filter((route) => route.method === "GET" && route.path === "/audio")).toHaveLength(1);
});

it.each(["xai", "x-ai", "spacex-ai"])("normalizes the %s Chat provider to the catalogue identity", async (provider) => {
	let body: Record<string, unknown> = {};
	vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
		body = JSON.parse(init.body);
		return Response.json({ clientSecret: "rtsec_test", connect: { url: "/v1/realtime/sessions/rt_test/relay" } });
	}));
	const response = await chatRouter.request("https://phaseo.app/realtime/session", {
		method: "POST", headers: { "content-type": "application/json" },
		body: JSON.stringify({ provider, model: `${provider}/grok-voice-think-fast-2.0`, voice: "eve" }),
	}, { ENV: "development", PHASEO_GATEWAY_URL: "https://api.phaseo.app/v1" });
	expect(response.status).toBe(200);
	expect(body.provider).toBe("spacex-ai");
	expect(body.model).toBe("spacex-ai/grok-voice-think-fast-2.0");
});

it("passes other catalogue providers through to the gateway", async () => {
	let body: Record<string, unknown> = {};
	vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
		body = JSON.parse(init.body);
		return Response.json({ clientSecret: "rtsec_test", connect: { url: "/v1/realtime/sessions/rt_test/relay" } });
	}));
	const response = await chatRouter.request("https://phaseo.app/realtime/session", {
		method: "POST", headers: { "content-type": "application/json" },
		body: JSON.stringify({ provider: "elevenlabs", model: "eleven-labs/eleven-realtime-v1-max", voice: "brian" }),
	}, { ENV: "development", PHASEO_GATEWAY_URL: "https://api.phaseo.app/v1" });
	expect(response.status).toBe(200);
	expect(body).toMatchObject({ provider: "elevenlabs", model: "eleven-labs/eleven-realtime-v1-max", voice: "brian", source: "chat" });
	expect((await response.json() as any).provider).toBe("elevenlabs");
});

it.each(["", "Eleven Labs", "../openai"])("rejects the malformed provider %j", async (provider) => {
	const fetchMock = vi.fn();
	vi.stubGlobal("fetch", fetchMock);
	const response = await chatRouter.request("https://phaseo.app/realtime/session", {
		method: "POST", headers: { "content-type": "application/json" },
		body: JSON.stringify({ provider, model: "eleven-labs/eleven-realtime-v1-mini" }),
	}, { ENV: "development", PHASEO_GATEWAY_URL: "https://api.phaseo.app/v1" });
	expect(response.status).toBe(400);
	expect(fetchMock).not.toHaveBeenCalled();
});

it("submits the supported Chat contract and returns the server-owned relay", async () => {
	let body: Record<string, unknown> = {};
	vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
		body = JSON.parse(init.body);
		return Response.json({ clientSecret: "rtsec_test", connect: { url: "/v1/realtime/sessions/rt_test/relay" } });
	}));
	const response = await chatRouter.request("https://phaseo.app/realtime/session", {
		method: "POST", headers: { "content-type": "application/json" },
		body: JSON.stringify({ provider: "openai", model: "gpt-realtime", voice: "marin", instructions: "Be concise." }),
	}, { ENV: "development", PHASEO_GATEWAY_URL: "https://api.phaseo.app/v1" });
	 expect(response.status).toBe(200);
	 expect(body).toEqual({ provider: "openai", model: "openai/gpt-realtime", voice: "marin", instructions: "Be concise.", source: "chat", metadata: { feature: "chat_realtime_voice", userId: "user-1", workspaceId: "workspace-1" } });
	 expect((await response.json() as any).connect.url).toBe("wss://api.phaseo.app/v1/realtime/sessions/rt_test/relay");
});

it("uses the separate Live API with trusted Chat identity and the selected backend", async () => {
	const fetchMock = vi.fn(async () => Response.json({ clientSecret: "rtsec_test", connect: { url: "/v1/live/sessions/rt_test/relay" } }));
	vi.stubGlobal("fetch", fetchMock);
	const response = await chatRouter.request("https://phaseo.app/live/session", {
		method: "POST", headers: { "content-type": "application/json" },
		body: JSON.stringify({ provider: "openai", model: "gpt-live-1", voice: "vesper", backend_model: "openai/gpt-5.6-terra",
			backend_settings: { web_search: true, max_output_tokens: 8192, reasoning_effort: "high", instructions: "Verify facts." },
			metadata: { userId: "forged" }, source: "api", final_cost_nanos: 0 }),
	}, { ENV: "development", PHASEO_GATEWAY_URL: "https://api.phaseo.app/v1" });
	expect(response.status).toBe(200);
	const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
	expect(url).toBe("https://api.phaseo.app/v1/live/sessions");
	expect(JSON.parse(init.body as string)).toEqual({ provider: "openai", model: "openai/gpt-live-1", voice: "vesper",
		backend_settings: { web_search: true, max_output_tokens: 8192, reasoning_effort: "high", instructions: "Verify facts." },
		backend_model: "openai/gpt-5.6-terra", source: "chat", metadata: { feature: "chat_realtime_voice", userId: "user-1", workspaceId: "workspace-1" } });
	expect((await response.json() as any).connect).toMatchObject({ url: "wss://api.phaseo.app/v1/live/sessions/rt_test/relay",
		protocols: ["statsync-realtime", "rtsec.rtsec_test"] });
});

it.each([["gpt-live-1.1", 200], ["openai/gpt-live-1.1", 200], ["gpt-live-1-mini", 400], ["openai/gpt-realtime-2.1", 400]])(
	"forwards only GPT Live models to the Live API (%s)", async (model, status) => {
		const fetchMock = vi.fn(async () => Response.json({ clientSecret: "rtsec_test", connect: { url: "/v1/live/sessions/rt_test/relay" } }));
		vi.stubGlobal("fetch", fetchMock);
		const response = await chatRouter.request("https://phaseo.app/live/session", {
			method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "openai", model }),
		}, { ENV: "development", PHASEO_GATEWAY_URL: "https://api.phaseo.app/v1" });
		expect(response.status).toBe(status);
		if (status === 200) expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).model).toBe("openai/gpt-live-1.1");
		else expect(fetchMock).not.toHaveBeenCalled();
	});

it("rejects an arbitrary Live backend before contacting the gateway", async () => {
	const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
	const response = await chatRouter.request("https://phaseo.app/live/session", {
		method: "POST", headers: { "content-type": "application/json" },
		body: JSON.stringify({ provider: "openai", model: "gpt-live-1", backend_model: "arbitrary" }),
	}, { ENV: "development" });
	expect(response.status).toBe(400);
	expect(fetchMock).not.toHaveBeenCalled();
});

it.each(["realtime", "live"])("scopes %s billing reads to the Chat user, workspace and session", async (surface) => {
	query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
	query.maybeSingle.mockResolvedValue({ data: { status: "completed", captured_nanos: 2, released_nanos: 3 }, error: null });
	const response = await chatRouter.request(`https://phaseo.app/${surface}/session/rt_01jz8h3j3f4q5r6s7t8v9w0xyz`, {}, {} as any);
	expect(response.status).toBe(200);
	expect(query.eq).toHaveBeenCalledWith("workspace_id", "workspace-1");
	expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
	expect(query.eq).toHaveBeenCalledWith("source", "chat");
	expect(query.select).toHaveBeenCalledWith(expect.stringContaining("pricing_lines,usage"));
	expect(response.headers.get("cache-control")).toContain("no-store");
	query.maybeSingle.mockResolvedValue({ data: null, error: null });
	expect((await chatRouter.request("https://phaseo.app/realtime/session/rt_01jz8h3j3f4q5r6s7t8v9w0xyz", {}, {} as any)).status).toBe(404);
});

const OFFER = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";
const ANSWER = "v=0\r\no=- 3 4 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";
const liveWebRTC = (fetchMock: ReturnType<typeof vi.fn>, extra: Record<string, unknown> = {}) => {
	vi.stubGlobal("fetch", fetchMock);
	return chatRouter.request("https://phaseo.app/live/session", {
		method: "POST", headers: { "content-type": "application/json" },
		body: JSON.stringify({ provider: "openai", model: "gpt-live-1.1", transport: "webrtc", sdp: OFFER, ...extra }),
	}, { ENV: "development", PHASEO_GATEWAY_URL: "https://api.phaseo.app/v1" });
};

it("sends the playground's WebRTC offer with standby and returns the SDP answer", async () => {
	const fetchMock = vi.fn(async () => Response.json({ id: "rt_test", status: "connected", transport: { type: "webrtc", sdp: ANSWER } }, { status: 201 }));
	const response = await liveWebRTC(fetchMock);
	expect(response.status).toBe(200);
	expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({
		model: "openai/gpt-live-1.1", transport: { type: "webrtc", sdp: OFFER }, wake_policy: { type: "speech" }, idle_timeout_s: 30, source: "chat" });
	expect((await response.json() as any).connect).toEqual({ transport: "webrtc", sdp: ANSWER, standby: true });
});

it("falls back to the WebSocket relay when the WebRTC gate is closed", async () => {
	const fetchMock = vi.fn()
		.mockResolvedValueOnce(Response.json({ error: "unauthorised", reason: "live_webrtc_feature_flag_disabled" }, { status: 401 }))
		.mockResolvedValueOnce(Response.json({ clientSecret: "rtsec_test", connect: { url: "/v1/live/sessions/rt_test/relay" } }, { status: 201 }));
	const response = await liveWebRTC(fetchMock);
	expect(response.status).toBe(200);
	const second = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
	expect(second).not.toHaveProperty("transport");
	expect(second).not.toHaveProperty("wake_policy");
	expect(await response.json()).toMatchObject({ webrtc_unavailable: true, connect: { transport: "websocket", url: "wss://api.phaseo.app/v1/live/sessions/rt_test/relay" } });
});

it("keeps calls with function tools on the WebSocket relay, which can carry their results", async () => {
	const fetchMock = vi.fn(async () => Response.json({ clientSecret: "rtsec_test", connect: { url: "/v1/live/sessions/rt_test/relay" } }, { status: 201 }));
	const tools = [{ type: "function", name: "get_time", parameters: { type: "object", properties: {} } }];
	const response = await liveWebRTC(fetchMock, { backend_settings: { tools } });
	expect(response.status).toBe(200);
	expect(fetchMock).toHaveBeenCalledTimes(1);
	const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
	expect(sent).not.toHaveProperty("transport");
	expect(sent.backend_settings).toEqual({ tools });
	const payload = await response.json() as Record<string, unknown>;
	expect(payload).toMatchObject({ connect: { transport: "websocket" } });
	// Not flagged: the playground still tries WebRTC for later calls without tools.
	expect(payload).not.toHaveProperty("webrtc_unavailable");
});

it("passes other WebRTC refusals through without retrying", async () => {
	const fetchMock = vi.fn(async () => Response.json({ error: "unauthorised", reason: "realtime_voice_feature_flag_disabled" }, { status: 401 }));
	const response = await liveWebRTC(fetchMock);
	expect(response.status).toBe(401);
	expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("rejects a malformed WebRTC offer before contacting the gateway", async () => {
	const fetchMock = vi.fn();
	expect((await liveWebRTC(fetchMock, { sdp: "not sdp" })).status).toBe(400);
	expect(fetchMock).not.toHaveBeenCalled();
});

it("closes a WebRTC Live call through the gateway", async () => {
	const fetchMock = vi.fn(async () => Response.json({ status: "ending" }, { status: 202 }));
	vi.stubGlobal("fetch", fetchMock);
	const response = await chatRouter.request("https://phaseo.app/live/session/rt_01jz8h3j3f4q5r6s7t8v9w0xyz/close", { method: "POST" },
		{ ENV: "development", PHASEO_GATEWAY_URL: "https://api.phaseo.app/v1" });
	expect(response.status).toBe(202);
	expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("https://api.phaseo.app/v1/live/sessions/rt_01jz8h3j3f4q5r6s7t8v9w0xyz/close");
});
