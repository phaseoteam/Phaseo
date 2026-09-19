import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";
import { fenceRequestStateMutation } from "./request-state-mutations";
const state = vi.hoisted(() => ({ authenticated: true, role: "admin", writes: 0, workspaceId: "00000000-0000-4000-8000-000000000001" }));
vi.mock("@/auth/requireUser", () => ({ requireUser: async () => state.authenticated ? { id: "owner" } : null }));
vi.mock("./context", () => ({ requireAccountWorkspace: async ({ workspaceId }: { workspaceId?: string }) => ({ workspaceId: workspaceId ?? state.workspaceId, role: state.role }) }));
vi.mock("@/data/supabase", () => ({ getDataClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { workspace_id: state.workspaceId }, error: null }) }) }) }) }) }));
const env = { GATEWAY_REQUEST_STATE_TEST_WORKSPACE_ID: state.workspaceId, GATEWAY_API_ORIGIN: "https://api-staging.phaseo.app", GATEWAY_INTERNAL_TEST_TOKEN: "fixture" } as Env;
function app() {
    const app = new Hono<{ Bindings: Env }>(); app.use("*", fenceRequestStateMutation);
    app.post("/keys", async c => { await c.req.json(); state.writes++; return c.json({ ok: true }); });
    app.delete("/keys/:id", c => { state.writes++; return c.json({ ok: true }); });
    return app;
}
describe("website request-state fencing", () => {
    beforeEach(() => { state.authenticated = true; state.role = "admin"; state.writes = 0; });
    afterEach(() => vi.unstubAllGlobals());
    it("acknowledges begin before writing and finish before returning success", async () => {
        const phases: string[] = [];
        vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
            const body = JSON.parse(init.body); phases.push(body.phase);
            expect(state.writes).toBe(body.phase === "begin" ? 0 : 1);
            return Response.json({ ok: true });
        }));
        const response = await app().request("/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId: state.workspaceId }) }, env);
        expect(response.status).toBe(200); expect(phases).toEqual(["begin", "finish"]);
    });
    it("does not mutate when the admission fence cannot be acknowledged", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
        const response = await app().request("/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId: state.workspaceId }) }, env);
        expect(response.status).toBe(503); expect(state.writes).toBe(0);
    });
    it("reports an uncertain write without reporting successful synchronization", async () => {
        vi.stubGlobal("fetch", vi.fn(async (_url, init) => JSON.parse(init.body).phase === "begin" ? Response.json({ ok: true }) : new Response("", { status: 503 })));
        const response = await app().request("/keys/00000000-0000-4000-8000-000000000002", { method: "DELETE" }, env);
        expect(response.status).toBe(503); expect(state.writes).toBe(1);
        expect(await response.json()).toMatchObject({ mutation_may_have_applied: true });
    });
    it("does not contact the staging control plane for another workspace", async () => {
        const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
        const response = await app().request("/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId: "other" }) }, env);
        expect(response.status).toBe(200); expect(fetch).not.toHaveBeenCalled();
    });
});
