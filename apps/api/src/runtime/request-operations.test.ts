import { describe, expect, it, vi } from "vitest";
import { RequestOperations, withRequestOperations, countOperation, instrumentKv,
    countSupabaseOperation, markProviderDispatch, shouldSampleOperations } from "./request-operations";

describe("request operations", () => {
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
