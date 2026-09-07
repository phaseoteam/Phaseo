import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/chat/proxy", async (original) => ({
	...await original<typeof import("@/chat/proxy")>(),
	resolveGatewayKeys: async () => ({ apiKey: "test-key", userId: "user-1", workspaceId: "workspace-1" }),
}));
import { chatRouter } from "./chat";
const query = vi.hoisted(() => ({ select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@/data/supabase", () => ({ getDataClient: () => ({ from: () => query }) }));
afterEach(() => vi.unstubAllGlobals());

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

it("scopes billing reads to the Chat user, workspace and session", async () => {
	query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
	query.maybeSingle.mockResolvedValue({ data: { status: "completed", captured_nanos: 2, released_nanos: 3 }, error: null });
	const response = await chatRouter.request("https://phaseo.app/realtime/session/rt_01jz8h3j3f4q5r6s7t8v9w0xyz", {}, {} as any);
	expect(response.status).toBe(200);
	expect(query.eq).toHaveBeenCalledWith("workspace_id", "workspace-1");
	expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
	expect(query.eq).toHaveBeenCalledWith("source", "chat");
	expect(response.headers.get("cache-control")).toContain("no-store");
	query.maybeSingle.mockResolvedValue({ data: null, error: null });
	expect((await chatRouter.request("https://phaseo.app/realtime/session/rt_01jz8h3j3f4q5r6s7t8v9w0xyz", {}, {} as any)).status).toBe(404);
});
