// Workspace role rules on the control API (review 2026-11-04): owner-only changes stay owner-only for
// management keys, a management key keeps only its creator's current role, people join only through an
// invite and a join request, and auto top-up is a billing change.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;
type Auth = Record<string, any>;

const state = vi.hoisted(() => ({
	auth: {} as Record<string, any>,
	tables: {} as Record<string, Array<Record<string, any>>>,
	rpcs: [] as Array<{ name: string; args: Record<string, any> }>,
	writes: [] as Array<{ table: string; op: string; payload?: unknown }>,
	writeErrors: {} as Record<string, { code: string; message: string }>,
	// Fault injection: errors returned by the next calls of an RPC, and tables whose updates fail.
	// A null entry lets that call through.
	rpcFailures: {} as Record<string, Array<{ code: string; message: string } | null>>,
	audits: [] as Array<Record<string, any>>,
	// Reads of these tables fail once a join request has been approved (the member readback).
	readErrorsAfterApproval: {} as Record<string, { code: string; message: string }>,
	updateErrors: {} as Record<string, { code: string; message: string }>,
}));

const OWNER = "user_owner";
const ADMIN = "user_admin";
const ADMIN_2 = "user_admin_2";
const MEMBER = "user_member";
const OUTSIDER = "user_outsider";
const REQUESTER = "user_requester";
const INVITED_ADMIN = "user_invited_admin";
const WS = "ws_1";

/** A small in-memory stand-in for the Supabase query builder: eq/in/neq filters, select, update, delete, insert, upsert. */
function query(table: string) {
	const filters: Array<(row: Row) => boolean> = [];
	let op: "select" | "update" | "delete" | "insert" | "upsert" = "select";
	let payload: any = null;
	const rows = () => (state.tables[table] ??= []);
	const matching = () => rows().filter((row) => filters.every((filter) => filter(row)));
	const run = () => {
		if (op === "select") {
			const approvedOne = state.rpcs.some((call) => call.name === "management_decide_workspace_join_request");
			if (approvedOne && state.readErrorsAfterApproval[table]) return { data: null, error: state.readErrorsAfterApproval[table], count: null };
			return { data: matching(), error: null, count: matching().length };
		}
		if (op === "update") {
			if (state.updateErrors[table]) return { data: null, error: state.updateErrors[table], count: 0 };
			const hit = matching();
			for (const row of hit) Object.assign(row, payload);
			state.writes.push({ table, op, payload });
			return { data: hit, error: null, count: hit.length };
		}
		if (op === "delete") {
			const hit = matching();
			state.tables[table] = rows().filter((row) => !hit.includes(row));
			state.writes.push({ table, op });
			return { data: hit, error: null, count: hit.length };
		}
		if (state.writeErrors[table]) return { data: null, error: state.writeErrors[table], count: 0 };
		const list = Array.isArray(payload) ? payload : [payload];
		rows().push(...list.map((row: Row) => ({ ...row })));
		state.writes.push({ table, op, payload });
		return { data: list, error: null, count: list.length };
	};
	const builder: any = {
		select: () => builder,
		eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return builder; },
		neq: (column: string, value: unknown) => { filters.push((row) => row[column] !== value); return builder; },
		in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return builder; },
		not: () => builder,
		order: () => builder,
		range: () => builder,
		limit: () => builder,
		update: (value: Row) => { op = "update"; payload = value; return builder; },
		delete: () => { op = "delete"; return builder; },
		insert: (value: Row | Row[]) => { op = "insert"; payload = value; return builder; },
		upsert: (value: Row | Row[]) => { op = "upsert"; payload = value; return builder; },
		maybeSingle: async () => { const result = run(); return { data: result.data?.[0] ?? null, error: result.error }; },
		single: async () => { const result = run(); return { data: result.data?.[0] ?? null, error: result.error }; },
		then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
	};
	return builder;
}

