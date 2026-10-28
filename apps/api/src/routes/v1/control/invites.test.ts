import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "./__fixtures__/fake-supabase";

const state = vi.hoisted(() => ({
	db: null as unknown as FakeDb,
	auth: {} as Record<string, unknown>,
	audits: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/runtime/env", () => ({ getSupabaseAdmin: () => state.db.client }));
vi.mock("@/pipeline/before/guards", () => ({ guardManagementAuth: async () => ({ ok: true, value: state.auth }) }));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: async (_client: unknown, event: Record<string, unknown>) => { state.audits.push(event); return true; } }));
vi.mock("./workspace-membership", () => ({ inviteFingerprint: async (token: string) => `fp:${token}` }));
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers }),
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

import { invitesRoutes } from "./invites";

const accept = (token: unknown) => invitesRoutes.request("https://api.phaseo.test/accept", {
	method: "POST",
	headers: { "content-type": "application/json" },
	body: JSON.stringify({ token }),
});
const requests = (query = "") => invitesRoutes.request(`https://api.phaseo.test/requests${query}`);

beforeEach(() => {
	state.db = createFakeDb({
		workspace_invites: [
			{ id: "invite_1", workspace_id: "ws_team", token_fingerprint: "fp:JOIN-CODE-1", expires_at: null, max_uses: null, uses_count: 0 },
			{ id: "invite_2", workspace_id: "ws_full", token_fingerprint: "fp:USED-UP-CODE", expires_at: null, max_uses: 1, uses_count: 1 },
		],
		workspace_members: [{ workspace_id: "ws_mine", user_id: "user_1", role: "owner" }],
		workspace_join_requests: [],
	});
	state.auth = { workspaceId: "ws_mine", authMethod: "oauth", userId: "user_1", requestId: "req_1", oauthScopes: ["workspaces:read", "workspaces:write"] };
	state.audits.length = 0;
});

describe("accepting a workspace invite", () => {
	it("asks to join the invite's workspace, once, and audits it there", async () => {
		const response = await accept("JOIN-CODE-1");
		expect(response.status).toBe(201);
		expect((await response.json() as any).data).toMatchObject({ workspace_id: "ws_team", status: "pending" });
		expect(state.db.tables.workspace_join_requests).toEqual([expect.objectContaining({ workspace_id: "ws_team", invite_id: "invite_1", requester_user_id: "user_1", status: "pending" })]);
		expect(state.audits).toEqual([expect.objectContaining({ workspaceId: "ws_team", actorUserId: "user_1", action: "workspace.join_request.created" })]);

		const again = await accept("JOIN-CODE-1");
		expect(again.status).toBe(409);
		expect((await again.json() as any).error).toBe("request_pending");
		expect(state.db.tables.workspace_join_requests).toHaveLength(1);
	});

	it("refuses unknown and used-up invites, and workspaces you already belong to", async () => {
		expect((await accept("NOT-A-CODE")).status).toBe(404);
		expect((await accept("USED-UP-CODE")).status).toBe(404);
		expect((await accept("abc")).status).toBe(400);
		state.db.tables.workspace_members.push({ workspace_id: "ws_team", user_id: "user_1", role: "member" });
		const response = await accept("JOIN-CODE-1");
		expect(response.status).toBe(409);
		expect((await response.json() as any).error).toBe("already_member");
		expect(state.db.tables.workspace_join_requests).toHaveLength(0);
	});

	it("needs an OAuth user with workspaces:write; management keys have no one to add", async () => {
		state.auth = { workspaceId: "ws_mine", authMethod: "api_key", requestId: "req_1", scopes: [] };
		let response = await accept("JOIN-CODE-1");
		expect(response.status).toBe(403);
		expect((await response.json() as any).error).toBe("oauth_user_required");
		state.auth = { ...state.auth, authMethod: "oauth", userId: "user_1", oauthScopes: ["workspaces:read"] };
		response = await accept("JOIN-CODE-1");
		expect(response.status).toBe(403);
		expect((await response.json() as any).error).toBe("insufficient_scope");
		expect(state.db.tables.workspace_join_requests).toHaveLength(0);
	});
});

describe("listing your join requests", () => {
	it("lists only your own, pending unless asked otherwise", async () => {
		state.db.tables.workspace_join_requests.push(
			{ id: "r1", workspace_id: "ws_team", requester_user_id: "user_1", status: "pending", created_at: "2026-10-28T10:00:00Z", workspaces: { name: "Team" } },
			{ id: "r2", workspace_id: "ws_old", requester_user_id: "user_1", status: "rejected", created_at: "2026-10-01T10:00:00Z", decided_at: "2026-10-02T10:00:00Z", workspaces: { name: "Old" } },
			{ id: "r3", workspace_id: "ws_team", requester_user_id: "user_2", status: "pending", created_at: "2026-10-28T11:00:00Z", workspaces: { name: "Team" } },
		);
		let body = await (await requests()).json() as any;
		expect(body.data).toEqual([{ id: "r1", workspace_id: "ws_team", workspace_name: "Team", status: "pending", created_at: "2026-10-28T10:00:00Z", decided_at: null }]);
		body = await (await requests("?status=all")).json() as any;
		expect(body.data.map((row: any) => row.id)).toEqual(["r1", "r2"]);
		expect((await requests("?status=maybe")).status).toBe(400);
	});
});
