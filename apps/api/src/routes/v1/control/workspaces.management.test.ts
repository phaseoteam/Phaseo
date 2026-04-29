import { beforeEach, describe, expect, it, vi } from "vitest";

type GuardOk = {
	ok: true;
	value: {
		workspaceId: string;
		apiKeyId: string;
		internal?: boolean;
	};
};

const state = vi.hoisted(() => ({
	guardManagementAuthResult: null as GuardOk | { ok: false; response: Response } | null,
	workspaces: [] as Array<Record<string, unknown> | null>,
	users: [] as Array<Record<string, unknown> | null>,
	workspaceSettingsUpserts: [] as Array<Record<string, unknown>>,
	workspaceMembersUpserts: [] as Array<Record<string, unknown>>,
	workspaceMembersUpsertError: null as { message: string } | null,
	workspaceSettingsUpsertError: null as { message: string } | null,
	workspacesInserted: [] as Array<Record<string, unknown>>,
	keyCount: 0,
	deletes: [] as Array<{ table: string; column: string; value: unknown }>,
	userHasPaidWorkspaceAccess: vi.fn(async (_userId: string) => true),
	ensureWorkspaceWalletProvisioned: vi.fn(async (_args: Record<string, unknown>) => ({ workspaceId: "ws_new", customerId: null })),
}));

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json",
			...headers,
		},
	});
}

function buildWorkspacesSupabaseMock() {
	return {
		from(table: string) {
			if (table === "workspaces") {
				const query: any = {
					select: () => query,
					eq: () => query,
					or: () => query,
					order: () => query,
					range: () => query,
					maybeSingle: async () => ({
						data: state.workspaces.shift() ?? null,
						error: null,
					}),
					insert: (payload: Record<string, unknown>) => {
						state.workspacesInserted.push(payload);
						return {
							select: () => ({
								maybeSingle: async () => ({
									data: state.workspaces.shift() ?? null,
									error: null,
								}),
							}),
						};
					},
					update: (_payload: Record<string, unknown>) => {
						let eqCount = 0;
						const updater: any = {
							eq: () => {
								eqCount += 1;
								return eqCount >= 2 ? Promise.resolve({ error: null }) : updater;
							},
						};
						return updater;
					},
					delete: () => {
						const filters: Array<{ column: string; value: unknown }> = [];
						const deleter: any = {
							eq: (column: string, value: unknown) => {
								filters.push({ column, value });
								if (filters.length >= 2) {
									for (const filter of filters) {
										state.deletes.push({ table, column: filter.column, value: filter.value });
									}
									return Promise.resolve({ error: null });
								}
								return deleter;
							},
						};
						return deleter;
					},
				};
				return query;
			}

			if (table === "users") {
				return {
					select: () => ({
						eq: () => ({
							maybeSingle: async () => ({
								data: state.users.shift() ?? null,
								error: null,
							}),
						}),
					}),
				};
			}

			if (table === "workspace_members" || table === "wallets") {
				return {
					upsert: async (payload?: Record<string, unknown>) => {
						if (table === "workspace_members" && payload) {
							state.workspaceMembersUpserts.push(payload);
						}
						return { error: table === "workspace_members" ? state.workspaceMembersUpsertError : null };
					},
					delete: () => ({
						eq: async (column: string, value: unknown) => {
							state.deletes.push({ table, column, value });
							return { error: null };
						},
					}),
				};
			}

			if (table === "workspace_settings") {
				return {
					upsert: async (payload: Record<string, unknown>) => {
						state.workspaceSettingsUpserts.push(payload);
						return { error: state.workspaceSettingsUpsertError };
					},
					delete: () => ({
						eq: async (column: string, value: unknown) => {
							state.deletes.push({ table, column, value });
							return { error: null };
						},
					}),
				};
			}

			if (table === "workspace_invites" || table === "workspace_join_requests" || table === "management_keys") {
				return {
					delete: () => ({
						eq: async (column: string, value: unknown) => {
							state.deletes.push({ table, column, value });
							return { error: null };
						},
					}),
				};
			}

			if (table === "keys") {
				return {
					select: () => ({
						eq: () => ({
							neq: async () => ({ count: state.keyCount, error: null }),
						}),
					}),
				};
			}

			throw new Error(`Unexpected table: ${table}`);
		},
	};
}

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => buildWorkspacesSupabaseMock(),
}));

vi.mock("@/pipeline/before/guards", () => ({
	guardManagementAuth: vi.fn(async () => state.guardManagementAuthResult),
}));

