import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ role: "member", credential: "abcdefghij" }));
vi.mock("./gateway-invalidation", () => ({ invalidateWorkspaceGatewayContext: async () => true }));
vi.mock("./settings-byok", () => ({ encryptByokSecret: async () => ({
    prefix: state.credential.slice(0, 6), suffix: state.credential.slice(-4), enc_value: "encrypted",
}) }));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: async () => undefined }));
vi.mock("./context", () => ({ requireAccountWorkspace: async () => ({
    workspaceId: "workspace-1", workspaceSlug: "acme", workspaceName: "Acme", workspaceLogoUrl: null,
    role: state.role, user: { id: "user-1" }, client: { from: () => {
        let columns = "";
        const row = () => Object.fromEntries(Object.entries({ id: "model-1", name: "Private model",
            base_url: "https://models.example.com/v1", credential_prefix: state.credential.slice(0, 6),
            credential_suffix: state.credential.slice(-4), enc_value: "encrypted",
        }).filter(([key]) => columns.split(",").includes(key)));
        const query: any = {
            select: (value: string) => { columns = value; return query; },
            eq: () => query, like: () => query, limit: async () => ({ data: [] }),
            insert: () => query, update: () => query,
            order: async () => ({ data: [row()] }),
            single: async () => ({ data: row() }), maybeSingle: async () => ({ data: row() }),
        };
        return query;
    } },
}) }));
import { accountPrivateModelsRouter } from "./private-models";

describe("private model credential response boundary", () => {
    beforeEach(() => { state.role = "member"; });
    it.each(["abcdefgh", "abcdefghi", "abcdefghij", "longer-private-credential"])(
        "does not reveal overlapping fragments of %s", async (credential) => {
            state.credential = credential;
            const response = await accountPrivateModelsRouter.request("https://example.com/", {}, {} as any);
            expect(response.status).toBe(200);
            const body = await response.json() as any;
            expect(body.canManage).toBe(false);
            expect(body.models[0]).toMatchObject({ name: "Private model", credential_suffix: credential.slice(-4) });
            expect(body.models[0]).not.toHaveProperty("credential_prefix");
            expect(body.models[0]).not.toHaveProperty("enc_value");
            expect(response.headers.get("cache-control")).toContain("no-store");
        },
    );
    it.each(["POST", "PATCH"])("also masks the %s management response", async (method) => {
        state.role = "admin";
        state.credential = "abcdefgh";
        const response = await accountPrivateModelsRouter.request(`https://example.com/${method === "PATCH" ? "model-1" : ""}`, {
            method, headers: { "content-type": "application/json" }, body: JSON.stringify({
                slug: "assistant", name: "Assistant", base_url: "https://models.example.com/v1",
                upstream_model_id: "model", credential: state.credential,
            }),
        }, {} as any);
        expect(response.status).toBe(method === "POST" ? 201 : 200);
        const body = await response.json() as any;
        expect(body.model.credential_suffix).toBe("efgh");
        expect(body.model).not.toHaveProperty("credential_prefix");
        expect(body.model).not.toHaveProperty("enc_value");
    });
});
