import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";

const mocks = vi.hoisted(() => {
    const key = { id: "key-1", workspace_id: "workspace-1", name: "Production", status: "active", storage_locations: ["railway"] as string[] };
    const update = vi.fn(() => ({ eq: () => ({ eq: async () => ({ error: null }) }) }));
    const insert = vi.fn(() => ({ select: () => ({ maybeSingle: async () => ({ data: { id: "key-2" }, error: null }) }) }));
    const keyRow = { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: key, error: null }) }) }), update, insert };
    // enforceKeyLimit: workspace tier, then a count of active keys.
    const countQuery: any = { eq: () => countQuery, or: () => countQuery, neq: () => countQuery, then: (resolve: (value: unknown) => void) => resolve({ count: 0, error: null }) };
    const client = {
        from: vi.fn((table: string) => table === "workspaces"
            ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { tier: "basic" }, error: null }) }) }) }
            : { ...keyRow, select: (columns: string, options?: unknown) => options ? countQuery : keyRow.select() }),
    };
    return { key, client, update, insert, audit: vi.fn() };
});

vi.mock("@/auth/requireUser", () => ({ requireUser: async () => ({ id: "user-1" }) }));
vi.mock("@/data/supabase", () => ({ getDataClient: () => mocks.client }));
vi.mock("./context", () => ({ requireAccountWorkspace: async () => ({ workspaceId: "workspace-1", role: "owner", client: mocks.client }) }));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: mocks.audit }));

import { accountSettingsKeysRouter } from "./settings-keys";
const app = new Hono<{ Bindings: Env }>().route("/", accountSettingsKeysRouter);
const env = { KEY_PEPPER_ACTIVE: "pepper" } as Env;
const executionContext = { waitUntil: () => undefined, passThroughOnException: () => undefined } as unknown as ExecutionContext;

function request(method: string, path: string, body: unknown) {
    return app.request(`https://example.com${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, env, executionContext);
}

describe("key storage locations", () => {
    beforeEach(() => vi.clearAllMocks());

    it("stores known locations in catalogue order on create and audits them", async () => {
        const response = await request("POST", "/keys", { workspaceId: "workspace-1", name: "Prod", storageLocations: ["github", "railway", "railway"] });
        expect(response.status).toBe(200);
        expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ storage_locations: ["railway", "github"] }));
        expect(mocks.audit).toHaveBeenCalledWith(mocks.client, expect.objectContaining({ action: "api_key.created", metadata: expect.objectContaining({ storageLocations: ["railway", "github"] }) }));
    });

    it("creates keys without a location", async () => {
        expect((await request("POST", "/keys", { workspaceId: "workspace-1", name: "Prod" })).status).toBe(200);
        expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ storage_locations: [] }));
    });

    it("rejects unknown locations before creating a key", async () => {
        const response = await request("POST", "/keys", { workspaceId: "workspace-1", name: "Prod", storageLocations: ["my-laptop"] });
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: "invalid_storage_locations" });
        expect(mocks.insert).not.toHaveBeenCalled();
    });

    it("updates and clears locations on an existing key", async () => {
        expect((await request("PUT", "/keys/key-1", { storageLocations: ["vercel", "1password"] })).status).toBe(200);
        expect(mocks.update).toHaveBeenCalledWith({ storage_locations: ["vercel", "1password"] });
        expect(mocks.audit).toHaveBeenCalledWith(mocks.client, expect.objectContaining({ metadata: { changedFields: ["storage_locations"], storageLocations: ["vercel", "1password"] } }));
        expect((await request("PUT", "/keys/key-1", { storageLocations: null })).status).toBe(200);
        expect(mocks.update).toHaveBeenLastCalledWith({ storage_locations: [] });
    });

    it("rejects too many locations", async () => {
        const ids = ["railway", "vercel", "netlify", "render", "fly", "heroku", "cloudflare", "supabase", "firebase"];
        expect((await request("PUT", "/keys/key-1", { storageLocations: ids })).status).toBe(400);
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it("never resumes a revoked key", async () => {
        mocks.key.status = "revoked";
        try {
            const response = await request("PUT", "/keys/key-1", { paused: false });
            expect(response.status).toBe(409);
            expect(await response.json()).toMatchObject({ error: "key_revoked" });
            expect(mocks.update).not.toHaveBeenCalled();
            // Other settings on a revoked key can still change, even when a client sends paused: true back.
            expect((await request("PUT", "/keys/key-1", { storageLocations: [] })).status).toBe(200);
            expect((await request("PUT", "/keys/key-1", { paused: true, name: "Renamed" })).status).toBe(200);
            expect(mocks.update).toHaveBeenLastCalledWith({ name: "Renamed" });
        } finally {
            mocks.key.status = "active";
        }
    });

    it("gives a rotated key the same locations", async () => {
        expect((await request("POST", "/keys/key-1/rotate", {})).status).toBe(200);
        expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ storage_locations: ["railway"] }));
    });

    it("refuses to rotate a workload identity key", async () => {
        Object.assign(mocks.key, { key_kind: "workload_identity" });
        try {
            const response = await request("POST", "/keys/key-1/rotate", {});
            expect(response.status).toBe(409);
            expect(await response.json()).toEqual({ error: "key_not_rotatable" });
            expect(mocks.insert).not.toHaveBeenCalled();
        } finally {
            delete (mocks.key as Record<string, unknown>).key_kind;
        }
    });
});
