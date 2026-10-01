import { describe, test, expect, vi } from "vitest";
import { simulate, EPOCH } from "./simulator";
import { report } from "./report";
import { Events } from "./events";
import { scenarioSchema } from "./schema";
import * as health from "../../src/pipeline/execute/health";
import { HEALTH_KEYS } from "../../src/pipeline/execute/health.config";
import { flushBackground, getCache, resetRuntime } from "./runtime";
import { networkAttempts } from "./offline";
import { request } from "node:https";

const provider = (id: string, behavior: Record<string, unknown> = {}) => ({ id, phases: [{ atMs: 0, behavior: { latencyMs: 20, generationMs: 80, ...behavior } }] });
const scenario = (overrides: Record<string, unknown> = {}) => ({
  name: "verification", durationMs: 1000, sampleMs: 100,
  providers: [provider("provider-a"), provider("provider-b")],
  traffic: [{ untilMs: 1000, rps: 10 }], ...overrides,
});
describe("offline routing simulator", () => {
  test("rejects fetch and HTTPS transports before a connection", () => {
    const before = networkAttempts.length;
    expect(() => fetch("https://example.invalid")).toThrow("forbids network");
    expect(() => request("https://example.invalid")).toThrow("forbids network");
    expect(networkAttempts.length - before).toBe(2);
  });
  test("heap preserves chronological, priority and insertion order", async () => {
    const events = new Events(); const seen: number[] = [];
    for (const [at, priority, n] of [[10, 1, 3], [0, 1, 1], [10, 0, 2], [10, 1, 4]]) events.add(at, priority, async () => { seen.push(n); });
    for (let e = events.pop(); e; e = events.pop()) await e.run();
    expect(seen).toEqual([1, 2, 3, 4]);
  });
  test("replays exactly, including score diagnostics and state", async () => {
    const input = scenario({ providers: [provider("provider-a", { failureRate: 0.4 }), provider("provider-b")] });
    expect(await simulate(input)).toEqual(await simulate(input));
  });
  test("overlaps requests and drains completions after the traffic ends", async () => {
    const result = await simulate(scenario({ providers: [provider("provider-a", { generationMs: 1980 })] }));
    expect(result.requests).toHaveLength(10);
    expect(Math.max(...result.samples.map(s => s.inflight["provider-a"]))).toBe(10);
    expect(result.requests.at(-1)?.endMs).toBe(2900);
    expect(result.finalHealth["provider-a"].inflight).toBe(0);
    expect(result.requests.every(r => r.success)).toBe(true);
  });
  test("fallback uses the real ranked snapshot and accounts for failed-attempt time", async () => {
    const result = await simulate(scenario({
      context: { body: { routing: { order: ["provider-a", "provider-b"] } } },
      providers: [provider("provider-a", { failureRate: 1, failureDurationMs: 50 }), provider("provider-b")],
    }));
    expect(result.requests[0].endMs-result.requests[0].atMs).toBe(150);
    expect(result.requests.every(r => r.success && r.endMs - r.atMs <= 150)).toBe(true);
    expect(result.requests[0].attempts.map(a => a.provider)).toEqual(["provider-a", "provider-b"]);
  });
  test("honors fallback prohibition", async () => {
    const result = await simulate(scenario({
      context: { body: { routing: { order: ["provider-a"], allow_fallbacks: false } } },
      providers: [provider("provider-a", { failureRate: 1 }), provider("provider-b")],
    }));
    expect(result.requests.every(r => !r.success && r.attempts.length === 1)).toBe(true);
  });
  test("does not learn from outcomes before their delayed feedback", async () => {
    const result = await simulate(scenario({ healthFeedbackDelayMs: 500, providers: [provider("provider-a", { failureRate: 1, failureDurationMs: 100 })] }));
    expect(result.samples.find(s => s.atMs === 500)?.health["provider-a::err_ewma_60s"]).toBeUndefined();
    expect(result.samples.find(s => s.atMs === 600)?.health["provider-a::err_ewma_60s"]).toBe("1");
    expect(result.finalHealth["provider-a"].inflight).toBe(0);
  });
  test("models upstream capacity rejection as a provider failure", async () => {
    const result = await simulate(scenario({ providers: [provider("provider-a", { capacity: 1, generationMs: 980 })] }));
    expect(result.requests.flatMap(r => r.attempts).some(a => a.status === 429 && a.healthImpact === "failure")).toBe(true);
    expect(result.finalHealth["provider-a"].err_ewma_60s).toBeGreaterThan(0);
  });
  test("midstream failure cannot produce an artificial fallback success", async () => {
    const result = await simulate(scenario({ providers: [provider("provider-a", { midStreamError: true }), provider("provider-b", { midStreamError: true })] }));
    expect(result.requests.every(r => !r.success && r.attempts.length === 1)).toBe(true);
  });
  test("uses production filters for disabled providers", async () => {
    const result = await simulate(scenario({ providers: [{ ...provider("provider-a"), candidate: { providerRoutingStatus: "disabled" } }, provider("provider-b")] }));
    expect(result.requests.every(r => r.attempts[0].provider === "provider-b")).toBe(true);
  });
  test("cached-token feedback reaches the real sticky routing scorer", async () => {
    const result = await simulate(scenario({ traceEvery: 1,
      context: { body: { prompt_cache_key: "simulation-session" } },
      providers: [provider("provider-a", { cachedReadTokens: 1000 }), provider("provider-b", { cachedReadTokens: 1000 })],
    }));
    expect(result.traces.some(t => t.diagnostics.stickyRouting.applied)).toBe(true);
  });
  test("supports seeded breaker state without mistaking it for learned observations", async () => {
    const result = await simulate(scenario({ providers: [{ ...provider("provider-a"), initialHealth: { breaker: "open", breaker_until_ms: 500 } }] }));
    expect(result.requests.filter(r => r.atMs < 500).every(r => r.attempts[0].admission === "blocked")).toBe(true);
    expect(result.transitions.some(t => t.breaker_state === "half_open")).toBe(true);
  });
  test("cache failure and local reset exercise the real fail-open cache path", async () => {
    const result = await simulate(scenario({
      cacheOutages: [{ fromMs: 0, untilMs: 400, writes: false }, { fromMs: 400, untilMs: 900, reads: false }], localCacheResetMs: [500],
    }));
    expect(result.metadata.cacheOperations.failedReads).toBeGreaterThan(0);
    expect(result.metadata.cacheOperations.failedWrites).toBeGreaterThan(0);
    expect(result.requests.every(r => r.success)).toBe(true);
  });
  test("real cold-start update path opens a breaker on sustained failures", async () => {
    const result = await simulate(scenario({ durationMs: 60_000, sampleMs: 1000,
      providers: [provider("provider-a", { failureRate: 1 })], traffic: [{ untilMs: 60_000, rps: 50 }],
      checks: [{ name: "opens", untilMs: 60_000, metric: "breakerOpenCount", op: ">=", value: 1 }],
    }));
    expect(result.requests).toHaveLength(3000);
    expect(result.finalHealth["provider-a"].err_ewma_60s).toBe(1);
    expect(result.finalHealth["provider-a"].rec_tot_ew_60s).toBeGreaterThan(1);
    expect(result.transitions.some(t => t.breaker_state === "open")).toBe(true);
    expect(report(result).checks[0].passed).toBe(true);
  });
  test("seeded open breaker blocks, probes after expiry, then closes after five successes", async () => {
    resetRuntime(); health.resetHealthStateForTests();
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(EPOCH);
    try {
      await getCache().put(HEALTH_KEYS.health("responses", "simulation/model"), JSON.stringify({
        "provider-a::breaker": "open", "provider-a::breaker_until_ms": EPOCH + 1000,
        "provider-a::last_updated": EPOCH,
      }));
      expect(await health.admitThroughBreaker("responses", "provider-a", "simulation/model", "w", "r")).toBe("blocked");
      vi.setSystemTime(EPOCH + 1001);
      let probes = 0;
      for (let n = 0; n < 10_000 && probes < 5; n++) {
        const admission = await health.admitThroughBreaker("responses", "provider-a", "simulation/model", "w", `probe-${n}`);
        if (admission === "probe") { probes++; await health.reportProbeResult("responses", "provider-a", "simulation/model", true); }
      }
      await flushBackground();
      expect(probes).toBe(5);
      expect((await health.readHealth("responses", "provider-a", "simulation/model")).breaker).toBe("closed");
    } finally { await flushBackground(); vi.useRealTimers(); }
  });
  test("validates windows, distributions, provider identities and unknown knobs", () => {
    expect(() => scenarioSchema.parse(scenario({ invented: true }))).toThrow();
    expect(() => scenarioSchema.parse(scenario({ providers: [provider("a"), provider("a")] }))).toThrow();
    expect(() => scenarioSchema.parse(scenario({ traffic: [{ untilMs: 1001, rps: 1 }] }))).toThrow();
    expect(() => scenarioSchema.parse(scenario({ providers: [provider("a", { latencyMs: { kind: "uniform", min: 20, max: 10 } })] }))).toThrow();
  });
  test("empty windows fail checks instead of reporting a misleading success", async () => {
    const result = await simulate(scenario({ traffic: [{ fromMs: 500, untilMs: 1000, rps: 1 }], checks: [{ name: "empty", untilMs: 100, metric: "successRate", op: ">=", value: 0 }] }));
    expect(report(result).checks[0]).toMatchObject({ actual: null, passed: false });
  });
  test("enforces request budget without emitting partial results", async () => {
    await expect(simulate(scenario({ maxRequests: 2 }))).rejects.toThrow("exceeds maxRequests");
  });
});
