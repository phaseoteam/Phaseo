// Purpose: Pipeline module for the gateway request lifecycle.
// Why: Keeps stage-specific logic isolated and testable.
// How: Exposes helpers used by before/execute/after orchestration.

import { dispatchBackground, getCache, getSupabaseAdmin } from "@/runtime/env";
import { HEALTH_CONSTANTS, HEALTH_KEYS, isRecoveryProbeRequest } from "./health.config";
import type { Endpoint } from "@core/types";
import { coordinatedHealthEnabled, coordinatedHealthMany, coordinatedHealthRead, reportCoordinatedHealth, resetCoordinatedHealthForTests } from "./health-coordinator";

export type BreakerState = "closed" | "open" | "half_open";
export type HealthImpact = "success" | "failure" | "neutral";

export type ProviderHealth = {
    endpoint: Endpoint;
    provider: string;
    model: string;

    lat_ewma_10s: number;
    lat_ewma_60s: number;
    lat_ewma_300s: number;

    err_ewma_10s: number;
    err_ewma_60s: number;
    err_ewma_300s: number;

    rate_10s: number;
    rate_60s: number;
    tp_ewma_60s: number;

    rec_ok_ew_60s: number;
    rec_tot_ew_60s: number;
    rec_ok_ew_10s?: number;
    rec_tot_ew_10s?: number;
    rec_rate_limited_ew_10s?: number;
    last_success_ms?: number;
    consecutive_failures?: number;

    // Legacy snapshot fields; no longer maintained or used for routing.
    inflight: number;
    current_load: number;

    breaker: BreakerState;
    breaker_until_ms: number;
    breaker_attempts: number;

    last_ts_10s: number;
    last_ts_60s: number;
    last_ts_300s: number;
    last_updated: number;
};

function normalizeHealthSignal(value: unknown): string {
    return String(value ?? "").trim().toLowerCase();
}

function isRateLimitSignal(value: unknown): boolean {
    const normalized = normalizeHealthSignal(value);
    if (!normalized) return false;
    return (
        normalized.includes("rate limit") ||
        normalized.includes("rate_limit") ||
        normalized.includes("too many requests") ||
        normalized.includes("ratelimit") ||
        normalized.includes("quota exceeded")
    );
}

export function classifyProviderHealthImpact(args: {
    upstreamStatus?: number | null;
    aborted?: boolean;
	midStreamError?: boolean;
	finishReason?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    credentialSource?: "gateway" | "byok";
    failureOrigin?: "provider" | "gateway" | "client";
}): HealthImpact {
    if (args.aborted || args.failureOrigin === "client" || args.failureOrigin === "gateway") return "neutral";
    const status = Number(args.upstreamStatus ?? 0);
    // Credential ownership remains authoritative if a stream also reports an error.
    if (args.credentialSource === "byok" && [401, 402, 403, 429].includes(status)) return "neutral";
	if (args.midStreamError) return "failure";
	const finishReason = normalizeHealthSignal(args.finishReason);
	if (finishReason === "error" || finishReason === "failed" || finishReason === "failure" || finishReason === "upstream_failure") {
		return "failure";
	}

    if (Number.isFinite(status) && status >= 200 && status < 300) {
        return "success";
    }
	// A user's own key/quota is not evidence against the shared managed route.
	if (status === 429 || status === 408) return "failure";
	// Authentication, billing, model lookup and request validation describe a
	// credential/request/configuration problem, not shared provider reliability.
	if (status >= 400 && status < 500) return "neutral";
	if (status >= 500 && status < 600) return "failure";
    if (isRateLimitSignal(args.errorCode) || isRateLimitSignal(args.errorMessage)) {
        return args.credentialSource !== "byok" && args.failureOrigin === "provider" ? "failure" : "neutral";
    }
    const code = normalizeHealthSignal(args.errorCode);
    if (/^(econnreset|econnrefused|etimedout|ehostunreach|enetunreach|und_err_(connect_timeout|headers_timeout|body_timeout|socket))$/.test(code)) return args.failureOrigin === "provider" ? "failure" : "neutral";
    // Unknown exceptions may be request mapping, billing, or gateway bugs.
    // Only explicit upstream evidence should affect provider selection.
    return args.failureOrigin === "provider" ? "failure" : "neutral";
}

type ProviderConfigField = "err_open_th" | "base_open_secs" | "max_open_secs" | "load_soft_cap";

const NUMERIC_DEFAULTS: Record<keyof Omit<ProviderHealth, "endpoint" | "provider" | "model" | "breaker">, number> = {
    lat_ewma_10s: 800,
    lat_ewma_60s: 800,
    lat_ewma_300s: 800,
    err_ewma_10s: 0,
    err_ewma_60s: 0,
    err_ewma_300s: 0,
    rate_10s: 0,
    rate_60s: 0,
    tp_ewma_60s: 0,
    rec_ok_ew_60s: 0,
    rec_tot_ew_60s: 0,
    rec_ok_ew_10s: 0,
    rec_tot_ew_10s: 0,
    rec_rate_limited_ew_10s: 0,
    last_success_ms: 0,
    consecutive_failures: 0,
    inflight: 0,
    current_load: 0,
    breaker_until_ms: 0,
    breaker_attempts: 0,
    last_ts_10s: 0,
    last_ts_60s: 0,
    last_ts_300s: 0,
    last_updated: 0,
};

