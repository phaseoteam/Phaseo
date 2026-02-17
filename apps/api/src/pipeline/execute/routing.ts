// file: lib/gateway/execute/routing.ts
// Purpose: Execute-stage logic for routing, attempts, and provider health.
// Why: Centralizes execution/failover behavior.
// How: Captures routing snapshots for analytics and debugging.

import type { Endpoint } from "@core/types";
import type { ProviderCandidate } from "../before/types";
import type { PriceCard } from "../pricing/types";
import { readHealthMany, ProviderHealth } from "./health";
import { stripPrioritySuffix } from "./utils";
import { normalizeProviderList } from "@/lib/config/providerAliases";

type Priority = "default" | "fast" | "quick" | "nitro";
type RoutingMode = "balanced" | "price" | "latency" | "throughput";
type ProviderStatus = "active" | "beta" | "alpha" | "not_ready";

type RoutingPreset = {
    wSucc: number;
    wP50: number;
    wTail: number;
    wTPS: number;
    wLoad: number;
    wPrice: number;
    noise: number;
    L0: number;
};

const PRESETS: Record<Priority, RoutingPreset> = {
    default: { wSucc: 0.35, wP50: 0.35, wTail: 0.15, wTPS: 0.10, wLoad: 0.05, wPrice: 0.0, noise: 0.02, L0: 800 },
    fast: { wSucc: 0.30, wP50: 0.50, wTail: 0.15, wTPS: 0.03, wLoad: 0.02, wPrice: 0.0, noise: 0.005, L0: 600 },
    quick: { wSucc: 0.25, wP50: 0.45, wTail: 0.20, wTPS: 0.08, wLoad: 0.02, wPrice: 0.0, noise: 0.015, L0: 500 },
    // Nitro mode prioritizes peak throughput (TPS) over latency/cost.
    nitro: { wSucc: 0.24, wP50: 0.10, wTail: 0.06, wTPS: 0.55, wLoad: 0.05, wPrice: 0.0, noise: 0.001, L0: 500 },
};

const TEXT_ENDPOINTS = new Set<Endpoint>(["responses", "chat.completions", "messages"]);
const TEXT_PRICE_METERS = ["input_text_tokens", "output_text_tokens"];

function normalizeRoutingMode(value?: string | null): RoutingMode {
    const mode = (value ?? "").toLowerCase();
    if (mode === "price") return "price";
    if (mode === "latency") return "latency";
    if (mode === "throughput") return "throughput";
    return "balanced";
}

function normalizeProviderStatus(value?: string | null): ProviderStatus {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (normalized === "active") return "active";
    if (normalized === "beta") return "beta";
    if (normalized === "alpha") return "alpha";
    if (
        normalized === "notready" ||
        normalized === "not_ready" ||
        normalized === "not ready"
    ) {
        return "not_ready";
    }
    return "active";
}

function applyRoutingMode(preset: RoutingPreset, mode: RoutingMode): RoutingPreset {
    if (mode === "price") {
        return {
            ...preset,
            wSucc: 0.25,
            wP50: 0.15,
            wTail: 0.10,
            wTPS: 0.05,
            wLoad: 0.05,
            wPrice: 0.40,
        };
    }
    if (mode === "latency") {
        return {
            ...preset,
            wSucc: 0.25,
            wP50: 0.55,
            wTail: 0.15,
            wTPS: 0.02,
            wLoad: 0.03,
            wPrice: 0.0,
        };
    }
    if (mode === "throughput") {
        return {
            ...preset,
            wSucc: 0.20,
            wP50: 0.20,
            wTail: 0.10,
            wTPS: 0.40,
            wLoad: 0.10,
            wPrice: 0.0,
        };
    }
    return preset;
}

function parsePriority(model: string): { base: string; priority: Priority; strict: boolean } {
    const lower = model.toLowerCase();
    if (lower.endsWith(":nitro")) {
        return { base: stripPrioritySuffix(model), priority: "nitro", strict: true };
    }
    if (lower.endsWith(":fast")) {
        return { base: stripPrioritySuffix(model), priority: "fast", strict: true };
    }
    if (lower.endsWith(":quick")) {
        return { base: stripPrioritySuffix(model), priority: "quick", strict: true };
    }
    return { base: stripPrioritySuffix(model), priority: "default", strict: false };
}

