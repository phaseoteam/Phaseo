import { describe, expect, it, vi } from "vitest";
import { RequestOperations, withRequestOperations, countOperation, instrumentKv,
    countSupabaseOperation, markProviderDispatch, shouldSampleOperations, recordStreamObservation } from "./request-operations";
import { StreamSession, observeStreamOutcome } from "@/pipeline/after/stream-session";

describe("request operations", () => {
    it("attributes mixed bulk reads and failed writes without retaining keys or values", async () => {
        const source = { getWithMetadata: vi.fn(), put: vi.fn(() => { throw new Error("offline"); }), delete: vi.fn(), list: vi.fn() };
        const kv = instrumentKv(source as unknown as KVNamespace);
        const record = new RequestOperations();
        withRequestOperations(record, () => {
            void kv.getWithMetadata(["gateway:key:private", "gateway:keyver:private", "gateway:credit:private",
                "gateway:routing:sticky:private", "gw:health:private", "gateway:static:v5:private", "gateway:keynot:private"], "text");
            markProviderDispatch();
            expect(() => kv.put("gateway:routing:sticky:private", "secret")).toThrow("offline");
            void kv.delete("gateway:credit:private");
            void kv.list({ prefix: "gateway:key:private" });
        });
        const snapshot = record.snapshot();
        expect(snapshot.total).toEqual({ kvRead: 7, kvWrite: 1, kvDelete: 1, kvList: 1 });
        expect(snapshot.beforeDispatch).toEqual({ kvRead: 7 });
        expect(snapshot.kvByPurpose).toEqual({ auth: { kvRead: 2 }, credit: { kvRead: 1, kvDelete: 1 },
            sticky: { kvRead: 1, kvWrite: 1 }, health: { kvRead: 1 }, context: { kvRead: 1 }, other: { kvRead: 1, kvList: 1 } });
        snapshot.kvByPurpose.auth.kvRead = 999;
        expect(record.snapshot().kvByPurpose.auth.kvRead).toBe(2);
        expect(JSON.stringify(snapshot)).not.toMatch(/private|secret/);
        expect(new RequestOperations().snapshot().runtimeInstanceId).toBe(snapshot.runtimeInstanceId);
    });

    it("does not inspect keys or list options on unsampled calls", () => {
        const source = { get: vi.fn(), list: vi.fn() };
        const kv = instrumentKv(source as unknown as KVNamespace);
        const key = { toString() { throw new Error("must not coerce"); } };
        void kv.get(key as unknown as string);
        const options = Object.defineProperty({}, "prefix", { get() { throw new Error("must not inspect"); } });
        void kv.list(options);
        expect(source.get.mock.calls[0][0]).toBe(key);
        expect(source.list.mock.calls[0][0]).toBe(options);
    });

    it("isolates stream observations, strips extra fields and preserves the first terminal outcome", () => {
        const a = new RequestOperations(), b = new RequestOperations();
        const session = new StreamSession(() => 0);
        const observation = { ...observeStreamOutcome(session.finish(null, { aborted: false, sawFinalUsage: false })), secret: "private" };
        withRequestOperations(a, () => { recordStreamObservation(observation); recordStreamObservation({ ...observation, state: "FAILED" }); });
        observation.durationMs = 123;
        expect(a.snapshot()).toMatchObject({ stream: { state: "COMPLETED", durationMs: 0 } });
        expect(JSON.stringify(a.snapshot())).not.toContain("private");
        expect(b.snapshot()).not.toHaveProperty("stream");
    });
    it("isolates interleaved requests and preserves their async background context", async () => {
        const a = new RequestOperations(), b = new RequestOperations();
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const first = withRequestOperations(a, async () => {
            countOperation("kvRead", 3);
            await gate;
            markProviderDispatch();
            countOperation("kvWrite");
            const background = Promise.resolve().then(() => countOperation("healthRpc"));
            a.track(background);
            await a.drain();
        });
        await withRequestOperations(b, async () => { countOperation("supabaseRpc"); release(); });
        await first;
        expect(a.snapshot()).toMatchObject({ total: { kvRead: 3, kvWrite: 1, healthRpc: 1 }, beforeDispatch: { kvRead: 3 }, complete: true });
        expect(b.total).toEqual({ supabaseRpc: 1 });
    });

    it("counts bulk keys, preserves receiver and observes attempted failures", async () => {
        const source = { get: vi.fn(function (this: unknown) { expect(this).toBe(source); throw new Error("offline"); }), put: vi.fn() };
        const kv = instrumentKv(source as unknown as KVNamespace);
        expect(instrumentKv(source as unknown as KVNamespace)).toBe(kv);
        const record = new RequestOperations();
        withRequestOperations(record, () => {
            expect(() => kv.get(["secret-a", "secret-b"], "text")).toThrow("offline");
            void kv.put("private-key", "private-value");
        });
        expect(record.total).toEqual({ kvRead: 2, kvWrite: 1 });
        expect(JSON.stringify(record.snapshot())).not.toContain("secret");
    });

    it("does not mislabel POST RPC reads as database writes", () => {
        const record = new RequestOperations();
        withRequestOperations(record, () => {
            countSupabaseOperation("https://db.example/rest/v1/rpc/private?secret=x", { method: "POST" });
            countSupabaseOperation(new Request("https://db.example/rest/v1/keys"));
            countSupabaseOperation("https://db.example/rest/v1/keys", { method: "PATCH" });
        });
        expect(record.total).toEqual({ supabaseRpc: 1, supabaseRead: 1, supabaseMutation: 1 });
        expect(JSON.stringify(record.snapshot())).not.toContain("private");
    });

    it("bounds background tracking and explicitly reports incomplete totals", async () => {
        const record = new RequestOperations();
        for (let i = 0; i < 130; i++) record.track(new Promise(() => {}));
        expect(record.pending.size).toBe(128);
        expect(record.snapshot().complete).toBe(false);
    });

    it("fails closed for invalid sampling configuration", () => {
        for (const raw of [undefined, "", "NaN", "-1", "1.1", "Infinity"]) expect(shouldSampleOperations(raw, 0)).toBe(false);
        expect(shouldSampleOperations("1", 0.999)).toBe(true);
        expect(shouldSampleOperations("0.01", 0.1)).toBe(false);
    });
});
