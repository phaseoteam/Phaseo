import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type KeyRow = {
    id: string;
    workspace_id: string;
    status: string;
    hash: string;
    expires_at?: string | null;
	key_kind?: string | null;
	oauth_client_id?: string | null;
	oauth_user_id?: string | null;
	oauth_scopes?: string[] | null;
};

const runtime = vi.hoisted(() => {
    const store = new Map<string, string>();
    const backgroundTasks: Promise<unknown>[] = [];
    const dbRow = { value: null as KeyRow | null };
    const updatePayloads: Array<Record<string, unknown>> = [];

    const maybeSingle = vi.fn(async () => ({
        data: dbRow.value,
        error: null,
    }));
	const authorizationMaybeSingle = vi.fn(async () => ({
		data: { scopes: ["gateway:access", "models:read"], revoked_at: null },
		error: null,
	}));
	const membershipMaybeSingle = vi.fn(async () => ({
		data: { workspace_id: "team_oauth" },
		error: null,
	}));
    const updateEq = vi.fn(async () => ({ error: null }));

    const cache = {
        get: vi.fn(async (key: string, type?: "text" | "json" | "arrayBuffer" | "stream") => {
            const value = store.get(key);
            if (value == null) return null;
            if (type === "json") return JSON.parse(value);
            return value;
        }),
        put: vi.fn(async (key: string, value: string) => {
            store.set(key, value);
        }),
        delete: vi.fn(async (key: string) => {
            store.delete(key);
        }),
    };

    const supabase = {
        from: vi.fn((table: string) => {
			if (table === "oauth_authorizations") {
				return {
					select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: authorizationMaybeSingle }) }) }) }),
					update: () => ({ eq: () => ({ eq: () => ({ eq: updateEq }) }) }),
				};
			}
			if (table === "workspace_members") {
				return {
					select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: membershipMaybeSingle }) }) }),
				};
			}
			if (table !== "keys") throw new Error(`Unexpected table: ${table}`);
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
        store,
        backgroundTasks,
        dbRow,
        maybeSingle,
		authorizationMaybeSingle,
		membershipMaybeSingle,
        updateEq,
        cache,
        supabase,
        updatePayloads,
        bindings: {
            SUPABASE_URL: "https://example.supabase.co",
            SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
            GATEWAY_CACHE: cache as unknown as KVNamespace,
			KEY_PEPPER_ACTIVE: "pepper_test_value",
            KEY_PEPPER_PREVIOUS: undefined as string | undefined,
        },
    };
});

vi.mock("@/runtime/env", () => ({
    getBindings: () => runtime.bindings,
    getCache: () => runtime.cache as unknown as KVNamespace,
    getSupabaseAdmin: () => runtime.supabase,
    dispatchBackground: (promise: Promise<unknown>) => {
        runtime.backgroundTasks.push(promise.catch(() => undefined));
    },
    configureRuntime: () => undefined,
    clearRuntime: () => undefined,
}));

function buildRequest(token: string): Request {
    return new Request("https://example.com/v1/responses", {
        headers: {
            authorization: `Bearer ${token}`,
        },
    });
}

function hashSecret(secret: string): string {
	const pepper = runtime.bindings.KEY_PEPPER_ACTIVE;
    return createHmac("sha256", pepper).update(secret).digest("hex");
}

async function flushBackground(): Promise<void> {
    while (runtime.backgroundTasks.length) {
        const batch = runtime.backgroundTasks.splice(0);
        await Promise.allSettled(batch);
    }
}