const CONFIG_DEFAULTS: Record<ProviderConfigField, number> = {
    err_open_th: HEALTH_CONSTANTS.ERROR_RATE_OPEN_THRESHOLD,
    base_open_secs: HEALTH_CONSTANTS.BASE_OPEN_SECS,
    max_open_secs: HEALTH_CONSTANTS.MAX_OPEN_SECS,
    load_soft_cap: HEALTH_CONSTANTS.LOAD_SOFT_CAP,
};

const breakerField = (provider: string) => `${provider}::breaker`;
const field = (provider: string, metric: string) => `${provider}::${metric}`;

const HEALTH_STATE_TTL_SECONDS = 24 * 60 * 60;
// KV requires expirationTtl >= 60 seconds. Retain sparse recovery probes long
// enough to accumulate a batch; each recorded probe refreshes this TTL.
const HALF_STATE_TTL_SECONDS = HEALTH_CONSTANTS.MAX_OPEN_SECS;
const HEALTH_L1_TTL_MS = 1_000;

type L1StateEntry = {
    map: Record<string, string>;
    expiresAtMs: number;
};

const l1State = new Map<string, L1StateEntry>();
const l1StateInflight = new Map<string, Promise<Record<string, string>>>();
const pendingBackgroundSaves = new Map<string, { map: Record<string, string>; ttlSeconds: number }>();
const activeBackgroundSave = new Set<string>();
const keyUpdateQueues = new Map<string, Array<() => void>>();
let healthStateEpoch = 0;

async function withKeyUpdateLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const queue = keyUpdateQueues.get(key);
    if (queue) {
        await new Promise<void>((resolve) => queue.push(resolve));
    } else {
        keyUpdateQueues.set(key, []);
    }

    try {
        return await fn();
    } finally {
        const activeQueue = keyUpdateQueues.get(key);
        if (!activeQueue) return;
        const next = activeQueue.shift();
        if (next) {
            next();
        } else {
            keyUpdateQueues.delete(key);
        }
    }
}

type BreakerPersistPayload = {
	endpoint: Endpoint;
	provider: string;
	model: string;
	breaker: BreakerState;
	breakerUntilMs: number;
	reason: string;
};

function persistBreakerState(payload: BreakerPersistPayload) {
	const nowIso = new Date().toISOString();
	const openUntilIso =
		payload.breakerUntilMs > 0
			? new Date(payload.breakerUntilMs).toISOString()
			: null;

	const row = {
		provider_id: payload.provider,
		model_id: payload.model,
		endpoint: payload.endpoint,
		breaker_state: payload.breaker,
		is_deranked: payload.breaker === "open" && payload.breakerUntilMs > Date.now(),
		open_until_ms: payload.breakerUntilMs,
		open_until: openUntilIso,
		last_transition_at: nowIso,
		updated_at: nowIso,
		last_reason: payload.reason,
	};

	dispatchBackground(
		Promise.resolve(
			getSupabaseAdmin()
			.from("gateway_provider_health_states")
			.upsert(row, { onConflict: "provider_id,model_id,endpoint" }),
		)
			.then(({ error }) => {
				if (error) {
					console.error("[health] persist breaker state failed", {
						provider: payload.provider,
						model: payload.model,
						endpoint: payload.endpoint,
						breaker: payload.breaker,
						error: error.message,
					});
				}
			})
			.catch((error) => {
				console.error("[health] persist breaker state exception", {
					provider: payload.provider,
					model: payload.model,
					endpoint: payload.endpoint,
					breaker: payload.breaker,
					error: error instanceof Error ? error.message : String(error),
				});
			}),
	);
}

function asNum(value: unknown, fallback = 0): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function normalizeMap(input: unknown): Record<string, string> {
    if (!input || typeof input !== "object") return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (value === undefined || value === null) continue;
        out[key] = String(value);
    }
    return out;
}

function isHalfStateKey(key: string): boolean {
    return key.includes(":half:");
}

function isHealthStateKey(key: string): boolean {
    return key.startsWith("gw:health:") && !isHalfStateKey(key);
}

function providerFromFieldKey(fieldKey: string): string | null {
    const sep = fieldKey.indexOf("::");
    if (sep <= 0) return null;
    return fieldKey.slice(0, sep);
}

function collectProviderFields(map: Record<string, string>): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const key of Object.keys(map)) {
        const provider = providerFromFieldKey(key);
        if (!provider) continue;
        const existing = out.get(provider);
        if (existing) {
            existing.push(key);
        } else {
            out.set(provider, [key]);
        }
    }
    return out;
}

