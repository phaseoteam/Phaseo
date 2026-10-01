import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
    store: new Map<string, string>(), rows: [] as any[], error: null as any, count: null as number | null,
    reads: vi.fn(), writes: vi.fn(), exact: vi.fn(), background: [] as Promise<unknown>[],
    readGate: null as Promise<void> | null, writeGate: null as Promise<void> | null,
    deleteError: false, kvReads: vi.fn(),
}));
vi.mock("@/runtime/env", () => ({
    dispatchBackground: (p: Promise<unknown>) => state.background.push(p),
    getCache: () => ({
        get: async (k: string) => { state.kvReads(k); await state.readGate; return state.store.get(k) ?? null; },
        put: async (k: string, v: string) => { state.writes(k, v); await state.writeGate; state.store.set(k, v); },
        delete: async (k: string) => { if (state.deleteError) throw new Error("delete failed"); state.store.delete(k); },
    }),
    getSupabaseAdmin: () => ({ from: () => {
        const q: any = { select: () => q, eq: () => q,
            limit: async () => { state.reads(); return { data: structuredClone(state.rows), error: state.error, count: state.count ?? state.rows.length }; },
            maybeSingle: async () => { state.exact(); return { data: structuredClone(state.rows[0] ?? null), error: state.error }; },
        }; return q;
    } }),
}));
const args = { workspaceId: "a", model: "public/model" };
const row = () => ({ id: "private-1", workspace_id: "a", model_id: "public/model", enc_value: "ciphertext", enc_iv: "iv", enc_tag: "tag", upstream_model_id: "old" });
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(100_000); state.store.clear(); state.rows = []; state.error = null; state.count = null; state.reads.mockClear(); state.exact.mockClear(); state.writes.mockClear(); state.background = []; state.readGate = null; state.writeGate = null; state.deleteError = false; state.kvReads.mockClear(); });
afterEach(async () => { await Promise.all(state.background); vi.useRealTimers(); });