describe("authenticate hot-path caching", () => {
    beforeEach(() => {
        runtime.store.clear();
        runtime.backgroundTasks.length = 0;
        runtime.dbRow.value = null;
        runtime.updatePayloads.length = 0;
		runtime.bindings.KEY_PEPPER_ACTIVE = "pepper_test_value";
        runtime.bindings.KEY_PEPPER_PREVIOUS = undefined;
        runtime.cache.get.mockClear();
        runtime.cache.put.mockClear();
        runtime.cache.delete.mockClear();
        runtime.supabase.from.mockClear();
        runtime.maybeSingle.mockClear();
		runtime.authorizationMaybeSingle.mockClear();
		runtime.membershipMaybeSingle.mockClear();
        runtime.updateEq.mockClear();
        vi.resetModules();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("reuses key-version and key-row L1 cache for back-to-back KV-backed auth checks", async () => {
        const kid = "KIDCACHE123";
        const secret = "secret_cache_hit";
        const hash = hashSecret(secret);
        const token = `phaseo_v1_sk_${kid}_${secret}`;
        const row: KeyRow = {
            id: "key_1",
            workspace_id: "team_1",
            status: "active",
            hash,
        };

        await runtime.cache.put(`gateway:keyver:kid:${kid}`, "7");
        await runtime.cache.put(`gateway:key:${kid}:v7`, JSON.stringify(row));

        const { authenticate } = await import("./auth");
        const first = await authenticate(buildRequest(token), { useKvCache: true });
        const second = await authenticate(buildRequest(token), { useKvCache: true });
        await flushBackground();

        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        expect(runtime.maybeSingle).not.toHaveBeenCalled();
        expect(runtime.cache.get).toHaveBeenCalledTimes(2);
    });

    it("warms auth L1 from DB path and avoids duplicate DB lookups on immediate repeat", async () => {
        const kid = "KIDDBWARM123";
        const secret = "secret_db_path";
        const hash = hashSecret(secret);
        const token = `phaseo_v1_sk_${kid}_${secret}`;
        runtime.dbRow.value = {
            id: "key_2",
            workspace_id: "team_2",
            status: "active",
            hash,
        };

        await runtime.cache.put(`gateway:keyver:kid:${kid}`, "0");

        const { authenticate } = await import("./auth");
        const first = await authenticate(buildRequest(token), { useKvCache: true });
        const second = await authenticate(buildRequest(token), { useKvCache: true });
        await flushBackground();

        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        expect(runtime.maybeSingle).toHaveBeenCalledTimes(1);
        expect(runtime.cache.get).toHaveBeenCalledTimes(2);
    });

    it("accepts KEY_PEPPER_PREVIOUS and migrates hash to KEY_PEPPER_ACTIVE", async () => {
		runtime.bindings.KEY_PEPPER_ACTIVE = "pepper_active";
        runtime.bindings.KEY_PEPPER_PREVIOUS = "pepper_previous";

        const kid = "KIDPEPPERROTATE";
        const secret = "secret_prev";
        const hash = createHmac("sha256", runtime.bindings.KEY_PEPPER_PREVIOUS).update(secret).digest("hex");
        const token = `phaseo_v1_sk_${kid}_${secret}`;
        runtime.dbRow.value = {
            id: "key_3",
            workspace_id: "team_3",
            status: "active",
            hash,
        };

        const { authenticate } = await import("./auth");
        const result = await authenticate(buildRequest(token), { useKvCache: false });
        await flushBackground();

        expect(result.ok).toBe(true);
        const migratedHash = createHmac("sha256", runtime.bindings.KEY_PEPPER_ACTIVE).update(secret).digest("hex");
        expect(runtime.updatePayloads).toContainEqual(
            expect.objectContaining({ hash: migratedHash }),
        );
    });

	it("does not accept a cached OAuth-managed key after it is revoked", async () => {
		const kid = "KIDOAUTHREVOKE";
		const secret = "secret_oauth_revoked";
		const token = `phaseo_v1_sk_${kid}_${secret}`;
		const cachedRow: KeyRow = {
			id: "key_oauth",
			workspace_id: "team_oauth",
			status: "active",
			hash: hashSecret(secret),
			key_kind: "oauth_delegated",
			oauth_user_id: "user_oauth",
			oauth_client_id: "client_oauth",
			oauth_scopes: ["models:read"],
		};
		runtime.dbRow.value = { ...cachedRow, status: "revoked" };
		await runtime.cache.put(`gateway:keyver:kid:${kid}`, "1");
		await runtime.cache.put(`gateway:key:${kid}:v1`, JSON.stringify(cachedRow));

		const { authenticate } = await import("./auth");
		const result = await authenticate(buildRequest(token), { useKvCache: true });

		expect(result).toEqual({ ok: false, reason: "key_not_found_or_revoked" });
		expect(runtime.maybeSingle).toHaveBeenCalledTimes(1);
	});

	it("keeps resource-bound OAuth keys off normal API routes", async () => {
		const kid = "KIDOAUTHSCOPE";
		const secret = "secret_oauth_scope";
		runtime.dbRow.value = {
			id: "key_oauth_scope",
			workspace_id: "team_oauth",
			status: "active",
			hash: hashSecret(secret),
			key_kind: "oauth_delegated",
			oauth_user_id: "user_oauth",
			oauth_client_id: "client_oauth",
			oauth_scopes: ["models:read", "logs:read"],
			oauth_resource: "https://mcp.phaseo.app/mcp",
		};

		const { authenticateManagement } = await import("./auth");
		const request = buildRequest(`phaseo_v1_sk_${kid}_${secret}`);
		const result = await authenticateManagement(request, { useKvCache: false });
		const exchangeResult = await authenticateManagement(request, {
			useKvCache: false,
			allowResourceBoundOAuthKey: true,
		});
		await flushBackground();

		expect(result).toEqual({ ok: false, reason: "oauth_resource_token_not_valid_for_api" });
		expect(exchangeResult).toMatchObject({
			ok: true,
			authMethod: "oauth",
			oauthScopes: ["models:read"],
			oauthResource: "https://mcp.phaseo.app/mcp",
			scopes: ["models:read"],
		});
	});

	it("rejects an identity-only OAuth-managed key", async () => {
		const kid = "KIDOAUTHIDENT";
		const secret = "secret_oauth_identity";
		runtime.dbRow.value = {
			id: "key_oauth_identity",
			workspace_id: "team_oauth",
			status: "active",
			hash: hashSecret(secret),
			key_kind: "oauth_delegated",
			oauth_user_id: "user_oauth",
			oauth_client_id: "client_oauth",
			oauth_scopes: ["openid"],
		};
		runtime.authorizationMaybeSingle.mockResolvedValueOnce({
			data: { scopes: ["openid"], revoked_at: null },
			error: null,
		});

		const { authenticate } = await import("./auth");
		const result = await authenticate(buildRequest(`phaseo_v1_sk_${kid}_${secret}`), { useKvCache: false });

		expect(result).toEqual({ ok: false, reason: "oauth_gateway_scope_required" });
	});

    it("rejects expired keys when expires_at has passed", async () => {
        const kid = "KIDEXPIRED001";
        const secret = "secret_expired";
        const hash = hashSecret(secret);
        const token = `phaseo_v1_sk_${kid}_${secret}`;
        runtime.dbRow.value = {
            id: "key_4",
            workspace_id: "team_4",
            status: "active",
            hash,
            expires_at: new Date(Date.now() - 5_000).toISOString(),
        };

        const { authenticate } = await import("./auth");
        const result = await authenticate(buildRequest(token), { useKvCache: false });

        expect(result).toEqual({ ok: false, reason: "key_expired" });
    });

    it("accepts legacy aistats-prefixed keys before the cutoff", async () => {
        const kid = "KIDLEGACY001";
        const secret = "secret_legacy";
        const hash = hashSecret(secret);
        runtime.dbRow.value = {
            id: "key_legacy",
            workspace_id: "team_legacy",
            status: "active",
            hash,
        };

        const { authenticate } = await import("./auth");
        const result = await authenticate(
            buildRequest(`aistats_v1_sk_${kid}_${secret}`),
            { useKvCache: false },
        );

        expect(result).toMatchObject({
            ok: true,
            workspaceId: "team_legacy",
            apiKeyId: "key_legacy",
            apiKeyKid: kid,
        });
    });

    it("rejects legacy aistats-prefixed keys after the cutoff", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2027-01-01T00:00:00.000Z"));

        const kid = "KIDLEGACY002";
        const secret = "secret_legacy";
        runtime.dbRow.value = {
            id: "key_legacy",
            workspace_id: "team_legacy",
            status: "active",
            hash: hashSecret(secret),
        };

        const { authenticate } = await import("./auth");
        const result = await authenticate(
            buildRequest(`aistats_v1_sk_${kid}_${secret}`),
            { useKvCache: false },
        );

        expect(result).toEqual({
            ok: false,
            reason: "legacy_key_prefix_retired",
        });
        expect(runtime.maybeSingle).not.toHaveBeenCalled();
    });
});
