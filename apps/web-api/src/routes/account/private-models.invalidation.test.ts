import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ invalidate: vi.fn(), role: "admin", error: null as any }));
vi.mock("./gateway-invalidation", () => ({ invalidateWorkspaceGatewayContext: state.invalidate }));
vi.mock("./settings-byok", () => ({ encryptByokSecret: async () => ({ prefix: "test", suffix: "key", enc_value: "encrypted" }) }));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: async () => undefined }));
vi.mock("./context", () => ({ requireAccountWorkspace: async () => ({
    workspaceId: "workspace-1", workspaceSlug: "acme", role: state.role, user: { id: "user-1" },
    client: { from: () => {
        const result = () => ({ data: { id: "model-1", name: "Private model" }, error: state.error });
        const query: any = { select: () => query, eq: () => query, like: () => query, limit: async () => ({ data: [] }),
            insert: () => query, update: () => query, delete: () => query,
            single: async () => result(), maybeSingle: async () => result(),
            then: (resolve: any) => Promise.resolve(result()).then(resolve) };
        return query;
    } },
}) }));
import { accountPrivateModelsRouter } from "./private-models";

describe("private model mutation invalidation", () => {
    beforeEach(() => { state.role = "admin"; state.error = null; state.invalidate.mockReset().mockResolvedValue(true); });
    const create = { slug: "assistant", name: "Assistant", base_url: "https://models.example.com/v1", upstream_model_id: "model", credential: "test-key-value" };
    it.each([
        ["POST", "/", create, 201],
        ["PATCH", "/model-1", { enabled: false }, 200],
        ["PATCH", "/model-1", { enabled: true }, 200],
        ["PATCH", "/model-1", { slug: "renamed" }, 200],
        ["PATCH", "/model-1", { credential: "replacement-key" }, 200],
        ["DELETE", "/model-1", undefined, 200],
    ])("invalidates after %s %s %j", async (method, path, body, status) => {
        const response = await accountPrivateModelsRouter.request(`https://example.com${path}`, {
            method: String(method), headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
        }, {} as any);
        expect(response.status).toBe(status);
        expect(state.invalidate).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "workspace-1" }), {});
        expect(await response.json()).toMatchObject({ gatewayCacheInvalidated: true });
    });
    it("reports failed invalidation without misreporting a saved update as failed", async () => {
        state.invalidate.mockRejectedValue(new Error("unavailable"));
        const response = await accountPrivateModelsRouter.request("https://example.com/model-1", {
            method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: true }),
        }, {} as any);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ gatewayCacheInvalidated: false });
    });
    it("does not invalidate unauthorized writes", async () => {
        state.role = "member";
        const response = await accountPrivateModelsRouter.request("https://example.com/model-1", { method: "DELETE" }, {} as any);
        expect(response.status).toBe(403);
        expect(state.invalidate).not.toHaveBeenCalled();
    });
});