describe("workspace private route cache", () => {
    it("bounds outstanding refills across distinct workspaces without falling through to SQL", async () => {
        let release!: () => void;
        state.readGate = new Promise<void>(resolve => { release = resolve; });
        const c = await import("./privateModelCache");
        const pending = Array.from({ length: 32 }, (_, i) => c.loadPrivateRouteRow({ ...args, workspaceId: `ws-${i}` }));
        try {
            await expect(c.loadPrivateRouteRow({ ...args, workspaceId: "overflow" })).rejects.toThrow("Cache refill capacity exceeded");
            expect(c.privateRouteCacheStats().pending).toBe(32);
            expect(state.exact).not.toHaveBeenCalled();
        } finally { release(); }
        await Promise.all(pending);
        expect(c.privateRouteCacheStats().pending).toBe(0);
    });
    it("does not let invalidation reset the outstanding refill limit", async () => {
        let release!: () => void;
        state.readGate = new Promise<void>(resolve => { release = resolve; });
        const c = await import("./privateModelCache");
        const pending = Array.from({ length: 32 }, (_, i) => c.loadPrivateRouteRow({ ...args, workspaceId: `ws-${i}` }));
        await c.invalidatePrivateRoutes("ws-0");
        try {
            await expect(c.loadPrivateRouteRow({ ...args, workspaceId: "ws-0" })).rejects.toThrow("Cache refill capacity exceeded");
            expect(c.privateRouteCacheStats().pending).toBe(32);
        } finally { release(); }
        await Promise.all(pending);
    });
    it("waits for an already-started fill before deleting, so a late put cannot resurrect it", async () => {
        let release!: () => void;
        state.rows = [row()]; state.writeGate = new Promise<void>(resolve => { release = resolve; });
        const c = await import("./privateModelCache");
        await c.loadPrivateRouteRow(args);
        expect(state.writes).toHaveBeenCalledOnce();
        let invalidated = false;
        const invalidation = c.invalidatePrivateRoutes("a").then(() => { invalidated = true; });
        await Promise.resolve();
        expect(invalidated).toBe(false);
        state.rows = [];
        expect(await c.loadPrivateRouteRow(args)).toBeNull();
        release(); await invalidation;
        expect(state.store.has(c.privateRouteCacheKey("a"))).toBe(false);
        expect(await c.loadPrivateRouteRow(args)).toBeNull();
    });
    it("uses authoritative reads after a failed delete instead of reloading stale KV", async () => {
        state.rows = [row()];
        const c = await import("./privateModelCache");
        await c.loadPrivateRouteRow(args); await Promise.all(state.background);
        state.rows = []; state.deleteError = true;
        await expect(c.invalidatePrivateRoutes("a", { requirePublication: true })).rejects.toThrow("private_route_cache_invalidation_failed");
        state.kvReads.mockClear();
        expect(await c.loadPrivateRouteRow(args)).toBeNull();
        expect(state.kvReads).not.toHaveBeenCalled();
        expect(state.exact).toHaveBeenCalledOnce();
        state.error = {};
        await expect(c.loadPrivateRouteRow(args)).rejects.toThrow("private_model_lookup_unavailable");
    });
    it("caps retained serialized data by bytes, not only workspace count", async () => {
        const c = await import("./privateModelCache");
        for (let i = 0; i < 80; i++) {
            const workspaceId = `ws-${i}`;
            state.store.set(c.privateRouteCacheKey(workspaceId), JSON.stringify({ version: 1, workspaceId, checkedAt: Date.now(), rows: [{ ...row(), workspace_id: workspaceId, enc_value: "x".repeat(60_000) }] }));
            await c.loadPrivateRouteRow({ ...args, workspaceId });
        }
        expect(c.privateRouteCacheStats().bytes).toBeLessThanOrEqual(4 * 1024 * 1024);
        expect(c.privateRouteCacheStats().entries).toBeLessThan(80);
        expect(c.privateRouteCacheStats().evictions).toBeGreaterThan(0);
    });
    it("coalesces misses and shares complete absence across keys and models", async () => {
        const { loadPrivateRouteRow } = await import("./privateModelCache");
        expect(await Promise.all(Array.from({ length: 20 }, () => loadPrivateRouteRow(args)))).toEqual(Array(20).fill(null));
        await vi.advanceTimersByTimeAsync(6_000);
        expect(await loadPrivateRouteRow({ ...args, model: "another/public" })).toBeNull();
        expect(state.reads).toHaveBeenCalledTimes(1);
        expect(state.exact).not.toHaveBeenCalled();
        expect(state.writes).toHaveBeenCalledTimes(1);
    });
    it("uses KV on a different isolate without another database lookup", async () => {
        await (await import("./privateModelCache")).loadPrivateRouteRow(args);
        await Promise.all(state.background); vi.resetModules();
        expect(await (await import("./privateModelCache")).loadPrivateRouteRow(args)).toBeNull();
        expect(state.reads).toHaveBeenCalledTimes(1);
    });
    it("returns isolated copies of encrypted rows; invalidation refreshes rotation and deletion", async () => {
        state.rows = [row()];
        const c = await import("./privateModelCache");
        const first = await c.loadPrivateRouteRow(args); first!.upstream_model_id = "mutated";
        expect((await c.loadPrivateRouteRow(args))!.upstream_model_id).toBe("old");
        state.rows[0].upstream_model_id = "rotated";
        await c.invalidatePrivateRoutes("a");
        expect((await c.loadPrivateRouteRow(args))!.upstream_model_id).toBe("rotated");
        state.rows = []; await c.invalidatePrivateRoutes("a");
        expect(await c.loadPrivateRouteRow(args)).toBeNull();
    });
    it("does not renew an old KV snapshot and fails closed after expiry", async () => {
        state.rows = [row()]; const c = await import("./privateModelCache");
        await c.loadPrivateRouteRow(args); await Promise.all(state.background);
        state.error = { message: "database unavailable" };
        await vi.advanceTimersByTimeAsync(60_001);
        await expect(c.loadPrivateRouteRow(args)).rejects.toThrow("private_model_lookup_unavailable");
        expect(state.reads).toHaveBeenCalledTimes(2);
        state.error = null; state.rows = [];
        expect(await c.loadPrivateRouteRow(args)).toBeNull();
    });
    it("never accepts another workspace's cached record", async () => {
        const c = await import("./privateModelCache");
        state.store.set(c.privateRouteCacheKey("b"), JSON.stringify({ version: 1, workspaceId: "a", checkedAt: Date.now(), rows: [row()] }));
        expect(await c.loadPrivateRouteRow({ ...args, workspaceId: "b" })).toBeNull();
        expect(state.reads).toHaveBeenCalledTimes(1);
    });
    it("never treats partial listings as absence or persists them", async () => {
        state.count = 2;
        const c = await import("./privateModelCache");
        expect(await c.loadPrivateRouteRow(args)).toBeNull();
        expect(state.exact).toHaveBeenCalledTimes(1);
        expect(state.writes).not.toHaveBeenCalled();
    });
    it("invalidating a pending cache load cannot return the pre-edit snapshot", async () => {
        state.rows = [row()]; const c = await import("./privateModelCache");
        const pending = c.loadPrivateRouteRow(args);
        await c.invalidatePrivateRoutes("a"); state.rows = [];
        expect(await pending).toBeNull();
    });
    it("honors explicit bypass and does not cache errors", async () => {
        const c = await import("./privateModelCache"); state.error = {};
        await expect(c.loadPrivateRouteRow(args)).rejects.toThrow();
        state.error = null; state.rows = [row()];
        expect(await c.loadPrivateRouteRow({ ...args, disableCache: true })).toMatchObject(row());
        expect(state.writes).not.toHaveBeenCalled();
    });
});
