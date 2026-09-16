import { expect, it, vi } from "vitest";
const createClient = vi.hoisted(() => vi.fn(() => ({ marker: Symbol() })));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

it("reuses a sessionless client and replaces it immediately on credential or database rotation", async () => {
    vi.resetModules(); createClient.mockClear();
    const { configureRuntime, clearRuntime, getSupabaseAdmin } = await import("./env");
    const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "first", GATEWAY_CACHE: {} } as any;
    configureRuntime(env); const first = getSupabaseAdmin(); clearRuntime();
    configureRuntime({ ...env }); expect(getSupabaseAdmin()).toBe(first); clearRuntime();
    expect(createClient).toHaveBeenCalledTimes(1);
    configureRuntime({ ...env, SUPABASE_SERVICE_ROLE_KEY: "second" }); expect(getSupabaseAdmin()).not.toBe(first); clearRuntime();
    configureRuntime({ ...env, SUPABASE_URL: "https://other.supabase.co" }); clearRuntime();
    expect(createClient).toHaveBeenCalledTimes(3);
    expect(createClient.mock.calls[0][2]).toMatchObject({ auth: { autoRefreshToken: false, persistSession: false } });
});
