import { expect, test, vi } from "vitest";
import { ageHealth, emptyHealth, reduceHealth, healthSnapshotKey, type HealthEvidence, type HealthObservation, type HealthReceipt } from "../../src/pipeline/execute/health-evidence";
import { simulate } from "./simulator";
import { deepSuite } from "./deep-suite";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isRecoveryProbeRequest } from "../../src/pipeline/execute/health.config";
import * as health from "../../src/pipeline/execute/health";
import { resetRuntime, flushBackground, setHealthCoordinator, cacheOperations, getCache } from "./runtime";

const epoch = 1_800_000_000_000;
test("recovery sampling spreads sequential request IDs across windows", () => {
    for (let start = 0; start < 10_000; start += 1000) {
        const count = Array.from({ length: 1000 }, (_, i) => isRecoveryProbeRequest("simulation", `sim-42-${start + i + 1}`)).filter(Boolean).length;
        expect(count).toBeGreaterThan(25);
        expect(count).toBeLessThan(80);
    }
});
function event(n: number, overrides: Partial<HealthObservation> = {}): HealthObservation {
    return { id: String(n), endpoint: "responses", model: "m", provider: "p", observedAt: epoch + n * 1000,
        startedAt: epoch + n * 1000 - 500, ok: true, limited: false, latencyMs: 200, tps: 100, probe: false, ...overrides };
}
test("concurrent evidence is additive and late deliveries preserve decayed counts", () => {
    const events = Array.from({ length: 80 }, (_, n) => event(n, { ok: n % 4 !== 0 }));
    const forward = events.reduce((h, e) => reduceHealth(h, e), emptyHealth("responses", "m", "p"));
    const reverse = [...events].reverse().reduce((h, e) => reduceHealth(h, e), emptyHealth("responses", "m", "p"));
    expect(forward.observations).toBe(80);
    for (const key of ["rec_tot_ew_10s", "rec_ok_ew_10s", "rec_tot_ew_60s", "rec_ok_ew_60s", "lat_ewma_60s", "tp_ewma_60s"] as const) {
        expect(reverse[key]).toBeCloseTo(forward[key]!, 8);
    }
    const simultaneous = Array.from({ length: 100 }, (_, n) => event(n, { observedAt: epoch, startedAt: epoch - 1 }));
    const result = simultaneous.reduce((h, e) => reduceHealth(h, e), emptyHealth("responses", "m", "p"));
    expect(result.rec_tot_ew_60s).toBe(100);
    expect(result.lat_ewma_60s).toBe(200);
});
test("one failure cannot open a breaker; 429s degrade scores without opening it", () => {
    expect(reduceHealth(undefined, event(0, { ok: false })).breaker).toBe("closed");
    let limited: HealthEvidence | undefined;
    for (let n = 0; n < 100; n++) limited = reduceHealth(limited, event(n, { ok: false, limited: true }));
    expect(limited?.breaker).toBe("closed");
    expect(limited?.err_ewma_60s).toBe(1);
});
test("recovery requires five post-cooldown successes and ignores old streams", () => {
    let h = emptyHealth("responses", "m", "p");
    for (let n = 0; n < 8; n++) h = reduceHealth(h, event(n, { ok: false }));
    expect(h.breaker).toBe("open");
    const until = h.breaker_until_ms;
    h = reduceHealth(h, event(8, { ok: false }));
    expect(h.breaker_until_ms).toBe(until);
    for (let n = 0; n < 4; n++) h = reduceHealth(h, event(n, { observedAt: until + n * 1000 + 500, startedAt: until + n * 1000, probe: true }));
    expect(h.breaker).toBe("half_open");
    h = reduceHealth(h, event(5, { observedAt: until + 4500, startedAt: until + 4000, probe: true }));
    expect(h.breaker).toBe("closed");
    for (let n = 0; n < 30; n++) h = reduceHealth(h, event(n, { observedAt: until + 5000, startedAt: epoch, ok: false }));
    expect(h.breaker).toBe("closed");
    expect(h.err_ewma_60s).toBe(0);
});
test("inactivity reduces confidence without erasing evidence of failure", () => {
    const h = reduceHealth(undefined, event(0, { ok: false }));
    const aged = ageHealth(h, epoch + 300_000);
    expect(aged.rec_tot_ew_60s).toBeCloseTo(Math.exp(-5));
    expect(aged.err_ewma_60s).toBe(1);
    expect(h.rec_tot_ew_60s).toBe(1);
});

test("degraded closed providers retire old failure evidence after five fresh successes", () => {
    let h = emptyHealth("responses", "m", "p");
    for (let n = 0; n < 4; n++) h = reduceHealth(h, event(n, { ok: false }));
    expect(h.breaker).toBe("closed");
    for (let n = 4; n < 8; n++) h = reduceHealth(h, event(n));
    expect(h.err_ewma_60s).toBeGreaterThan(0);
    h = reduceHealth(h, event(8));
    expect(h.breaker).toBe("closed");
    expect(h.err_ewma_60s).toBe(0);
    expect(h.rec_tot_ew_60s).toBe(5);
});

