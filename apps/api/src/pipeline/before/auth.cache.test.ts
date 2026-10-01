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
	oauth_resource?: string | null;
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
    it("coalesces a 32-request cold burst and performs no external work on the immediate warm path", async () => {
        const kid = "BURSTCACHE1", secret = "burst_secret";
        runtime.dbRow.value = { id: "burst-key", workspace_id: "workspace", status: "active", hash: hashSecret(secret) };
        const { authenticate } = await import("./auth");
        const request = buildRequest(`phaseo_v1_sk_${kid}_${secret}`);
        expect((await Promise.all(Array.from({ length: 32 }, () => authenticate(request)))).every(result => result.ok)).toBe(true);
        await flushBackground();
        expect(runtime.cache.get).toHaveBeenCalledTimes(2);
        expect(runtime.cache.put).toHaveBeenCalledTimes(1);
        expect(runtime.maybeSingle).toHaveBeenCalledTimes(1);
        expect(runtime.updateEq).toHaveBeenCalledTimes(1);
        expect((await authenticate(request)).ok).toBe(true); await flushBackground();
        expect(runtime.cache.get).toHaveBeenCalledTimes(2); expect(runtime.cache.put).toHaveBeenCalledTimes(1);
        expect(runtime.maybeSingle).toHaveBeenCalledTimes(1); expect(runtime.updateEq).toHaveBeenCalledTimes(1);
        expect([...runtime.store.values()].join()).not.toContain(secret);
    });

    it("does not extend an old KV row's source lease when copying it into a fresh isolate", async () => {
        vi.useFakeTimers(); const now = Date.now();
        const kid = "SOURCELEASE1", secret = "source_secret";
        const active = { id: "source-key", workspace_id: "workspace", status: "active", hash: hashSecret(secret) };
        runtime.store.set(`gateway:key:${kid}:v0`, JSON.stringify({ ...active, auth_source_at_ms: now - 59_000 }));
        runtime.dbRow.value = { ...active, status: "deleted" };
        const { authenticate } = await import("./auth"); const request = buildRequest(`phaseo_v1_sk_${kid}_${secret}`);
        expect((await authenticate(request)).ok).toBe(true); await flushBackground();
        vi.setSystemTime(now + 1001);
        expect(await authenticate(request)).toEqual({ ok: false, reason: "key_not_found_or_revoked" });
        expect(runtime.maybeSingle).toHaveBeenCalledTimes(1);
    });

    it.each(["legacy", "future", "expired"])("rejects %s serving metadata even when KV retains an active row", async kind => {
        const kid = "SOURCELEASE2", secret = "source_secret";
        const active = { id: "source-key", workspace_id: "workspace", status: "active", hash: hashSecret(secret) };
        const source = kind === "legacy" ? {} : { auth_source_at_ms: Date.now() + (kind === "future" ? 60_000 : -61_000) };
        runtime.store.set(`gateway:key:${kid}:v0`, JSON.stringify({ ...active, ...source }));
        runtime.dbRow.value = { ...active, status: "deleted" };
        const { authenticate } = await import("./auth");
        expect(await authenticate(buildRequest(`phaseo_v1_sk_${kid}_${secret}`))).toEqual({ ok: false, reason: "key_not_found_or_revoked" });
        expect(runtime.maybeSingle).toHaveBeenCalledTimes(1);
    });

    it("never grants a validated credential lease to a different supplied secret or a bypassed-cache request", async () => {
        const kid = "LEASESECRET1", secret = "correct_secret";
        runtime.dbRow.value = { id: "secret-key", workspace_id: "workspace", status: "active", hash: hashSecret(secret) };
        const { authenticate } = await import("./auth");
        expect((await authenticate(buildRequest(`phaseo_v1_sk_${kid}_${secret}`))).ok).toBe(true);
        expect(await authenticate(buildRequest(`phaseo_v1_sk_${kid}_wrong_secret`))).toEqual({ ok: false, reason: "invalid_secret" });
        runtime.dbRow.value = { ...runtime.dbRow.value, status: "deleted" };
        expect(await authenticate(buildRequest(`phaseo_v1_sk_${kid}_${secret}`), { useKvCache: false }))
            .toEqual({ ok: false, reason: "key_not_found_or_revoked" });
        await flushBackground();
    });

    it("invalidates validated decisions when the active pepper changes", async () => {
        const kid = "LEASEPEPPER1", secret = "pepper_secret";
        runtime.dbRow.value = { id: "pepper-key", workspace_id: "workspace", status: "active", hash: hashSecret(secret) };
        const { authenticate } = await import("./auth"); const request = buildRequest(`phaseo_v1_sk_${kid}_${secret}`);
        expect((await authenticate(request)).ok).toBe(true);
        runtime.bindings.KEY_PEPPER_ACTIVE = "a-new-active-pepper";
        expect(await authenticate(request)).toEqual({ ok: false, reason: "invalid_secret" });
        await flushBackground();
    });

    it("bounds a validated decision by key expiry and rejects malformed expiry", async () => {
        vi.useFakeTimers(); const now = Date.now();
        const kid = "LEASEEXPIRY1", secret = "expiry_secret";
        runtime.dbRow.value = { id: "expiry-key", workspace_id: "workspace", status: "active", hash: hashSecret(secret), expires_at: new Date(now + 1000).toISOString() };
        const { authenticate } = await import("./auth"); const request = buildRequest(`phaseo_v1_sk_${kid}_${secret}`);
        expect((await authenticate(request)).ok).toBe(true); await flushBackground();
        vi.setSystemTime(now + 1001);
        expect(await authenticate(request)).toEqual({ ok: false, reason: "key_expired" });
        runtime.dbRow.value.expires_at = "not-a-date";
        expect(await authenticate(request, { useKvCache: false })).toEqual({ ok: false, reason: "key_expired" });
    });

    it("does not admit a database result delayed beyond the source lease", async () => {
        vi.useFakeTimers(); const now = Date.now();
        runtime.maybeSingle.mockImplementationOnce(async () => {
            vi.setSystemTime(now + 60_001);
            return { data: { id: "delayed-key", workspace_id: "workspace", status: "active", hash: hashSecret("secret") }, error: null };
        });
        const { authenticate } = await import("./auth");
        expect(await authenticate(buildRequest("phaseo_v1_sk_DELAYEDSOURCE_secret"))).toEqual({ ok: false, reason: "db_error" });
        expect(runtime.cache.put).not.toHaveBeenCalled();
    });

    it("coalesces last-used timestamps but retries a failed write and writes again after its window", async () => {
        vi.useFakeTimers(); const now = Date.now();
        runtime.dbRow.value = { id: "touch-key", workspace_id: "workspace", status: "active", hash: hashSecret("secret") };
        runtime.updateEq.mockResolvedValueOnce({ error: { message: "unavailable" } } as any);
        const { authenticate } = await import("./auth"); const request = buildRequest("phaseo_v1_sk_LASTUSEDCACHE_secret");
        expect((await authenticate(request)).ok).toBe(true); await flushBackground();
        expect((await authenticate(request)).ok).toBe(true); await flushBackground();
        expect((await authenticate(request)).ok).toBe(true); await flushBackground();
        expect(runtime.updateEq).toHaveBeenCalledTimes(2);
        vi.setSystemTime(now + 60_001);
        expect((await authenticate(request)).ok).toBe(true); await flushBackground();
        expect(runtime.updateEq).toHaveBeenCalledTimes(3);
    });

    it("rechecks internal-request authorization on every validated-cache hit", async () => {
        const kid = "INTERNALLEASE", secret = "internal_secret";
        runtime.dbRow.value = { id: "internal-key", workspace_id: "workspace", status: "active", hash: hashSecret(secret) };
        (runtime.bindings as any).GATEWAY_INTERNAL_TEST_TOKEN = "x".repeat(128);
        try {
            const { authenticate } = await import("./auth"); const ordinary = buildRequest(`phaseo_v1_sk_${kid}_${secret}`);
            const trusted = new Request(ordinary, { headers: { authorization: ordinary.headers.get("authorization")!, "x-phaseo-internal-token": "x".repeat(128) } });
            expect(await authenticate(trusted)).toMatchObject({ ok: true, internal: true });
            expect(await authenticate(ordinary)).toMatchObject({ ok: true, internal: false });
            expect(await authenticate(trusted)).toMatchObject({ ok: true, internal: true });
            await flushBackground(); expect(runtime.maybeSingle).toHaveBeenCalledTimes(1);
        } finally { delete (runtime.bindings as any).GATEWAY_INTERNAL_TEST_TOKEN; }
    });

    // Regression tests cover local races; distributed KV timing is not simulated.
    it("observes a remote revocation marker after the five-second local marker cache", async () => {
        vi.useFakeTimers();
        const now = Date.now();
        const kid = "REVOCATION1", secret = "revocation_secret";
        runtime.dbRow.value = { id: "revoke1", workspace_id: "workspace", status: "active", hash: hashSecret(secret) };
        const { authenticate } = await import("./auth");
        const request = buildRequest(`phaseo_v1_sk_${kid}_${secret}`);
        expect((await authenticate(request)).ok).toBe(true);
        await flushBackground();
        runtime.dbRow.value = { ...runtime.dbRow.value, status: "deleted" };
        runtime.store.set(`gateway:keyver:kid:${kid}`, "123");
        expect((await authenticate(request)).ok).toBe(true);
        vi.setSystemTime(now + 5001);
        expect(await authenticate(request)).toEqual({ ok: false, reason: "key_not_found_or_revoked" });
        await flushBackground();
    });

    it("a refill after the committed deletion cannot cache an active row under the new marker", async () => {
        vi.useFakeTimers();
        const now = Date.now();
        const kid = "REVOCATION2", secret = "revocation_secret";
        runtime.dbRow.value = { id: "revoke2", workspace_id: "workspace", status: "active", hash: hashSecret(secret) };
        const { authenticate } = await import("./auth");
        const { setKeyVersion } = await import("@/core/kv");
        const request = buildRequest(`phaseo_v1_sk_${kid}_${secret}`);
        expect((await authenticate(request)).ok).toBe(true);
        await flushBackground();
        runtime.dbRow.value = { ...runtime.dbRow.value, status: "deleted" };
        await setKeyVersion("kid", kid, 123);
        vi.setSystemTime(now + 5001);
        expect((await authenticate(request)).ok).toBe(false);
        await flushBackground();
        expect(JSON.parse(runtime.store.get(`gateway:key:${kid}:v123`)!)).toMatchObject({ status: "deleted" });
    });

    it("pins a delayed pre-deletion database result to its original cache version", async () => {
        const kid = "REVOCATION3", secret = "revocation_secret";
        const active = { id: "revoke3", workspace_id: "workspace", status: "active", hash: hashSecret(secret) };
        runtime.dbRow.value = active;
        let release!: (value: { data: KeyRow; error: null }) => void;
        let started!: () => void;
        const reading = new Promise<void>(resolve => { started = resolve; });
        runtime.maybeSingle.mockImplementationOnce(() => { started(); return new Promise(resolve => { release = resolve; }); });
        const { authenticate } = await import("./auth");
        const { setKeyVersion } = await import("@/core/kv");
        const request = buildRequest(`phaseo_v1_sk_${kid}_${secret}`);
        const pending = authenticate(request);
        await reading;
        runtime.dbRow.value = { ...active, status: "deleted" };
        await setKeyVersion("kid", kid, 123);
        release({ data: active, error: null });
        expect((await pending).ok).toBe(true);
        await flushBackground();
        expect(runtime.store.has(`gateway:key:${kid}:v123`)).toBe(false);
        expect(JSON.parse(runtime.store.get(`gateway:key:${kid}:v0`)!)).toMatchObject({ status: "active" });
        expect((await authenticate(request)).ok).toBe(false);
        await flushBackground();
    });

    it("ignores a delayed old-version KV write once the new revocation marker is visible", async () => {
        const kid = "REVOCATION5", secret = "revocation_secret";
        runtime.dbRow.value = { id: "revoke5", workspace_id: "workspace", status: "active", hash: hashSecret(secret) };
        let finishWrite!: () => void;
        runtime.cache.put.mockImplementationOnce((key, value) => new Promise<void>(resolve => {
            finishWrite = () => { runtime.store.set(key, value); resolve(); };
        }));
        const { authenticate } = await import("./auth");
        const { setKeyVersion } = await import("@/core/kv");
        const request = buildRequest(`phaseo_v1_sk_${kid}_${secret}`);
        try {
            expect((await authenticate(request)).ok).toBe(true);
            runtime.dbRow.value = { ...runtime.dbRow.value, status: "deleted" };
            await setKeyVersion("kid", kid, 123);
            expect((await authenticate(request)).ok).toBe(false);
            finishWrite();
            await flushBackground();
            expect(JSON.parse(runtime.store.get(`gateway:key:${kid}:v0`)!)).toMatchObject({ status: "active" });
            expect((await authenticate(request)).ok).toBe(false);
        } finally {
            finishWrite?.();
            await flushBackground();
        }
    });

    it("does not resurrect an old v0 row when the version read fails after rejection", async () => {
        vi.useFakeTimers();
        const now = Date.now();
        const kid = "REVOCATION4", secret = "revocation_secret";
        runtime.dbRow.value = { id: "revoke4", workspace_id: "workspace", status: "active", hash: hashSecret(secret) };
        const { authenticate } = await import("./auth");
        const request = buildRequest(`phaseo_v1_sk_${kid}_${secret}`);
        expect((await authenticate(request)).ok).toBe(true);
        await flushBackground();
        runtime.dbRow.value = { ...runtime.dbRow.value, status: "deleted" };
        runtime.store.set(`gateway:keyver:kid:${kid}`, "123");
        vi.setSystemTime(now + 5001);
        expect((await authenticate(request)).ok).toBe(false);
        await flushBackground();
        vi.setSystemTime(now + 10002);
        runtime.cache.get.mockRejectedValueOnce(new Error("KV version read unavailable"));
        const writes = runtime.cache.put.mock.calls.length;
        expect((await authenticate(request)).ok).toBe(false);
        expect(runtime.cache.put).toHaveBeenCalledTimes(writes);
    });

    it("uses the database without filling caches when the version is unavailable", async () => {
        const kid = "REVOCATION6", secret = "revocation_secret";
        runtime.dbRow.value = { id: "revoke6", workspace_id: "workspace", status: "active", hash: hashSecret(secret) };
        runtime.cache.get.mockRejectedValueOnce(new Error("KV unavailable"));
        const { authenticate } = await import("./auth");
        expect((await authenticate(buildRequest(`phaseo_v1_sk_${kid}_${secret}`))).ok).toBe(true);
        await flushBackground();
        expect(runtime.maybeSingle).toHaveBeenCalledTimes(1);
        expect(runtime.cache.put).not.toHaveBeenCalled();
    });

    it("fails closed if neither the version nor the authoritative database can be read", async () => {
        runtime.cache.get.mockRejectedValueOnce(new Error("KV unavailable"));
        runtime.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "Database unavailable" } as never });
        const { authenticate } = await import("./auth");
        expect(await authenticate(buildRequest("phaseo_v1_sk_REVOCATION7_secret"))).toEqual({ ok: false, reason: "db_error" });
        expect(runtime.cache.put).not.toHaveBeenCalled();
    });

    it("pins a delayed pepper-migration cache fill to the original version", async () => {
        const kid = "REVOCATION8", secret = "revocation_secret";
        runtime.bindings.KEY_PEPPER_PREVIOUS = "previous-pepper";
        runtime.dbRow.value = { id: "revoke8", workspace_id: "workspace", status: "active",
            hash: createHmac("sha256", "previous-pepper").update(secret).digest("hex") };
        let finishUpdate!: () => void;
        runtime.updateEq.mockImplementationOnce(() => new Promise(resolve => {
            finishUpdate = () => resolve({ error: null });
        }));
        const { authenticate } = await import("./auth");
        const { setKeyVersion } = await import("@/core/kv");
        const request = buildRequest(`phaseo_v1_sk_${kid}_${secret}`);
        try {
            expect((await authenticate(request)).ok).toBe(true);
            runtime.dbRow.value = { ...runtime.dbRow.value, status: "deleted" };
            await setKeyVersion("kid", kid, 123);
            finishUpdate();
            await flushBackground();
            expect(runtime.store.has(`gateway:key:${kid}:v123`)).toBe(false);
            expect((await authenticate(request)).ok).toBe(false);
        } finally {
            finishUpdate?.();
            await flushBackground();
        }
    });

    it("reuses imported pepper keys while still verifying every supplied secret", async () => {
        const secret = "secret_crypto_cache";
        runtime.dbRow.value = { id: "crypto", workspace_id: "workspace", status: "active", hash: hashSecret(secret) };
        const spy = vi.spyOn(crypto.subtle, "importKey");
        try {
            const { authenticate } = await import("./auth");
            expect((await authenticate(buildRequest(`phaseo_v1_sk_CRYPTO_${secret}`))).ok).toBe(true);
            expect((await authenticate(buildRequest(`phaseo_v1_sk_CRYPTO_${secret}`))).ok).toBe(true);
            const imports = spy.mock.calls.length;
            expect((await authenticate(buildRequest("phaseo_v1_sk_CRYPTO_wrong"))).ok).toBe(false);
            expect(spy.mock.calls.length).toBe(imports);
            expect(imports).toBe(1);
        } finally { spy.mockRestore(); await flushBackground(); }
    });
    it("authenticates and warms L1 while the versioned KV write is pending", async () => {
        const kid = "KIDSLOWWRITE";
        const secret = "secret_slow_write";
        runtime.dbRow.value = { id: "key_slow", workspace_id: "team_slow", status: "active", hash: hashSecret(secret) };
        let finishWrite!: () => void;
        runtime.cache.put.mockImplementationOnce(async () => new Promise<void>((resolve) => { finishWrite = resolve; }));
        const { authenticate } = await import("./auth");
        try {
            const request = buildRequest(`phaseo_v1_sk_${kid}_${secret}`);
            const first = authenticate(request, { useKvCache: true });
            await expect(Promise.race([first, new Promise((resolve) => setTimeout(() => resolve("blocked"), 500))])).resolves.toMatchObject({ ok: true });
            expect(runtime.cache.put).toHaveBeenCalledWith(`gateway:key:${kid}:v0`, expect.any(String), expect.any(Object));
            await expect(authenticate(request, { useKvCache: true })).resolves.toMatchObject({ ok: true });
            expect(runtime.maybeSingle).toHaveBeenCalledTimes(1);
        } finally {
            finishWrite?.();
            await flushBackground();
        }
    });

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

	it("requires the opaque delegated access token for inference instead of a session JWT", async () => {
		const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoidTEiLCJ3b3Jrc3BhY2VfaWQiOiJ3MSIsImNsaWVudF9pZCI6ImMxIn0.sig";
		const { authenticate } = await import("./auth");
		await expect(authenticate(buildRequest(jwt))).resolves.toEqual({
			ok: false,
			reason: "oauth_delegated_key_required",
		});
		expect(runtime.supabase.from).not.toHaveBeenCalled();
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
        await runtime.cache.put(`gateway:key:${kid}:v7`, JSON.stringify({ ...row, auth_source_at_ms: Date.now() }));

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

	it("keeps non-API resource-bound OAuth keys off normal API routes", async () => {
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

	it("rejects Gateway API resource keys without gateway access consent", async () => {
		const kid = "KIDOAUTHAPIRES";
		const secret = "secret_oauth_api_resource";
		runtime.dbRow.value = {
			id: "key_oauth_api_resource",
			workspace_id: "team_oauth",
			status: "active",
			hash: hashSecret(secret),
			key_kind: "oauth_delegated",
			oauth_user_id: "user_oauth",
			oauth_client_id: "client_oauth",
			oauth_scopes: ["models:read"],
			oauth_resource: "https://api.phaseo.app/v1",
		};

		const { authenticateManagement } = await import("./auth");
		const result = await authenticateManagement(
			buildRequest(`phaseo_v1_sk_${kid}_${secret}`),
			{ useKvCache: false },
		);
		await flushBackground();

		expect(result).toEqual({ ok: false, reason: "oauth_gateway_scope_required" });
	});

	it("accepts Gateway API resource keys with gateway access consent", async () => {
		const kid = "KIDOAUTHAPIYES";
		const secret = "secret_oauth_api_resource_allowed";
		runtime.dbRow.value = {
			id: "key_oauth_api_resource_allowed",
			workspace_id: "team_oauth",
			status: "active",
			hash: hashSecret(secret),
			key_kind: "oauth_delegated",
			oauth_user_id: "user_oauth",
			oauth_client_id: "client_oauth",
			oauth_scopes: ["gateway:access", "models:read"],
			oauth_resource: "https://api.phaseo.app:443/v1/",
		};

		const { authenticateManagement } = await import("./auth");
		const result = await authenticateManagement(
			buildRequest(`phaseo_v1_sk_${kid}_${secret}`),
			{ useKvCache: false },
		);
		await flushBackground();

		expect(result).toMatchObject({
			ok: true,
			authMethod: "oauth",
			oauthScopes: ["gateway:access", "models:read"],
			scopes: ["gateway:access", "models:read"],
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