vi.mock("@/routes/utils", () => ({
	json,
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

vi.mock("./management-helpers", () => ({
	userHasPaidWorkspaceAccess: state.userHasPaidWorkspaceAccess,
	ensureWorkspaceWalletProvisioned: state.ensureWorkspaceWalletProvisioned,
}));

describe("management workspace routes", () => {
	beforeEach(() => {
		state.guardManagementAuthResult = {
			ok: true,
			value: { workspaceId: "ws_1", apiKeyId: "mgmt_1", internal: false },
		};
		state.workspaces.length = 0;
		state.users.length = 0;
		state.workspaceSettingsUpserts.length = 0;
		state.workspaceMembersUpserts.length = 0;
		state.workspaceMembersUpsertError = null;
		state.workspaceSettingsUpsertError = null;
		state.workspacesInserted.length = 0;
		state.keyCount = 0;
		state.deletes.length = 0;
		state.userHasPaidWorkspaceAccess.mockReset();
		state.userHasPaidWorkspaceAccess.mockResolvedValue(true);
		state.ensureWorkspaceWalletProvisioned.mockReset();
		state.ensureWorkspaceWalletProvisioned.mockResolvedValue({ workspaceId: "ws_new", customerId: null });
		vi.resetModules();
	});

	it("blocks workspace creation when the owner has not unlocked paid workspace access", async () => {
		state.workspaces.push({ owner_user_id: "user_1" });
		state.userHasPaidWorkspaceAccess.mockResolvedValue(false);

		const { workspacesRoutes } = await import("./workspaces");
		const response = await workspacesRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "Production", slug: "production" }),
		});
		const body = await response.json();

		expect(response.status).toBe(403);
		expect(body.error).toBe("workspace_upgrade_required");
	});

	it("provisions wallet state when creating a workspace", async () => {
		state.workspaces.push(
			{ owner_user_id: "user_1" },
			{
				id: "ws_new",
				name: "Production",
				slug: "production",
				owner_user_id: "user_1",
				created_at: "2026-04-28T12:00:00Z",
				updated_at: "2026-04-28T12:00:00Z",
			},
		);

		const { workspacesRoutes } = await import("./workspaces");
		const response = await workspacesRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "Production", slug: "production" }),
		});
		const body = await response.json();

		expect(response.status).toBe(201);
		expect(state.ensureWorkspaceWalletProvisioned).toHaveBeenCalledWith({
			workspaceId: "ws_new",
			userId: "user_1",
		});
		expect(state.workspaceSettingsUpserts[0]).toMatchObject({
			workspace_id: "ws_new",
			routing_mode: "balanced",
		});
		expect(body.data).toMatchObject({
			id: "ws_new",
			name: "Production",
			slug: "production",
		});
	});

	it("returns a clear service error when Stripe provisioning is unavailable", async () => {
		state.workspaces.push(
			{ owner_user_id: "user_1" },
			{
				id: "ws_new",
				name: "Production",
				slug: "production",
				owner_user_id: "user_1",
				created_at: "2026-04-28T12:00:00Z",
				updated_at: "2026-04-28T12:00:00Z",
			},
		);
		state.ensureWorkspaceWalletProvisioned.mockRejectedValueOnce(
			new Error("Stripe customer provisioning is not configured for workspace creation"),
		);

		const { workspacesRoutes } = await import("./workspaces");
		const response = await workspacesRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "Production", slug: "production" }),
		});
		const body = await response.json();

		expect(response.status).toBe(503);
		expect(body.error).toBe("stripe_not_configured");
		expect(state.deletes).toEqual([
			{ table: "workspace_settings", column: "workspace_id", value: "ws_new" },
			{ table: "workspace_members", column: "workspace_id", value: "ws_new" },
			{ table: "wallets", column: "workspace_id", value: "ws_new" },
			{ table: "management_keys", column: "workspace_id", value: "ws_new" },
			{ table: "workspaces", column: "id", value: "ws_new" },
			{ table: "workspaces", column: "owner_user_id", value: "user_1" },
		]);
	});

	it("rolls back the new workspace when post-create provisioning fails", async () => {
		state.workspaces.push(
			{ owner_user_id: "user_1" },
			{
				id: "ws_new",
				name: "Production",
				slug: "production",
				owner_user_id: "user_1",
				created_at: "2026-04-28T12:00:00Z",
				updated_at: "2026-04-28T12:00:00Z",
			},
		);
		state.workspaceSettingsUpsertError = { message: "settings write failed" };

		const { workspacesRoutes } = await import("./workspaces");
		const response = await workspacesRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "Production", slug: "production" }),
		});
		const body = await response.json();

		expect(response.status).toBe(500);
		expect(body.error).toBe("failed");
		expect(state.workspaceMembersUpserts[0]).toMatchObject({
			workspace_id: "ws_new",
			user_id: "user_1",
			role: "owner",
		});
		expect(state.deletes).toEqual([
			{ table: "workspace_settings", column: "workspace_id", value: "ws_new" },
			{ table: "workspace_members", column: "workspace_id", value: "ws_new" },
			{ table: "wallets", column: "workspace_id", value: "ws_new" },
			{ table: "management_keys", column: "workspace_id", value: "ws_new" },
			{ table: "workspaces", column: "id", value: "ws_new" },
			{ table: "workspaces", column: "owner_user_id", value: "user_1" },
		]);
	});

	it("blocks renaming the personal workspace", async () => {
		state.workspaces.push(
			{ owner_user_id: "user_1" },
			{
				id: "ws_personal",
				name: "Personal",
				slug: "personal",
				owner_user_id: "user_1",
				created_at: "2026-04-28T12:00:00Z",
				updated_at: "2026-04-28T12:00:00Z",
			},
		);
		state.users.push({ default_workspace_id: "ws_personal" });

		const { workspacesRoutes } = await import("./workspaces");
		const response = await workspacesRoutes.request("https://example.com/ws_personal", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "Renamed" }),
		});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.message).toBe("Personal workspace cannot be renamed.");
	});

	it("blocks deleting the default workspace", async () => {
		state.workspaces.push(
			{ owner_user_id: "user_1" },
			{
				id: "ws_personal",
				name: "Personal",
				slug: "personal",
				owner_user_id: "user_1",
				created_at: "2026-04-28T12:00:00Z",
				updated_at: "2026-04-28T12:00:00Z",
			},
		);
		state.users.push({ default_workspace_id: "ws_personal" });

		const { workspacesRoutes } = await import("./workspaces");
		const response = await workspacesRoutes.request("https://example.com/ws_personal", {
			method: "DELETE",
		});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.message).toBe("The default workspace cannot be deleted");
		expect(state.deletes).toEqual([]);
	});

	it("blocks deleting a workspace that still has active keys", async () => {
		state.workspaces.push(
			{ owner_user_id: "user_1" },
			{
				id: "ws_prod",
				name: "Production",
				slug: "production",
				owner_user_id: "user_1",
				created_at: "2026-04-28T12:00:00Z",
				updated_at: "2026-04-28T12:00:00Z",
			},
		);
		state.users.push({ default_workspace_id: "ws_personal" });
		state.keyCount = 2;

		const { workspacesRoutes } = await import("./workspaces");
		const response = await workspacesRoutes.request("https://example.com/ws_prod", {
			method: "DELETE",
		});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.message).toBe("Workspaces with active API keys cannot be deleted");
		expect(state.deletes).toEqual([]);
	});

	it("deletes a non-default workspace after dependent cleanup", async () => {
		state.workspaces.push(
			{ owner_user_id: "user_1" },
			{
				id: "ws_prod",
				name: "Production",
				slug: "production",
				owner_user_id: "user_1",
				created_at: "2026-04-28T12:00:00Z",
				updated_at: "2026-04-28T12:00:00Z",
			},
		);
		state.users.push({ default_workspace_id: "ws_personal" });

		const { workspacesRoutes } = await import("./workspaces");
		const response = await workspacesRoutes.request("https://example.com/ws_prod", {
			method: "DELETE",
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ deleted: true });
		expect(state.deletes).toEqual([
			{ table: "workspace_members", column: "workspace_id", value: "ws_prod" },
			{ table: "workspace_invites", column: "workspace_id", value: "ws_prod" },
			{ table: "workspace_join_requests", column: "workspace_id", value: "ws_prod" },
			{ table: "workspace_settings", column: "workspace_id", value: "ws_prod" },
			{ table: "wallets", column: "workspace_id", value: "ws_prod" },
			{ table: "management_keys", column: "workspace_id", value: "ws_prod" },
			{ table: "workspaces", column: "id", value: "ws_prod" },
			{ table: "workspaces", column: "owner_user_id", value: "user_1" },
		]);
	});
});