function mergeHealthStateMaps(existing: Record<string, string>, candidate: Record<string, string>): Record<string, string> {
    const merged: Record<string, string> = { ...existing };
    const existingByProvider = collectProviderFields(existing);
    const candidateByProvider = collectProviderFields(candidate);
    const providers = new Set<string>([
        ...existingByProvider.keys(),
        ...candidateByProvider.keys(),
    ]);

    for (const provider of providers) {
        const existingTs = asNum(existing[field(provider, "last_updated")], 0);
        const candidateTs = asNum(candidate[field(provider, "last_updated")], 0);
        const useCandidate = candidateTs >= existingTs;
        const primary = useCandidate ? candidate : existing;
        const secondary = useCandidate ? existing : candidate;
        const keys = new Set<string>([
            ...(existingByProvider.get(provider) ?? []),
            ...(candidateByProvider.get(provider) ?? []),
        ]);

        for (const key of keys) {
            const selected = primary[key] ?? secondary[key];
            if (selected === undefined) {
                delete merged[key];
            } else {
                merged[key] = String(selected);
            }
        }
    }

    // Preserve non-provider fields with candidate precedence.
    for (const key of new Set([...Object.keys(existing), ...Object.keys(candidate)])) {
        if (providerFromFieldKey(key)) continue;
        const selected = candidate[key] ?? existing[key];
        if (selected === undefined) {
            delete merged[key];
        } else {
            merged[key] = String(selected);
        }
    }

    return merged;
}

function mergeHalfStateMaps(existing: Record<string, string>, candidate: Record<string, string>): Record<string, string> {
    const merged: Record<string, string> = { ...existing, ...candidate };
    merged.ok = String(Math.max(asNum(existing.ok, 0), asNum(candidate.ok, 0)));
    merged.cnt = String(Math.max(asNum(existing.cnt, 0), asNum(candidate.cnt, 0)));
    merged.p = String(asNum(candidate.p ?? existing.p, HEALTH_CONSTANTS.HALF_OPEN_PROBE_RATIO));
    return merged;
}

async function persistMapWithMerge(
    key: string,
    candidateMap: Record<string, string>,
    ttlSeconds: number,
    epoch = healthStateEpoch,
) {
    if (epoch !== healthStateEpoch) return;
    try {
        let mapToWrite = { ...candidateMap };
        const raw = await getCache().get(key, "text");
        if (epoch !== healthStateEpoch) return;
        if (raw) {
            try {
                const existing = normalizeMap(JSON.parse(raw));
                if (isHealthStateKey(key)) {
                    mapToWrite = mergeHealthStateMaps(existing, mapToWrite);
                } else if (isHalfStateKey(key)) {
                    mapToWrite = mergeHalfStateMaps(existing, mapToWrite);
                } else {
                    mapToWrite = { ...existing, ...mapToWrite };
                }
            } catch {
                // Ignore malformed existing payload; candidate map is authoritative.
            }
        }
        if (epoch !== healthStateEpoch) return;
        await getCache().put(key, JSON.stringify(mapToWrite), { expirationTtl: ttlSeconds });
        if (epoch !== healthStateEpoch) return;
        l1State.set(key, { map: { ...mapToWrite }, expiresAtMs: Date.now() + HEALTH_L1_TTL_MS });
    } catch {
        // Ignore KV write failures.
    }
}

async function loadMapByKey(key: string): Promise<Record<string, string>> {
    const now = Date.now();
    const l1 = l1State.get(key);
    if (l1 && l1.expiresAtMs > now) {
        return { ...l1.map };
    }
    if (l1 && l1.expiresAtMs <= now) {
        l1State.delete(key);
    }

    const inflight = l1StateInflight.get(key);
    if (inflight) {
        return { ...(await inflight) };
    }

    const loader = (async () => {
        try {
            const raw = await getCache().get(key, "text");
            if (!raw) {
                const empty: Record<string, string> = {};
                l1State.set(key, { map: { ...empty }, expiresAtMs: now + HEALTH_L1_TTL_MS });
                return empty;
            }
            try {
                const normalized = normalizeMap(JSON.parse(raw));
                l1State.set(key, { map: { ...normalized }, expiresAtMs: now + HEALTH_L1_TTL_MS });
                return normalized;
            } catch {
                const empty: Record<string, string> = {};
                l1State.set(key, { map: { ...empty }, expiresAtMs: now + HEALTH_L1_TTL_MS });
                return empty;
            }
        } catch {
            // Fail open to in-memory defaults when KV is unavailable.
            const empty: Record<string, string> = {};
            l1State.set(key, { map: { ...empty }, expiresAtMs: now + HEALTH_L1_TTL_MS });
            return empty;
        }
    })();

    l1StateInflight.set(key, loader);

    try {
        return { ...(await loader) };
    } finally {
        if (l1StateInflight.get(key) === loader) {
            l1StateInflight.delete(key);
        }
    }
}

