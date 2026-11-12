// Group mappings, SCIM tokens and the trusted SSO provider decide who gets the admin role, so only the
// workspace owner changes them. Approving an invite that makes someone an admin is refused for admins.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	session: { role: "admin", isOwner: false },
	writes: [] as Array<{ table: string; op: string }>,
	rpcError: null as null | { code: string; message: string },
	rpcs: [] as string[],
	rpcArgs: [] as Array<Record<string, unknown>>,
	// Fault injection: errors returned by the next RPC calls, one per call.
	rpcFailures: [] as Array<{ code: string; message: string }>,
}));

function table(name: string) {
	const record = (op: string) => {
		state.writes.push({ table: name, op });
		return chain;
	};
	const chain: any = {
		select: () => chain,
		eq: () => chain,
		is: () => chain,
		insert: () => record("insert"),
		upsert: () => record("upsert"),
		update: () => record("update"),
		delete: () => record("delete"),
		single: async () => ({ data: { id: "mapping_1" }, error: null }),
		maybeSingle: async () => ({ data: name === "workspace_addon_subscriptions" ? { status: "active", grace_until: null } : { id: "mapping_1" }, error: null }),
	};
	return chain;
}

vi.mock("./context", () => ({
	requireAccountWorkspace: async () => ({
		workspaceId: "workspace_1",
		role: state.session.isOwner ? "admin" : state.session.role,
		isOwner: state.session.isOwner,
		user: { id: state.session.isOwner ? "user_owner" : "user_admin" },
		client: {
			from: (name: string) => table(name),
			rpc: (name: string, args: Record<string, unknown>) => {
				state.rpcs.push(name);
				state.rpcArgs.push(args);
				const failure = state.rpcFailures.shift() ?? state.rpcError;
				const result = failure ? { data: null, error: failure } : { data: { id: "department_1", user_id: "user_2", department_id: "department_1", position: "member", is_primary: true }, error: null };
				const builder: any = { select: () => builder, single: async () => result, then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) };
				return builder;
			},
		},
	}),
}));
vi.mock("@/scim/auth", () => ({ generateScimToken: () => ({ token: "ph_scim_x", prefix: "x" }), hashScimToken: async () => "hash" }));
vi.mock("@/billing/workspaceAddons", () => ({ workspaceHasAddon: async () => true }));
vi.mock("@/auth/requireUser", () => ({ requireUser: async () => ({ id: "user_admin" }) }));
vi.mock("@/data/supabase", () => ({
	getDataClient: () => ({ from: (name: string) => table(name) }),
	getAuthenticatedDataClient: () => ({
		rpc: async () => (state.rpcError ? { data: null, error: state.rpcError } : { data: [{ id: "request_1", workspace_id: "workspace_1" }], error: null }),
	}),
}));

const mappingRequests: Array<[string, string, Record<string, unknown> | undefined]> = [
	["POST", "/teams/workspace_1/scim/mappings", { groupId: "group_1", departmentId: "department_1", accessRole: "admin" }],
	["PATCH", "/teams/workspace_1/scim/mappings/mapping_1", { accessRole: "admin" }],
	["DELETE", "/teams/workspace_1/scim/mappings/mapping_1", undefined],
];

async function send(method: string, path: string, body?: Record<string, unknown>) {
	const { accountSettingsScimRouter } = await import("./settings-scim");
	return accountSettingsScimRouter.request(`https://example.com${path}`, {
		method,
		headers: { "content-type": "application/json" },
		body: body ? JSON.stringify(body) : undefined,
	}, {});
}

describe("SCIM group mappings", () => {
	beforeEach(() => {
		state.writes.length = 0;
	});

	it.each(mappingRequests)("refuses an admin session: %s %s", async (method, path, body) => {
		state.session = { role: "admin", isOwner: false };
		const response = await send(method, path, body);
		expect(response.status).toBe(403);
		expect(state.writes.filter((write) => write.table === "scim_group_mappings")).toHaveLength(0);
	});

	it.each(mappingRequests)("lets the owner: %s %s", async (method, path, body) => {
		state.session = { role: "admin", isOwner: true };
		const response = await send(method, path, body);
		expect(response.status).toBeLessThan(300);
		expect(state.writes.filter((write) => write.table === "scim_group_mappings")).toHaveLength(1);
	});
});

// A SCIM token can add people to groups that grant the admin role, so the SCIM endpoint and its tokens
// are the owner's too.
const scimRequests: Array<[string, string, Record<string, unknown> | undefined, string]> = [
	["PUT", "/teams/workspace_1/scim", { enabled: true }, "scim_endpoints"],
	["POST", "/teams/workspace_1/scim/tokens", { label: "Okta" }, "scim_tokens"],
	["DELETE", "/teams/workspace_1/scim/tokens/token_1", undefined, "scim_tokens"],
];

