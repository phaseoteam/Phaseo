import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	member: null as Record<string, unknown> | null,
	invite: null as Record<string, unknown> | null,
	invites: [] as Array<Record<string, unknown>>,
	insertedInvite: null as Record<string, unknown> | null,
	auditEvents: [] as Array<Record<string, unknown>>,
	rpcArgs: null as { name: string; args: Record<string, unknown> } | null,
}));

function mockSupabase() {
	return {
		from(table: string) {
			if (table === "workspace_members") {
				const result = {
					data: state.member,
					error: null,
				};
				const chain: any = {
					update: () => chain,
					eq: () => chain,
					select: () => chain,
					maybeSingle: async () => result,
				};
				return chain;
			}
			if (table === "workspace_invites") {
				const chain: any = {
					select: () => chain,
					eq: () => chain,
					order: () => chain,
					range: async () => ({ data: state.invites, error: null, count: state.invites.length }),
					insert: (payload: Record<string, unknown>) => {
						state.insertedInvite = payload;
						return {
							select: () => ({ maybeSingle: async () => ({ data: state.invite, error: null }) }),
						};
					},
					delete: () => chain,
					maybeSingle: async () => ({ data: state.invite ? { id: state.invite.id } : null, error: null }),
				};
				return chain;
			}
			if (table === "workspace_audit_events") {
				return {
					insert: async (payload: Record<string, unknown>) => {
						state.auditEvents.push(payload);
						return { error: null };
					},
				};
			}
			throw new Error(`Unexpected table: ${table}`);
		},
		rpc: async (name: string, args: Record<string, unknown>) => {
			state.rpcArgs = { name, args };
			return {
				data: [{ id: "request_1", requester_user_id: "user_requester", status: "approved" }],
				error: null,
			};
		},
	};
}

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({
		INVITE_ENCRYPTION_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
		HMAC_ENCRYPTION_KEY: btoa("membership-test-hmac-key"),
	}),
	getSupabaseAdmin: () => mockSupabase(),
}));

vi.mock("@/pipeline/before/guards", () => ({
	guardManagementAuth: vi.fn(async () => ({
		ok: true,
		value: {
			workspaceId: "workspace_1",
			apiKeyId: "management_1",
			apiKeyRef: null,
			apiKeyKid: null,
			userId: "user_actor",
			requestId: "request_trace_1",
		},
	})),
}));

vi.mock("./route-helpers", () => ({
	requireCapability: () => null,
	requireOAuthWorkspaceRole: async () => null,
	rejectThirdPartyOAuthSpendingChange: () => null,
	internalServerError: (_operation: string, error: unknown) => new Response(JSON.stringify({ error: String(error) }), { status: 500 }),
}));

vi.mock("./workspaces", () => ({
	resolveAuthorizedWorkspace: async () => ({
		id: "workspace_1",
		name: "Production",
		slug: "production",
		owner_user_id: "user_owner",
	}),
}));

vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", ...headers },
	}),
	withRuntime: (handler: (request: Request) => Promise<Response>) => (context: any) => handler(context.req.raw),
}));

describe("workspace membership management", () => {
	beforeEach(() => {
		state.member = null;
		state.invite = null;
		state.invites.length = 0;
		state.insertedInvite = null;
		state.auditEvents.length = 0;
		state.rpcArgs = null;
		vi.resetModules();
	});

	it("updates a non-owner member role and records an audit event", async () => {
		state.member = { workspace_id: "workspace_1", user_id: "user_member", role: "admin", joined_at: null };
		const { workspaceMembershipRoutes } = await import("./workspace-membership");
		const response = await workspaceMembershipRoutes.request("https://example.com/workspace_1/members/user_member", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ role: "admin" }),
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ data: { user_id: "user_member", role: "admin" } });
		expect(state.auditEvents[0]).toMatchObject({
			action: "workspace.member.role_updated",
			target_id: "user_member",
		});
	});

	it("does not allow changing the workspace owner role", async () => {
		const { workspaceMembershipRoutes } = await import("./workspace-membership");
		const response = await workspaceMembershipRoutes.request("https://example.com/workspace_1/members/user_owner", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ role: "member" }),
		});

		expect(response.status).toBe(409);
	});

	it("creates a server-generated, write-once invite token", async () => {
		state.invite = {
			id: "invite_1",
			workspace_id: "workspace_1",
			creator_user_id: "user_actor",
			role: "member",
			token_preview: "AB...yz",
			expires_at: "2026-09-06T00:00:00Z",
			max_uses: 3,
			uses_count: 0,
			revoked: false,
			created_at: "2026-08-30T00:00:00Z",
		};
		const { workspaceMembershipRoutes } = await import("./workspace-membership");
		const response = await workspaceMembershipRoutes.request("https://example.com/workspace_1/invites", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ role: "member", expires_in_days: 7, max_uses: 3 }),
		});
		const body = await response.json() as { token: string };

		expect(response.status).toBe(201);
		expect(body.token).toHaveLength(20);
		expect(state.insertedInvite).toMatchObject({
			workspace_id: "workspace_1",
			creator_user_id: "user_actor",
			role: "member",
			max_uses: 3,
			key_version: 1,
		});
		expect(state.insertedInvite?.token_encrypted).not.toBe(body.token);
		expect(String(state.insertedInvite?.token_fingerprint)).toHaveLength(64);
		expect(state.auditEvents[0]).toMatchObject({ action: "workspace.invite.created", target_id: "invite_1" });
	});

	it("rejects unbounded invite use counts", async () => {
		const { workspaceMembershipRoutes } = await import("./workspace-membership");
		const response = await workspaceMembershipRoutes.request("https://example.com/workspace_1/invites", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ max_uses: 1_000_001 }),
		});

		expect(response.status).toBe(400);
		expect(state.insertedInvite).toBeNull();
	});

	it("uses the atomic management decision function", async () => {
		const { workspaceMembershipRoutes } = await import("./workspace-membership");
		const response = await workspaceMembershipRoutes.request("https://example.com/workspace_1/join-requests/request_1/approve", {
			method: "POST",
		});

		expect(response.status).toBe(200);
		expect(state.rpcArgs).toEqual({
			name: "management_decide_workspace_join_request",
			args: {
				p_workspace_id: "workspace_1",
				p_request_id: "request_1",
				p_decision: "approve",
				p_actor_user_id: "user_actor",
			},
		});
		expect(state.auditEvents[0]).toMatchObject({ action: "workspace.join_request.approved" });
	});
});