const database = {
	from: (table: string) => query(table),
	async rpc(name: string, args: Record<string, any>) {
		state.rpcs.push({ name, args });
		const injected = state.rpcFailures[name]?.shift();
		if (injected) return { data: null, error: injected };
		if (name === "management_decide_workspace_join_request") {
			const request = (state.tables.workspace_join_requests ?? []).find((row) => row.id === args.p_request_id && row.status === "pending");
			if (!request) return { data: null, error: { code: "P0002", message: "Join request not found" } };
			const invite = (state.tables.workspace_invites ?? []).find((row) => row.id === request.invite_id);
			// Mirrors the SQL: a role given with the approval replaces the invite's, in the same transaction.
			const role = args.p_role ?? invite?.role ?? "member";
			const owner = state.tables.workspaces.find((row) => row.id === args.p_workspace_id)?.owner_user_id;
			if (role === "admin" && args.p_actor_user_id !== owner) return { data: null, error: { code: "42501", message: "workspace_admin_owner_only" } };
			request.status = "approved";
			state.tables.workspace_members.push({ workspace_id: args.p_workspace_id, user_id: request.requester_user_id, role });
			return { data: [request], error: null };
		}
		if (name === "management_delete_workspace_department") {
			// Mirrors the SQL: a department that group mappings use is the owner's to delete.
			const mapped = (state.tables.scim_group_mappings ?? []).some((row) => row.department_id === args.p_department_id);
			const owner = state.tables.workspaces.find((row) => row.id === args.p_workspace_id)?.owner_user_id;
			if (mapped && args.p_actor_user_id !== owner) return { data: null, error: { code: "42501", message: "department_has_group_mappings" } };
			return { data: { id: args.p_department_id, name: "Engineering" }, error: null };
		}
		return { data: true, error: null };
	},
	auth: { admin: { getUserById: async () => ({ data: { user: { factors: [{ factor_type: "totp", status: "verified" }] } }, error: null }) } },
};

vi.mock("@/runtime/env", () => ({ getSupabaseAdmin: () => database, getBindings: () => ({ SCIM_TOKEN_PEPPER: "pepper" }) }));
vi.mock("@core/rate-limit-policies", () => ({ publishRateLimitPlan: async () => true }));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: async (_client: unknown, event: Record<string, any>) => { state.audits.push(event); return true; } }));
vi.mock("@/pipeline/before/guards", () => ({ guardManagementAuth: async () => ({ ok: true, value: state.auth }) }));
vi.mock("@/routes/utils", async (importOriginal) => {
	const original = await importOriginal<typeof import("@/routes/utils")>();
	return { ...original, withRuntime: (handler: (request: Request) => Promise<Response>) => (context: any) => handler(context.req.raw) };
});

function managementKey(createdBy: string | null, scopes: string[], extra: Auth = {}): Auth {
	return { authMethod: "api_key", workspaceId: WS, apiKeyId: "mk_1", apiKeyRef: "mgmt_kid_1", userId: createdBy, requestId: "req_1", scopes, ...extra };
}

function post(path: string, body: unknown, method = "POST") {
	return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

async function workspacesApp() {
	const { Hono } = await import("hono");
	const { workspacesRoutes } = await import("./workspaces");
	return new Hono().route("/workspaces", workspacesRoutes);
}

const roleOf = (userId: string) => state.tables.workspace_members.find((row) => row.workspace_id === WS && row.user_id === userId)?.role ?? null;

beforeEach(() => {
	state.rpcs.length = 0;
	state.writes.length = 0;
	state.writeErrors = {};
	state.rpcFailures = {};
	state.updateErrors = {};
	state.audits.length = 0;
	state.readErrorsAfterApproval = {};
	state.tables = {
		workspaces: [{ id: WS, name: "Team", slug: "team", owner_user_id: OWNER }],
		workspace_members: [
			{ workspace_id: WS, user_id: OWNER, role: "owner" },
			{ workspace_id: WS, user_id: ADMIN, role: "admin" },
			{ workspace_id: WS, user_id: ADMIN_2, role: "admin" },
			{ workspace_id: WS, user_id: MEMBER, role: "member" },
		],
		users: [OWNER, ADMIN, ADMIN_2, MEMBER, OUTSIDER, REQUESTER, INVITED_ADMIN].map((user_id) => ({ user_id, default_workspace_id: `personal_${user_id}`, display_name: user_id, email: `${user_id}@example.com` })),
		workspace_invites: [
			{ id: "inv_member", workspace_id: WS, role: "member" },
			{ id: "inv_admin", workspace_id: WS, role: "admin" },
		],
		workspace_join_requests: [
			{ id: "jr_1", workspace_id: WS, requester_user_id: REQUESTER, invite_id: "inv_member", status: "pending" },
			{ id: "jr_2", workspace_id: WS, requester_user_id: INVITED_ADMIN, invite_id: "inv_admin", status: "pending" },
		],
		keys: [],
		workspace_addon_subscriptions: [{ workspace_id: WS, addon_key: "identity", status: "active", grace_until: null }],
	};
});

describe("management keys act with their creator's current role", () => {
	it("rejects a key whose creator is now a member, and one with no creator", async () => {
		const { requireOAuthWorkspaceRole } = await import("./route-helpers");
		const demoted = await requireOAuthWorkspaceRole(managementKey(MEMBER, ["settings:write"]), WS, ["owner", "admin"]);
		expect(demoted?.status).toBe(403);
		const orphan = await requireOAuthWorkspaceRole(managementKey(null, ["settings:write"]), WS, ["owner", "admin"]);
		expect(orphan?.status).toBe(403);
		const removed = await requireOAuthWorkspaceRole(managementKey(OUTSIDER, ["settings:write"]), WS, ["owner", "admin"]);
		expect(removed?.status).toBe(403);
		expect(await requireOAuthWorkspaceRole(managementKey(ADMIN, ["settings:write"]), WS, ["owner", "admin"])).toBeNull();
		expect(await requireOAuthWorkspaceRole(managementKey(null, ["settings:write"], { internal: true }), WS, ["owner"])).toBeNull();
	});

	it("blocks a demoted admin's key on an admin route", async () => {
		state.tables.workspace_members.find((row) => row.user_id === ADMIN)!.role = "member";
		state.auth = managementKey(ADMIN, ["settings:write", "workspaces:write"]);
		const { notificationRoutes } = await import("./notifications");
		const response = await notificationRoutes.request("https://example.com/settings", post("/settings", { low_balance_email: { enabled: false } }, "PATCH"));
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ message: expect.stringContaining("Workspace role") });
		expect(state.writes).toHaveLength(0);
	});
});