describe("SCIM endpoint and tokens", () => {
	beforeEach(() => {
		state.writes.length = 0;
	});

	it.each(scimRequests)("refuses an admin session: %s %s", async (method, path, body, written) => {
		state.session = { role: "admin", isOwner: false };
		const response = await send(method, path, body);
		expect(response.status).toBe(403);
		expect(state.writes.filter((write) => write.table === written)).toHaveLength(0);
	});

	it.each(scimRequests)("lets the owner: %s %s", async (method, path, body, written) => {
		state.session = { role: "admin", isOwner: true };
		const response = await send(method, path, body);
		expect(response.status).toBeLessThan(300);
		expect(state.writes.filter((write) => write.table === written).length).toBeGreaterThan(0);
	});
});

describe("department deletion", () => {
	beforeEach(() => {
		state.writes.length = 0;
		state.rpcs.length = 0;
		state.rpcError = null;
	});

	it("goes through the owner-checked function, and returns 403 when it refuses", async () => {
		state.session = { role: "admin", isOwner: false };
		state.rpcError = { code: "42501", message: "department_has_group_mappings" };
		const response = await send("DELETE", "/teams/workspace_1/scim/departments/department_1");
		expect(response.status).toBe(403);
		expect(state.rpcs).toEqual(["management_delete_workspace_department"]);
		expect(state.writes.filter((write) => write.table === "workspace_departments")).toHaveLength(0);
	});
});

describe("single sign-on settings", () => {
	// Sign-ins through the workspace's identity provider are linked to directory users, who can hold the
	// admin role, so only the owner chooses which provider to trust.
	async function saveSso(provider: string) {
		const { accountSettingsTeamsRouter } = await import("./settings-teams");
		return accountSettingsTeamsRouter.request("https://example.com/teams/workspace_1/sso", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ ssoEnabled: true, ssoMode: "saml", ssoProviderIdentifier: provider, ssoDomains: ["example.com"] }),
		}, {});
	}

	beforeEach(() => {
		state.writes.length = 0;
	});

	it("refuses an admin who changes the identity provider, and lets the owner", async () => {
		state.session = { role: "admin", isOwner: false };
		const denied = await saveSso("6a7ec0f5-d5ce-4f71-99df-5f720ea59751");
		expect(denied.status).toBe(403);
		expect(state.writes.filter((write) => write.table === "workspace_settings")).toHaveLength(0);
		state.session = { role: "admin", isOwner: true };
		const allowed = await saveSso("5f6ec0f5-d5ce-4f71-99df-5f720ea59750");
		expect(allowed.status).toBe(200);
		expect(state.writes.filter((write) => write.table === "workspace_settings")).toHaveLength(1);
	});
});

describe("join request approval", () => {
	it("returns 403 when the approval function refuses an admin invite", async () => {
		state.session = { role: "admin", isOwner: false };
		state.rpcError = { code: "42501", message: "workspace_admin_owner_only" };
		const { accountSettingsTeamsRouter } = await import("./settings-teams");
		const response = await accountSettingsTeamsRouter.request("https://example.com/teams/join-requests/request_1/approve", { method: "POST" }, {});
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: "forbidden" });
	});
});

describe("department membership", () => {
	const put = (primary: boolean) => send("PUT", "/teams/workspace_1/scim/departments/department_1/members/user_2", { position: "member", primary });
	const deadlock = { code: "40P01", message: "deadlock detected" };

	beforeEach(() => {
		state.session = { role: "admin", isOwner: false };
		state.writes.length = 0;
		state.rpcs.length = 0;
		state.rpcArgs.length = 0;
		state.rpcFailures.length = 0;
		state.rpcError = null;
	});

	it("moves the primary department in one function call, never as separate table writes", async () => {
		const response = await put(true);
		expect(response.status).toBe(200);
		expect(state.rpcs).toEqual(["management_set_workspace_department_member"]);
		expect(state.rpcArgs[0]).toMatchObject({ p_workspace_id: "workspace_1", p_department_id: "department_1", p_user_id: "user_2", p_position: "member", p_primary: true, p_actor_user_id: "user_admin" });
		expect(state.writes.filter((write) => write.table === "workspace_department_grants")).toHaveLength(0);
	});

	it("retries the whole call after a deadlock in either step", async () => {
		state.rpcFailures.push(deadlock, deadlock);
		const response = await put(true);
		expect(response.status).toBe(200);
		expect(state.rpcs).toHaveLength(3);
		expect(state.writes.filter((write) => write.table === "workspace_department_grants")).toHaveLength(0);
	});

	it("returns an error once retries run out, with nothing written outside the function", async () => {
		state.rpcFailures.push(deadlock, deadlock, deadlock);
		const response = await put(true);
		expect(response.status).toBe(400);
		expect(state.rpcs).toHaveLength(3);
		expect(state.writes.filter((write) => write.table === "workspace_department_grants")).toHaveLength(0);
	});
});