function queueBackgroundSave(key: string) {
    if (activeBackgroundSave.has(key)) return;
    activeBackgroundSave.add(key);
    const epoch = healthStateEpoch;

    dispatchBackground((async () => {
        try {
            while (true) {
                if (epoch !== healthStateEpoch) return;
                const pending = pendingBackgroundSaves.get(key);
                if (!pending) return;
                pendingBackgroundSaves.delete(key);
                await persistMapWithMerge(key, pending.map, pending.ttlSeconds, epoch);
            }
        } finally {
            activeBackgroundSave.delete(key);
            if (epoch === healthStateEpoch && pendingBackgroundSaves.has(key)) {
                queueBackgroundSave(key);
            }
        }
    })());
}

type SaveMapMode = "sync" | "background";

async function saveMap(
    key: string,
    map: Record<string, string>,
    ttlSeconds = HEALTH_STATE_TTL_SECONDS,
    mode: SaveMapMode = "sync"
) {
    const normalized = normalizeMap(map);
    l1State.set(key, { map: { ...normalized }, expiresAtMs: Date.now() + HEALTH_L1_TTL_MS });
    if (mode === "background") {
        pendingBackgroundSaves.set(key, { map: { ...normalized }, ttlSeconds });
        queueBackgroundSave(key);
        return;
    }
    await persistMapWithMerge(key, normalized, ttlSeconds);
}

async function updateMap(
    key: string,
    updater: (map: Record<string, string>) => Record<string, string> | void,
    ttlSeconds = HEALTH_STATE_TTL_SECONDS,
    mode: SaveMapMode = "sync",
): Promise<Record<string, string>> {
    return withKeyUpdateLock(key, async () => {
        const current = await loadMapByKey(key);
        const before = JSON.stringify(current);
        const working = { ...current };
        const next = updater(working);
        const updated = normalizeMap(next && typeof next === "object" ? next : working);
        const after = JSON.stringify(updated);
        if (after !== before) {
            await saveMap(key, updated, ttlSeconds, mode);
        }
        return updated;
    });
}

function readNumber<T extends keyof typeof NUMERIC_DEFAULTS>(
    map: Record<string, string>,
    provider: string,
    metric: T
): number {
    return asNum(map[field(provider, metric)], NUMERIC_DEFAULTS[metric]);
}

function readConfig(
    map: Record<string, string>,
    provider: string,
    metric: ProviderConfigField
): number {
    return asNum(map[field(provider, metric)], CONFIG_DEFAULTS[metric]);
}

function readBreaker(map: Record<string, string>, provider: string): BreakerState {
    const raw = map[breakerField(provider)];
    if (raw === "open" || raw === "half_open") return raw;
    return "closed";
}

function snapshotFromMap(
    endpoint: Endpoint,
    provider: string,
    model: string,
    map: Record<string, string>
): ProviderHealth {
    return {
        endpoint,
        provider,
        model,
        lat_ewma_10s: readNumber(map, provider, "lat_ewma_10s"),
        lat_ewma_60s: readNumber(map, provider, "lat_ewma_60s"),
        lat_ewma_300s: readNumber(map, provider, "lat_ewma_300s"),
        err_ewma_10s: readNumber(map, provider, "err_ewma_10s"),
        err_ewma_60s: readNumber(map, provider, "err_ewma_60s"),
        err_ewma_300s: readNumber(map, provider, "err_ewma_300s"),
        rate_10s: readNumber(map, provider, "rate_10s"),
        rate_60s: readNumber(map, provider, "rate_60s"),
        tp_ewma_60s: readNumber(map, provider, "tp_ewma_60s"),
        rec_ok_ew_60s: readNumber(map, provider, "rec_ok_ew_60s"),
        rec_tot_ew_60s: readNumber(map, provider, "rec_tot_ew_60s"),
        rec_ok_ew_10s: readNumber(map, provider, "rec_ok_ew_10s"),
        rec_tot_ew_10s: readNumber(map, provider, "rec_tot_ew_10s"),
        rec_rate_limited_ew_10s: readNumber(map, provider, "rec_rate_limited_ew_10s"),
        last_success_ms: readNumber(map, provider, "last_success_ms"),
        consecutive_failures: readNumber(map, provider, "consecutive_failures"),
        inflight: readNumber(map, provider, "inflight"),
        current_load: readNumber(map, provider, "current_load"),
        breaker: readBreaker(map, provider),
        breaker_until_ms: readNumber(map, provider, "breaker_until_ms"),
        breaker_attempts: readNumber(map, provider, "breaker_attempts"),
        last_ts_10s: readNumber(map, provider, "last_ts_10s"),
        last_ts_60s: readNumber(map, provider, "last_ts_60s"),
        last_ts_300s: readNumber(map, provider, "last_ts_300s"),
        last_updated: readNumber(map, provider, "last_updated"),
    };
}

async function loadStateMap(endpoint: Endpoint, model: string): Promise<Record<string, string>> {
    const key = HEALTH_KEYS.health(endpoint, model);
    return loadMapByKey(key);
}

