import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";

const mocks = vi.hoisted(() => {
	const state = {
		role: "admin",
		changed: [] as Array<{ id: string; name: string; prefix: string }>,
		filters: [] as Array<[string, ...unknown[]]>,
		update: null as Record<string, unknown> | null,
		audit: [] as Array<Record<string, unknown>>,
		rpc: vi.fn(),
	};
	const updateChain: any = {};
	for (const method of ["eq", "in", "not", "or", "contains"]) updateChain[method] = (...args: unknown[]) => { state.filters.push([method, ...args]); return updateChain; };
	updateChain.select = async () => ({ data: state.changed, error: null });
	const client = {
		from: vi.fn((table: string) => table === "workspace_audit_events"
			? { insert: async (rows: Array<Record<string, unknown>>) => { state.audit.push(...rows); return { error: null }; } }
			: { update: (values: Record<string, unknown>) => { state.update = values; return updateChain; } }),
		rpc: (name: string, args: unknown) => {
			state.rpc(name, args);
			const data = name === "workspace_key_security_summary"
				? { total: 1, locations: [] }
				: name === "workspace_key_storage_incidents"
					? [{ id: "incident-1", location_id: "railway", action: "revoke", keys: 1 }]
					: [{ id: "k1", name: "Prod", owner_email: "ada@example.com" }];
			const result = { data, error: null };
			return Object.assign(Promise.resolve(result), { limit: async () => result });
		},
	};
	return { state, client };
});

vi.mock("@/auth/requireUser", () => ({ requireUser: async () => ({ id: "user-1" }) }));
vi.mock("./context", () => ({ requireAccountWorkspace: async () => ({ workspaceId: "workspace-1", role: mocks.state.role, client: mocks.client }) }));
vi.mock("./settings-keys", () => ({ invalidateGatewayKey: vi.fn(async () => true) }));

import { accountSettingsKeySecurityRouter, bulkKeyUpdate, MAX_BULK_KEYS } from "./settings-key-security";
import { invalidateGatewayKey } from "./settings-keys";

const app = new Hono<{ Bindings: Env }>().route("/", accountSettingsKeySecurityRouter);
const ids = (count: number) => Array.from({ length: count }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);

async function bulk(body: Record<string, unknown>) {
	const background: Promise<unknown>[] = [];
	const response = await app.request("https://example.com/key-security/bulk", {
		method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId: "workspace-1", ...body }),
	}, {} as Env, { waitUntil: (promise: Promise<unknown>) => background.push(promise), passThroughOnException: () => undefined } as unknown as ExecutionContext);
	await Promise.all(background);
	return response;
}

