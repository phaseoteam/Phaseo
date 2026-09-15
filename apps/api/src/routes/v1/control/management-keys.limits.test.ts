import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	enforceWorkspaceKeyLimit: vi.fn(async (_workspaceId: string, _keyType: string, _excludeKeyId?: string) => undefined),
	isUsableWorkspaceKey: vi.fn((key: Record<string, unknown>) => {
		if (key.status !== "active" || key.soft_blocked !== false) return false;
		if (key.expires_at === null || key.expires_at === undefined) return true;
		return new Date(String(key.expires_at)).getTime() > Date.now();
	}),
	updatePayloads: [] as Array<Record<string, unknown>>,
}));

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", ...headers },
	});
}

function managementKey() {
	return {
		id: "mgmt_1",
		workspace_id: "ws_1",
		name: "Automation",
		status: "paused",
		soft_blocked: false,
		expires_at: null,
		scopes: "[\"management_keys:write\"]",
	};
}

function buildQuery() {
	let updatePayload: Record<string, unknown> | null = null;
	const query: any = {
		select: () => query,
		eq: () => query,
		update: (payload: Record<string, unknown>) => {
			updatePayload = payload;
			state.updatePayloads.push(payload);
			return query;
		},
		maybeSingle: async () => ({
			data: updatePayload ? { ...managementKey(), ...updatePayload } : managementKey(),
			error: null,
		}),
	};
	return query;
}

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({ KEY_PEPPER_ACTIVE: "pepper" }),
	getSupabaseAdmin: () => ({
		from: (table: string) => {
			if (table !== "management_keys") throw new Error(`Unexpected table: ${table}`);
			return buildQuery();
		},
	}),
}));

vi.mock("@/pipeline/before/guards", () => ({
	guardManagementAuth: vi.fn(async () => ({
		ok: true,
		value: {
			workspaceId: "ws_1",
			apiKeyId: "mgmt_auth",
			authMethod: "api_key",
		},
	})),
}));

vi.mock("@/routes/utils", () => ({
	json,
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

vi.mock("@/lib/audit/workspaceAudit", () => ({
	recordWorkspaceAuditEvent: vi.fn(async () => true),
}));

vi.mock("./management-helpers", () => ({
	enforceWorkspaceKeyLimit: state.enforceWorkspaceKeyLimit,
	isUsableWorkspaceKey: state.isUsableWorkspaceKey,
}));

describe("management key limits", () => {
	beforeEach(() => {
		state.enforceWorkspaceKeyLimit.mockReset().mockResolvedValue(undefined);
		state.isUsableWorkspaceKey.mockClear();
		state.updatePayloads.length = 0;
		vi.resetModules();
	});

	it("rechecks the management key limit before reactivating a paused key", async () => {
		state.enforceWorkspaceKeyLimit.mockRejectedValueOnce(
			new Error("Key limit reached (5) for this workspace. Delete an existing management key to create a new one."),
		);

		const { managementKeysRoutes } = await import("./management-keys");
		const response = await managementKeysRoutes.request("https://example.com/mgmt_1", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ paused: false }),
		});
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body).toMatchObject({ error: "key_limit_reached" });
		expect(state.enforceWorkspaceKeyLimit).toHaveBeenCalledWith("ws_1", "management", "mgmt_1");
		expect(state.updatePayloads).toEqual([]);
	});
});