test("gateway feedback retries the same observation ID and skips neutral/start writes", async () => {
    await flushBackground(); resetRuntime(); health.resetHealthStateForTests();
    let state: HealthEvidence | undefined;
    const ids = new Set<string>(), deliveries: string[] = [];
    setHealthCoordinator(async observation => {
        deliveries.push(observation.id);
        if (!ids.has(observation.id)) { ids.add(observation.id); state = reduceHealth(state, observation); }
        if (deliveries.length === 1) throw new Error("Ambiguous response after durable commit");
        return { health: state!, version: ids.size };
    });
    try {
        await health.onCallStart("responses", "p", "m");
        await health.onCallEnd("responses", { provider: "p", model: "m", ok: false, healthImpact: "neutral", latency_ms: 1 });
        await flushBackground();
        expect(deliveries).toHaveLength(0);
        await health.onCallEnd("responses", { provider: "p", model: "m", observationId: "once", ok: true,
            latency_ms: 200, generation_ms: 500, tokens_in: 1_000_000, tokens_out: 100 });
        await flushBackground();
        expect(deliveries).toEqual(["once", "once"]);
        expect(state?.observations).toBe(1);
        expect(state?.tp_ewma_60s).toBe(200);
        expect(cacheOperations.writes).toBe(0);
        expect(health.readHealthManyOptimistic("responses", "m", ["p"]).p.rec_tot_ew_60s).toBe(1);
        vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(Date.now() + 16 * 60_000);
        expect(health.readHealthManyOptimistic("responses", "m", ["p"]).p.last_updated).toBe(0);
    } finally { await flushBackground(); vi.useRealTimers(); resetRuntime(); health.resetHealthStateForTests(); }
});

test("a newer wall clock cannot erase local failures missing from a published revision", async () => {
    await flushBackground(); resetRuntime(); health.resetHealthStateForTests();
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(epoch);
    let resolveReport!: (value: HealthReceipt) => void;
    let accepted!: HealthEvidence;
    setHealthCoordinator(observation => {
        accepted = reduceHealth(undefined, observation);
        return new Promise(resolve => { resolveReport = resolve; });
    });
    try {
        await health.onCallEnd("responses", { provider: "p", model: "m", observationId: "delayed", ok: false, latency_ms: 50 });
        vi.setSystemTime(epoch + 31_000);
        await getCache().put(healthSnapshotKey("responses", "m"), JSON.stringify({ version: 5, publishedAt: Date.now(), providers: { p: emptyHealth("responses", "m", "p") } }));
        expect((await health.readHealthMany("responses", "m", ["p"])).p.err_ewma_60s).toBe(1);
        resolveReport({ health: accepted, version: 6 });
        await flushBackground();
        expect(health.readHealthManyOptimistic("responses", "m", ["p"]).p.err_ewma_60s).toBe(1);
        vi.setSystemTime(epoch + 62_000);
        await getCache().put(healthSnapshotKey("responses", "m"), JSON.stringify({ version: 6, publishedAt: Date.now(), providers: { p: { ...accepted, lat_ewma_60s: 123 } } }));
        expect((await health.readHealthMany("responses", "m", ["p"])).p.lat_ewma_60s).toBe(123);
    } finally {
        if (resolveReport) resolveReport({ health: accepted, version: 6 });
        await flushBackground(); vi.useRealTimers(); resetRuntime(); health.resetHealthStateForTests();
    }
});

test("coordinated routing measures outage recovery against a matched healthy pool", async () => {
    const results = [];
    for (const seed of [7, 42, 123]) {
    for (const rpm of [100, 1000, 10_000]) {
        for (const incident of [false, true]) {
            const durationMs = rpm === 100 ? 600_000 : 300_000;
            const base = deepSuite([rpm], [seed]).find(s => s.name === `outage-recovery-${rpm}rpm`)!;
            const result = await simulate({ ...base, name: `coordinated-${incident ? "outage" : "healthy"}-${rpm}`,
                durationMs, sampleMs: 60_000, maxRequests: rpm * durationMs / 60_000 + 10,
                healthBackend: "coordinated", traffic: [{ untilMs: durationMs, rps: rpm / 60 }],
                providers: base.providers.map(p => ({ ...p, phases: incident ? p.phases.map((phase, index) => ({ ...phase, atMs: index === 1 ? 30_000 : index === 2 ? 90_000 : 0 })) : [p.phases[0]] })),
            });
            expect(result.metadata.blockedNetworkAttempts).toBe(0);
            expect(result.aggregates.summary.successRate).toBe(1);
            if (!incident && rpm >= 1000) {
                expect(Math.max(...Object.values(result.aggregates.summary.providerFirstAttempts)) / result.aggregates.summary.requests).toBeLessThan(0.08);
            }
            const shares = result.aggregates.windows.map(w => Object.entries(w.providerFirstAttempts)
                .filter(([id]) => Number(id.slice(-2)) < 5).reduce((sum, [, n]) => sum + n, 0) / w.requests);
            results.push({ seed, rpm, incident, shares, summary: result.aggregates.summary, cache: result.metadata.cacheOperations,
                finalAffectedHealth: Object.fromEntries(Object.entries(result.finalHealth).filter(([id]) => Number(id.slice(-2)) < 5)) });
            if (incident) expect.soft(shares.at(-1)).toBeGreaterThan(0.10);
        }
    }
    }
    const output = resolve("scripts/routing-simulator/results/coordinated-recovery"); mkdirSync(output, { recursive: true });
    writeFileSync(resolve(output, "comparison.json"), JSON.stringify({ scope: "single-isolate policy simulation, simulated RPC and publication; not measured WAN or capacity", results }, null, 2));
}, 180_000);
