import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ManagementKeyRow = {
	id: string;
	workspace_id: string;
	status: string;
	hash: string;
	expires_at?: string | null;
	soft_blocked?: boolean | null;
};

const runtime = vi.hoisted(() => {
	const backgroundTasks: Promise<unknown>[] = [];
	const dbRow = { value: null as ManagementKeyRow | null };
	const updatePayloads: Array<Record<string, unknown>> = [];

	const maybeSingle = vi.fn(async () => ({
		data: dbRow.value,
		error: null,
	}));
	const updateEq = vi.fn(async () => ({ error: null }));

	const supabase = {
		from: vi.fn((table: string) => {
			if (table !== "management_keys") {
				throw new Error(`Unexpected table: ${table}`);
			}
			return {
				select: () => ({
					eq: () => ({
						maybeSingle,
					}),
				}),
				update: (payload: Record<string, unknown>) => {
					updatePayloads.push(payload);
					return {
						eq: updateEq,
					};
				},
			};
		}),
	};

	return {
		backgroundTasks,
		dbRow,
		maybeSingle,
		updateEq,
		supabase,
		updatePayloads,
		bindings: {
			SUPABASE_URL: "https://example.supabase.co",
			SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
			GATEWAY_CACHE: {} as KVNamespace,
			KEY_PEPPER: "pepper_test_value",
			KEY_PEPPER_ACTIVE: undefined as string | undefined,
			KEY_PEPPER_PREVIOUS: undefined as string | undefined,
		},
	};
});

vi.mock("@/runtime/env", () => ({
	getBindings: () => runtime.bindings,
	getCache: () => ({}) as KVNamespace,
	getSupabaseAdmin: () => runtime.supabase,
	dispatchBackground: (promise: Promise<unknown>) => {
		runtime.backgroundTasks.push(promise.catch(() => undefined));
	},
	configureRuntime: () => undefined,
	clearRuntime: () => undefined,
}));

function buildRequest(token: string): Request {
	return new Request("https://example.com/v1/credits", {
		headers: {
			authorization: `Bearer ${token}`,
		},
	});
}

function hashSecret(secret: string): string {
	const pepper = runtime.bindings.KEY_PEPPER_ACTIVE ?? runtime.bindings.KEY_PEPPER;
	return createHmac("sha256", pepper).update(secret).digest("hex");
}

async function flushBackground(): Promise<void> {
	while (runtime.backgroundTasks.length) {
		const batch = runtime.backgroundTasks.splice(0);
		await Promise.allSettled(batch);
	}
}

describe("authenticateManagement", () => {
	beforeEach(() => {
		runtime.backgroundTasks.length = 0;
		runtime.dbRow.value = null;
		runtime.updatePayloads.length = 0;
		runtime.bindings.KEY_PEPPER = "pepper_test_value";
		runtime.bindings.KEY_PEPPER_ACTIVE = undefined;
		runtime.bindings.KEY_PEPPER_PREVIOUS = undefined;
		runtime.supabase.from.mockClear();
		runtime.maybeSingle.mockClear();
		runtime.updateEq.mockClear();
		vi.resetModules();
	});

	it("accepts active management keys", async () => {
		const kid = "MGMTKEY12345";
		const secret = "secret_management_key";
		runtime.dbRow.value = {
			id: "mgmt_1",
			workspace_id: "team_1",
			status: "active",
			hash: hashSecret(secret),
		};

		const { authenticateManagement } = await import("./auth");
		const result = await authenticateManagement(
			buildRequest(`aistats_v1_sk_${kid}_${secret}`),
		);
		await flushBackground();

		expect(result).toMatchObject({
			ok: true,
			workspaceId: "team_1",
			apiKeyId: "mgmt_1",
			apiKeyKid: kid,
		});
		expect(runtime.updatePayloads).toContainEqual(
			expect.objectContaining({
				last_used_at: expect.any(String),
			}),
		);
	});

	it("rejects soft-blocked management keys", async () => {
		const kid = "MGMTSOFT1234";
		const secret = "secret_soft_blocked";
		runtime.dbRow.value = {
			id: "mgmt_2",
			workspace_id: "team_2",
			status: "active",
			hash: hashSecret(secret),
			soft_blocked: true,
		};

		const { authenticateManagement } = await import("./auth");
		const result = await authenticateManagement(
			buildRequest(`aistats_v1_sk_${kid}_${secret}`),
		);

		expect(result).toEqual({ ok: false, reason: "key_soft_blocked" });
	});

	it("rejects expired management keys", async () => {
		const kid = "MGMTEXP12345";
		const secret = "secret_expired_key";
		runtime.dbRow.value = {
			id: "mgmt_3",
			workspace_id: "team_3",
			status: "active",
			hash: hashSecret(secret),
			expires_at: new Date(Date.now() - 60_000).toISOString(),
		};

		const { authenticateManagement } = await import("./auth");
		const result = await authenticateManagement(
			buildRequest(`aistats_v1_sk_${kid}_${secret}`),
		);

		expect(result).toEqual({ ok: false, reason: "key_expired" });
	});

	it("rejects OAuth bearer tokens for management auth", async () => {
		const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoidTEiLCJ3b3Jrc3BhY2VfaWQiOiJ3MSIsImNsaWVudF9pZCI6ImMxIn0.sig";
		const { authenticateManagement } = await import("./auth");
		const result = await authenticateManagement(buildRequest(jwt));

		expect(result).toEqual({ ok: false, reason: "management_key_required" });
	});
});
