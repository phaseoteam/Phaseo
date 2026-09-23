import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyHealth, reduceHealth, type HealthObservation, type HealthSnapshot } from "./health-evidence";
import { healthBatcher } from "./health-batcher";
const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), observe: vi.fn(), cache: vi.fn(), tasks: [] as Promise<unknown>[] }));
vi.mock("@/runtime/env", () => ({
    getBindings: () => ({ ROUTING_HEALTH: { idFromName: (name: string) => name,
        get: () => ({ getSnapshot: mocks.snapshot, observeBatch: async (events: HealthObservation[]) => Promise.all(events.map(event => mocks.observe(event))) }) } }),
    getCache: mocks.cache,
    dispatchBackground: (task: Promise<unknown>) => mocks.tasks.push(task),
}));
import { coordinatedHealthMany, coordinatedHealthRead, reportCoordinatedHealth, resetCoordinatedHealthForTests } from "./health-coordinator";
const now = 1_800_000_000_000;
const snapshot = (generation = "a", version = 10): HealthSnapshot => ({ generation, version, publishedAt: Date.now(),
    providers: { p: { ...emptyHealth("responses", "m", "p"), lat_ewma_60s: version, last_updated: Date.now() } } });
async function drain() { await healthBatcher.flushQueued(); while (mocks.tasks.length) await Promise.all(mocks.tasks.splice(0)); }
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
    resetCoordinatedHealthForTests(); mocks.snapshot.mockReset(); mocks.observe.mockReset(); mocks.cache.mockClear();
    mocks.snapshot.mockResolvedValue(snapshot());
});
afterEach(async () => { await drain(); vi.useRealTimers(); });

describe("Memory-first coordinator snapshots", () => {
    it("returns immediately during refresh, then serves warm reads without KV or extra RPCs", async () => {
        let resolve!: (value: HealthSnapshot) => void;
        mocks.snapshot.mockReturnValue(new Promise(r => { resolve = r; }));
        expect(coordinatedHealthMany("responses", "m", ["p"]).p.last_updated).toBe(0);
        await Promise.resolve();
        resolve(snapshot()); await drain();
        for (let n = 0; n < 100; n++) expect(coordinatedHealthMany("responses", "m", ["p"]).p.lat_ewma_60s).toBe(10);
        expect(mocks.snapshot).toHaveBeenCalledTimes(1); expect(mocks.cache).not.toHaveBeenCalled();
    });
    it("accepts lower revisions after restart and never renews expired evidence", async () => {
        await coordinatedHealthRead("responses", "m", ["p"]);
        vi.setSystemTime(now + 31_000); mocks.snapshot.mockResolvedValue(snapshot("b", 2));
        expect((await coordinatedHealthRead("responses", "m", ["p"])).p.lat_ewma_60s).toBe(2);
        vi.setSystemTime(now + 16 * 60_000);
        mocks.snapshot.mockResolvedValue({ ...snapshot("b", 2), publishedAt: now });
        expect((await coordinatedHealthRead("responses", "m", ["p"])).p.last_updated).toBe(0);
    });
    it("does not let a snapshot from another generation erase recent local failure evidence", async () => {
        const event: HealthObservation = { id: "failure", endpoint: "responses", model: "m", provider: "p",
            observedAt: now, startedAt: now - 20, ok: false, limited: false, probe: false, latencyMs: 20, tps: null };
        mocks.snapshot.mockResolvedValue(snapshot("a", 0));
        mocks.observe.mockResolvedValue({ health: reduceHealth(undefined, event), generation: "a", version: 1 });
        reportCoordinatedHealth(event); await drain();
        vi.setSystemTime(now + 31_000); mocks.snapshot.mockResolvedValue(snapshot("b", 100));
        expect((await coordinatedHealthRead("responses", "m", ["p"])).p.err_ewma_60s).toBe(1);
    });
    it("bounds simultaneous refreshes even when pools are evicted", async () => {
        const resolvers: Array<(value: HealthSnapshot) => void> = [];
        mocks.snapshot.mockImplementation(() => new Promise(resolve => { resolvers.push(resolve); }));
        for (let n = 0; n < 500; n++) coordinatedHealthMany("responses", `model-${n}`, ["p"]);
        await Promise.resolve(); expect(mocks.snapshot).toHaveBeenCalledTimes(32);
        for (const resolve of resolvers) resolve(snapshot());
    });
    it("recovers from synchronous RPC errors without retaining a completed inflight promise", async () => {
        mocks.snapshot.mockImplementationOnce(() => { throw new Error("unavailable"); });
        await coordinatedHealthRead("responses", "m", ["p"]);
        vi.setSystemTime(now + 6000);
        expect((await coordinatedHealthRead("responses", "m", ["p"])).p.lat_ewma_60s).toBe(10);
        expect(mocks.snapshot).toHaveBeenCalledTimes(2);
    });
    it("does not expose shared mutable health values", async () => {
        const values = await coordinatedHealthRead("responses", "m", ["p"]);
        values.p.lat_ewma_60s = -99;
        expect(coordinatedHealthMany("responses", "m", ["p"]).p.lat_ewma_60s).toBe(10);
    });
});