describe("POST /workspaces/{id}/members/add", () => {
	it("refuses to add someone who hasn't asked to join, even for the owner", async () => {
		state.auth = managementKey(OWNER, ["workspaces:write"]);
		const workspacesRoutes = await workspacesApp();
		const response = await workspacesRoutes.request(`https://example.com/workspaces/${WS}/members/add`, post("", { user_ids: [OUTSIDER] }));
		expect(response.status).toBe(400);
		expect(roleOf(OUTSIDER)).toBeNull();
		expect(state.writes.filter((write) => write.table === "workspace_members")).toHaveLength(0);
	});

	it("needs the owner to add an admin", async () => {
		state.auth = managementKey(ADMIN, ["workspaces:write"]);
		const workspacesRoutes = await workspacesApp();
		const response = await workspacesRoutes.request(`https://example.com/workspaces/${WS}/members/add`, post("", { user_ids: [REQUESTER], role: "admin" }));
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ message: expect.stringContaining("Only the workspace owner can add admins") });
		expect(roleOf(REQUESTER)).toBeNull();
	});

	it("approves a pending join request and never changes an existing member's role", async () => {
		state.auth = managementKey(ADMIN, ["workspaces:write"]);
		const workspacesRoutes = await workspacesApp();
		const response = await workspacesRoutes.request(`https://example.com/workspaces/${WS}/members/add`, post("", { user_ids: [REQUESTER, ADMIN_2], role: "member" }));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ added_count: 1 });
		expect(state.rpcs).toEqual([expect.objectContaining({ name: "management_decide_workspace_join_request", args: expect.objectContaining({ p_request_id: "jr_1", p_decision: "approve", p_actor_user_id: ADMIN }) })]);
		expect(roleOf(REQUESTER)).toBe("member");
		expect(roleOf(ADMIN_2)).toBe("admin");
	});
});

