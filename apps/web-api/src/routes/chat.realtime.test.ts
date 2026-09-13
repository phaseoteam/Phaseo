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
