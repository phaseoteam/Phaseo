// Shared by the durable reducer and the edge's immediate, advisory health view.
import type { Endpoint } from "@core/types";
import type { ProviderHealth } from "./health";
import { HEALTH_CONSTANTS } from "./health.config";

export const HEALTH_REPORT_MAX_AGE_MS = 120_000;
export const HEALTH_PUBLISH_INTERVAL_MS = 60_000;
export const HEALTH_SNAPSHOT_MAX_AGE_MS = 15 * 60_000;
export const healthSnapshotKey = (endpoint: string, model: string) => `gw:health:v2:${endpoint}:${model}`;
export const healthPoolName = (endpoint: string, model: string) => JSON.stringify([endpoint, model]);

export type HealthObservation = {
    id: string;
    endpoint: Endpoint;
    model: string;
    provider: string;
    observedAt: number;
    startedAt: number;
    ok: boolean;
    limited: boolean;
    latencyMs: number;
    tps: number | null;
    probe: boolean;
};

export type HealthEvidence = ProviderHealth & {
    observations: number;
    probeOk: number;
    probeFail: number;
    recoveredAt: number;
    successWeight: number;
    tpsWeight: number;
    lastTpsAt: number;
    degradedAt: number;
    recoverySuccesses: number;
};

export type HealthSnapshot = {
    version: number;
    publishedAt: number;
    providers: Record<string, HealthEvidence>;
};
export type HealthReceipt = { health: HealthEvidence; version: number };

export function emptyHealth(endpoint: Endpoint, model: string, provider: string): HealthEvidence {
    return {
        endpoint, model, provider, observations: 0, probeOk: 0, probeFail: 0, recoveredAt: 0, successWeight: 0, tpsWeight: 0, lastTpsAt: 0,
        degradedAt: 0, recoverySuccesses: 0,
        lat_ewma_10s: 800, lat_ewma_60s: 800, lat_ewma_300s: 800, tp_ewma_60s: 0,
        err_ewma_10s: 0, err_ewma_60s: 0, err_ewma_300s: 0, rate_10s: 0, rate_60s: 0,
        rec_ok_ew_10s: 0, rec_tot_ew_10s: 0, rec_rate_limited_ew_10s: 0,
        rec_ok_ew_60s: 0, rec_tot_ew_60s: 0, last_success_ms: 0, consecutive_failures: 0,
        inflight: 0, current_load: 0, breaker: "closed", breaker_until_ms: 0, breaker_attempts: 0,
        last_ts_10s: 0, last_ts_60s: 0, last_ts_300s: 0, last_updated: 0,
    };
}