describe("an invite that makes someone an admin", () => {
	it("needs the owner when add-members takes the role from the invite", async () => {
		state.auth = managementKey(ADMIN, ["workspaces:write"]);
		const workspacesRoutes = await workspacesApp();
		const denied = await workspacesRoutes.request(`https://example.com/workspaces/${WS}/members/add`, post("", { user_ids: [INVITED_ADMIN] }));
		expect(denied.status).toBe(403);
		expect(roleOf(INVITED_ADMIN)).toBeNull();
		expect(state.rpcs).toHaveLength(0);

		state.auth = managementKey(OWNER, ["workspaces:write"]);
		const allowed = await workspacesRoutes.request(`https://example.com/workspaces/${WS}/members/add`, post("", { user_ids: [INVITED_ADMIN] }));
		expect(allowed.status).toBe(200);
		expect(roleOf(INVITED_ADMIN)).toBe("admin");
	});

	it("needs the owner to approve the join request", async () => {
		state.auth = managementKey(ADMIN, ["workspaces:write"]);
		const { Hono } = await import("hono");
		const { workspaceMembershipRoutes } = await import("./workspace-membership");
		const app = new Hono().route("/workspaces", workspaceMembershipRoutes);
		const response = await app.request(`https://example.com/workspaces/${WS}/join-requests/jr_2/approve`, { method: "POST" });
		expect(response.status).toBe(403);
		expect(roleOf(INVITED_ADMIN)).toBeNull();
	});
});

describe("POST /workspaces/{id}/members/remove", () => {
	it("lets a plain member leave, but not remove anyone else", async () => {
		state.auth = managementKey(MEMBER, ["workspaces:write"]);
		const workspacesRoutes = await workspacesApp();
		const other = await workspacesRoutes.request(`https://example.com/workspaces/${WS}/members/remove`, post("", { user_ids: [ADMIN] }));
		expect(other.status).toBe(403);
		expect(roleOf(ADMIN)).toBe("admin");
		const leave = await workspacesRoutes.request(`https://example.com/workspaces/${WS}/members/remove`, post("", { user_ids: [MEMBER] }));
		expect(leave.status).toBe(200);
		expect(roleOf(MEMBER)).toBeNull();
	});

	it("stops an admin's key removing another admin", async () => {
		state.auth = managementKey(ADMIN, ["workspaces:write"]);
		const workspacesRoutes = await workspacesApp();
		const response = await workspacesRoutes.request(`https://example.com/workspaces/${WS}/members/remove`, post("", { user_ids: [ADMIN_2] }));
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ message: expect.stringContaining("Only the workspace owner can remove") });
		expect(roleOf(ADMIN_2)).toBe("admin");
	});

	it("lets an admin leave and the owner remove anyone but themselves", async () => {
		const workspacesRoutes = await workspacesApp();
		state.auth = managementKey(ADMIN, ["workspaces:write"]);
		const leave = await workspacesRoutes.request(`https://example.com/workspaces/${WS}/members/remove`, post("", { user_ids: [ADMIN] }));
		expect(leave.status).toBe(200);
		expect(roleOf(ADMIN)).toBeNull();
		state.auth = managementKey(OWNER, ["workspaces:write"]);
		const remove = await workspacesRoutes.request(`https://example.com/workspaces/${WS}/members/remove`, post("", { user_ids: [ADMIN_2, MEMBER] }));
		expect(remove.status).toBe(200);
		expect([roleOf(ADMIN_2), roleOf(MEMBER)]).toEqual([null, null]);
		const owner = await workspacesRoutes.request(`https://example.com/workspaces/${WS}/members/remove`, post("", { user_ids: [OWNER] }));
		expect(owner.status).toBe(400);
	});
});

describe("DELETE /workspaces/{id}", () => {
	it("is owner-only for management keys", async () => {
		state.auth = managementKey(ADMIN, ["workspaces:delete"]);
		const workspacesRoutes = await workspacesApp();
		const denied = await workspacesRoutes.request(`https://example.com/workspaces/${WS}`, { method: "DELETE" });
		expect(denied.status).toBe(403);
		expect(await denied.json()).toMatchObject({ message: "Only the workspace owner can delete the workspace." });
		expect(state.writes.filter((write) => write.op === "delete")).toHaveLength(0);
		expect(state.tables.workspaces).toHaveLength(1);

		state.auth = managementKey(OWNER, ["workspaces:delete"]);
		const allowed = await workspacesRoutes.request(`https://example.com/workspaces/${WS}`, { method: "DELETE" });
		expect(allowed.status).toBe(200);
		expect(state.tables.workspaces).toHaveLength(0);
	});
});

