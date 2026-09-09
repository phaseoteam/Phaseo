import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
const env = { ENV: "development", SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon-key", SUPABASE_SERVICE_ROLE_KEY: "service-role-key" };
afterEach(() => vi.unstubAllGlobals());
function setup(role = "admin") {
  const calls: Array<{ url: string; body?: string }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, body: init?.body as string });
    if (url.includes("/auth/v1/user")) return Response.json({ id: "user-1" });
    if (url.includes("/rest/v1/users")) return Response.json({ role });
    return Response.json([], { headers: { "content-range": "0-0/0" } });
  })); return calls;
}
const request = (path: string, body?: unknown) => app.request(`https://phaseo.app/api/account/models/catalog/${path}`, { headers: { authorization: "Bearer session-token", "content-type": "application/json" }, ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }) }, env);
describe("catalog registries", () => {
  it("denies non-admin registry reads and writes", async () => { const calls = setup("member"); expect((await request("registries")).status).toBe(403); expect((await request("registries/families", {})).status).toBe(403); expect(calls.some((call) => call.url.includes("rpc/"))).toBe(false); });
  it.each(["constructor", "__proto__", "users"])("rejects unknown registry %s", async (key) => { setup(); expect((await request(`registries/${key}`)).status).toBe(404); });
  it("rejects unknown writable columns", async () => { const calls = setup(); const response = await request("registries/families", { values: { family_slug: "test", name: "Test", lab_slug: "test", role: "admin" }, before: null }); expect(response.status).toBe(400); expect(calls.some((call) => call.url.includes("rpc/"))).toBe(false); });
  it("passes the authenticated actor and concurrency baseline to the RPC", async () => { const calls = setup(); const before = { family_slug: "test", name: "Old", lab_slug: "test" }; expect((await request("registries/families", { values: { ...before, name: "New" }, before })).status).toBe(200); const call = calls.find((call) => call.url.includes("rpc/mutate_v2_admin_registry"))!; expect(JSON.parse(call.body!)).toEqual({ p_actor_user_id: "user-1", p_resource: "families", p_values: { ...before, name: "New" }, p_before: before }); });
  it("rejects ambiguous proposal decisions", async () => { const calls = setup(); expect((await request("price-proposals/test", { accept: "yes" })).status).toBe(400); expect(calls.some((call) => call.url.includes("rpc/"))).toBe(false); });
});
