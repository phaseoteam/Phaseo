import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
    role: "admin", events: [] as string[], failWrite: false, failInsert: false,
    publish: vi.fn(),
}));
function query(table: string) {
    let operation = "read";
    const q: any = {};
    for (const method of ["select", "eq", "neq", "in", "order", "limit"]) q[method] = () => q;
    for (const method of ["insert", "update", "upsert", "delete"]) q[method] = () => { operation = method; return q; };
    const finish = () => {
        const writes = operation !== "read";
        if (writes) state.events.push(`${table}:${operation}`);
        return {
            data: table === "byok_keys" ? { id: "key-a", workspace_id: "workspace-a", provider_id: "openai" }
                : { id: "guardrail-a", workspace_id: "workspace-a" },
            count: 0,
            error: writes && (state.failWrite || state.failInsert && operation === "insert") ? { message: "write failed" } : null,
        };
    };
    q.maybeSingle = async () => finish();
    q.then = (resolve: any, reject: any) => Promise.resolve(finish()).then(resolve, reject);
    return q;
}
const client = { from: query, rpc: async () => { state.events.push("rpc"); return { error: state.failWrite ? {} : null }; } };
vi.mock("./context", () => ({
    requireAccountWorkspace: async () => ({ workspaceId: "workspace-a", user: { id: "user-a" }, role: state.role, client, userClient: client }),
}));
vi.mock("@/data/supabase", () => ({ getDataClient: () => client }));
vi.mock("@/auth/requireUser", () => ({ requireUser: async () => ({ id: "user-a" }) }));
vi.mock("./gateway-invalidation", () => ({ invalidateWorkspaceGatewayContext: state.publish }));

import { accountSettingsByokRouter } from "./settings-byok";
import { accountSettingsGuardrailsRouter } from "./settings-guardrails";

const cases = [
    ["byok", "POST", "/byok", { workspaceId: "workspace-a", name: "key", providerId: "openai", value: "sk-fake-test-credential-only" }],
    ["byok", "PUT", "/byok/key-a", { enabled: false }],
    ["byok", "DELETE", "/byok/key-a", {}],
    ["byok", "POST", "/byok/key-a/reorder", { direction: "up" }],
    ["byok", "PUT", "/byok-fallback", { workspaceId: "workspace-a", enabled: true }],
    ["guardrail", "PUT", "/guardrails/global", { workspaceId: "workspace-a" }],
    ["guardrail", "POST", "/guardrails", { workspaceId: "workspace-a", name: "guardrail" }],
    ["guardrail", "PUT", "/guardrails/guardrail-a", { workspaceId: "workspace-a", name: "guardrail" }],
    ["guardrail", "DELETE", "/guardrails/guardrail-a", { workspaceId: "workspace-a" }],
    ["guardrail", "PUT", "/guardrails/guardrail-a/keys", { workspaceId: "workspace-a", keyIds: [] }],
    ["guardrail", "PUT", "/guardrails/guardrail-a/members", { workspaceId: "workspace-a", userIds: [] }],
] as const;

function request([kind, method, path, body]: typeof cases[number]) {
    const router = kind === "byok" ? accountSettingsByokRouter : accountSettingsGuardrailsRouter;
    return router.request(`https://web.test${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, {
        BYOK_KMS_KEY_V1: btoa("x".repeat(32)),
    } as any);
}

describe("website workspace mutation publication", () => {
    beforeEach(() => {
        state.role = "admin"; state.events = []; state.failWrite = false; state.failInsert = false;
        state.publish.mockReset().mockImplementation(async () => { state.events.push("publish"); return true; });
    });
    for (const entry of cases) {
        it(`publishes exactly once after ${entry[1]} ${entry[2]} commits`, async () => {
            const response = await request(entry);
            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({ gatewayCacheInvalidated: true });
            expect(state.events.length).toBeGreaterThan(1);
            expect(state.events.at(-1)).toBe("publish");
            expect(state.publish).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ workspaceId: "workspace-a" }), expect.anything());
        });
        it(`does not publish or write for a member: ${entry[1]} ${entry[2]}`, async () => {
            state.role = "member";
            expect((await request(entry)).status).toBe(403);
            expect(state.events).toEqual([]);
            expect(state.publish).not.toHaveBeenCalled();
        });
        it(`does not publish after a failed write: ${entry[1]} ${entry[2]}`, async () => {
            state.failWrite = true;
            expect((await request(entry)).status).toBeGreaterThanOrEqual(400);
            expect(state.publish).not.toHaveBeenCalled();
        });
        it(`reports saved data separately from publication failure: ${entry[1]} ${entry[2]}`, async () => {
            state.publish.mockResolvedValue(false);
            const response = await request(entry);
            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({ gatewayCacheInvalidated: false });
            expect(state.events.length).toBeGreaterThan(0);
        });
    }
});