describe("enterprise directory role overrides", () => {
	it("need the owner, for management keys too", async () => {
		const { enterpriseDirectoryRoutes } = await import("./enterprise-directory");
		const request = () => enterpriseDirectoryRoutes.request("https://example.com/directory/members/user_member", post("", { access_role: "admin" }, "PUT"));
		state.auth = managementKey(ADMIN, ["settings:write", "workspaces:write"]);
		const denied = await request();
		expect(denied.status).toBe(403);
		expect(await denied.json()).toMatchObject({ error: "forbidden" });
		expect(state.rpcs).toHaveLength(0);
		const mapping = await enterpriseDirectoryRoutes.request("https://example.com/group-mappings", post("", { scim_group_id: "g1", department_id: "d1", access_role: "admin" }));
		expect(mapping.status).toBe(403);
		state.auth = managementKey(OWNER, ["settings:write", "workspaces:write"]);
		const allowed = await request();
		expect(allowed.status).toBe(200);
		expect(state.rpcs).toContainEqual(expect.objectContaining({ name: "apply_workspace_member_override" }));
	});
});

describe("auto top-up through PATCH /notifications/settings", () => {
	const enable = (extra: Record<string, unknown> = {}) => post("", { auto_top_up: { enabled: true, amount_nanos: 10_000_000_000, balance_threshold_nanos: 0, payment_method_id: "pm_1", ...extra } }, "PATCH");

	it("needs billing:write to turn it on, but not to turn it off", async () => {
		state.auth = managementKey(ADMIN, ["settings:read", "settings:write"]);
		const { notificationRoutes } = await import("./notifications");
		const response = await notificationRoutes.request("https://example.com/settings", enable());
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ error: "insufficient_scope" });
		const off = await notificationRoutes.request("https://example.com/settings", post("", { auto_top_up: { enabled: false } }, "PATCH"));
		expect(off.status).toBe(200);
		expect(state.rpcs.map((call) => call.name)).toEqual(["update_workspace_auto_top_up"]);
	});

	it("rejects apps that sign in with Phaseo", async () => {
		state.auth = { authMethod: "oauth", workspaceId: WS, userId: ADMIN, oauthClientId: "third_party_app", oauthScopes: ["settings:write", "billing:write"], scopes: [] };
		const { notificationRoutes } = await import("./notifications");
		const response = await notificationRoutes.request("https://example.com/settings", enable());
		expect(response.status).toBe(403);
		expect(state.rpcs).toHaveLength(0);
	});

	it("never takes the MFA bypass from the API", async () => {
		state.auth = managementKey(ADMIN, ["settings:read", "settings:write", "billing:write"]);
		const { notificationRoutes } = await import("./notifications");
		const bypass = await notificationRoutes.request("https://example.com/settings", enable({ mfa_bypass_acknowledged: true, mfa_bypass_phrase: "I ACCEPT THE RISK" }));
		expect(bypass.status).toBe(400);
		expect(state.rpcs).toHaveLength(0);
		const allowed = await notificationRoutes.request("https://example.com/settings", enable());
		expect(allowed.status).toBe(200);
		expect(state.rpcs).toEqual([expect.objectContaining({
			name: "update_workspace_auto_top_up",
			args: expect.objectContaining({ p_enabled: true, p_mfa_bypass_acknowledged: false, p_mfa_bypass_phrase: null }),
		})]);
	});
});

describe("PUT /identity/sso", () => {
	const PROVIDER = "5f6ec0f5-d5ce-4f71-99df-5f720ea59750";
	const sso = (provider: string) => post("", { enabled: true, mode: "saml", provider_identifier: provider, domains: ["example.com"] }, "PUT");

	it("lets only the owner choose which identity provider to trust", async () => {
		// Sign-ins through the provider are linked to directory users, who can hold the admin role.
		state.tables.workspace_settings = [{ workspace_id: WS, sso_enabled: false, sso_provider_identifier: null }];
		const { identityRoutes } = await import("./identity");
		state.auth = managementKey(ADMIN, ["settings:read", "settings:write"]);
		const denied = await identityRoutes.request("https://example.com/sso", sso("6a7ec0f5-d5ce-4f71-99df-5f720ea59751"));
		expect(denied.status).toBe(403);
		expect(state.writes.filter((write) => write.table === "workspace_settings")).toHaveLength(0);
		state.auth = managementKey(OWNER, ["settings:read", "settings:write"]);
		const allowed = await identityRoutes.request("https://example.com/sso", sso(PROVIDER));
		expect(allowed.status).toBe(200);
		expect(state.writes.filter((write) => write.table === "workspace_settings")).toEqual([
			expect.objectContaining({ op: "upsert", payload: expect.objectContaining({ sso_provider_identifier: PROVIDER, sso_enabled: true }) }),
		]);
	});

	it("reports an identity provider already connected to another workspace as a conflict", async () => {
		state.auth = managementKey(OWNER, ["settings:read", "settings:write"]);
		// The database allows one workspace per provider (workspace_settings_sso_provider_identifier_key).
		state.writeErrors.workspace_settings = { code: "23505", message: "duplicate key value violates unique constraint" };
		const { identityRoutes } = await import("./identity");
		const response = await identityRoutes.request("https://example.com/sso", sso(PROVIDER));
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ error: "sso_provider_in_use" });
	});
});

