import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";

const mocks = vi.hoisted(() => {
    const key = { id: "key-1", workspace_id: "workspace-1", name: "Production", status: "active" };
    const update = vi.fn(() => ({ eq: () => ({ eq: async () => ({ error: null }) }) }));
    const client = { from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: key, error: null }) }) }), update })) };
    return { key, client, update, role: "admin", audit: vi.fn() };
});

vi.mock("@/auth/requireUser", () => ({ requireUser: async () => ({ id: "user-1" }) }));
vi.mock("@/data/supabase", () => ({ getDataClient: () => mocks.client }));
vi.mock("./context", () => ({ requireAccountWorkspace: async () => ({ workspaceId: "workspace-1", role: mocks.role, client: mocks.client }) }));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: mocks.audit }));

import { accountSettingsKeysRouter } from "./settings-keys";
const app = new Hono<{ Bindings: Env }>().route("/", accountSettingsKeysRouter);

async function save(ipAllowlist: unknown, env: Partial<Env> = {}) {
    const background: Promise<unknown>[] = [];
    const response = await app.request("https://example.com/keys/key-1", {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ipAllowlist }),
    }, env as Env, { waitUntil: (promise: Promise<unknown>) => background.push(promise), passThroughOnException: () => undefined } as ExecutionContext);
    await Promise.all(background);
    return response;
}

describe("per-key IP settings", () => {
    beforeEach(() => { vi.clearAllMocks(); mocks.role = "admin"; });
    afterEach(() => vi.unstubAllGlobals());
    it("invalidates gateway authorization after saving the policy", async () => {
        const fetchMock = vi.fn(async () => new Response("{}"));
        vi.stubGlobal("fetch", fetchMock);
        expect((await save([], { PHASEO_CONTROL_KEY: "control-key", PHASEO_CONTROL_SECRET: "control-secret", GATEWAY_API_ORIGIN: "https://gateway.example" })).status).toBe(200);
        expect(fetchMock).toHaveBeenCalledWith("https://gateway.example/v1/keys/key-1/invalidate", expect.objectContaining({ method: "POST" }));
    });
    it("saves labeled ranges and audits the changed field", async () => {
        const entries = [{ label: " Office ", address: " 203.0.113.0/24 " }];
        expect((await save(entries)).status).toBe(200);
        expect(mocks.update).toHaveBeenCalledWith({ ip_allowlist: [{ label: "Office", address: "203.0.113.0/24" }] });
        expect(mocks.audit).toHaveBeenCalledWith(mocks.client, expect.objectContaining({ targetId: "key-1", metadata: { changedFields: ["ip_allowlist"] } }));
    });
    it("removes restrictions with an empty list", async () => {
        expect((await save([])).status).toBe(200);
        expect(mocks.update).toHaveBeenCalledWith({ ip_allowlist: [] });
    });
    it("rejects malformed entries before writing", async () => {
        expect((await save([{ label: "Office", address: "invalid" }])).status).toBe(400);
        expect(mocks.update).not.toHaveBeenCalled();
    });
    it("denies non-admin members", async () => {
        mocks.role = "member";
        expect((await save([])).status).toBe(403);
        expect(mocks.update).not.toHaveBeenCalled();
    });
    it("saves settings and limits together in one update", async () => {
        const response = await app.request("https://example.com/keys/key-1", {
            method: "PUT", headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "Renamed", ipAllowlist: [], limits: { dailyRequests: 25, monthlyCostNanos: 1000000000 } }),
        }, {} as Env, { waitUntil: () => undefined, passThroughOnException: () => undefined } as ExecutionContext);
        expect(response.status).toBe(200);
        expect(mocks.update).toHaveBeenCalledTimes(1);
        expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ name: "Renamed", ip_allowlist: [], daily_limit_requests: 25, monthly_limit_cost_nanos: 1000000000 }));
    });
});
