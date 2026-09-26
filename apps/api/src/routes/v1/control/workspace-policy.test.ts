import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
    bindings: {} as Record<string, string>,
    auth: vi.fn(),
    publish: vi.fn(),
}));
vi.mock("@/runtime/env", () => ({ getBindings: () => state.bindings }));
vi.mock("@/pipeline/before/guards", () => ({ guardAuth: state.auth }));
vi.mock("@/core/workspace-publication", () => ({ publishWorkspaceMutation: state.publish }));
vi.mock("@/routes/utils", () => ({
    json: (body: unknown, status = 200, headers = {}) => Response.json(body, { status, headers }),
    withRuntime: (handler: (request: Request) => Promise<Response>) => (c: any) => handler(c.req.raw),
}));

import { workspacePolicyRoutes } from "./workspace-policy";

function request(headers: Record<string, string> = {}, workspace = "workspace-a") {
    return workspacePolicyRoutes.request(`https://gateway.test/${workspace}/invalidate`, { method: "POST", headers });
}

describe("workspace invalidation authorization", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.bindings = { PHASEO_CONTROL_SECRET: "secret", PHASEO_CONTROL_KEY: "service-key" };
        state.auth.mockResolvedValue({ ok: false, response: Response.json({ error: "unauthorized" }, { status: 401 }) });
        state.publish.mockResolvedValue({ contextVersion: 2, policyVersion: 3 });
    });

    it("requires the control secret before doing authentication or publication", async () => {
        expect((await request({ authorization: "Bearer service-key" })).status).toBe(403);
        expect(state.auth).not.toHaveBeenCalled();
        expect(state.publish).not.toHaveBeenCalled();
    });
    it("requires both service credentials", async () => {
        expect((await request({ "x-control-secret": "secret" })).status).toBe(401);
        expect(state.publish).not.toHaveBeenCalled();
    });
    it("does not accept a bare service token as Bearer authentication", async () => {
        expect((await request({ "x-control-secret": "secret", authorization: "service-key" })).status).toBe(401);
        expect(state.publish).not.toHaveBeenCalled();
    });
    it("publishes once with both configured service credentials and no user DB lookup", async () => {
        const response = await request({ "x-control-secret": "secret", authorization: "Bearer service-key" });
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.json()).toMatchObject({ ok: true, workspace_id: "workspace-a", context_version: 2, cache_version: 3 });
        expect(state.auth).not.toHaveBeenCalled();
        expect(state.publish).toHaveBeenCalledExactlyOnceWith("workspace-a");
    });
    it("keeps ordinary authenticated callers scoped to their own workspace", async () => {
        state.auth.mockResolvedValue({ ok: true, value: { workspaceId: "workspace-a" } });
        const headers = { "x-control-secret": "secret", authorization: "Bearer user-key" };
        expect((await request(headers, "workspace-b")).status).toBe(403);
        expect(state.publish).not.toHaveBeenCalled();
        expect((await request(headers)).status).toBe(200);
        expect(state.auth).toHaveBeenLastCalledWith(expect.any(Request), { useKvCache: false });
    });
    it("fails closed when control credentials are unconfigured", async () => {
        state.bindings = {};
        expect((await request()).status).toBe(503);
        expect(state.publish).not.toHaveBeenCalled();
    });
    it("rejects invalid workspace identifiers without publishing", async () => {
        expect((await request({ "x-control-secret": "secret", authorization: "Bearer service-key" }, "a".repeat(129))).status).toBe(400);
        expect(state.publish).not.toHaveBeenCalled();
    });
    it("reports publication failure without leaking upstream diagnostics", async () => {
        state.publish.mockRejectedValue(new Error("secret connection details"));
        const response = await request({ "x-control-secret": "secret", authorization: "Bearer service-key" });
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ ok: false, error: "workspace_publication_failed" });
    });
});
