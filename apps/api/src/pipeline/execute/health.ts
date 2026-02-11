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

async function loadMapByKey(key: string): Promise<Record<string, string>> {
    const raw = await getCache().get(key, "text");
    if (!raw) return {};
    try {
        return normalizeMap(JSON.parse(raw));
    } catch {
        return {};
    }
}

async function saveMap(key: string, map: Record<string, string>, ttlSeconds = HEALTH_STATE_TTL_SECONDS) {
    await getCache().put(key, JSON.stringify(map), { expirationTtl: ttlSeconds });
}

async function updateMap(
    key: string,
    updater: (map: Record<string, string>) => Record<string, string> | void,
    ttlSeconds = HEALTH_STATE_TTL_SECONDS
): Promise<Record<string, string>> {
    const map = await loadMapByKey(key);
    const next = updater(map);
    const updated: Record<string, string> = next && typeof next === "object" ? next : map;
    await saveMap(key, updated, ttlSeconds);
    return updated;
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

async function incrHealthField(endpoint: Endpoint, model: string, fieldKey: string, delta: number): Promise<number> {
    const key = HEALTH_KEYS.health(endpoint, model);
    let nextValue = 0;
    await updateMap(key, (map) => {
        const current = asNum(map[fieldKey], 0);
        nextValue = current + delta;
        map[fieldKey] = String(nextValue);
        return map;
    });
    return nextValue;
}

async function loadHalfMap(endpoint: Endpoint, provider: string, model: string): Promise<Record<string, string>> {
    const key = HEALTH_KEYS.half(endpoint, model, provider);
    return loadMapByKey(key);
}

async function saveHalfMap(endpoint: Endpoint, provider: string, model: string, map: Record<string, string>) {
    const key = HEALTH_KEYS.half(endpoint, model, provider);
    await saveMap(key, map, HALF_STATE_TTL_SECONDS);
}

async function deleteHalf(endpoint: Endpoint, provider: string, model: string) {
    const key = HEALTH_KEYS.half(endpoint, model, provider);
    await getCache().delete(key);
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
    const map = await loadStateMap(endpoint, model);
    const now = Date.now();
    const attempts = readNumber(map, provider, "breaker_attempts") + 1;
    const base = readConfig(map, provider, "base_open_secs");
    const maxs = readConfig(map, provider, "max_open_secs");
    const duration = Math.min(base * Math.pow(2, Math.max(0, attempts - 1)), maxs);
    await setHealthFields(endpoint, model, {
        [breakerField(provider)]: "open",
        [field(provider, "breaker_attempts")]: attempts,
        [field(provider, "breaker_until_ms")]: now + duration * 1000,
    });
    persistBreakerState({
        endpoint,
        provider,
        model,
        breaker: "open",
        breakerUntilMs: now + duration * 1000,
        reason: "open_breaker",
    });
}

async function closeBreaker(endpoint: Endpoint, provider: string, model: string) {
    await setHealthFields(endpoint, model, {
        [breakerField(provider)]: "closed",
        [field(provider, "breaker_attempts")]: 0,
        [field(provider, "breaker_until_ms")]: 0,
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
    const map = await loadHalfMap(endpoint, provider, model);
    const next = { ...map };
    if (!("p" in next)) next.p = String(HEALTH_CONSTANTS.HALF_OPEN_PROBE_RATIO);
    if (!("ok" in next)) next.ok = "0";
    if (!("cnt" in next)) next.cnt = "0";
    await saveHalfMap(endpoint, provider, model, next);
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
    const map = await loadHalfMap(endpoint, provider, model);
    const next = { ...map };
    const cnt = asNum(next.cnt, 0) + 1;
    const okCount = asNum(next.ok, 0) + (ok ? 1 : 0);
    next.cnt = String(cnt);
    next.ok = String(okCount);
    if (!("p" in next)) next.p = String(HEALTH_CONSTANTS.HALF_OPEN_PROBE_RATIO);
    await saveHalfMap(endpoint, provider, model, next);
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
                await setHealthFields(endpoint, model, { [breakerField(provider)]: "half_open" });
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
            await setHealthFields(endpoint, model, { [breakerField(provider)]: "half_open" });
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
    const inflightField = field(provider, "inflight");
    const inflight = await incrHealthField(endpoint, model, inflightField, 1);
    const softCap = Math.max(CONFIG_DEFAULTS.load_soft_cap, 1);
    await setHealthFields(endpoint, model, {
        [field(provider, "current_load")]: Math.min(1, inflight / softCap),
    });
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
    const map = await loadStateMap(endpoint, model);
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
    const inflight = Math.max(await incrHealthField(endpoint, model, field(provider, "inflight"), -1), 0);
    const load = Math.min(1, inflight / Math.max(softCap, 1));

    await setHealthFields(endpoint, model, {
        [field(provider, "lat_ewma_10s")]: lat10,
        [field(provider, "lat_ewma_60s")]: lat60,
        [field(provider, "lat_ewma_300s")]: lat300,
        [field(provider, "err_ewma_10s")]: err10,
        [field(provider, "err_ewma_60s")]: err60,
        [field(provider, "err_ewma_300s")]: err300,
        [field(provider, "rate_10s")]: rate10,
        [field(provider, "rate_60s")]: rate60,
        [field(provider, "tp_ewma_60s")]: tp60,
        [field(provider, "rec_ok_ew_60s")]: recOk,
        [field(provider, "rec_tot_ew_60s")]: recTot,
        [field(provider, "last_ts_10s")]: now,
        [field(provider, "last_ts_60s")]: now,
        [field(provider, "last_ts_300s")]: now,
        [field(provider, "current_load")]: load,
        [field(provider, "last_updated")]: now,
        [field(provider, "load_soft_cap")]: softCap,
        [field(provider, "err_open_th")]: readConfig(map, provider, "err_open_th"),
        [field(provider, "base_open_secs")]: readConfig(map, provider, "base_open_secs"),
        [field(provider, "max_open_secs")]: readConfig(map, provider, "max_open_secs"),
    });
}
