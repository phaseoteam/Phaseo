// Fully resolved scenarios are embedded in each output for independent replay.
const phase = (atMs: number, behavior: Record<string, unknown>) => ({ atMs, behavior });
const healthy = { latencyMs: 150, generationMs: 350 };
const provider = (id: string, phases = [phase(0, healthy)]) => ({ id, phases });
const common = {
  durationMs: 120_000, sampleMs: 5000, traceEvery: 250,
  context: { cacheAwareRouting: false },
  providers: [provider("provider-a"), provider("provider-b", [phase(0, { latencyMs: 300, generationMs: 500 })])],
  traffic: [{ untilMs: 120_000, rps: 20, arrival: "poisson" }],
};
const outageProviders = [provider("provider-a", [phase(0, healthy), phase(30_000, { failureRate: 1, failureDurationMs: 100 }), phase(80_000, healthy)]), common.providers[1]];
const cases = [
  { name: "healthy-balanced" },
  { name: "outage-router", providers: outageProviders },
  { name: "outage-round-robin", providers: outageProviders, strategy: "round_robin" },
  { name: "slowdown-recovery", providers: [provider("provider-a", [phase(0, healthy), phase(30_000, { latencyMs: 3000, generationMs: 3000 }), phase(80_000, healthy)]), common.providers[1]] },
  { name: "flapping", providers: [provider("provider-a", Array.from({ length: 12 }, (_, i) => phase(i * 10_000, i % 2 ? { failureRate: 1 } : healthy))), common.providers[1]] },
  { name: "upstream-rate-limit", providers: [provider("provider-a", [phase(0, healthy), phase(30_000, { failureRate: 1, failureStatus: 429 }), phase(80_000, healthy)]), common.providers[1]] },
  { name: "capacity-burst", providers: [provider("provider-a", [phase(0, { ...healthy, capacity: 10 })]), provider("provider-b", [phase(0, { ...healthy, capacity: 30 })])], traffic: [{ untilMs: 120_000, rps: 20 }, { fromMs: 40_000, untilMs: 50_000, rps: 200 }] },
  { name: "delayed-health", providers: outageProviders, healthFeedbackDelayMs: 5000 },
  { name: "low-traffic-outage", providers: outageProviders, traffic: [{ untilMs: 120_000, rps: 0.5, arrival: "poisson" }] },
  { name: "sticky-outage", context: { body: { prompt_cache_key: "shared-session" } }, providers: [provider("provider-a", [phase(0, { ...healthy, cachedReadTokens: 10_000 }), phase(30_000, { failureRate: 1 }), phase(80_000, { ...healthy, cachedReadTokens: 10_000 })]), common.providers[1]] },
  { name: "no-fallback-outage", providers: outageProviders, context: { cacheAwareRouting: false, body: { routing: { allow_fallbacks: false } } } },
  { name: "latency-mode", context: { cacheAwareRouting: false, body: { routing: { mode: "latency" } } } },
  { name: "throughput-mode", context: { cacheAwareRouting: false, body: { routing: { mode: "throughput" } } }, providers: [provider("provider-a", [phase(0, { latencyMs: 100, generationMs: 1000, outputTokens: 100 })]), provider("provider-b", [phase(0, { latencyMs: 200, generationMs: 500, outputTokens: 100 })])] },
  { name: "price-mode", context: { cacheAwareRouting: false, body: { routing: { mode: "price" } } }, providers: [{ ...common.providers[0], inputUsdPerMillion: 10, outputUsdPerMillion: 10 }, common.providers[1]] },
  { name: "stream-errors", providers: [provider("provider-a", [phase(0, healthy), phase(30_000, { ...healthy, midStreamError: true }), phase(80_000, healthy)]), common.providers[1]] },
  { name: "seeded-breaker-recovery", providers: [{ ...common.providers[0], initialHealth: { breaker: "open", breaker_until_ms: 30_000 } }], checks: [{ name: "recovery probes run", fromMs: 30_000, untilMs: 120_000, metric: "probeCount", op: ">=", value: 5 }] },
  { name: "cache-outage-with-local-reset", cacheOutages: [{ fromMs: 30_000, untilMs: 60_000 }], localCacheResetMs: [40_000, 80_000], providers: outageProviders },
];
export function builtInSuite() {
  return [
    ...[1, 42, 2026].flatMap(seed => cases.map(c => ({ ...common, ...c, seed }))),
    { ...common, name: "100k-overlapping-requests", seed: 42, traceEvery: 10_000, traffic: [{ untilMs: 100_000, rps: 1000 }] },
  ];
}
