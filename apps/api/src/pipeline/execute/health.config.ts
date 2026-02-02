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
    HALF_OPEN_TEST_SECS: 20,          // collect probes for ~20s
    HALF_OPEN_MIN_PROBES: 5,          // all must succeed to close

    // Load
    LOAD_SOFT_CAP: 500,

    // Dynamic gating for "open" (scales with traffic over ~60s)
    // breaker may open only if recent volume ≥ max(floor, fraction * expected calls in 60s)
    OPEN_MIN_TOTAL_FLOOR: 8,          // absolute floor for low traffic
    OPEN_MIN_TOTAL_FRAC: 0.10,        // 10% of expected 60s volume (from rate_60s)
};

export const HEALTH_KEYS = {
    // Per-(endpoint, base-model) scope; provider data is stored within hash fields
    health: (endpoint: string, model: string) => `gw:health:${endpoint}:${model}`,
    half: (endpoint: string, model: string, provider: string) => `gw:health:${endpoint}:${model}:half:${provider}`,
};