function refreshStateMapInBackground(key: string): void {
    dispatchBackground(loadMapByKey(key).then(() => undefined));
}

async function setHealthFields(endpoint: Endpoint, model: string, updates: Record<string, string | number>) {
    const key = HEALTH_KEYS.health(endpoint, model);
    await updateMap(key, (map) => {
        for (const [k, v] of Object.entries(updates)) {
            map[k] = String(v);
        }
        return map;
    });
}

async function loadHalfMap(endpoint: Endpoint, provider: string, model: string): Promise<Record<string, string>> {
    const key = HEALTH_KEYS.half(endpoint, model, provider);
    return loadMapByKey(key);
}

async function deleteHalf(endpoint: Endpoint, provider: string, model: string) {
    const key = HEALTH_KEYS.half(endpoint, model, provider);
    try {
        await getCache().delete(key);
        l1State.delete(key);
        pendingBackgroundSaves.delete(key);
    } catch {
        // Ignore KV delete failures.
    }
}

export async function readHealth(
    endpoint: Endpoint,
    provider: string,
    model: string
): Promise<ProviderHealth> {
    if (coordinatedHealthEnabled()) return (await coordinatedHealthRead(endpoint, model, [provider]))[provider];
    const map = await loadStateMap(endpoint, model);
    return snapshotFromMap(endpoint, provider, model, map);
}

export async function readHealthMany(
    endpoint: Endpoint,
    model: string,
    providers: string[]
): Promise<Record<string, ProviderHealth>> {
    if (coordinatedHealthEnabled()) return coordinatedHealthRead(endpoint, model, providers);
    if (!providers.length) return {};
    const map = await loadStateMap(endpoint, model);
    const out: Record<string, ProviderHealth> = {};
    for (const provider of providers) {
        out[provider] = snapshotFromMap(endpoint, provider, model, map);
    }
    return out;
}

/**
 * Returns the isolate-local health snapshot without putting KV on the routing
 * critical path. Missing or expired state is refreshed through waitUntil;
 * safe defaults (or the last snapshot) are used for the current request.
 */
export function readHealthManyOptimistic(
    endpoint: Endpoint,
    model: string,
    providers: string[]
): Record<string, ProviderHealth> {
    if (coordinatedHealthEnabled()) return coordinatedHealthMany(endpoint, model, providers);
    if (!providers.length) return {};

    const key = HEALTH_KEYS.health(endpoint, model);
    const cached = l1State.get(key);
    if (!cached || cached.expiresAtMs <= Date.now()) {
        refreshStateMapInBackground(key);
    }

    const map = cached?.map ?? {};
    const out: Record<string, ProviderHealth> = {};
    for (const provider of providers) {
        out[provider] = snapshotFromMap(endpoint, provider, model, map);
    }
    return out;
}

async function openBreaker(endpoint: Endpoint, provider: string, model: string) {
    const key = HEALTH_KEYS.health(endpoint, model);
    let breakerUntilMs = 0;
    await updateMap(key, (map) => {
        const now = Date.now();
        // In-flight failures must not repeatedly extend an already-open breaker.
        if (readBreaker(map, provider) === "open") return map;
        const attempts = readNumber(map, provider, "breaker_attempts") + 1;
        const base = readConfig(map, provider, "base_open_secs");
        const maxs = readConfig(map, provider, "max_open_secs");
        const duration = Math.min(base * Math.pow(2, Math.max(0, attempts - 1)), maxs);
        breakerUntilMs = now + duration * 1000;
        map[breakerField(provider)] = "open";
        map[field(provider, "breaker_attempts")] = String(attempts);
        map[field(provider, "breaker_until_ms")] = String(breakerUntilMs);
        map[field(provider, "last_updated")] = String(now);
        return map;
    });
    if (!breakerUntilMs) return;
    await deleteHalf(endpoint, provider, model);
    persistBreakerState({
        endpoint,
        provider,
        model,
        breaker: "open",
        breakerUntilMs,
        reason: "open_breaker",
    });
}

async function closeBreaker(endpoint: Endpoint, provider: string, model: string) {
    const key = HEALTH_KEYS.health(endpoint, model);
    await updateMap(key, (map) => {
        const now = Date.now();
        map[breakerField(provider)] = "closed";
        map[field(provider, "breaker_attempts")] = "0";
        map[field(provider, "breaker_until_ms")] = "0";
        map[field(provider, "last_updated")] = String(now);
        // Successful recovery starts a fresh decision window; do not reopen
        // immediately from the previous outage's observations.
        for (const horizon of ["10s", "60s"]) {
            map[field(provider, `rec_ok_ew_${horizon}`)] = String(HEALTH_CONSTANTS.HALF_OPEN_MIN_PROBES);
            map[field(provider, `rec_tot_ew_${horizon}`)] = String(HEALTH_CONSTANTS.HALF_OPEN_MIN_PROBES);
            map[field(provider, `err_ewma_${horizon}`)] = "0";
        }
        map[field(provider, "rec_rate_limited_ew_10s")] = "0";
        return map;
    });
    persistBreakerState({
        endpoint,
        provider,
        model,
        breaker: "closed",
        breakerUntilMs: 0,
        reason: "close_breaker",
    });
    await deleteHalf(endpoint, provider, model);
}

