import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
    ENV: "development" as const,
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    KEY_PEPPER_ACTIVE: "test-pepper",
    GATEWAY_API_ORIGIN: "https://gateway.example.com",
    PHASEO_MANAGEMENT_KEY: "test-management-key",
    PHASEO_CONTROL_SECRET: "test-control-secret",
};
afterEach(() => vi.unstubAllGlobals());

function mockLifecycle(invalidation: "ok" | "http-error" | "network-error", status = "active") {
    const events: string[] = [];
    const writes: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(String(input), init);
        const url = request.url;
        const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
        if (url.includes("/auth/v1/user")) return json({ id: "user-1", app_metadata: {}, user_metadata: {} });
        if (url.includes("workspace_members")) return json([{ role: "admin" }]);
        if (url.includes("/rest/v1/workspaces")) return json([{ owner_user_id: "user-1" }]);
        if (url.startsWith(env.GATEWAY_API_ORIGIN)) {
            events.push("invalidate");
            if (invalidation === "network-error") throw new Error("invalidation unavailable");
            return json({}, invalidation === "http-error" ? 503 : 200);
        }
        if (url.includes("/rest/v1/keys") && request.method === "GET") return json([{ id: "key-1", workspace_id: "workspace-1", name: "Disposable", status }]);
        if (url.includes("/rest/v1/keys") && request.method === "PATCH") {
            events.push("delete-database-row");
            writes.push(await request.json() as Record<string, unknown>);
        }
        return json([]);
    }));
    return { events, writes };
}
function removeKey(bindings = env) {
    return app.request("https://phaseo.app/api/account/settings/keys/key-1?confirmName=Disposable", {
        method: "DELETE", headers: { authorization: "Bearer session-token" },
    }, bindings);
}

describe("website key revocation", () => {
    it("commits the deleted status before invalidating", async () => {
        const state = mockLifecycle("ok");
        expect((await removeKey()).status).toBe(200);
        expect(state.events).toEqual(["delete-database-row", "invalidate"]);
        expect(state.writes).toEqual([expect.objectContaining({ status: "deleted", soft_blocked: true, hash: "deleted:key-1" })]);
    });
    it("reports failure when gateway invalidation returns HTTP 503", async () => {
        const state = mockLifecycle("http-error");
        const response = await removeKey();
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: "key_invalidation_failed" });
        expect(state.writes).toHaveLength(1);
    });
    it("reports failure when control configuration is absent", async () => {
        const state = mockLifecycle("ok");
        expect((await removeKey({ ...env, PHASEO_MANAGEMENT_KEY: "" })).status).toBe(503);
        expect(state.events).toEqual(["delete-database-row"]);
    });
    it("keeps the key deleted and reports failure when invalidation fetch rejects", async () => {
        const state = mockLifecycle("network-error");
        expect((await removeKey()).status).toBe(503);
        expect(state.writes).toHaveLength(1);
    });
    it("retries invalidation for an already-deleted key", async () => {
        const state = mockLifecycle("ok", "deleted");
        const response = await removeKey();
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, alreadyDeleted: true });
        expect(state.events).toEqual(["invalidate"]);
        expect(state.writes).toHaveLength(0);
    });
    it("does not hide repeated invalidation failures on an already-deleted key", async () => {
        const state = mockLifecycle("http-error", "deleted");
        expect((await removeKey()).status).toBe(503);
        expect(state.events).toEqual(["invalidate"]);
    });
});
