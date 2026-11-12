// A directory role override can make someone an admin, so changing it is the workspace owner's call.
// Admins can still move people between departments, through a function that never writes the role override.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { serverRouteHandler } from "@/lib/testing/serverRoute";

const state = vi.hoisted(() => ({
	actor: { workspaceId: "workspace_1", userId: "user_admin" },
	override: null as { access_role: string | null } | null,
	rpc: vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: null, error: null })),
}));

vi.mock("@/lib/server/activeTeamStripe", () => ({
	requireActiveWorkspaceBillingAdmin: vi.fn(async () => ({ ...state.actor })),
}));
vi.mock("@/lib/http/sameOrigin", () => ({ rejectCrossOriginRequest: () => null }));
vi.mock("@/utils/supabase/admin", () => ({
	createAdminClient: () => ({
		from: (table: string) => {
			const row = table === "workspace_addon_subscriptions"
				? { status: "active", grace_until: null }
				: table === "workspaces"
					? { owner_user_id: "user_owner" }
					: state.override;
			const chain: Record<string, unknown> = {};
			chain.select = () => chain;
			chain.eq = () => chain;
			chain.maybeSingle = async () => ({ data: row, error: null });
			return chain;
		},
		rpc: state.rpc,
	}),
}));

async function updateMember(body: Record<string, unknown>) {
	const { Route } = await import("./index");
	return serverRouteHandler(Route, "POST")(new Request("https://phaseo.app/api/enterprise/directory?workspaceId=workspace_1", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ action: "update_member", userId: "user_member", ...body }),
	}));
}

describe("POST /api/enterprise/directory update_member", () => {
	beforeEach(() => {
		state.rpc.mockClear();
		state.actor.userId = "user_admin";
		state.override = null;
	});

	it("refuses an admin who makes someone an admin", async () => {
		const response = await updateMember({ accessRole: "admin", departmentMode: "directory" });
		expect(response.status).toBe(403);
		expect(state.rpc).not.toHaveBeenCalled();
	});

	it("refuses an admin who clears someone's role override", async () => {
		state.override = { access_role: "member" };
		const response = await updateMember({ accessRole: "directory", departmentMode: "directory" });
		expect(response.status).toBe(403);
		expect(state.rpc).not.toHaveBeenCalled();
	});

	it("lets an admin change a department through the function that never writes the role override", async () => {
		state.override = { access_role: "member" };
		const response = await updateMember({ accessRole: "member", departmentMode: "department", departmentId: "department_1" });
		expect(response.status).toBe(200);
		expect(state.rpc).toHaveBeenCalledTimes(1);
		const [name, args] = state.rpc.mock.calls[0];
		expect(name).toBe("apply_workspace_member_department_override");
		expect(args).toMatchObject({ p_department_id: "department_1" });
		expect(args).not.toHaveProperty("p_access_role");
	});

	it("lets the owner make someone an admin", async () => {
		state.actor.userId = "user_owner";
		const response = await updateMember({ accessRole: "admin", departmentMode: "directory" });
		expect(response.status).toBe(200);
		expect(state.rpc).toHaveBeenCalledWith("apply_workspace_member_override", expect.objectContaining({ p_access_role: "admin" }));
	});
});