async function ensureHalfOpen(endpoint: Endpoint, provider: string, model: string) {
    const key = HEALTH_KEYS.half(endpoint, model, provider);
    await updateMap(key, (map) => {
        if (!("p" in map)) map.p = String(HEALTH_CONSTANTS.HALF_OPEN_PROBE_RATIO);
        if (!("ok" in map)) map.ok = "0";
        if (!("cnt" in map)) map.cnt = "0";
        return map;
    }, HALF_STATE_TTL_SECONDS);
}

async function readHalf(endpoint: Endpoint, provider: string, model: string) {
    const map = await loadHalfMap(endpoint, provider, model);
    if (!Object.keys(map).length) return null;
    return {
        p: asNum(map.p, HEALTH_CONSTANTS.HALF_OPEN_PROBE_RATIO),
        ok: asNum(map.ok, 0),
        cnt: asNum(map.cnt, 0),
    };
}

async function incrHalf(endpoint: Endpoint, provider: string, model: string, ok: boolean) {
    const key = HEALTH_KEYS.half(endpoint, model, provider);
    await updateMap(key, (map) => {
        const cnt = asNum(map.cnt, 0) + 1;
        const okCount = asNum(map.ok, 0) + (ok ? 1 : 0);
        map.cnt = String(cnt);
        map.ok = String(okCount);
        if (!("p" in map)) map.p = String(HEALTH_CONSTANTS.HALF_OPEN_PROBE_RATIO);
        return map;
    }, HALF_STATE_TTL_SECONDS);
}

function allowSample(workspaceId: string, requestId: string, p: number) {
    return isRecoveryProbeRequest(workspaceId, requestId, p);
}

export async function admitThroughBreaker(
    endpoint: Endpoint,
    provider: string,
    model: string,
    workspaceId: string,
    requestId: string,
    snapshot?: ProviderHealth
): Promise<"blocked" | "probe" | "closed"> {
    if (coordinatedHealthEnabled()) {
        const latest = coordinatedHealthMany(endpoint, model, [provider])[provider];
        const h = snapshot && snapshot.last_updated > latest.last_updated ? snapshot : latest;
        if (h.breaker === "closed") return "closed";
        if (Date.now() < h.breaker_until_ms) return "blocked";
        return allowSample(workspaceId, requestId, HEALTH_CONSTANTS.HALF_OPEN_PROBE_RATIO) ? "probe" : "blocked";
    }
    if (snapshot) {
        const latest = l1State.get(HEALTH_KEYS.health(endpoint, model));
        if (latest && asNum(latest.map[field(provider, "last_updated")]) >= snapshot.last_updated) {
            snapshot = snapshotFromMap(endpoint, provider, model, latest.map);
        }
        let state = snapshot.breaker;
        const now = Date.now();

        if (state === "open") {
            if (now >= snapshot.breaker_until_ms) {
                await setHealthFields(endpoint, model, {
                    [breakerField(provider)]: "half_open",
                    [field(provider, "last_updated")]: now,
                });
                persistBreakerState({
                    endpoint,
                    provider,
                    model,
                    breaker: "half_open",
                    breakerUntilMs: snapshot.breaker_until_ms ?? 0,
                    reason: "open_to_half_open",
                });
                state = "half_open";
            } else {
                return "blocked";
            }
        }

        if (state === "half_open") {
            await ensureHalfOpen(endpoint, provider, model);
            const half = await readHalf(endpoint, provider, model);
            if (!half) return "blocked";
            return allowSample(workspaceId, requestId, half.p) ? "probe" : "blocked";
        }
        return "closed";
    }

    const map = await loadStateMap(endpoint, model);
    let state = readBreaker(map, provider);
    const now = Date.now();
    const until = readNumber(map, provider, "breaker_until_ms");

    if (state === "open") {
        if (now >= until) {
            state = "half_open";
            await setHealthFields(endpoint, model, {
                [breakerField(provider)]: "half_open",
                [field(provider, "last_updated")]: now,
            });
            persistBreakerState({
                endpoint,
                provider,
                model,
                breaker: "half_open",
                breakerUntilMs: until,
                reason: "open_to_half_open",
            });
        } else {
            return "blocked";
        }
    }

    if (state === "half_open") {
        await ensureHalfOpen(endpoint, provider, model);
        const half = await readHalf(endpoint, provider, model);
        if (!half) return "blocked";
        return allowSample(workspaceId, requestId, half.p) ? "probe" : "blocked";
    }
    return "closed";
}

