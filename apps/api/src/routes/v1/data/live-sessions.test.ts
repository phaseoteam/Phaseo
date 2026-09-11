import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { liveSessionsRoutes, realtimeSessionsRoutes } from "./realtime-sessions";
import { LIVE_VOICES } from "@core/live-settings";

const mocks = vi.hoisted(() => ({ auth: {} as any, create: vi.fn(), context: vi.fn(), policy: null as any }));
vi.mock("../../utils", () => ({ withRuntime: (handler: any) => (c: any) => handler(c.req.raw) }));
vi.mock("@/runtime/env", () => ({ getBindings: () => ({ CHAT_ROUTE_KEY_SEED: "test-seed" }) }));
vi.mock("@pipeline/before/guards", () => ({ guardAuth: async () => ({ ok: true, value: mocks.auth }),
	guardJson: async (req: Request) => ({ ok: true, value: await req.json() }), guardContext: mocks.context }));
vi.mock("@core/feature-flags", () => ({ isRealtimeVoiceAccessEnabled: async () => true }));
vi.mock("@pipeline/before/workspacePolicy", async (original) => ({
	...await original<typeof import("@pipeline/before/workspacePolicy")>(), fetchWorkspacePolicy: async () => mocks.policy,
}));
vi.mock("@core/realtime-sessions", async (original) => ({
	...await original<typeof import("@core/realtime-sessions")>(), createRealtimeSession: mocks.create,
	publicRealtimeSessionPayload: (created: unknown) => created,
}));

const userId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "6108396e-0e12-425d-91ff-a02d39a346e0";
const request = { source: "chat", model: "openai/gpt-live-1", provider: "openai", metadata: { userId } };
function post(body: unknown, live = true) {
	return (live ? liveSessionsRoutes : realtimeSessionsRoutes).request("https://test/", {
		method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
	});
}
beforeEach(() => {
	vi.clearAllMocks(); mocks.policy = null;
	const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	mocks.auth = { workspaceId, apiKeyId: "key", requestId: "request", authMethod: "api_key",
		apiKeyKid: Array.from(createHash("sha256").update(`test-seed:kid:${workspaceId}:${userId}:0`).digest())
			.map((byte) => alphabet[byte % 62]).join("").slice(0, 12) };
	mocks.context.mockResolvedValue({ ok: true, value: { resolvedModel: "openai/gpt-5.6-luna",
		providers: [{ providerId: "openai", apiModelId: "openai/gpt-5.6-luna" }], context: {} } });
	mocks.create.mockResolvedValue({ id: "rt_created" });
});

it("uses the separate Live route and validates backend availability before reserving credit", async () => {
	expect((await post(request)).status).toBe(201);
	expect(mocks.context).toHaveBeenCalledWith(expect.objectContaining({ model: "openai/gpt-5.6-luna", capability: "text.generate" }));
	expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ model: "openai/gpt-live-1", liveBackendModel: "openai/gpt-5.6-luna",
		source: "chat", relay: true, auth: expect.objectContaining({ userId }) }));
});

it("rejects ordinary keys even when they claim to be a playground user", async () => {
	mocks.auth.apiKeyKid = "ordinary-key";
	expect((await post(request)).status).toBeGreaterThanOrEqual(400);
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