function normalise(v: number, min: number, max: number) {
    if (max === min) return 0.5;
    const x = (v - min) / (max - min);
    return Math.max(0, Math.min(1, x));
}

function weightedOrder<T>(items: T[], weight: (x: T) => number, rng: () => number): T[] {
    const bag = items.map(i => ({ i, w: Math.max(0.0001, weight(i)) }));
    const out: T[] = [];
    while (bag.length) {
        const total = bag.reduce((s, b) => s + b.w, 0);
        let r = rng() * total;
        let idx = 0;
        for (; idx < bag.length; idx++) {
            r -= bag[idx].w;
            if (r <= 0) break;
        }
        out.push(bag[idx].i);
        bag.splice(idx, 1);
    }
    return out;
}

function hashSeed(value: string): number {
    let h = 2166136261;
    for (let i = 0; i < value.length; i++) {
        h ^= value.charCodeAt(i);
        h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return h >>> 0;
}

function seededRandom(seed: number): () => number {
    let t = seed;
    return () => {
        t += 0x6D2B79F5;
        let x = t;
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

function extractMeterPrices(card: PriceCard | null): Map<string, number> {
    const out = new Map<string, number>();
    if (!card) return out;
    for (const rule of card.rules) {
        const unitSize = rule.unit_size > 0 ? rule.unit_size : 1;
        const price = Number(rule.price_per_unit);
        if (!Number.isFinite(price)) continue;
        const perUnit = price / unitSize;
        const existing = out.get(rule.meter);
        if (existing === undefined || perUnit < existing) {
            out.set(rule.meter, perUnit);
        }
    }
    return out;
}

function sharedPriceMeters(meterMaps: Map<string, number>[]): string[] {
    if (!meterMaps.length) return [];
    const [first, ...rest] = meterMaps;
    const shared = new Set(first.keys());
    for (const next of rest) {
        for (const key of Array.from(shared)) {
            if (!next.has(key)) shared.delete(key);
        }
    }
    return Array.from(shared);
}

function pickPriceMeters(endpoint: Endpoint, meterMaps: Map<string, number>[]): string[] {
    const shared = sharedPriceMeters(meterMaps);
    if (!shared.length) return [];
    if (TEXT_ENDPOINTS.has(endpoint)) {
        const hasTextMeters = meterMaps.every((map) =>
            TEXT_PRICE_METERS.every((meter) => map.has(meter))
        );
        if (hasTextMeters) return TEXT_PRICE_METERS;
    }
    return shared;
}

function computePriceScores(
    endpoint: Endpoint,
    candidates: ProviderCandidate[]
): Map<string, number> {
    const meterMaps = candidates.map((candidate) => extractMeterPrices(candidate.pricingCard ?? null));
    const selectedMeters = pickPriceMeters(endpoint, meterMaps);
    if (!selectedMeters.length) {
        return new Map(candidates.map((candidate) => [candidate.providerId, 0.5]));
    }

    const prices = meterMaps.map((map) => {
        let sum = 0;
        for (const meter of selectedMeters) {
            const value = map.get(meter);
            if (value === undefined) return null;
            sum += value;
        }
        return sum;
    });

    const validPrices = prices.filter((value): value is number => value !== null);
    if (!validPrices.length) {
        return new Map(candidates.map((candidate) => [candidate.providerId, 0.5]));
    }

    const min = Math.min(...validPrices);
    const max = Math.max(...validPrices);
    const range = max - min;
    const scores = new Map<string, number>();
    candidates.forEach((candidate, index) => {
        const price = prices[index];
        if (price === null || range === 0) {
            scores.set(candidate.providerId, 0.5);
        } else {
            scores.set(candidate.providerId, 1 - (price - min) / range);
        }
    });
    return scores;
}

export type RoutedCandidate = {
    candidate: ProviderCandidate;
    adapter: ProviderCandidate["adapter"];
    score: number;
    health: ProviderHealth;
};

export type RoutingFilterStageDiagnostics = {
    stage: "hints.only" | "hints.ignore" | "status_gate" | "health_breaker";
    beforeCount: number;
    afterCount: number;
    droppedProviders: Array<{
        providerId: string;
        reason: string;
    }>;
};

export type RoutingDiagnostics = {
    model: string;
    endpoint: Endpoint;
    priority: Priority;
    routingMode: RoutingMode;
    strictPriority: boolean;
    includeAlpha: boolean;
    betaChannelEnabled: boolean;
    providerCapabilitiesBeta: boolean;
    filterStages: RoutingFilterStageDiagnostics[];
    finalCandidateCount: number;
};

/**
 * Extracts the requested max_tokens from the request body
 */
function getRequestedMaxTokens(body: any): number | null {
    if (typeof body?.max_tokens === "number" && body.max_tokens > 0) {
        return body.max_tokens;
    }
    if (typeof body?.max_output_tokens === "number" && body.max_output_tokens > 0) {
        return body.max_output_tokens;
    }
    return null;
}

/**
 * Calculates a token affinity score (0-1) based on how well the provider's
 * max_output_tokens matches the requested max_tokens.
 * Providers with limits closest to (but >= ) the request get higher scores.
 */
function calculateTokenAffinityScore(
    requestedMaxTokens: number | null,
    providerMaxOutputTokens: number | null | undefined
): number {
    // If no tokens requested or provider has no limit, return neutral score
    if (requestedMaxTokens === null || providerMaxOutputTokens === null || providerMaxOutputTokens === undefined) {
        return 0.5;
    }

    // Provider must support at least the requested amount (this should already be filtered)
    if (providerMaxOutputTokens < requestedMaxTokens) {
        return 0;
    }

    // Calculate how much "headroom" the provider has
    // Less headroom = better match = higher score
    const headroom = providerMaxOutputTokens - requestedMaxTokens;
    const maxReasonableHeadroom = requestedMaxTokens * 2; // 2x the request is "reasonable"

    if (headroom === 0) {
        return 1.0; // Perfect match
    }

    // Linear decay: 1.0 at 0 headroom, 0.5 at maxReasonableHeadroom, approaches 0 beyond
    const score = Math.max(0, Math.min(1, 1 - (headroom / (maxReasonableHeadroom * 2))));
    return score;
}

export async function routeProviders(
    candidates: ProviderCandidate[],
    ctx: {
        endpoint: Endpoint;
        model: string;
        teamId: string;
        body?: any;
        routingMode?: string | null;
        betaChannelEnabled?: boolean;
        providerCapabilitiesBeta?: boolean;
        requestId?: string | null;
    }
): Promise<{ ranked: RoutedCandidate[]; diagnostics: RoutingDiagnostics }> {
    const { base, priority, strict } = parsePriority(ctx.model);
    const mode = normalizeRoutingMode(ctx.routingMode);
    const preset = applyRoutingMode(PRESETS[priority], mode);
    const hints = (ctx.body?.provider ?? {}) as {
        order?: string[];
        only?: string[];
        ignore?: string[];
        include_alpha?: boolean;
        includeAlpha?: boolean;
    };
    const includeAlpha = Boolean(hints.include_alpha ?? hints.includeAlpha);
    const onlyHints = normalizeProviderList(hints.only ?? []);
    const ignoreHints = normalizeProviderList(hints.ignore ?? []);
    const orderedHints = normalizeProviderList(hints.order ?? []);
    const betaChannelEnabled = Boolean(ctx.betaChannelEnabled);
    const providerCapabilitiesBeta = Boolean(ctx.providerCapabilitiesBeta);
    const allowBetaProviders = betaChannelEnabled || providerCapabilitiesBeta;
    const requestedMaxTokens = getRequestedMaxTokens(ctx.body);
    const filterStages: RoutingFilterStageDiagnostics[] = [];

    const pushStage = (
        stage: RoutingFilterStageDiagnostics["stage"],
        before: ProviderCandidate[],
        after: ProviderCandidate[],
        reasonForDrop: (candidate: ProviderCandidate) => string,
    ) => {
        const afterSet = new Set(after.map((candidate) => candidate.providerId));
        const droppedProviders = before
            .filter((candidate) => !afterSet.has(candidate.providerId))
            .map((candidate) => ({
                providerId: candidate.providerId,
                reason: reasonForDrop(candidate),
            }));
        filterStages.push({
            stage,
            beforeCount: before.length,
            afterCount: after.length,
            droppedProviders,
        });
    };

    let poolCandidates = candidates;
    if (onlyHints.length) {
        const before = poolCandidates;
        const allow = new Set(onlyHints);
        poolCandidates = poolCandidates.filter(c => allow.has(c.adapter.name));
        pushStage("hints.only", before, poolCandidates, () => "not_in_provider.only");
    }
    if (ignoreHints.length) {
        const before = poolCandidates;
        const deny = new Set(ignoreHints);
        poolCandidates = poolCandidates.filter(c => !deny.has(c.adapter.name));
        pushStage("hints.ignore", before, poolCandidates, () => "listed_in_provider.ignore");
    }
    if (!poolCandidates.length) poolCandidates = candidates;

    // Channel/status gating before health scoring.
    const beforeStatusGate = poolCandidates;
    poolCandidates = poolCandidates.filter((candidate) => {
        const status = normalizeProviderStatus(candidate.providerStatus);
        if (status === "active") return true;
        if (status === "beta") return allowBetaProviders;
        if (status === "alpha") return includeAlpha;
        return false;
    });
    pushStage("status_gate", beforeStatusGate, poolCandidates, (candidate) => {
        const status = normalizeProviderStatus(candidate.providerStatus);
        if (status === "beta") return "beta_requires_team_beta_channel";
        if (status === "alpha") return "alpha_requires_provider.include_alpha";
        if (status === "not_ready") return "provider_status_not_ready";
        return `provider_status_${status}`;
    });

    if (!poolCandidates.length) {
        const diagnostics: RoutingDiagnostics = {
            model: ctx.model,
            endpoint: ctx.endpoint,
            priority,
            routingMode: mode,
            strictPriority: strict,
            includeAlpha,
            betaChannelEnabled,
            providerCapabilitiesBeta,
            filterStages,
            finalCandidateCount: 0,
        };
        console.log("[gateway] provider pool empty", {
            model: ctx.model,
            endpoint: ctx.endpoint,
            diagnostics,
        });
        return { ranked: [], diagnostics };
    }

    if (orderedHints.length) {
        const order = orderedHints;
        const byName = new Map(poolCandidates.map((c) => [c.adapter.name, c]));
        const ordered = order.map((name) => byName.get(name)).filter(Boolean) as typeof poolCandidates;
        const orderedSet = new Set(ordered.map((c) => c.adapter.name));
        const remaining = poolCandidates.filter((c) => !orderedSet.has(c.adapter.name));
        poolCandidates = [...ordered, ...remaining];
    }

    const providerIds = poolCandidates.map(c => c.adapter.name);
    const healthMap = await readHealthMany(ctx.endpoint, base, providerIds);
    const healths = poolCandidates.map(candidate => ({
        candidate,
        adapter: candidate.adapter,
        h: healthMap[candidate.adapter.name],
    }));

    const now = Date.now();
    const viable = healths.filter(x => !(x.h.breaker === "open" && (x.h.breaker_until_ms ?? 0) > now));
    const pool = viable.length ? viable : healths;
    if (viable.length !== healths.length) {
        filterStages.push({
            stage: "health_breaker",
            beforeCount: healths.length,
            afterCount: pool.length,
            droppedProviders: healths
                .filter((entry) => entry.h.breaker === "open" && (entry.h.breaker_until_ms ?? 0) > now)
                .map((entry) => ({
                    providerId: entry.candidate.providerId,
                    reason: "breaker_open",
                })),
        });
    }
    console.log("[gateway] provider pool", {
        model: ctx.model,
        endpoint: ctx.endpoint,
        candidates: candidates.length,
        poolCandidates: poolCandidates.length,
        viable: viable.length,
        openBreakers: healths.filter(
            (entry) =>
                entry.h.breaker === "open" &&
                (entry.h.breaker_until_ms ?? 0) > now
        ).length,
        filterStages,
    });

    const latP50s = pool.map(v => v.h.lat_ewma_60s);
    const latTail = pool.map(v => Math.max(v.h.lat_ewma_300s, v.h.lat_ewma_60s * 1.6));
    const tpss = pool.map(v => v.h.tp_ewma_60s);
    const minP50 = Math.min(...latP50s), maxP50 = Math.max(...latP50s);
    const minTail = Math.min(...latTail), maxTail = Math.max(...latTail);
    const minTPS = Math.min(...tpss), maxTPS = Math.max(...tpss);

    const rng = seededRandom(hashSeed(`${ctx.requestId ?? ""}:${ctx.teamId}:${ctx.model}`));
    const priceScores = preset.wPrice > 0 ? computePriceScores(ctx.endpoint, pool.map((p) => p.candidate)) : new Map();
    const scored = pool.map(v => {
        const h = v.h;
        const weight = v.candidate.baseWeight > 0 ? v.candidate.baseWeight : 1;
        const providerStatus = normalizeProviderStatus(v.candidate.providerStatus);
        const rolloutMultiplier =
            providerStatus === "beta"
                ? 0.05
                : providerStatus === "alpha"
                    ? 0.03
                    : 1;
        const succ = 1 - h.err_ewma_60s;
        const p50Curve = 1 / (1 + (h.lat_ewma_60s / preset.L0));
        const p50Norm = 1 - normalise(h.lat_ewma_60s, minP50, maxP50);
        const tailNorm = 1 - normalise(Math.max(h.lat_ewma_300s, h.lat_ewma_60s * 1.6), minTail, maxTail);
        const tpsNorm = maxTPS > 0 ? normalise(h.tp_ewma_60s, minTPS, maxTPS) : 0;
        const loadPen = h.current_load;
        const priceScore = preset.wPrice > 0 ? (priceScores.get(v.candidate.providerId) ?? 0.5) : 0.5;

        // Token affinity: prefer providers with limits close to requested max_tokens
        const tokenAffinity = calculateTokenAffinityScore(requestedMaxTokens, v.candidate.maxOutputTokens);
        const tokenWeight = 0.10; // 10% weight for token affinity

        const baseScore =
            preset.wSucc * succ +
            preset.wP50 * (0.5 * p50Curve + 0.5 * p50Norm) +
            preset.wTail * tailNorm +
            preset.wTPS * tpsNorm -
            preset.wLoad * loadPen +
            preset.wPrice * priceScore +
            tokenWeight * tokenAffinity +
            preset.noise * rng();

        const score = Math.max(
            0,
            baseScore * Math.max(weight, 0.0001) * rolloutMultiplier
        );
        return { candidate: v.candidate, adapter: v.adapter, health: h, score };
    });

    if (orderedHints.length) {
        const order = orderedHints;
        const byName = new Map(scored.map((entry) => [entry.adapter.name, entry]));
        const ordered = order.map((name) => byName.get(name)).filter(Boolean) as RoutedCandidate[];
        const orderedSet = new Set(ordered.map((entry) => entry.adapter.name));
        const remaining = scored.filter((entry) => !orderedSet.has(entry.adapter.name));
        if (strict) {
            const ranked = [...ordered, ...remaining.sort((a, b) => b.score - a.score)];
            return {
                ranked,
                diagnostics: {
                    model: ctx.model,
                    endpoint: ctx.endpoint,
                    priority,
                    routingMode: mode,
                    strictPriority: strict,
                    includeAlpha,
                    betaChannelEnabled,
                    providerCapabilitiesBeta,
                    filterStages,
                    finalCandidateCount: ranked.length,
                },
            };
        }
        const ranked = [...ordered, ...weightedOrder(remaining, (s) => s.score, rng)];
        return {
            ranked,
            diagnostics: {
                model: ctx.model,
                endpoint: ctx.endpoint,
                priority,
                routingMode: mode,
                strictPriority: strict,
                includeAlpha,
                betaChannelEnabled,
                providerCapabilitiesBeta,
                filterStages,
                finalCandidateCount: ranked.length,
            },
        };
    }

    if (strict) {
        const ranked = [...scored].sort((a, b) => b.score - a.score);
        return {
            ranked,
            diagnostics: {
                model: ctx.model,
                endpoint: ctx.endpoint,
                priority,
                routingMode: mode,
                strictPriority: strict,
                includeAlpha,
                betaChannelEnabled,
                providerCapabilitiesBeta,
                filterStages,
                finalCandidateCount: ranked.length,
            },
        };
    }

    const ranked = weightedOrder(scored, (s) => s.score, rng);
    return {
        ranked,
        diagnostics: {
            model: ctx.model,
            endpoint: ctx.endpoint,
            priority,
            routingMode: mode,
            strictPriority: strict,
            includeAlpha,
            betaChannelEnabled,
            providerCapabilitiesBeta,
            filterStages,
            finalCandidateCount: ranked.length,
        },
    };
}