export async function reportProbeResult(
    endpoint: Endpoint,
    provider: string,
    model: string,
    ok: boolean
) {
    if (coordinatedHealthEnabled()) return; // Recorded atomically with the terminal outcome.
    const state = await loadStateMap(endpoint, model);
    if (readBreaker(state, provider) !== "half_open") return;
    await incrHalf(endpoint, provider, model, ok);
    const half = await readHalf(endpoint, provider, model);
    if (!half) return;
    const min = HEALTH_CONSTANTS.HALF_OPEN_MIN_PROBES;
    const threshold = HEALTH_CONSTANTS.ERROR_RATE_OPEN_THRESHOLD;
    if (half.cnt >= min) {
        const errRate = half.cnt > 0 ? 1 - (half.ok / half.cnt) : 1;
        if (half.ok === half.cnt) await closeBreaker(endpoint, provider, model);
        else if (errRate >= threshold) await openBreaker(endpoint, provider, model);
        else await deleteHalf(endpoint, provider, model); // retry a clean batch; never remain stuck on one failed probe
    }
}

export async function maybeOpenOnRecentErrors(
    endpoint: Endpoint,
    provider: string,
    model: string
) {
    if (coordinatedHealthEnabled()) return; // The shared reducer owns breaker transitions.
    const map = await loadStateMap(endpoint, model);
    if (readBreaker(map, provider) !== "closed") return;
    // Rate limits degrade routing scores, but are not evidence of an outage.
    // Conflating saturation with downtime can open every provider under load.
    const tot = Math.max(0, readNumber(map, provider, "rec_tot_ew_10s") - readNumber(map, provider, "rec_rate_limited_ew_10s"));
    const ok = readNumber(map, provider, "rec_ok_ew_10s");
    const rate60 = readNumber(map, provider, "rate_10s");
    const threshold = readConfig(map, provider, "err_open_th");

    const expected = rate60 * 10;
    const minFloor = HEALTH_CONSTANTS.OPEN_MIN_TOTAL_FLOOR;
    const minFrac = HEALTH_CONSTANTS.OPEN_MIN_TOTAL_FRAC;
    const minNeeded = Math.max(minFloor, minFrac * expected);

    if (readNumber(map, provider, "consecutive_failures") >= HEALTH_CONSTANTS.OPEN_MIN_TOTAL_FLOOR) {
        await openBreaker(endpoint, provider, model);
        return;
    }
    if (tot < minNeeded) return;

    const errRate = 1 - (ok / Math.max(tot, 1));
    if (errRate >= threshold) await openBreaker(endpoint, provider, model);
}

export function resetHealthStateForTests(): void {
    resetCoordinatedHealthForTests();
    healthStateEpoch += 1;
    l1State.clear();
    l1StateInflight.clear();
    pendingBackgroundSaves.clear();
    activeBackgroundSave.clear();
    keyUpdateQueues.clear();
}

