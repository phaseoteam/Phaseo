import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
    query: vi.fn(),
    admit: vi.fn(async () => ({ allowed: true, reason: null, retryAfterSeconds: null, reservation: null })),
}));
vi.mock("@/runtime/env", () => ({
    getSupabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: runtime.query }) }) }) }),
    getBindings: () => ({ PROVIDER_RATE_LIMITS: { getByName: () => ({ admit: runtime.admit }) } }),
}));

describe("provider configuration load coalescing", () => {
    beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

    it("shares cold configuration reads but admits every request separately", async () => {
        let resolve!: (value: unknown) => void;
        runtime.query.mockReturnValue(new Promise((done) => { resolve = done; }));
        const { admitManagedProvider } = await import("./provider-rate-limits");
        const requests = Array.from({ length: 20 }, () => admitManagedProvider("poolside", 32));
        expect(runtime.query).toHaveBeenCalledTimes(1);
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
});
