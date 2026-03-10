// Purpose: Pipeline module for the gateway request lifecycle.
// Why: Keeps stage-specific logic isolated and testable.
// How: Exposes helpers used by before/execute/after orchestration.

import { dispatchBackground, getCache, getSupabaseAdmin } from "@/runtime/env";
import { HEALTH_CONSTANTS, HEALTH_KEYS } from "./health.config";
import type { Endpoint } from "@core/types";

export type BreakerState = "closed" | "open" | "half_open";

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
const HALF_STATE_TTL_SECONDS = HEALTH_CONSTANTS.HALF_OPEN_TEST_SECS;
const HEALTH_L1_TTL_MS = 1_000;

type L1StateEntry = {
    map: Record<string, string>;
    expiresAtMs: number;
};

const l1State = new Map<string, L1StateEntry>();
const pendingBackgroundSaves = new Map<string, { map: Record<string, string>; ttlSeconds: number }>();
const activeBackgroundSave = new Set<string>();
const keyUpdateQueues = new Map<string, Array<() => void>>();

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
) {
    try {
        let mapToWrite = { ...candidateMap };
        const raw = await getCache().get(key, "text");
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
        await getCache().put(key, JSON.stringify(mapToWrite), { expirationTtl: ttlSeconds });
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
    try {
        const raw = await getCache().get(key, "text");
        if (!raw) {
            const empty: Record<string, string> = {};
            l1State.set(key, { map: { ...empty }, expiresAtMs: now + HEALTH_L1_TTL_MS });
            return { ...empty };
        }
        try {
            const normalized = normalizeMap(JSON.parse(raw));
            l1State.set(key, { map: { ...normalized }, expiresAtMs: now + HEALTH_L1_TTL_MS });
            return { ...normalized };
        } catch {
            const empty: Record<string, string> = {};
            l1State.set(key, { map: { ...empty }, expiresAtMs: now + HEALTH_L1_TTL_MS });
            return { ...empty };
        }
    } catch {
        // Fail open to in-memory defaults when KV is unavailable.
        const empty: Record<string, string> = {};
        l1State.set(key, { map: { ...empty }, expiresAtMs: now + HEALTH_L1_TTL_MS });
        return { ...empty };
    }
}

function queueBackgroundSave(key: string) {
    if (activeBackgroundSave.has(key)) return;
    activeBackgroundSave.add(key);

    dispatchBackground((async () => {
        try {
            while (true) {
                const pending = pendingBackgroundSaves.get(key);
                if (!pending) return;
                pendingBackgroundSaves.delete(key);
                await persistMapWithMerge(key, pending.map, pending.ttlSeconds);
            }
        } finally {
            activeBackgroundSave.delete(key);
            if (pendingBackgroundSaves.has(key)) {
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
    const map = await loadStateMap(endpoint, model);
    return snapshotFromMap(endpoint, provider, model, map);
}

export async function readHealthMany(
    endpoint: Endpoint,
    model: string,
    providers: string[]
): Promise<Record<string, ProviderHealth>> {
    if (!providers.length) return {};
    const map = await loadStateMap(endpoint, model);
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

function allowSample(teamId: string, requestId: string, p: number) {
    const s = `${teamId}|${requestId}`;
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    const frac = (h >>> 0) / 0xffffffff;
    return frac < p;
}

export async function admitThroughBreaker(
    endpoint: Endpoint,
    provider: string,
    model: string,
    teamId: string,
    requestId: string,
    snapshot?: ProviderHealth
): Promise<"blocked" | "probe" | "closed"> {
    if (snapshot) {
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
            return allowSample(teamId, requestId, half.p) ? "probe" : "blocked";
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
        return allowSample(teamId, requestId, half.p) ? "probe" : "blocked";
    }
    return "closed";
}

export async function reportProbeResult(
    endpoint: Endpoint,
    provider: string,
    model: string,
    ok: boolean
) {
    await incrHalf(endpoint, provider, model, ok);
    const half = await readHalf(endpoint, provider, model);
    if (!half) return;
    const min = HEALTH_CONSTANTS.HALF_OPEN_MIN_PROBES;
    const threshold = HEALTH_CONSTANTS.ERROR_RATE_OPEN_THRESHOLD;
    if (half.cnt >= min) {
        const errRate = half.cnt > 0 ? 1 - (half.ok / half.cnt) : 1;
        if (half.ok === half.cnt) await closeBreaker(endpoint, provider, model);
        else if (errRate >= threshold) await openBreaker(endpoint, provider, model);
    }
}

export async function maybeOpenOnRecentErrors(
    endpoint: Endpoint,
    provider: string,
    model: string
) {
    const map = await loadStateMap(endpoint, model);
    const tot = readNumber(map, provider, "rec_tot_ew_60s");
    const ok = readNumber(map, provider, "rec_ok_ew_60s");
    const rate60 = readNumber(map, provider, "rate_60s");
    const threshold = readConfig(map, provider, "err_open_th");

    const expected = rate60 * 60;
    const minFloor = HEALTH_CONSTANTS.OPEN_MIN_TOTAL_FLOOR;
    const minFrac = HEALTH_CONSTANTS.OPEN_MIN_TOTAL_FRAC;
    const minNeeded = Math.max(minFloor, minFrac * expected);

    if (tot < minNeeded) return;

    const errRate = 1 - (ok / Math.max(tot, 1));
    if (errRate >= threshold) await openBreaker(endpoint, provider, model);
}

export async function onCallStart(endpoint: Endpoint, provider: string, model: string) {
    const key = HEALTH_KEYS.health(endpoint, model);
    await updateMap(key, (map) => {
        const now = Date.now();
        const inflightField = field(provider, "inflight");
        const currentInflight = asNum(map[inflightField], 0);
        const inflight = currentInflight + 1;
        const softCap = Math.max(CONFIG_DEFAULTS.load_soft_cap, 1);
        map[inflightField] = String(inflight);
        map[field(provider, "current_load")] = String(Math.min(1, inflight / softCap));
        map[field(provider, "last_updated")] = String(now);
        return map;
    }, HEALTH_STATE_TTL_SECONDS, "background");
}

export async function onCallEnd(
    endpoint: Endpoint,
    params: {
        provider: string;
        model: string;
        ok: boolean;
        latency_ms: number;
        generation_ms?: number;
        tokens_in?: number;
        tokens_out?: number;
    }
) {
    const { provider, model, ok, latency_ms } = params;
    const tokens = (params.tokens_in ?? 0) + (params.tokens_out ?? 0);
    const key = HEALTH_KEYS.health(endpoint, model);
    await updateMap(key, (map) => {
        const now = Date.now();
        const tau10 = HEALTH_CONSTANTS.TAU_10S_MS;
        const tau60 = HEALTH_CONSTANTS.TAU_60S_MS;
        const tau300 = HEALTH_CONSTANTS.TAU_300S_MS;

        const last10 = readNumber(map, provider, "last_ts_10s") || now;
        const last60 = readNumber(map, provider, "last_ts_60s") || now;
        const last300 = readNumber(map, provider, "last_ts_300s") || now;

        const decay10 = Math.exp(-(now - last10) / tau10);
        const decay60 = Math.exp(-(now - last60) / tau60);
        const decay300 = Math.exp(-(now - last300) / tau300);

        const decay = (prev: number, sample: number, d: number) => prev * d + (1 - d) * sample;

        const lat10 = decay(readNumber(map, provider, "lat_ewma_10s"), latency_ms, decay10);
        const lat60 = decay(readNumber(map, provider, "lat_ewma_60s"), latency_ms, decay60);
        const lat300 = decay(readNumber(map, provider, "lat_ewma_300s"), latency_ms, decay300);

        const errSample = ok ? 0 : 1;
        const err10 = decay(readNumber(map, provider, "err_ewma_10s"), errSample, decay10);
        const err60 = decay(readNumber(map, provider, "err_ewma_60s"), errSample, decay60);
        const err300 = decay(readNumber(map, provider, "err_ewma_300s"), errSample, decay300);

        const rate10 = readNumber(map, provider, "rate_10s") * decay10 + (1000 / tau10);
        const rate60 = readNumber(map, provider, "rate_60s") * decay60 + (1000 / tau60);

        let tp60 = readNumber(map, provider, "tp_ewma_60s");
        if (tokens > 0 && params.generation_ms && params.generation_ms > 0) {
            const tps = tokens / Math.max(params.generation_ms / 1000, 0.001);
            tp60 = decay(tp60, tps, decay60);
        }

        const recOk = decay(readNumber(map, provider, "rec_ok_ew_60s"), ok ? 1 : 0, decay60);
        const recTot = decay(readNumber(map, provider, "rec_tot_ew_60s"), 1, decay60);

        const softCap = readConfig(map, provider, "load_soft_cap");
        const inflightField = field(provider, "inflight");
        const inflight = Math.max(asNum(map[inflightField], 0) - 1, 0);
        const load = Math.min(1, inflight / Math.max(softCap, 1));

        map[inflightField] = String(inflight);
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
        map[field(provider, "current_load")] = String(load);
        map[field(provider, "last_updated")] = String(now);
        map[field(provider, "load_soft_cap")] = String(softCap);
        map[field(provider, "err_open_th")] = String(readConfig(map, provider, "err_open_th"));
        map[field(provider, "base_open_secs")] = String(readConfig(map, provider, "base_open_secs"));
        map[field(provider, "max_open_secs")] = String(readConfig(map, provider, "max_open_secs"));
        return map;
    }, HEALTH_STATE_TTL_SECONDS, "background");
}
