import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	scopes: ["settings:write"] as string[],
	rpcs: [] as Array<{ name: string; args: Record<string, unknown> }>,
}));

function addonQuery() {
	const chain: any = {};
	chain.select = () => chain;
	chain.eq = () => chain;
	chain.maybeSingle = async () => ({ data: { status: "active", grace_until: null }, error: null });
	return chain;
}

const database = {
	from(table: string) {
		if (table === "workspace_addon_subscriptions") return addonQuery();
		if (table === "workspace_audit_events") return { insert: async () => ({ error: null }) };
		throw new Error(`Unexpected table: ${table}`);
	},
	async rpc(name: string, args: Record<string, unknown>) {
		state.rpcs.push({ name, args });
		return { data: true, error: null };
	},
};

vi.mock("@/runtime/env", () => ({ getSupabaseAdmin: () => database }));
vi.mock("@/pipeline/before/guards", () => ({
	guardManagementAuth: async () => ({
		ok: true,
		value: {
			authMethod: "api_key",
			workspaceId: "workspace_1",
			userId: "user_1",
			requestId: "request_1",
			scopes: state.scopes,
		},
	}),
}));
vi.mock("@/routes/utils", async (importOriginal) => {
	const original = await importOriginal<typeof import("@/routes/utils")>();
	return {
		...original,
		withRuntime: (handler: (request: Request) => Promise<Response>) => (context: any) => handler(context.req.raw),
	};
});

describe("enterprise directory role authority", () => {
	beforeEach(() => {
		state.scopes = ["settings:write"];
		state.rpcs.length = 0;
	});

	it("rejects settings-only management keys before a member can be promoted", async () => {
		const { enterpriseDirectoryRoutes } = await import("./enterprise-directory");
		const response = await enterpriseDirectoryRoutes.request("https://example.com/directory/members/user_2", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ access_role: "admin" }),
		});

		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ error: "insufficient_scope" });
		expect(state.rpcs).toHaveLength(0);
	});

	it("allows a management key explicitly granted both settings and workspace authority", async () => {
		state.scopes = ["settings:write", "workspaces:write"];
		const { enterpriseDirectoryRoutes } = await import("./enterprise-directory");
		const response = await enterpriseDirectoryRoutes.request("https://example.com/directory/members/user_2", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ access_role: "admin" }),
		});

		expect(response.status).toBe(200);
		expect(state.rpcs).toContainEqual(expect.objectContaining({
			name: "apply_workspace_member_override",
			args: expect.objectContaining({ p_access_role: "admin", p_user_id: "user_2" }),
		}));
	});
});