describe("SCIM provisioning through the API", () => {
	// A SCIM token can add people to directory groups that grant the admin role.
	const requests: Array<[string, string, Record<string, unknown> | undefined]> = [
		["PUT", "/scim", { enabled: true }],
		["POST", "/scim/tokens", { label: "Okta" }],
		["DELETE", "/scim/tokens/token_1", undefined],
	];

	it.each(requests)("is owner-only: %s %s", async (method, path, body) => {
		const { identityRoutes } = await import("./identity");
		state.auth = managementKey(ADMIN, ["settings:read", "settings:write"]);
		const denied = await identityRoutes.request(`https://example.com${path}`, body ? post("", body, method) : { method });
		expect(denied.status).toBe(403);
		expect(state.writes.filter((write) => write.table.startsWith("scim_"))).toHaveLength(0);
		state.auth = managementKey(OWNER, ["settings:read", "settings:write"]);
		const allowed = await identityRoutes.request(`https://example.com${path}`, body ? post("", body, method) : { method });
		expect(allowed.status).not.toBe(403);
	});
});

describe("DELETE /departments/{id}", () => {
	it("needs the owner when directory group mappings use the department", async () => {
		state.tables.scim_group_mappings = [{ id: "mapping_1", workspace_id: WS, department_id: "dept_1", access_role: "admin" }];
		const { enterpriseDirectoryRoutes } = await import("./enterprise-directory");
		state.auth = managementKey(ADMIN, ["settings:read", "settings:write"]);
		const denied = await enterpriseDirectoryRoutes.request("https://example.com/departments/dept_1", { method: "DELETE" });
		expect(denied.status).toBe(403);
		state.auth = managementKey(OWNER, ["settings:read", "settings:write"]);
		const allowed = await enterpriseDirectoryRoutes.request("https://example.com/departments/dept_1", { method: "DELETE" });
		expect(allowed.status).toBe(200);
	});
});

describe("approving a join request with a role", () => {
	const add = async (role: string) => (await workspacesApp()).request(`https://example.com/workspaces/${WS}/members/add`, post("", { user_ids: [INVITED_ADMIN], role }));

	it("gives the role in the same call as the approval, so an admin invite approved as a member never makes an admin", async () => {
		state.auth = managementKey(ADMIN, ["workspaces:write"]);
		// If anything still wrote the role in a second call, it would fail here.
		state.updateErrors.workspace_members = { code: "XX000", message: "injected failure" };
		const response = await add("member");
		expect(response.status).toBe(200);
		expect(roleOf(INVITED_ADMIN)).toBe("member");
		expect(state.rpcs).toEqual([expect.objectContaining({ name: "management_decide_workspace_join_request", args: expect.objectContaining({ p_request_id: "jr_2", p_role: "member" }) })]);
		expect(state.writes.filter((write) => write.table === "workspace_members")).toHaveLength(0);
	});

	it("never leaves an approved admin when a role write would fail, and an HTTP retry finds the right role", async () => {
		state.auth = managementKey(OWNER, ["workspaces:write"]);
		// A separate role write after the approval would fail here and leave the invite's admin role in place.
		state.updateErrors.workspace_members = { code: "40P01", message: "deadlock detected" };
		await add("member");
		expect(roleOf(INVITED_ADMIN)).toBe("member");
		delete state.updateErrors.workspace_members;
		await add("member");
		expect(roleOf(INVITED_ADMIN)).toBe("member");
	});

	it("leaves nothing half done when the approval fails, and a retried request then succeeds", async () => {
		state.auth = managementKey(OWNER, ["workspaces:write"]);
		const deadlock = { code: "40P01", message: "deadlock detected" };
		state.rpcFailures.management_decide_workspace_join_request = [deadlock, deadlock, deadlock];
		const failed = await add("member");
		expect(failed.status).toBe(409);
		expect(await failed.json()).toMatchObject({ approved: [], failed: [{ user_id: INVITED_ADMIN, code: "internal_error" }], not_attempted: [] });
		expect(roleOf(INVITED_ADMIN)).toBeNull();
		expect(state.tables.workspace_join_requests.find((row) => row.id === "jr_2")?.status).toBe("pending");
		expect(state.rpcs).toHaveLength(3);
		const retried = await add("member");
		expect(retried.status).toBe(200);
		expect(roleOf(INVITED_ADMIN)).toBe("member");
	});
});

