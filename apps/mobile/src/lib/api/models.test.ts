import { parseModelPerformance, parseProviderHealth } from "./models";

const metrics = (successSeries: unknown[], extra: Record<string, unknown> = {}) => ({
  metrics: { summary: { totalRequests: 0 }, hourly: [], successSeries, providerHourly7d: [], providerDaily7d: [], providerPercentileDaily7d: [], qualitySeries: [], ...extra },
});

describe("parseModelPerformance", () => {
  test("keeps the attempt rates, with null hours distinct from an older server that has none", () => {
    const parsed = parseModelPerformance(metrics(
      [
        { bucket: "2026-11-05T05:00:00Z", overallSuccessPct: 99, requests: 3, reachabilityPct: "99.5", capacityPct: 100, callErrorPct: 99.99 },
        { bucket: "2026-11-05T04:00:00Z", overallSuccessPct: null, requests: 0, reachabilityPct: null, capacityPct: null, callErrorPct: null },
      ],
      { attemptHealth24h: { reachabilityPct: 99.7, capacityPct: 100, callErrorPct: 99.9, uptimePct: 99.6 } },
    ))!;
    expect(parsed.successSeries[0]).toMatchObject({ reachabilityPct: 99.5, capacityPct: 100, callErrorPct: 99.99 });
    expect(parsed.successSeries[1]!.reachabilityPct).toBeNull();
    expect(parsed.attemptHealth24h).toMatchObject({ reachabilityPct: 99.7, uptimePct: 99.6 });

    const older = parseModelPerformance(metrics([{ bucket: "2026-11-05T05:00:00Z", overallSuccessPct: 99, requests: 3 }]))!;
    expect(older.successSeries[0]!.reachabilityPct).toBeUndefined();
    expect(older.attemptHealth24h).toBeUndefined();
  });

  test("parses with or without the count fields #3550 stopped publishing", () => {
    const withCounts = { bucket: "2026-11-05T05:00:00Z", overallSuccessPct: 99, requests: 3, failedRequests: 1, eligibleAttempts: 4, reachabilityFailures: 1, capacityFailures: 0, callErrorFailures: 0, reachabilityPct: 75, capacityPct: 100, callErrorPct: 100 };
    expect(parseModelPerformance(metrics([withCounts]))!.successSeries[0]!.reachabilityPct).toBe(75);
    const ratesOnly = { bucket: "2026-11-05T05:00:00Z", overallSuccessPct: 99, reachabilityPct: 75, capacityPct: 100, callErrorPct: 100 };
    expect(parseModelPerformance(metrics([ratesOnly]))!.successSeries[0]).toMatchObject({ requests: 0, worstProviderRequests: 0, providerCount: 0 });
  });
});

describe("parseProviderHealth", () => {
  test("reads rates-only attempt health with daily rates", () => {
    const parsed = parseProviderHealth({
      rows: [{ provider_id: "openai", service_tier: "standard", requests: 10, health_requests: 10, uptime_pct: 100 }],
      attempt_health: [{
        provider_id: "openai", service_tier: "standard", provider_name: "OpenAI", reachability_pct: 99.5, capacity_pct: 100, call_error_pct: 99.99, uptime_pct: 99.49,
        buckets: [{ start: "2026-11-05T05:00:00Z", end: "2026-11-05T06:00:00Z", reachability_pct: 99.5, capacity_pct: 100, call_error_pct: 99.99, uptime_pct: 99.49 }],
        days: [{ start: "2026-11-05T00:00:00.000Z", end: "2026-11-06T00:00:00.000Z", reachability_pct: 99.5, capacity_pct: 100, call_error_pct: 99.99, uptime_pct: 99.49 }],
      }],
    });
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.attemptHealth[0]).toMatchObject({ provider_id: "openai", reachability_pct: 99.5, call_error_pct: 99.99 });
    expect(parsed.attemptHealth[0]!.days![0]).toMatchObject({ start: "2026-11-05T00:00:00.000Z", uptime_pct: 99.49 });
  });

  test("an older server's counts and missing days or attempt health still parse", () => {
    const parsed = parseProviderHealth({
      rows: [],
      attempt_health: [{ provider_id: "openai", service_tier: null, attempts: 40, eligible_attempts: 40, success_attempts: 39, reachability_failures: 1, capacity_failures: 0, call_error_failures: 0, reachability_pct: 97.5, capacity_pct: 100, call_error_pct: 100, uptime_pct: 97.5, buckets: [] }],
    });
    expect(parsed.attemptHealth[0]!.days).toBeUndefined();
    expect(parseProviderHealth({ rows: [] }).attemptHealth).toEqual([]);
  });
});
