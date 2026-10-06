import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), upsert: vi.fn(), role: vi.fn() }));
vi.mock("@/pipeline/before/guards", () => ({ guardAuth: mocks.auth }));
vi.mock("@/runtime/env", async (importOriginal) => ({ ...await importOriginal<typeof import("@/runtime/env")>(), getSupabaseAdmin: () => ({ from: () => ({ upsert: mocks.upsert }) }) }));
vi.mock("@/routes/v1/control/route-helpers", () => ({ requireOAuthWorkspaceRole: mocks.role }));
import { handleDesktopSessionTurn, desktopSessionsRoutes } from "./desktop-sessions";
const payload = { environment_id: "env-1", session_id: "chat-1", turn_id: "turn-1", provider: "codex", model: "gpt-test", status: "completed", started_at: "2026-10-06T14:00:00Z", completed_at: "2026-10-06T14:00:10Z", input_tokens: null, output_tokens: null, usage_status: "unavailable", desktop_scheme: "t3code" };
const request = (body: unknown = payload) => new Request("https://api.phaseo.app/desktop/session-turns", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, value: { authMethod: "oauth", oauthClientId: "phaseo_desktop", userId: "user-1", workspaceId: "workspace-1", oauthScopes: ["gateway:access"] } });
  mocks.role.mockResolvedValue(null);
  mocks.upsert.mockResolvedValue({ error: null });
});
it("binds idempotent reports to the verified OAuth user and workspace", async () => {
  expect((await handleDesktopSessionTurn(request())).status).toBe(200);
  expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: "workspace-1", user_id: "user-1", session_id: "chat-1" }), { onConflict: "workspace_id,user_id,environment_id,turn_id" });
});
it.each(["api_key", "wrong-client", "missing-scope"])("rejects %s", async (scenario) => {
  const value = (await mocks.auth()).value;
  if (scenario === "api_key") value.authMethod = "api_key";
  if (scenario === "wrong-client") value.oauthClientId = "other";
  if (scenario === "missing-scope") value.oauthScopes = [];
  mocks.auth.mockResolvedValue({ ok: true, value });
  expect((await handleDesktopSessionTurn(request())).status).toBe(403);
  expect(mocks.upsert).not.toHaveBeenCalled();
});
it.each([{ workspace_id: "other" }, { prompt: "private" }, { input_tokens: -1 }, { usage_status: "complete" }, { completed_at: "2026-10-06T13:00:00Z" }, { provider: "phaseo" }])("rejects invalid or private metadata %j", async (extra) => {
  expect((await handleDesktopSessionTurn(request({ ...payload, ...extra }))).status).toBe(400);
  expect(mocks.upsert).not.toHaveBeenCalled();
});
it("bounds streamed bodies and retains failed reports for retry", async () => {
  expect((await handleDesktopSessionTurn(request({ text: "x".repeat(5000) }))).status).toBe(413);
  mocks.upsert.mockResolvedValue({ error: { message: "private database error" } });
  const response = await handleDesktopSessionTurn(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private database error");
});

it("rejects revoked workspace membership before writing", async () => {
  mocks.role.mockResolvedValue(new Response("forbidden", { status: 403 }));
  expect((await handleDesktopSessionTurn(request())).status).toBe(403);
  expect(mocks.upsert).not.toHaveBeenCalled();
});

it("wires the first-party endpoint through the Worker runtime", async () => {
  const response = await desktopSessionsRoutes.request("https://api.phaseo.app/session-turns", { method: "POST", body: JSON.stringify(payload) }, { SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fixture" }, { waitUntil() {}, passThroughOnException() {} });
  expect(response.status).toBe(200);
});

it("accepts stable delegated chat IDs", async () => {
  expect((await handleDesktopSessionTurn(request({ ...payload, session_id: "thread:delegated-task:command%3Achild" }))).status).toBe(200);
});
