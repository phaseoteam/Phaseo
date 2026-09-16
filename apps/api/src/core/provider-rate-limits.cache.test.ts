import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
    query: vi.fn(),
    get: vi.fn(), put: vi.fn(),
    admit: vi.fn(async () => ({ allowed: true, reason: null, retryAfterSeconds: null, reservation: null })),
}));
vi.mock("@/runtime/env", () => ({
    getCache: () => ({ get: runtime.get, put: runtime.put }),
    dispatchBackground: (promise: Promise<unknown>) => { void promise; },
    getSupabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: runtime.query }) }) }) }),
    getBindings: () => ({ PROVIDER_RATE_LIMITS: { getByName: () => ({ admit: runtime.admit }) } }),
}));

describe("provider configuration load coalescing", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks(); runtime.get.mockResolvedValue(null); runtime.put.mockResolvedValue(undefined);
        runtime.admit.mockResolvedValue({ allowed: true, reason: null, retryAfterSeconds: null, reservation: null }); });

    it("shares cold configuration reads but admits every request separately", async () => {
        let resolve!: (value: unknown) => void;
        runtime.query.mockReturnValue(new Promise((done) => { resolve = done; }));
        const { admitManagedProvider } = await import("./provider-rate-limits");
        const requests = Array.from({ length: 20 }, () => admitManagedProvider("poolside", 32));
        await vi.waitFor(() => expect(runtime.query).toHaveBeenCalledTimes(1));
        resolve({ data: { provider_id: "poolside", enabled: true, requests_per_minute: 100 }, error: null });
        await Promise.all(requests);
        expect(runtime.admit).toHaveBeenCalledTimes(20);
        await admitManagedProvider("poolside", 32);
        expect(runtime.query).toHaveBeenCalledTimes(1);
    });

    it("retries configuration after a shared failed read", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
        runtime.query.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } })
            .mockResolvedValueOnce({ data: null, error: null });
        const { admitManagedProvider } = await import("./provider-rate-limits");
        try {
            await Promise.all([admitManagedProvider("poolside", 32), admitManagedProvider("poolside", 32)]);
            expect(runtime.query).toHaveBeenCalledTimes(1);
            await admitManagedProvider("poolside", 32);
            expect(runtime.query).toHaveBeenCalledTimes(2);
            expect(runtime.admit).not.toHaveBeenCalled();
        } finally { log.mockRestore(); }
    });

    it("shares a negative result across isolates without another database lookup", async () => {
        runtime.query.mockResolvedValue({ data: null, error: null });
        await (await import("./provider-rate-limits")).admitManagedProvider("openai", 32);
        const snapshot = JSON.parse(runtime.put.mock.calls[0][1]);
        vi.resetModules(); runtime.get.mockResolvedValue(snapshot);
        await (await import("./provider-rate-limits")).admitManagedProvider("openai", 32);
        expect(runtime.query).toHaveBeenCalledTimes(1);
        expect(runtime.put).toHaveBeenCalledTimes(1);
        expect(runtime.admit).not.toHaveBeenCalled();
    });

    it("still coordinates every admission when the configuration comes from KV", async () => {
        runtime.get.mockResolvedValue({ version: 1, providerId: "openai", checkedAt: Date.now(),
            row: { provider_id: "openai", enabled: true, requests_per_minute: 100 } });
        const { admitManagedProvider } = await import("./provider-rate-limits");
        await Promise.all(Array.from({ length: 20 }, () => admitManagedProvider("openai", 32)));
        expect(runtime.query).not.toHaveBeenCalled();
        expect(runtime.admit).toHaveBeenCalledTimes(20);
        expect(new Set(runtime.admit.mock.calls.map((call: unknown[]) => call[2])).size).toBe(20);
    });

    it("preserves coordinator denials from a shared configuration", async () => {
        runtime.get.mockResolvedValue({ version: 1, providerId: "openai", checkedAt: Date.now(),
            row: { provider_id: "openai", enabled: true, requests_per_minute: 1 } });
        const denial = { allowed: false, reason: "requests_per_minute", retryAfterSeconds: 12, reservation: null };
        runtime.admit.mockResolvedValueOnce(denial as any);
        const result = await (await import("./provider-rate-limits")).admitManagedProvider("openai", 32);
        expect(result).toEqual(denial);
        expect(runtime.query).not.toHaveBeenCalled();
    });

    it.each([
        { version: 1, providerId: "openai", checkedAt: 0, row: null },
        { version: 1, providerId: "another", checkedAt: Date.now(), row: null },
        { version: 1, providerId: "openai", checkedAt: Date.now() + 600_000, row: null },
        { version: 1, providerId: "openai", checkedAt: Date.now(), row: {} },
    ])("ignores expired, mismatched or malformed snapshots: %j", async snapshot => {
        runtime.get.mockResolvedValue(snapshot);
        runtime.query.mockResolvedValue({ data: { provider_id: "openai", enabled: true, requests_per_minute: 10 }, error: null });
        await (await import("./provider-rate-limits")).admitManagedProvider("openai", 32);
        expect(runtime.query).toHaveBeenCalledTimes(1);
        expect(runtime.admit).toHaveBeenCalledTimes(1);
    });

    it("does not extend a cached snapshot's absolute deadline on a new isolate", async () => {
        const now = Date.now(); const clock = vi.spyOn(Date, "now").mockReturnValue(now);
        runtime.get.mockResolvedValue({ version: 1, providerId: "openai", checkedAt: now - 59_999, row: null });
        runtime.query.mockResolvedValue({ data: { provider_id: "openai", enabled: true, requests_per_minute: 10 }, error: null });
        try {
            const { admitManagedProvider } = await import("./provider-rate-limits");
            await admitManagedProvider("openai", 32);
            expect(runtime.query).not.toHaveBeenCalled();
            clock.mockReturnValue(now + 1);
            await admitManagedProvider("openai", 32);
            expect(runtime.query).toHaveBeenCalledTimes(1);
            expect(runtime.admit).toHaveBeenCalledTimes(1);
        } finally { clock.mockRestore(); }
    });

    it("uses authoritative configuration when KV is unavailable", async () => {
        runtime.get.mockRejectedValue(new Error("KV unavailable"));
        runtime.put.mockRejectedValue(new Error("KV unavailable"));
        runtime.query.mockResolvedValue({ data: { provider_id: "openai", enabled: true, requests_per_minute: 10 }, error: null });
        await (await import("./provider-rate-limits")).admitManagedProvider("openai", 32);
        expect(runtime.query).toHaveBeenCalledTimes(1);
        expect(runtime.admit).toHaveBeenCalledTimes(1);
    });

    it("does not wait for configuration persistence before returning admission", async () => {
        let release!: () => void;
        const write = new Promise<void>(resolve => { release = resolve; });
        runtime.put.mockReturnValue(write);
        runtime.query.mockResolvedValue({ data: null, error: null });
        try {
            const result = await (await import("./provider-rate-limits")).admitManagedProvider("openai", 32);
            expect(result.allowed).toBe(true);
            expect(runtime.put).toHaveBeenCalledTimes(1);
        } finally { release(); }
    });
});
