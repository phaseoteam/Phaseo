// file: lib/gateway/execute/health.config.ts
// Purpose: Execute-stage logic for routing, attempts, and provider health.
// Why: Centralizes execution/failover behavior.
// How: Defines constants for breaker thresholds and sampling windows.

export const HEALTH_CONSTANTS = {
    // EWMA horizons (ms)
    TAU_10S_MS: 10_000,
    TAU_60S_MS: 60_000,
    TAU_300S_MS: 300_000,

    // Circuit breaker thresholds & backoff
    ERROR_RATE_OPEN_THRESHOLD: 0.5,   // open if recent error% ≥ 50%
    BASE_OPEN_SECS: 30,
    MAX_OPEN_SECS: 15 * 60,

    // Half-open sampling
    HALF_OPEN_PROBE_RATIO: 0.05,      // 5% sampled traffic during half-open
    HALF_OPEN_MIN_PROBES: 5,          // evaluate a bounded batch, then start a new batch

    // Load
    LOAD_SOFT_CAP: 500,

    // Dynamic gating for "open" over the 10s observation horizon.
    // Eight consecutive failures also open the breaker at sparse traffic rates.
    OPEN_MIN_TOTAL_FLOOR: 8,          // absolute floor for low traffic
    OPEN_MIN_TOTAL_FRAC: 0.10,        // 10% of expected 10s volume (from rate_10s)
};

// Shared deterministic admission predicate: ranking must deliberately revisit
// recovering providers, otherwise their stale scores can starve every probe.
export function isRecoveryProbeRequest(workspaceId: string, requestId: string, p = HEALTH_CONSTANTS.HALF_OPEN_PROBE_RATIO): boolean {
    let h = 2166136261 >>> 0;
    const value = `${workspaceId}|${requestId}`;
    for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
    // Avalanche adjacent/sequential IDs. FNV's high bits alone can produce
    // hundreds of consecutive non-probe requests with a shared ID prefix.
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 0xffffffff < p;
}

export const HEALTH_KEYS = {
    // Per-(endpoint, base-model) scope; provider data is stored within hash fields
    health: (endpoint: string, model: string) => `gw:health:${endpoint}:${model}`,
    half: (endpoint: string, model: string, provider: string) => `gw:health:${endpoint}:${model}:half:${provider}`,
};







