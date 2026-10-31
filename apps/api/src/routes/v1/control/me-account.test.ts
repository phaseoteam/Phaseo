import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "./__fixtures__/fake-supabase";

const state = vi.hoisted(() => ({
	db: null as unknown as FakeDb,
	auth: {} as Record<string, unknown>,
	audits: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/runtime/env", () => ({ getSupabaseAdmin: () => state.db.client }));
vi.mock("@/pipeline/before/auth", () => ({ authenticateManagement: async () => state.auth }));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: async (_client: unknown, event: Record<string, unknown>) => { state.audits.push(event); return true; } }));
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers }),
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

import { meAccountRoutes } from "./me-account";

const call = (path: string, method = "GET", body?: unknown) => meAccountRoutes.request(`https://api.phaseo.test${path}`, {
	method,
	headers: { "content-type": "application/json" },
	body: body === undefined ? undefined : JSON.stringify(body),
});
const ALL_SCOPES = ["me:read", "settings:write", "oauth_clients:read", "oauth_clients:write", "oauth_clients:delete"];

beforeEach(() => {
	state.db = createFakeDb({
		users: [{ user_id: "user_1", display_name: "Old Name", default_workspace_id: null, obfuscate_info: false }],
		workspace_members: [{ workspace_id: "ws_1", user_id: "user_1", role: "owner" }],
		workspaces: [{ id: "ws_1", name: "Mine" }],
		oauth_app_metadata: [{ client_id: "client_tool", name: "Tool" }],
		oauth_authorizations: [
			{ id: "auth_cli", user_id: "user_1", client_id: "phaseo_cli", workspace_id: "ws_1", scopes: ["me:read", "keys:read", "keys:write"], created_at: "2026-10-01T00:00:00Z", last_used_at: null, revoked_at: null },
			{ id: "auth_tool", user_id: "user_1", client_id: "client_tool", workspace_id: "ws_1", scopes: ["models:read"], created_at: "2026-10-02T00:00:00Z", last_used_at: null, revoked_at: null },
			{ id: "auth_other", user_id: "user_2", client_id: "client_tool", workspace_id: "ws_1", scopes: ["models:read"], created_at: "2026-10-02T00:00:00Z", last_used_at: null, revoked_at: null },
		],
	});
	state.auth = { ok: true, workspaceId: "ws_1", authMethod: "oauth", userId: "user_1", oauthClientId: "phaseo_cli", oauthScopes: ALL_SCOPES };
	state.audits.length = 0;
});

describe("account routes", () => {
	it("refuses management keys", async () => {
		state.auth = { ok: true, workspaceId: "ws_1", authMethod: "api_key", scopes: [] };
		expect((await call("/profile")).status).toBe(401);
		expect((await call("/authorized-apps")).status).toBe(401);
	});

	it("reads and updates the profile", async () => {
		expect((await (await call("/profile")).json() as any).data).toMatchObject({ display_name: "Old Name", obfuscate_info: false });
		const response = await call("/profile", "PATCH", { display_name: "  New Name ", default_workspace_id: "ws_1", obfuscate_info: true });
		expect(response.status).toBe(200);
		expect((await response.json() as any).data).toEqual({ user_id: "user_1", display_name: "New Name", default_workspace_id: "ws_1", obfuscate_info: true });
	});

	it("refuses invalid profile changes and workspaces you do not belong to", async () => {
		expect((await call("/profile", "PATCH", { display_name: "" })).status).toBe(400);
		expect((await call("/profile", "PATCH", { obfuscate_info: "yes" })).status).toBe(400);
		expect((await call("/profile", "PATCH", {})).status).toBe(400);
		expect((await call("/profile", "PATCH", { default_workspace_id: "ws_other" })).status).toBe(403);
		state.auth = { ...state.auth, oauthScopes: ["me:read"] };
		expect((await call("/profile", "PATCH", { display_name: "x" })).status).toBe(403);
		expect(state.db.tables.users[0].display_name).toBe("Old Name");
	});

	it("lists only your own live authorizations", async () => {
		const body = await (await call("/authorized-apps")).json() as any;
		expect(body.data.map((app: any) => [app.id, app.app_name, app.current])).toEqual([["auth_cli", "Phaseo CLI", true], ["auth_tool", "Tool", false]]);
	});

	it("only removes scopes, never adds them", async () => {
		let response = await call("/authorized-apps/auth_cli", "PATCH", { scopes: ["me:read", "keys:read", "keys:delete"] });
		expect(response.status).toBe(400);
		expect((await response.json() as any).error).toBe("scopes_can_only_be_reduced");
		expect((await call("/authorized-apps/auth_cli", "PATCH", { scopes: [] })).status).toBe(400);
		response = await call("/authorized-apps/auth_cli", "PATCH", { scopes: ["me:read", "keys:read"] });
		expect(response.status).toBe(200);
		expect(state.db.tables.oauth_authorizations[0].scopes).toEqual(["me:read", "keys:read"]);
		expect(state.audits).toEqual([expect.objectContaining({ action: "oauth_authorization.reduced", targetId: "auth_cli", metadata: { removed: ["keys:write"] } })]);
	});

	it("revokes your own authorizations only", async () => {
		expect((await call("/authorized-apps/auth_other", "DELETE")).status).toBe(404);
		expect(state.db.tables.oauth_authorizations[2].revoked_at).toBeNull();
		const response = await call("/authorized-apps/auth_tool", "DELETE");
		expect(response.status).toBe(200);
		expect(state.db.tables.oauth_authorizations[1].revoked_at).toEqual(expect.any(String));
		expect((await call("/authorized-apps/auth_tool", "DELETE")).status).toBe(404);
		expect(state.audits).toEqual([expect.objectContaining({ action: "oauth_authorization.revoked", targetId: "auth_tool", workspaceId: "ws_1" })]);
	});
});
