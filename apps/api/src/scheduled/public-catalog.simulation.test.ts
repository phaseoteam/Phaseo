import { afterEach, describe, expect, it, vi } from "vitest";

// Model only network visibility and passage of time. Exercise the real publisher,
// snapshot reader, expiry checks and account/catalog composition code.
const state = vi.hoisted(() => ({
    rpc: vi.fn(), get: vi.fn(), put: vi.fn(), background: [] as Promise<unknown>[],
}));
vi.mock("@/runtime/env", () => ({
    getBindingsIfConfigured: () => ({ GATEWAY_CONTEXT_BUNDLE_ENABLED: "true" }),
    getSupabaseAdmin: () => ({ rpc: state.rpc }),
    getCache: () => ({ get: state.get, put: state.put }),
    dispatchBackground: (promise: Promise<unknown>) => { state.background.push(promise); },
}));

function snapshot() {
    return { version: 1, model: "lab/model", resolvedModel: "lab/model", endpoints: ["text.generate", "responses"],
        checkedAt: Date.now(), expiresAt: Date.now() + 300_000,
        variants: ["text.generate", "responses"].map(endpoint => ({ endpoint, pricing: {},
            providers: [{ provider_id: "test", api_model_id: "lab/model", byok_meta: [] }],
        })), providerRows: [], routeModes: [],
    };
}

async function simulate(publish: boolean, visibilityDelaySeconds: number) {
    vi.resetModules(); vi.useFakeTimers();
    const start = Date.parse("2026-09-16T12:00:00Z"); vi.setSystemTime(start);
    const writes: { visibleAt: number; value: string }[] = [];
    const stats = { requests: 0, requestCatalogBuilds: 0, scheduledCatalogBuilds: 0, kvReads: 0, kvWrites: 0, maximumAgeMs: 0 };
    state.background = [];
    state.get.mockImplementation(async () => {
        stats.kvReads++;
        return writes.findLast(write => write.visibleAt <= Date.now())?.value ?? null;
    });
    state.put.mockImplementation(async (_key, value) => {
        stats.kvWrites++;
        writes.push({ value, visibleAt: Date.now() + visibilityDelaySeconds * 1000 });
    });
    state.rpc.mockImplementation((name, args) => {
        if (name === "gateway_fetch_public_catalog") {
            stats.scheduledCatalogBuilds++;
            return { abortSignal: () => Promise.resolve({ data: snapshot(), error: null }) };
        }
        if (args.include_catalog) stats.requestCatalogBuilds++;
        return Promise.resolve({ error: null, data: {
            context: { workspace_id: args.workspace_id, resolved_model: "lab/model" },
            byok: {}, settings: {}, billingMode: "wallet", catalog: args.include_catalog ? snapshot() : null,
        } });
    });
    const publisher = await import("./public-catalog");
    // Different module instances represent the scheduler and request isolates.
    vi.resetModules();
    const reader = await import("@/pipeline/before/contextBundle");
    for (let second = 0; second < 1800; second += 10) {
        vi.setSystemTime(start + second * 1000);
        if (publish && second % 120 === 0) {
            await publisher.publishConfiguredPublicCatalog(JSON.stringify([{ model: "lab/model", endpoint: "responses" }]));
        }
        const result = await reader.loadTextContextBundle({ workspaceId: "workspace", apiKeyId: "key", model: "lab/model", endpoint: "responses" });
        stats.requests++;
        stats.maximumAgeMs = Math.max(stats.maximumAgeMs, Date.now() - result.catalog.checkedAt);
        expect(result.catalog.expiresAt).toBeGreaterThan(Date.now());
        await Promise.all(state.background.splice(0));
    }
    return stats;
}

afterEach(() => vi.useRealTimers());
describe("30-minute public catalog publication simulation", () => {
    it.each([0, 60, 180, 360])("preserves expiry with %i seconds of simulated KV visibility delay", async delay => {
        const baseline = await simulate(false, delay);
        const candidate = await simulate(true, delay);
        console.log("catalog_publication_simulation", JSON.stringify({ delaySeconds: delay, baseline, candidate }));
        expect(candidate.maximumAgeMs).toBeLessThan(300_000);
        expect(candidate.requestCatalogBuilds).toBeLessThanOrEqual(baseline.requestCatalogBuilds);
        if (delay <= 180) expect(candidate.requestCatalogBuilds).toBeLessThan(baseline.requestCatalogBuilds);
        else expect(candidate.requestCatalogBuilds).toBeGreaterThan(0);
    });
});
