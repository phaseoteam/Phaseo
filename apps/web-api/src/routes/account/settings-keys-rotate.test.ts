import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";

// Rotating from Settings, API Keys runs public.rotate_api_key, which creates the replacement and
// copies the old key's settings, guardrails, destinations, dynamic route and key spend rules in one
// transaction. The route passes the new secret's hash, never the secret, and reports what moved.

const mocks = vi.hoisted(() => {
	const key = { id: "key-1", workspace_id: "workspace-1", name: "Production", status: "active" } as Record<string, unknown>;
	const rpcResult = { value: { data: null as unknown, error: null as { message: string } | null } };
	const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => rpcResult.value);
	const insert = vi.fn();
	const update = vi.fn();
	const client = {
		rpc,
		from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: key, error: null }) }) }), insert, update })),
	};
	return { key, rpc, rpcResult, insert, update, client, audit: vi.fn(), fetch: vi.fn(async () => new Response("{}")) };
});

vi.mock("@/auth/requireUser", () => ({ requireUser: async () => ({ id: "user-1" }) }));
vi.mock("@/data/supabase", () => ({ getDataClient: () => mocks.client }));
vi.mock("./context", () => ({ requireAccountWorkspace: async () => ({ workspaceId: "workspace-1", role: "owner", client: mocks.client }) }));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: mocks.audit }));

import { accountSettingsKeysRouter, parseKeyRotation } from "./settings-keys";
const app = new Hono<{ Bindings: Env }>().route("/", accountSettingsKeysRouter);
const env = { KEY_PEPPER_ACTIVE: "pepper", PHASEO_CONTROL_KEY: "control", PHASEO_CONTROL_SECRET: "secret" } as unknown as Env;
const waited: Array<Promise<unknown>> = [];
const executionContext = { waitUntil: (promise: Promise<unknown>) => { waited.push(promise); }, passThroughOnException: () => undefined } as unknown as ExecutionContext;

function rotate(body: unknown) {
	return app.request("https://example.com/keys/key-1/rotate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, env, executionContext);
}

const carried = { guardrails: 3, rate_guardrails: 1, destinations: 2, dynamic_routes: 1, spend_rules: 1, department: true };

describe("rotating a key from settings", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		waited.length = 0;
		vi.stubGlobal("fetch", mocks.fetch);
		mocks.rpcResult.value = { data: { replacement_key_id: "key-2", previous_expires_at: null, carried }, error: null };
	});

	it("rotates in one database call and reports what moved to the new key", async () => {
		const response = await rotate({ newName: "Production v2", previousKeyExpiresAt: "2026-12-01T00:00:00Z" });
		expect(response.status).toBe(200);
		const body = await response.json() as Record<string, unknown>;
		expect(body).toMatchObject({
			id: "key-2",
			previousKeyExpiresAt: "2026-12-01T00:00:00.000Z",
			carried: { guardrails: 3, destinations: 2, dynamicRoutes: 1, spendRules: 1, department: true },
		});
		expect(String(body.plaintext)).toMatch(/^phaseo_v1_sk_/);
		expect(mocks.rpc).toHaveBeenCalledTimes(1);
		const [name, args] = mocks.rpc.mock.calls[0];
		expect(name).toBe("rotate_api_key");
		expect(args).toMatchObject({
			p_workspace_id: "workspace-1", p_key_id: "key-1", p_name: "Production v2", p_created_by: "user-1",
			p_expire_previous: true, p_previous_expires_at: "2026-12-01T00:00:00.000Z",
		});
		// The database gets the secret's HMAC, never the secret.
		expect(args.p_hash).toMatch(/^[0-9a-f]{64}$/);
		expect(String(body.plaintext)).not.toContain(String(args.p_hash));
		expect(mocks.insert).not.toHaveBeenCalled();
		expect(mocks.update).not.toHaveBeenCalled();
		// The old key's new expiry reaches the gateway.
		await Promise.all(waited);
		expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining("/v1/keys/key-1/invalidate"), expect.anything());
		expect(mocks.audit).toHaveBeenCalledWith(mocks.client, expect.objectContaining({
			action: "api_key.rotated",
			metadata: expect.objectContaining({ replacementKeyId: "key-2", carried: expect.objectContaining({ guardrails: 3 }) }),
		}));
	});

	it("leaves the old key's expiry alone when none is given", async () => {
		expect((await rotate({})).status).toBe(200);
		expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_name: "Production (rotated)", p_expire_previous: false, p_previous_expires_at: null });
		await Promise.all(waited);
		expect(mocks.fetch).not.toHaveBeenCalled();
	});

	it("explains when the key's spend rules would pass the workspace limit", async () => {
		mocks.rpcResult.value = { data: null, error: { message: "spend_rule_limit_reached" } };
		const response = await rotate({});
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: "spend_rule_limit_reached" });
	});

	it("reports a failed rotation without writing anything else", async () => {
		mocks.rpcResult.value = { data: null, error: { message: "connection reset" } };
		const response = await rotate({ previousKeyExpiresAt: "2026-12-01T00:00:00Z" });
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: "key_write_failed" });
		expect(mocks.insert).not.toHaveBeenCalled();
		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.audit).not.toHaveBeenCalled();
	});

	it("reads the function's result defensively", () => {
		expect(parseKeyRotation(null)).toBeNull();
		expect(parseKeyRotation({ carried })).toBeNull();
		expect(parseKeyRotation([{ replacement_key_id: "key-2" }])).toEqual({
			id: "key-2", carried: { guardrails: 0, destinations: 0, dynamicRoutes: 0, spendRules: 0, department: false },
		});
	});
});