/** Additive exponentially decayed counts are independent of delivery order. */
export function reduceHealth(previous: HealthEvidence | undefined, event: HealthObservation): HealthEvidence {
    const h = { ...(previous ?? emptyHealth(event.endpoint, event.model, event.provider)) };
    h.observations++;
    // Requests started before a proven recovery belong to the previous incident.
    // Count receipt, but never let a straggling stream reopen the new generation.
    if (event.startedAt < h.recoveredAt) return h;
    const timestamp = Math.max(h.last_ts_60s, event.observedAt);
    const decayedCount = (count: number, sample: number, tau: number) =>
        count * Math.exp(-(timestamp - h.last_ts_60s) / tau) + sample * Math.exp(-(timestamp - event.observedAt) / tau);
    const chronological = event.observedAt >= h.last_updated;
    h.rec_tot_ew_10s = decayedCount(h.rec_tot_ew_10s ?? 0, 1, 10_000);
    h.rec_ok_ew_10s = decayedCount(h.rec_ok_ew_10s ?? 0, Number(event.ok), 10_000);
    h.rec_rate_limited_ew_10s = decayedCount(h.rec_rate_limited_ew_10s ?? 0, Number(event.limited), 10_000);
    h.rec_tot_ew_60s = decayedCount(h.rec_tot_ew_60s, 1, 60_000);
    h.rec_ok_ew_60s = decayedCount(h.rec_ok_ew_60s, Number(event.ok), 60_000);
    h.err_ewma_10s = 1 - h.rec_ok_ew_10s / Math.max(h.rec_tot_ew_10s, Number.EPSILON);
    h.err_ewma_60s = 1 - h.rec_ok_ew_60s / Math.max(h.rec_tot_ew_60s, Number.EPSILON);
    h.err_ewma_300s = h.err_ewma_60s;
    h.rate_10s = h.rec_tot_ew_10s / 10;
    h.rate_60s = h.rec_tot_ew_60s / 60;
    if (chronological) h.consecutive_failures = event.ok || event.limited ? 0 : (h.consecutive_failures ?? 0) + 1;
    if (chronological && !event.ok) {
        h.recoverySuccesses = 0;
        if (h.err_ewma_60s >= 0.1 && h.rec_tot_ew_60s >= 2) h.degradedAt = event.observedAt;
    } else if (chronological && h.degradedAt > 0) h.recoverySuccesses++;
    if (event.ok) {
        const last = h.last_success_ms ?? 0;
        const at = Math.max(last, event.observedAt);
        const oldWeight = h.successWeight * Math.exp(-(at - last) / 60_000);
        const weight = Math.exp(-(at - event.observedAt) / 60_000);
        const blend = (value: number, sample: number) => value + (sample - value) * weight / (oldWeight + weight);
        h.lat_ewma_60s = blend(h.lat_ewma_60s, event.latencyMs);
        // Keep distinct latency horizons; simultaneous successes still contribute.
        const elapsed = Math.max(1, event.observedAt - last);
        const blendTime = (value: number, tau: number) => !last ? event.latencyMs : value + (event.latencyMs - value) * (1 - Math.exp(-elapsed / tau));
        if (event.observedAt >= last) {
            h.lat_ewma_10s = blendTime(h.lat_ewma_10s, 10_000);
            h.lat_ewma_300s = blendTime(h.lat_ewma_300s, 300_000);
        }
        if (event.tps !== null) {
            const tpsAt = Math.max(h.lastTpsAt, event.observedAt);
            const oldTpsWeight = h.tpsWeight * Math.exp(-(tpsAt - h.lastTpsAt) / 60_000);
            const tpsWeight = Math.exp(-(tpsAt - event.observedAt) / 60_000);
            h.tp_ewma_60s += (event.tps - h.tp_ewma_60s) * tpsWeight / (oldTpsWeight + tpsWeight);
            h.tpsWeight = oldTpsWeight + tpsWeight;
            h.lastTpsAt = tpsAt;
        }
        h.successWeight = oldWeight + weight;
        h.last_success_ms = at;
    }
    h.last_ts_10s = h.last_ts_60s = h.last_ts_300s = timestamp;
    h.last_updated = Math.max(h.last_updated, event.observedAt);

    const open = () => {
        h.breaker = "open";
        h.breaker_attempts++;
        h.breaker_until_ms = timestamp + Math.min(HEALTH_CONSTANTS.MAX_OPEN_SECS,
            HEALTH_CONSTANTS.BASE_OPEN_SECS * 2 ** Math.min(10, h.breaker_attempts - 1)) * 1000;
        h.probeOk = h.probeFail = 0;
    };
    const restoreEvidence = () => {
        h.recoveredAt = timestamp;
        h.rec_ok_ew_10s = h.rec_tot_ew_10s = h.rec_ok_ew_60s = h.rec_tot_ew_60s = HEALTH_CONSTANTS.HALF_OPEN_MIN_PROBES;
        h.rec_rate_limited_ew_10s = h.err_ewma_10s = h.err_ewma_60s = h.err_ewma_300s = 0;
        h.rate_10s = h.rec_tot_ew_10s / 10;
        h.rate_60s = h.rec_tot_ew_60s / 60;
        h.degradedAt = h.recoverySuccesses = 0;
    };
    if (h.breaker !== "closed") {
        // Admission is local and probabilistic. Only actual post-cooldown probes
        // count toward recovery; stale snapshots and in-flight failures cannot extend it.
        if (event.probe && event.startedAt >= h.breaker_until_ms && !event.limited) {
            h.breaker = "half_open";
            if (event.ok) h.probeOk++; else h.probeFail++;
            if (h.probeOk + h.probeFail >= HEALTH_CONSTANTS.HALF_OPEN_MIN_PROBES) {
                if (h.probeFail === 0) {
                    h.breaker = "closed";
                    h.breaker_until_ms = h.breaker_attempts = h.consecutive_failures = 0;
                    restoreEvidence();
                    h.probeOk = h.probeFail = 0;
                } else if (h.probeFail / (h.probeOk + h.probeFail) >= HEALTH_CONSTANTS.ERROR_RATE_OPEN_THRESHOLD) open();
                else h.probeOk = h.probeFail = 0;
            }
        }
    } else if (event.ok && h.degradedAt > 0 && h.recoverySuccesses >= HEALTH_CONSTANTS.HALF_OPEN_MIN_PROBES) {
        // A degraded route need not open a circuit to prove recovery. Fresh
        // consecutive successes retire the incident's stale error window.
        restoreEvidence();
    } else if (!event.ok && !event.limited && chronological) {
        const outageTotal = h.rec_tot_ew_10s - h.rec_rate_limited_ew_10s;
        if ((h.consecutive_failures ?? 0) >= HEALTH_CONSTANTS.OPEN_MIN_TOTAL_FLOOR ||
            (outageTotal >= HEALTH_CONSTANTS.OPEN_MIN_TOTAL_FLOOR &&
                1 - h.rec_ok_ew_10s / outageTotal >= HEALTH_CONSTANTS.ERROR_RATE_OPEN_THRESHOLD)) open();
    }
    return h;
}

/** Confidence ages even while a provider receives no traffic. Raw error ratios
 * remain evidence of degradation, so expiry grants probes, not a clean bill of health. */
export function ageHealth(h: ProviderHealth, now: number): ProviderHealth {
    const age10 = h.last_ts_10s > 0 ? Math.max(0, now - h.last_ts_10s) : 0;
    const age60 = h.last_ts_60s > 0 ? Math.max(0, now - h.last_ts_60s) : 0;
    return { ...h,
        rec_ok_ew_10s: (h.rec_ok_ew_10s ?? 0) * Math.exp(-age10 / 10_000),
        rec_tot_ew_10s: (h.rec_tot_ew_10s ?? 0) * Math.exp(-age10 / 10_000),
        rec_ok_ew_60s: h.rec_ok_ew_60s * Math.exp(-age60 / 60_000),
        rec_tot_ew_60s: h.rec_tot_ew_60s * Math.exp(-age60 / 60_000),
        rate_10s: h.rate_10s * Math.exp(-age10 / 10_000),
        rate_60s: h.rate_60s * Math.exp(-age60 / 60_000),
    };
}
