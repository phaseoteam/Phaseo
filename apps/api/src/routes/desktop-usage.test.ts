import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), limit: vi.fn(), from: vi.fn(), filters: [] as unknown[][], result: { data: [] as unknown[], error: null as unknown } }));
vi.mock("@/pipeline/before/guards", () => ({ guardAuth: mocks.auth }));
vi.mock("@/lib/oauth/rateLimit", () => ({ checkOAuthRateLimit: mocks.limit }));
vi.mock("@/runtime/env", async (importOriginal) => ({ ...await importOriginal<typeof import("@/runtime/env")>(), getSupabaseAdmin: () => ({ from: mocks.from }) }));
import { desktopUsageRoutes, handleDesktopUsage } from "./desktop-usage";
const request = (query = "from=2026-10-01T00:00:00Z&to=2026-10-06T00:00:00Z") => new Request(`https://api.phaseo.app/desktop/usage?${query}`);
beforeEach(() => {
  vi.clearAllMocks(); mocks.limit.mockResolvedValue(true); mocks.filters = []; mocks.result = { data: [], error: null };
  mocks.auth.mockResolvedValue({ ok: true, value: { authMethod: "oauth", oauthClientId: "phaseo_desktop", workspaceId: "workspace", apiKeyId: "key", oauthScopes: ["gateway:access"] } });
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn((...args) => { mocks.filters.push(args); return query; }), gte: vi.fn().mockReturnThis(), lt: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn(async () => mocks.result) };
  mocks.from.mockReturnValue(query);
});
it("restricts existing logs to the authenticated key and returns safe metadata", async () => {
  mocks.result.data = [{ request_id: "req", model_id: "lab/model", created_at: "2026-10-05T00:00:00Z", cost_nanos: "1000000000", usage: { input_tokens: 10, output_tokens: 2, prompt: "private" }, prompt: "secret" }];
  const response = await handleDesktopUsage(request());
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ source_id: "workspace:key", has_more: false, rows: [{ request_id: "req", model: "lab/model", created_at: "2026-10-05T00:00:00Z", input_tokens: 10, output_tokens: 2, cost_nanos: 1000000000 }] });
  expect(mocks.filters).toEqual([["workspace_id", "workspace"], ["key_id", "key"]]);
});
it.each(["from=bad&to=2026-10-06", "from=2026-01-01&to=2026-10-06", "from=2026-10-01&to=2026-10-06&offset=10000", "from=2026-10-06&to=2026-10-01"])("bounds the query %s", async query => {
  expect((await handleDesktopUsage(request(query))).status).toBe(400); expect(mocks.from).not.toHaveBeenCalled();
});
it("rejects other OAuth applications", async () => {
  mocks.auth.mockResolvedValue({ ok: true, value: { authMethod: "oauth", oauthClientId: "other", apiKeyId: "key", oauthScopes: ["gateway:access"] } });
  expect((await handleDesktopUsage(request())).status).toBe(403); expect(mocks.from).not.toHaveBeenCalled();
});
it("preserves missing usage and sanitizes database errors", async () => {
  mocks.result.data = [{ request_id: "req", model_id: "model", created_at: "date", usage: {}, cost_nanos: null }];
  expect((await (await handleDesktopUsage(request())).json()).rows[0].input_tokens).toBeNull();
  mocks.result.error = { message: "sensitive" };
  const response = await handleDesktopUsage(request()); expect(response.status).toBe(503); expect(await response.text()).not.toContain("sensitive");
});

it("limits reads without querying logs and ignores caller-controlled key filters", async () => {
  mocks.limit.mockResolvedValue(false);
  const limited = await handleDesktopUsage(request());
  expect(limited.status).toBe(429); expect(limited.headers.get("retry-after")).toBe("60");
  expect(mocks.from).not.toHaveBeenCalled();
  mocks.limit.mockResolvedValue(true);
  await handleDesktopUsage(request("from=2026-10-01&to=2026-10-06&workspace_id=other&key_id=other"));
  expect(mocks.filters).toEqual([["workspace_id", "workspace"], ["key_id", "key"]]);
});
it("wires the read-only route through the Worker runtime", async () => {
  const response = await desktopUsageRoutes.request("https://api.phaseo.app/usage?from=2026-10-01&to=2026-10-06", {}, { SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fixture" }, { waitUntil() {}, passThroughOnException() {} });
  expect(response.status).toBe(200);
  expect(mocks.auth).toHaveBeenCalledWith(expect.any(Request), { allowOAuthJwt: true, useKvCache: false });
});