export async function onCallEnd(
    endpoint: Endpoint,
    params: {
        provider: string;
        model: string;
        ok: boolean;
        healthImpact?: HealthImpact;
        upstreamStatus?: number;
        errorCode?: string | null;
        errorMessage?: string | null;
        latency_ms: number;
        generation_ms?: number;
        tokens_in?: number;
        tokens_out?: number;
        observationId?: string;
        startedAt?: number;
        probe?: boolean;
    }
) {
    const { provider, model, ok, latency_ms } = params;
    const impact = params.healthImpact ?? (ok ? "success" : "failure");
    const rateLimited = impact === "failure" && (params.upstreamStatus === 429 || isRateLimitSignal(params.errorCode) || isRateLimitSignal(params.errorMessage));
    // Neutral outcomes have no health evidence to persist. There is no longer
    // an in-flight counter to decrement on cancellation or validation errors.
    if (impact === "neutral") return { rateLimited };
    const textGeneration = endpoint === "responses" || endpoint === "chat.completions" || endpoint === "messages";
    // Generated text speed excludes the prompt. Other endpoints retain their
    // existing token-volume metric (e.g. input tokens processed by embeddings).
    const tokens = Math.max(0, params.tokens_out ?? 0) + (textGeneration ? 0 : Math.max(0, params.tokens_in ?? 0));
    if (coordinatedHealthEnabled()) {
        const now = Date.now();
        const latency = Number.isFinite(latency_ms) ? Math.max(0, latency_ms) : 0;
        const generation = Number.isFinite(params.generation_ms) ? Math.max(0, params.generation_ms ?? 0) : 0;
        const tps = generation > 0 && tokens > 0 ? tokens / (generation / 1000) : null;
        reportCoordinatedHealth({
            id: params.observationId ?? crypto.randomUUID(), endpoint, model, provider,
            observedAt: now, startedAt: Number.isFinite(params.startedAt) ? Math.min(now, params.startedAt!) : now - latency - generation,
            ok: impact === "success", limited: rateLimited, probe: params.probe ?? false,
            latencyMs: latency,
            tps: tps !== null && Number.isFinite(tps) ? tps : null,
        });
        return { rateLimited };
    }
    const key = HEALTH_KEYS.health(endpoint, model);
    await updateMap(key, (map) => {
        const now = Date.now();
        map[field(provider, "last_updated")] = String(now);
        map[field(provider, "err_open_th")] = String(readConfig(map, provider, "err_open_th"));
        map[field(provider, "base_open_secs")] = String(readConfig(map, provider, "base_open_secs"));
        map[field(provider, "max_open_secs")] = String(readConfig(map, provider, "max_open_secs"));

        const tau10 = HEALTH_CONSTANTS.TAU_10S_MS;
        const tau60 = HEALTH_CONSTANTS.TAU_60S_MS;
        const tau300 = HEALTH_CONSTANTS.TAU_300S_MS;

        const last10 = readNumber(map, provider, "last_ts_10s");
        const last60 = readNumber(map, provider, "last_ts_60s");
        const last300 = readNumber(map, provider, "last_ts_300s");

        // The first observation initializes the EWMA. Treating its elapsed
        // time as zero would produce a decay of 1 and discard the signal.
        const decay10 = last10 > 0 ? Math.exp(-(now - last10) / tau10) : 0;
        const decay60 = last60 > 0 ? Math.exp(-(now - last60) / tau60) : 0;
        const decay300 = last300 > 0 ? Math.exp(-(now - last300) / tau300) : 0;

        const decay = (prev: number, sample: number, d: number) => prev * d + (1 - d) * sample;

		const healthOk = impact === "success";
        map[field(provider, "consecutive_failures")] = String(healthOk || rateLimited ? 0 : readNumber(map, provider, "consecutive_failures") + 1);
        const lastSuccess = readNumber(map, provider, "last_success_ms");
        const performanceDecay = (tau: number) => lastSuccess > 0 ? Math.exp(-(now-lastSuccess)/tau) : 0;
        // A quick error must never improve latency or retain invented throughput.
        const lat10 = healthOk ? decay(readNumber(map, provider, "lat_ewma_10s"), latency_ms, performanceDecay(tau10)) : readNumber(map, provider, "lat_ewma_10s");
        const lat60 = healthOk ? decay(readNumber(map, provider, "lat_ewma_60s"), latency_ms, performanceDecay(tau60)) : readNumber(map, provider, "lat_ewma_60s");
        const lat300 = healthOk ? decay(readNumber(map, provider, "lat_ewma_300s"), latency_ms, performanceDecay(tau300)) : readNumber(map, provider, "lat_ewma_300s");
        // Decayed counts include every completion, including simultaneous ones.
        const recOk10 = readNumber(map, provider, "rec_ok_ew_10s")*decay10 + Number(healthOk);
        const recTot10 = readNumber(map, provider, "rec_tot_ew_10s")*decay10 + 1;
        const recRateLimited10 = readNumber(map, provider, "rec_rate_limited_ew_10s")*decay10 + Number(rateLimited);
        const recOk = readNumber(map, provider, "rec_ok_ew_60s")*decay60 + Number(healthOk);
        const recTot = readNumber(map, provider, "rec_tot_ew_60s")*decay60 + 1;
        const err10 = 1-recOk10/recTot10;
        const err60 = 1-recOk/recTot;
        const err300 = decay(readNumber(map, provider, "err_ewma_300s"), Number(!healthOk), decay300);

        const rate10 = readNumber(map, provider, "rate_10s") * decay10 + (1000 / tau10);
        const rate60 = readNumber(map, provider, "rate_60s") * decay60 + (1000 / tau60);

        let tp60 = readNumber(map, provider, "tp_ewma_60s");
        if (healthOk && tokens > 0 && params.generation_ms && params.generation_ms > 0) {
            const tps = tokens / Math.max(params.generation_ms / 1000, 0.001);
            tp60 = decay(tp60, tps, performanceDecay(tau60));
        }
        if (healthOk) map[field(provider, "last_success_ms")] = String(now);
        map[field(provider, "rec_ok_ew_10s")] = String(recOk10);
        map[field(provider, "rec_tot_ew_10s")] = String(recTot10);
        map[field(provider, "rec_rate_limited_ew_10s")] = String(recRateLimited10);
        map[field(provider, "lat_ewma_10s")] = String(lat10);
        map[field(provider, "lat_ewma_60s")] = String(lat60);
        map[field(provider, "lat_ewma_300s")] = String(lat300);
        map[field(provider, "err_ewma_10s")] = String(err10);
        map[field(provider, "err_ewma_60s")] = String(err60);
        map[field(provider, "err_ewma_300s")] = String(err300);
        map[field(provider, "rate_10s")] = String(rate10);
        map[field(provider, "rate_60s")] = String(rate60);
        map[field(provider, "tp_ewma_60s")] = String(tp60);
        map[field(provider, "rec_ok_ew_60s")] = String(recOk);
        map[field(provider, "rec_tot_ew_60s")] = String(recTot);
        map[field(provider, "last_ts_10s")] = String(now);
        map[field(provider, "last_ts_60s")] = String(now);
        map[field(provider, "last_ts_300s")] = String(now);
        return map;
    }, HEALTH_STATE_TTL_SECONDS, "background");
    return { rateLimited };
}
