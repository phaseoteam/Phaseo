import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";

const mocks = vi.hoisted(() => {
	const state = {
		role: "admin" as string | null,
		inserted: [] as Array<{ table: string; values: unknown }>,
		rpc: vi.fn(),
		applyError: null as { message: string } | null,
		outboxError: null as { message: string } | null,
		upsertOptions: null as unknown,
	};
	const client = {
		from: (table: string) => ({
			select: () => ({
				eq: () => ({ maybeSingle: async () => ({ data: state.role ? { role: state.role } : null, error: null }) }),
				order: () => ({ limit: async () => ({ data: [{ id: "incident-0" }], error: null }) }),
			}),
			upsert: async (values: unknown, options: unknown) => {
				state.inserted.push({ table, values });
				state.upsertOptions = options;
				return { error: state.outboxError };
			},
		}),
		rpc: async (name: string, args: unknown) => {
			state.rpc(name, args);
			if (name === "preview_key_storage_incident") return { data: [{ keys: 12, workspaces: 3 }], error: null };
			if (name === "declare_key_storage_incident") return state.applyError
				? { data: null, error: state.applyError }
				: { data: { incident_id: "incident-1", created: true, keys: [{ key_id: "k1", workspace_id: "w1" }, { key_id: "k2", workspace_id: "w1" }, { key_id: "k3", workspace_id: "w2" }] }, error: null };
			if (name === "key_storage_incident_recipients") return { data: [
				{ workspace_id: "w1", workspace_name: "Acme", user_id: "u1", email: "owner@acme.test", keys: 2 },
				{ workspace_id: "w2", workspace_name: "Beta", user_id: "u2", email: "owner@beta.test", keys: 1 },
			], error: null };
			return { data: null, error: null };
		},
	};
	return { state, client };
});

vi.mock("@/auth/requireUser", () => ({ requireUser: async () => ({ id: "staff-1" }) }));
vi.mock("@/data/supabase", () => ({ getDataClient: () => mocks.client }));
vi.mock("@/routes/account/settings-keys", () => ({ invalidateGatewayKey: vi.fn(async () => true) }));

import { internalKeyIncidentsRouter } from "./internal-key-incidents";
import { invalidateGatewayKey } from "@/routes/account/settings-keys";

const app = new Hono<{ Bindings: Env }>().route("/", internalKeyIncidentsRouter);
const scope = { locationId: "railway", action: "revoke", keysCreatedBefore: "2026-10-21T12:00:00Z" };
const incident = { ...scope, requestId: "00000000-0000-4000-8000-00000000e001", title: "Railway breach", customerMessage: "Railway reported exposed environment variables.", sourceUrl: "https://blog.railway.com/p/security", confirmLocationId: "railway" };

async function post(path: string, body: unknown) {
	const background: Promise<unknown>[] = [];
	const response = await app.request(`https://example.com/key-incidents/${path}`, {
		method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
	}, {} as Env, { waitUntil: (promise: Promise<unknown>) => background.push(promise), passThroughOnException: () => undefined } as unknown as ExecutionContext);
	await Promise.all(background);
	return response;
}

describe("key storage incidents (staff)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Object.assign(mocks.state, { role: "admin", inserted: [], applyError: null, outboxError: null, upsertOptions: null });
	});

	it("is for Phaseo admins only", async () => {
		mocks.state.role = "member";
		expect((await post("preview", scope)).status).toBe(403);
		expect((await app.request("https://example.com/key-incidents/list", {}, {} as Env)).status).toBe(403);
		expect(mocks.state.rpc).not.toHaveBeenCalled();
	});

	it("previews how many keys and workspaces an incident would change", async () => {
		const response = await post("preview", { ...scope, action: "pause" });
		expect(await response.json()).toEqual({ keys: 12, workspaces: 3 });
		expect(mocks.state.rpc).toHaveBeenCalledWith("preview_key_storage_incident", { p_location_id: "railway", p_keys_created_before: "2026-10-21T12:00:00Z", p_action: "pause" });
	});

	it.each([
		[{ ...scope, locationId: "my-laptop" }],
		[{ ...scope, action: "delete" }],
		[{ ...scope, keysCreatedBefore: "yesterday" }],
	])("rejects an invalid scope %j", async (body) => {
		expect((await post("preview", body)).status).toBe(400);
		expect(mocks.state.rpc).not.toHaveBeenCalled();
	});

	it("requires the location id retyped and a cut-off that isn't in the future", async () => {
		expect((await post("apply", { ...incident, confirmLocationId: "vercel" })).status).toBe(409);
		expect((await post("apply", { ...incident, keysCreatedBefore: "2999-01-01T00:00:00Z" })).status).toBe(400);
		expect((await post("apply", { ...incident, sourceUrl: "http://insecure.test" })).status).toBe(400);
		expect((await post("apply", { ...incident, requestId: undefined })).status).toBe(400);
		expect(mocks.state.inserted).toEqual([]);
	});

	it("declares and applies an incident, emails each workspace's owners and admins once, and clears the gateway cache", async () => {
		const response = await post("apply", incident);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ incidentId: "incident-1", keys: 3, workspaces: 2, emails: 2 });
		expect(mocks.state.rpc).toHaveBeenCalledWith("declare_key_storage_incident", expect.objectContaining({
			p_client_request_id: incident.requestId, p_location_id: "railway", p_action: "revoke", p_declared_by: "staff-1",
		}));
		// Retries can't send the same email twice.
		expect(mocks.state.upsertOptions).toEqual({ onConflict: "dedupe_key", ignoreDuplicates: true });
		const outbox = mocks.state.inserted.find((entry) => entry.table === "email_outbox")?.values as Array<Record<string, any>>;
		expect(outbox).toHaveLength(2);
		expect(outbox[0]).toMatchObject({
			template: "security_storage_incident",
			to_email: "owner@acme.test",
			dedupe_key: "storage_incident:incident-1:w1:u1",
			payload: { location_id: "railway", action: "revoke", keys: 2, workspace_name: "Acme" },
		});
		expect(vi.mocked(invalidateGatewayKey).mock.calls.map(([, keyId]) => keyId).sort()).toEqual(["k1", "k2", "k3"]);
	});

	it("reports a failed email step as retryable after the keys were changed", async () => {
		mocks.state.outboxError = { message: "timeout" };
		const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const response = await post("apply", incident);
		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({ error: "notification_enqueue_failed", incidentId: "incident-1", keys: 3 });
		// The gateway cache is still cleared.
		expect(invalidateGatewayKey).toHaveBeenCalledTimes(3);
		log.mockRestore();
	});

	it("reports a failed apply without emailing anyone", async () => {
		mocks.state.applyError = { message: "boom" };
		const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const response = await post("apply", incident);
		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({ error: "incident_apply_failed" });
		expect(mocks.state.inserted.some((entry) => entry.table === "email_outbox")).toBe(false);
		log.mockRestore();
	});
});
