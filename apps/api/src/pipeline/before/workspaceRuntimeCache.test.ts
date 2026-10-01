import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceRuntimeCache } from "./workspaceRuntimeCache";
import { workspaceRuntimeSettingsSchema } from "./workspaceRuntimeSnapshot";

const workspace = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const fixture = (workspaceId = workspace) => ({
    version: 1, workspaceId, checkedAtMs: Date.now(), expiresAtMs: Date.now() + 60_000,
    configuredTier: null, billingMode: "wallet",
    settings: Object.fromEntries(Object.keys(workspaceRuntimeSettingsSchema.shape).map(key => [key, null])), byok: {},
});
function setup() {
    const data = new Map<string, string>();
    const get = vi.fn(async (key: string) => data.get(key) ?? null);
    const put = vi.fn(async (key: string, raw: string) => { data.set(key, raw); });
    const cache = new WorkspaceRuntimeCache(() => ({ get: async (key: string, type: string) => {
        expect(type).toBe("stream");
        const raw = await get(key);
        return raw === null ? null : new Response(raw).body;
    }, put }) as unknown as KVNamespace);
    return { cache, data, get, put };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000); });
afterEach(() => { vi.useRealTimers(); });

describe("shared workspace runtime cache", () => {
    it("uses one write per fill and zero KV operations on repeated warm reads", async () => {
        const { cache, get, put } = setup();
        expect(await cache.publish(fixture(), workspace, "v1")).toBe(true);
        for (let i = 0; i < 100; i++) expect(await cache.read(workspace, "v1")).toEqual(fixture());
        expect(get).not.toHaveBeenCalled();
        expect(put).toHaveBeenCalledTimes(1);
        expect(put.mock.calls[0]).toHaveLength(3);
        expect(cache.stats()).toMatchObject({ entries: 1, writes: 0, pending: 0 });
    });
    it("coalesces 32 L2 reads and returns independent nested values", async () => {
        const { cache, get } = setup();
        get.mockResolvedValue(JSON.stringify(fixture()));
        const values = await Promise.all(Array.from({ length: 32 }, () => cache.read(workspace, "v1")));
        expect(get).toHaveBeenCalledTimes(1);
        values[0]!.settings.routing_mode = "price";
        expect(values[1]!.settings.routing_mode).toBeNull();
    });
    it("never crosses workspace or generation boundaries", async () => {
        const { cache, get } = setup();
        await cache.publish(fixture(), workspace, "v1");
        expect(await cache.read(other, "v1")).toBeNull();
        expect(await cache.read(workspace, "v2")).toBeNull();
        get.mockResolvedValue(JSON.stringify(fixture(other)));
        expect(await cache.read(workspace, "v3")).toBeNull();
    });
    it("does no I/O for unknown versions or invalid key components", async () => {
        const { cache, get, put } = setup();
        for (const [ws, version] of [[workspace, null], [workspace, "v1:other"], ["../other", "v1"]]) {
            expect(await cache.read(ws!, version)).toBeNull();
            expect(await cache.publish(fixture(), ws!, version)).toBe(false);
        }
        expect(get).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled();
    });
    it("rechecks L2 at 30 seconds and rejects its stale data at source expiry", async () => {
        const { cache, get } = setup();
        const initial = fixture();
        get.mockResolvedValue(JSON.stringify(initial));
        await cache.read(workspace, "v1");
        vi.setSystemTime(initial.checkedAtMs + 29_999); await cache.read(workspace, "v1");
        expect(get).toHaveBeenCalledTimes(1);
        vi.setSystemTime(initial.checkedAtMs + 30_000); await cache.read(workspace, "v1");
        expect(get).toHaveBeenCalledTimes(2);
        vi.setSystemTime(initial.expiresAtMs);
        expect(await cache.read(workspace, "v1")).toBeNull();
        expect(cache.stats().entries).toBe(0);
    });
    it("keeps valid L1 usable during KV outage but does not invent cold data", async () => {
        const { cache, get, put } = setup();
        put.mockRejectedValue(new Error("KV unavailable"));
        await expect(cache.publish(fixture(), workspace, "v1")).rejects.toThrow("KV unavailable");
        get.mockRejectedValue(new Error("KV unavailable"));
        expect(await cache.read(workspace, "v1")).not.toBeNull();
        expect(await cache.read(other, "v1")).toBeNull();
        expect(cache.stats().writes).toBe(0);
    });
    it("does not negative-cache misses or malformed data", async () => {
        const { cache, get } = setup();
        await cache.read(workspace, "v1");
        get.mockResolvedValue("{"); await cache.read(workspace, "v1");
        get.mockResolvedValue(JSON.stringify(fixture()));
        expect(await cache.read(workspace, "v1")).not.toBeNull();
        expect(get).toHaveBeenCalledTimes(3);
    });
    it("bounds active reads and writes, including competing fills", async () => {
        const { cache, get, put } = setup();
        let finishRead!: (value: string | null) => void;
        get.mockReturnValue(new Promise(resolve => { finishRead = resolve; }));
        const reads = Array.from({ length: 32 }, (_, i) => cache.read(workspace, `v${i}`));
        expect(await cache.read(workspace, "v99")).toBeNull();
        expect(cache.stats().pending).toBe(32);
        finishRead(null); await Promise.all(reads);
        let finishWrite!: () => void;
        put.mockReturnValue(new Promise<void>(resolve => { finishWrite = resolve; }));
        const writes = Array.from({ length: 32 }, (_, i) => cache.publish(fixture(), workspace, `v${i}`));
        expect(await cache.publish(fixture(), workspace, "v99")).toBe(false);
        expect(await cache.publish(fixture(), workspace, "v0")).toBe(false);
        expect(cache.stats().writes).toBe(32);
        finishWrite(); await Promise.all(writes);
        expect(cache.stats()).toMatchObject({ pending: 0, writes: 0 });
    });
    it("does not deliver a delayed L2 fill after a newer local publication", async () => {
        const { cache, get } = setup();
        const old = fixture();
        let finish!: (raw: string) => void;
        get.mockReturnValue(new Promise(resolve => { finish = resolve; }));
        const pending = cache.read(workspace, "v1");
        await Promise.resolve();
        vi.setSystemTime(Date.now() + 1000);
        await cache.publish(fixture(), workspace, "v1");
        finish(JSON.stringify(old));
        expect(await pending).toBeNull();
        expect((await cache.read(workspace, "v1"))?.checkedAtMs).toBe(Date.now());
        expect(await cache.publish(old, workspace, "v1")).toBe(false);
    });
    it("bounds retained data and bypasses oversized valid snapshots without truncation", async () => {
        const { cache, put } = setup();
        const huge = fixture();
        Object.assign(huge.settings, { auto_routing_allowed_patterns: ["x".repeat(256 * 1024)] });
        expect(await cache.publish(huge, workspace, "v1")).toBe(false);
        expect(put).not.toHaveBeenCalled();
        for (let i = 0; i < 200; i++) await cache.publish(fixture(), workspace, `v${i}`);
        expect(cache.stats().entries).toBeLessThanOrEqual(128);
        expect(cache.stats().bytes).toBeLessThanOrEqual(4 * 1024 * 1024);
    });

    it("cancels an oversized KV transport without buffering the whole value", async () => {
        let pulled = 0, cancelled = false;
        const get = vi.fn(async () => new ReadableStream<Uint8Array>({
            pull(controller) { pulled++; controller.enqueue(new Uint8Array(64 * 1024)); },
            cancel() { cancelled = true; },
        }, {highWaterMark:0}));
        const cache = new WorkspaceRuntimeCache(() => ({get,put:vi.fn()}) as unknown as KVNamespace);
        expect(await cache.read(workspace,"v1")).toBeNull();
        expect(get).toHaveBeenCalledExactlyOnceWith(expect.any(String),"stream");
        expect(pulled).toBe(5);
        expect(cancelled).toBe(true);
        expect(cache.stats()).toMatchObject({entries:0,pending:0});
    });
});