describe("key security", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Object.assign(mocks.state, { role: "admin", changed: [], filters: [], update: null, audit: [] });
	});

	it("returns the overview, hiding owner emails from members", async () => {
		const read = async () => (await app.request("https://example.com/key-security?workspaceId=workspace-1", {}, {} as Env)).json() as Promise<any>;
		const admin = await read();
		expect(admin.keys[0].owner_email).toBe("ada@example.com");
		expect(admin.incidents).toEqual([expect.objectContaining({ location_id: "railway", keys: 1 })]);
		expect(mocks.state.rpc).toHaveBeenCalledWith("workspace_key_storage_incidents", { p_workspace_id: "workspace-1" });
		mocks.state.role = "member";
		const member = await read();
		expect(member.canManage).toBe(false);
		expect(member.keys[0].owner_email).toBeNull();
		expect(mocks.state.rpc).toHaveBeenCalledWith("workspace_key_security_summary", { p_workspace_id: "workspace-1" });
	});

	it("revokes selected live keys in one workspace-scoped statement, audits each and clears the gateway cache", async () => {
		const keyIds = ids(2);
		mocks.state.changed = [{ id: keyIds[0], name: "Prod", prefix: "abc123" }];
		const response = await bulk({ action: "revoke", keyIds });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ changed: [keyIds[0]], skipped: 1 });
		expect(mocks.state.update).toMatchObject({ status: "revoked", revoked_reason: "workspace_security_review" });
		expect(mocks.state.filters).toEqual(expect.arrayContaining([
			["eq", "workspace_id", "workspace-1"],
			["eq", "key_kind", "standard"],
			["in", "id", keyIds],
			["in", "status", ["active", "paused"]],
			["or", expect.stringMatching(/^expires_at\.is\.null,expires_at\.gt\.\d{4}-/)],
			["not", "name", "in", "(\"__chat_route_managed_key__\",\"__slack_agent_managed_key__\")"],
		]));
		expect(mocks.state.audit).toEqual([expect.objectContaining({ action: "api_key.revoked", target_id: keyIds[0], metadata: expect.objectContaining({ bulkAction: "revoke" }) })]);
		expect(invalidateGatewayKey).toHaveBeenCalledWith(expect.anything(), keyIds[0]);
	});

	it("revokes every live key stored in a location, chosen on the server", async () => {
		mocks.state.changed = [{ id: ids(1)[0], name: "Prod", prefix: "abc123" }];
		const response = await bulk({ action: "revoke", storageLocation: "railway" });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ changed: [ids(1)[0]], skipped: 0 });
		expect(mocks.state.filters).toContainEqual(["contains", "storage_locations", ["railway"]]);
		expect(mocks.state.filters.some(([method, column]) => method === "in" && column === "id")).toBe(false);
	});

	it.each([
		[{ action: "revoke", storageLocation: "nowhere" }],
		[{ action: "revoke", storageLocation: "railway", keyIds: ids(1) }],
		[{ action: "set_expiry", storageLocation: "railway", expiresAt: "2999-01-01" }],
	])("rejects a bad location selection %j", async (body) => {
		expect((await bulk(body)).status).toBe(400);
		expect(mocks.state.update).toBeNull();
	});

	it("pauses only active keys", async () => {
		expect((await bulk({ action: "pause", keyIds: ids(1) })).status).toBe(200);
		expect(mocks.state.filters).toContainEqual(["in", "status", ["active"]]);
	});

	it("tags keys with storage locations without touching the gateway", async () => {
		mocks.state.changed = [{ id: ids(1)[0], name: "Prod", prefix: "abc123" }];
		expect((await bulk({ action: "set_storage_locations", keyIds: ids(1), storageLocations: ["railway"] })).status).toBe(200);
		expect(mocks.state.update).toEqual({ storage_locations: ["railway"] });
		expect(invalidateGatewayKey).not.toHaveBeenCalled();
	});

	it.each([
		[{ action: "delete_everything", keyIds: ids(1) }, "invalid_action"],
		[{ action: "revoke", keyIds: [] }, "invalid_keys"],
		[{ action: "revoke", keyIds: ["not-a-uuid"] }, "invalid_keys"],
		[{ action: "revoke", keyIds: ids(MAX_BULK_KEYS + 1) }, "too_many_keys"],
		[{ action: "set_monthly_spend_limit", keyIds: ids(1), monthlyCostNanos: 0 }, "invalid_limit"],
		[{ action: "set_expiry", keyIds: ids(1), expiresAt: "2001-01-01" }, "invalid_expiry"],
		[{ action: "set_storage_locations", keyIds: ids(1), storageLocations: ["nowhere"] }, "invalid_storage_locations"],
	])("rejects %j", async (body, error) => {
		const response = await bulk(body);
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error });
		expect(mocks.state.update).toBeNull();
	});

	it("denies members", async () => {
		mocks.state.role = "member";
		expect((await bulk({ action: "revoke", keyIds: ids(1) })).status).toBe(403);
		expect(mocks.state.update).toBeNull();
	});

	it("builds spend limit and expiry updates", () => {
		const now = new Date("2026-10-22T00:00:00Z");
		expect(bulkKeyUpdate("set_monthly_spend_limit", { monthlyCostNanos: 50_000_000_000 }, now)).toMatchObject({ ok: true, update: { monthly_limit_cost_nanos: 50_000_000_000 } });
		expect(bulkKeyUpdate("set_expiry", { expiresAt: "2026-11-01T00:00:00Z" }, now)).toMatchObject({ ok: true, update: { expires_at: "2026-11-01T00:00:00.000Z" } });
	});
});
