import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AsyncLocalStorage } from "node:async_hooks";
import { HealthBatcher } from "./health-batcher";
import { emptyHealth, type HealthObservation, type HealthReceipt } from "./health-evidence";
const event = (id: number): HealthObservation => ({ id: String(id), endpoint: "responses", model: "m", provider: "p",
    observedAt: 100, startedAt: 0, ok: true, limited: false, latencyMs: 100, tps: 10, probe: false });
const receipt = (): HealthReceipt => ({ health: emptyHealth("responses", "m", "p"), version: 1 });
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });
describe("Health micro-batching", () => {
    it("seals full batches before the owner resumes without deleting the next batch", async () => {
        const batcher = new HealthBatcher();
        const send = vi.fn(async (events: HealthObservation[]) => events.map(() => receipt()));
        const work = Array.from({ length: 65 }, (_, n) => batcher.enqueue("pool", event(n), send));
        expect(batcher.stats()).toMatchObject({ active: 3, queued: 1 });
        await Promise.all(work.slice(0, 64));
        expect(send.mock.calls.map(([events]) => events.length)).toEqual([32, 32]);
        expect(batcher.stats()).toMatchObject({ active: 1, queued: 1 });
        await batcher.flushQueued();
        await Promise.all(work);
        expect(send.mock.calls.map(([events]) => events.length)).toEqual([32, 32, 1]);
        expect(batcher.stats()).toMatchObject({ active: 0, queued: 0, observations: 65, batches: 3 });
        expect(vi.getTimerCount()).toBe(0);
    });
    it("bounds full batches waiting for their owner to resume", async () => {
        const batcher = new HealthBatcher();
        const send = vi.fn(async (events: HealthObservation[]) => events.map(() => receipt()));
        const work = Array.from({ length: 1024 }, (_, n) => batcher.enqueue("pool", event(n), send));
        const overflow = batcher.enqueue("pool", event(1024), send);
        expect(batcher.stats()).toMatchObject({ active: 32, queued: 0, dropped: 1 });
        expect(await overflow).toBeUndefined();
        expect((await Promise.all(work)).every(Boolean)).toBe(true);
        expect(send).toHaveBeenCalledTimes(32);
        expect(batcher.stats()).toMatchObject({ active: 0, queued: 0 });
        expect(vi.getTimerCount()).toBe(0);
    });
    it.each(["full", "explicit"])("keeps %s delivery in the batch owner's async context", async mode => {
        const scope = new AsyncLocalStorage<string>(), batcher = new HealthBatcher();
        const owners: Array<string | undefined> = [];
        const send = async (events: HealthObservation[]) => {
            owners.push(scope.getStore());
            return events.map(() => receipt());
        };
        const work = [scope.run("owner", () => batcher.enqueue("pool", event(0), send))];
        if (mode === "full") {
            for (let n = 1; n < 32; n++) work.push(scope.run(`caller-${n}`, () => batcher.enqueue("pool", event(n), send)));
        } else await scope.run("flusher", () => batcher.flushQueued());
        expect((await Promise.all(work)).every(Boolean)).toBe(true);
        expect(owners).toEqual(["owner"]);
        expect(batcher.stats()).toMatchObject({ active: 0, queued: 0, batches: 1 });
        expect(vi.getTimerCount()).toBe(0);
    });
    it("coalesces 32 reports into one delivery and resolves every caller", async () => {
        const batcher = new HealthBatcher();
        const send = vi.fn(async events => events.map(() => receipt()));
        const work = Array.from({ length: 32 }, (_, n) => batcher.enqueue("pool", event(n), send));
        await Promise.resolve();
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0]).toHaveLength(32);
        expect((await Promise.all(work)).every(Boolean)).toBe(true);
        expect(batcher.stats()).toMatchObject({ active: 0, queued: 0, batches: 1 });
        expect(vi.getTimerCount()).toBe(0);
    });
    it("flushes sparse traffic after one second and never mixes pools", async () => {
        const batcher = new HealthBatcher(), send = vi.fn(async events => events.map(() => receipt()));
        const a = batcher.enqueue("a", event(1), send), b = batcher.enqueue("b", event(2), send);
        await vi.advanceTimersByTimeAsync(999); expect(send).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1); await Promise.all([a, b]);
        expect(send).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
    });
    it("includes outstanding RPCs in the capacity bound and releases it after failure", async () => {
        const batcher = new HealthBatcher();
        const rejecters: Array<(reason: Error) => void> = [];
        const send = () => new Promise<Array<HealthReceipt | null>>((_, reject) => { rejecters.push(reject); });
        const work = Array.from({ length: 32 }, (_, n) => batcher.enqueue(String(n), event(n), send));
        await vi.advanceTimersByTimeAsync(1000);
        expect(await batcher.enqueue("overflow", event(33), send)).toBeUndefined();
        expect(batcher.stats()).toMatchObject({ active: 32, queued: 0, dropped: 1 });
        for (const reject of rejecters) reject(new Error("unavailable"));
        expect((await Promise.all(work)).every(value => value === undefined)).toBe(true);
        expect(batcher.stats()).toMatchObject({ active: 0, failed: 32 });
    });
    it("does not retry partial receipt arrays or retain mutable caller events", async () => {
        const batcher = new HealthBatcher(), send = vi.fn(async () => []);
        const source = event(1), work = batcher.enqueue("pool", source, send);
        source.id = "changed";
        await batcher.flushQueued(); expect(await work).toBeUndefined();
        expect((send.mock.calls as unknown as Array<[HealthObservation[]]>)[0][0][0].id).toBe("1");
        expect(batcher.stats().failed).toBe(1);
    });
});
