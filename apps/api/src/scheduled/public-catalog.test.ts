import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rpc: vi.fn(), get: vi.fn(), put: vi.fn() }));
vi.mock("@/runtime/env", () => ({
    getSupabaseAdmin: () => ({ rpc: state.rpc }),
    getCache: () => ({ get: state.get, put: state.put }),
    getBindingsIfConfigured: () => ({}),
    dispatchBackground: vi.fn(),
}));

const target = { model: "lab/model", endpoint: "responses" };
function catalog(model = target.model) {
    return { version: 1, model, resolvedModel: model, endpoints: ["text.generate", "responses"],
        checkedAt: Date.now(), expiresAt: Date.now() + 300_000,
        variants: ["text.generate", "responses"].map(endpoint => ({ endpoint, pricing: {},
            providers: [{ provider_id: "test", api_model_id: model, byok_meta: [] }],
        })), providerRows: [], routeModes: [],
    };
}
beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-16T12:00:00Z"));
    state.get.mockReset(); state.put.mockReset().mockResolvedValue(undefined);
    state.rpc.mockReset().mockImplementation((_name, params) => ({ abortSignal: () =>
        Promise.resolve({ data: catalog(params.p_model), error: null }),
    }));
});
afterEach(() => vi.useRealTimers());

describe("public catalog publisher", () => {
    it("deduplicates targets and publishes usable snapshots before any account request", async () => {
        const { publishConfiguredPublicCatalog } = await import("./public-catalog");
        expect(await publishConfiguredPublicCatalog(JSON.stringify([target, target]))).toEqual({ targets: 1, published: 1, skipped: 0, failed: 0 });
        expect(state.rpc).toHaveBeenCalledTimes(1);
        expect(state.rpc.mock.calls[0]).toEqual(["gateway_fetch_public_catalog", { p_model: "lab/model", p_endpoints: ["text.generate", "responses"] }]);
        expect(state.put.mock.calls[0][2]).toEqual({ expirationTtl: 300 });
    });

    it.each([
        "invalid json", JSON.stringify([{ ...target, model: "@private" }]),
        JSON.stringify([{ ...target, endpoint: "unknown" }]),
        JSON.stringify(Array.from({ length: 21 }, (_, i) => ({ ...target, model: `lab/${i}` }))),
    ])("rejects invalid or oversized configuration before I/O: %s", async raw => {
        const { publishConfiguredPublicCatalog } = await import("./public-catalog");
        await expect(publishConfiguredPublicCatalog(raw)).rejects.toThrow();
        expect(state.rpc).not.toHaveBeenCalled(); expect(state.put).not.toHaveBeenCalled();
    });

    it("rejects private payloads, model mismatches, hidden results and expired prices", async () => {
        const values = [catalog(), catalog("wrong/model"), catalog(), catalog()];
        values[0].variants[0].providers[0].byok_meta = [{ key: "secret" }] as never[];
        values[2].variants.forEach(variant => { variant.providers = []; });
        values[3].expiresAt = Date.now();
        state.rpc.mockImplementation(() => ({ abortSignal: () => Promise.resolve({ data: values.shift(), error: null }) }));
        const { publishConfiguredPublicCatalog } = await import("./public-catalog");
        for (let i = 0; i < 4; i++) expect((await publishConfiguredPublicCatalog(JSON.stringify([target]))).skipped).toBe(1);
        expect(state.put).not.toHaveBeenCalled();
    });

    it("waits for persistence and reports KV failure without discarding other targets", async () => {
        state.put.mockRejectedValueOnce(new Error("KV unavailable"));
        const { publishConfiguredPublicCatalog } = await import("./public-catalog");
        expect(await publishConfiguredPublicCatalog(JSON.stringify([target, { ...target, model: "lab/other" }]))).toEqual({ targets: 2, published: 1, skipped: 0, failed: 1 });
    });

    it("bounds database concurrency to two and continues after query failure", async () => {
        let active = 0, maximum = 0;
        const finishes: (() => void)[] = [];
        state.rpc.mockImplementation((_name, params) => ({ abortSignal: () => new Promise(resolve => {
            active++; maximum = Math.max(maximum, active);
            finishes.push(() => { active--; resolve({ data: catalog(params.p_model), error: params.p_model === "lab/0" ? {} : null }); });
        }) }));
        const { publishConfiguredPublicCatalog } = await import("./public-catalog");
        const pending = publishConfiguredPublicCatalog(JSON.stringify(Array.from({ length: 6 }, (_, i) => ({ ...target, model: `lab/${i}` }))));
        for (let i = 0; i < 6; i++) {
            await vi.waitFor(() => expect(finishes.length).toBeGreaterThan(0));
            finishes.shift()!();
        }
        expect(await pending).toEqual({ targets: 6, published: 5, failed: 1, skipped: 0 });
        expect(maximum).toBe(2);
    });
});