describe("approving several join requests", () => {
	const LATE = "user_late_requester";
	const addAll = async () => (await workspacesApp()).request(`https://example.com/workspaces/${WS}/members/add`, post("", { user_ids: [REQUESTER, INVITED_ADMIN, LATE] }));

	beforeEach(() => {
		state.tables.users.push({ user_id: LATE, default_workspace_id: `personal_${LATE}`, display_name: LATE, email: `${LATE}@example.com` });
		state.tables.workspace_join_requests.push({ id: "jr_3", workspace_id: WS, requester_user_id: LATE, invite_id: "inv_member", status: "pending" });
		state.auth = managementKey(OWNER, ["workspaces:write"]);
	});

	it("reports who was approved, who failed and who wasn't tried when a later user fails, and audits each approval", async () => {
		state.rpcFailures.management_decide_workspace_join_request = [null, { code: "23514", message: "Invite has no uses left" }];
		const response = await addAll();
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			error: "conflict",
			added_count: 1,
			data: [expect.objectContaining({ user_id: REQUESTER })],
			approved: [REQUESTER],
			failed: [{ user_id: INVITED_ADMIN, code: "conflict", message: "Invite has no uses left" }],
			not_attempted: [LATE],
		});
		expect([roleOf(REQUESTER), roleOf(INVITED_ADMIN), roleOf(LATE)]).toEqual(["member", null, null]);
		expect(state.audits).toEqual([expect.objectContaining({ action: "workspace.member.added", targetId: REQUESTER, metadata: { role: "member" } })]);
	});

	it("still reports the committed approvals when reading the added members back fails, leaving out only data", async () => {
		state.rpcFailures.management_decide_workspace_join_request = [null, { code: "23514", message: "Invite has no uses left" }];
		state.readErrorsAfterApproval.workspace_members = { code: "57014", message: "canceling statement due to statement timeout" };
		const response = await addAll();
		expect(response.status).toBe(409);
		const body = await response.json();
		expect(body).toMatchObject({
			error: "conflict",
			added_count: 1,
			approved: [REQUESTER],
			failed: [{ user_id: INVITED_ADMIN, code: "conflict" }],
			not_attempted: [LATE],
		});
		expect(body).not.toHaveProperty("data");
		// Each failure is flat strings, so every SDK (including a string map) can hold it.
		expect(body.failed).toEqual([{ user_id: INVITED_ADMIN, code: "conflict", message: "Invite has no uses left" }]);
		expect(roleOf(REQUESTER)).toBe("member");
		expect(state.audits.map((event) => event.targetId)).toEqual([REQUESTER]);

		// The same when every approval succeeds: 200 with the outcome, without data.
		state.rpcFailures = {};
		// Reads fail again only after this request's own approval.
		state.rpcs.length = 0;
		state.tables.workspace_join_requests.push({ id: "jr_4", workspace_id: WS, requester_user_id: OUTSIDER, invite_id: "inv_member", status: "pending" });
		const all = await (await workspacesApp()).request(`https://example.com/workspaces/${WS}/members/add`, post("", { user_ids: [OUTSIDER] }));
		expect(all.status).toBe(200);
		const allBody = await all.json();
		expect(allBody).toMatchObject({ added_count: 1, approved: [OUTSIDER], failed: [], not_attempted: [] });
		expect(allBody).not.toHaveProperty("data");
	});

	it("returns 200 with every user approved and audited when none fail", async () => {
		const response = await addAll();
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ added_count: 3, approved: [REQUESTER, INVITED_ADMIN, LATE], failed: [], not_attempted: [] });
		expect(state.audits.map((event) => [event.targetId, event.metadata.role])).toEqual([[REQUESTER, "member"], [INVITED_ADMIN, "admin"], [LATE, "member"]]);
	});
});
