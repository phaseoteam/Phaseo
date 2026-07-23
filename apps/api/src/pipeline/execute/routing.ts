// file: lib/gateway/execute/routing.ts
// Purpose: Execute-stage logic for routing, attempts, and provider health.
// Why: Centralizes execution/failover behavior.
// How: Captures routing snapshots for analytics and debugging.

import type { Endpoint } from "@core/types";
import { normalizeTextServiceTier, readRequestedServiceTier } from "@core/serviceTiers";
import type {
    CapabilityRoutingStatus,
    ProviderCandidate,
    ProviderRolloutStatus,
    RoutingStatus,
} from "../before/types";
import type { PriceCard } from "../pricing/types";
import {
    normalizeCapabilityStatus as normalizeSharedCapabilityStatus,
    normalizeProviderStatus as normalizeSharedProviderStatus,
    normalizeRoutingStatus as normalizeSharedRoutingStatus,
} from "../before/context.shared";
import { providerMeetsResidencyRequirement } from "@/lib/config/providerResidency";
import { readHealthManyOptimistic, ProviderHealth } from "./health";
import { stripPrioritySuffix } from "./utils";
import { normalizeProviderList } from "@/lib/config/providerAliases";
import {
	extractRoutingPreferenceScalar,
	getEffectiveRoutingHints,
} from "../requestRouting";
import {
    readStickyRoutingOptimistic,
    resolveStickyRoutingContext,
    stickyRoutingCacheBoostMultiplier,
    type StickyRoutingContext,
    type StickyRoutingEntry,
} from "./sticky-routing";

type Priority = "default" | "fast" | "nitro" | "cheap";
type RoutingMode = "balanced" | "price" | "latency" | "throughput";
type ProviderStatus = ProviderRolloutStatus;
type CapabilityStatus = CapabilityRoutingStatus;

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
    // Nitro mode prioritizes peak throughput (TPS) over latency/cost.
    nitro: { wSucc: 0.24, wP50: 0.10, wTail: 0.06, wTPS: 0.55, wLoad: 0.05, wPrice: 0.0, noise: 0.001, L0: 500 },
    cheap: { wSucc: 0.25, wP50: 0.15, wTail: 0.10, wTPS: 0.05, wLoad: 0.05, wPrice: 0.40, noise: 0.001, L0: 700 },
};

const TEXT_ENDPOINTS = new Set<Endpoint>(["responses", "chat.completions", "messages"]);
const TEXT_PRICE_METERS = ["input_text_tokens", "output_text_tokens"];
const TOKEN_PRICE_CAP_UNIT_SIZE = 1_000_000;

function normalizeRoutingMode(value?: string | null): RoutingMode {
    const mode = (value ?? "").toLowerCase();
    if (mode === "price") return "price";
    if (mode === "pricing") return "price";
    if (mode === "cost") return "price";
    if (mode === "latency") return "latency";
    if (mode === "speed") return "latency";
    if (mode === "throughput") return "throughput";
    if (mode === "tps") return "throughput";
    return "balanced";
}

function normalizeProviderStatus(value?: string | null): ProviderStatus {
    return normalizeSharedProviderStatus(value);
}

function normalizeRoutingStatus(value?: string | null): RoutingStatus {
    return normalizeSharedRoutingStatus(value);
}

function normalizeCapabilityStatus(value?: string | null): CapabilityStatus {
    return normalizeSharedCapabilityStatus(value);
}

function routingStatusMultiplier(status: RoutingStatus): number {
    if (status === "deranked_lvl1") return 1e-3;
    if (status === "deranked_lvl2") return 1e-6;
    if (status === "deranked_lvl3") return 1e-9;
    if (status === "disabled") return 0;
    return 1;
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
    if (lower.endsWith(":cheap")) {
        return { base: stripPrioritySuffix(model), priority: "cheap", strict: true };
    }
    if (lower.endsWith(":fast")) {
        return { base: stripPrioritySuffix(model), priority: "fast", strict: true };
    }
    return { base: stripPrioritySuffix(model), priority: "default", strict: false };
}

function priorityDefaultRoutingMode(priority: Priority): RoutingMode | null {
	if (priority === "cheap") return "price";
	if (priority === "nitro") return "throughput";
	if (priority === "fast") return "latency";
	return null;
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

function filterStable<T>(items: T[], predicate: (item: T) => boolean): T[] {
	for (let index = 0; index < items.length; index += 1) {
		if (predicate(items[index])) continue;
		const filtered = items.slice(0, index);
		for (let remaining = index + 1; remaining < items.length; remaining += 1) {
			if (predicate(items[remaining])) filtered.push(items[remaining]);
		}
		return filtered;
	}
	return items;
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

function sampleStandardNormal(rng: () => number): number {
    const u1 = Math.max(Number.EPSILON, rng());
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function sampleGamma(shape: number, rng: () => number): number {
    if (shape < 1) {
        return sampleGamma(shape + 1, rng) * Math.pow(Math.max(Number.EPSILON, rng()), 1 / shape);
    }
    const d = shape - (1 / 3);
    const c = 1 / Math.sqrt(9 * d);
    for (let attempt = 0; attempt < 32; attempt += 1) {
        const normal = sampleStandardNormal(rng);
        const base = 1 + c * normal;
        if (base <= 0) continue;
        const value = base * base * base;
        const uniform = rng();
        if (
            uniform < 1 - 0.0331 * normal ** 4 ||
            Math.log(Math.max(Number.EPSILON, uniform)) < 0.5 * normal * normal + d * (1 - value + Math.log(value))
        ) {
            return d * value;
        }
    }
    return shape;
}

function sampleBeta(alpha: number, beta: number, rng: () => number): number {
    const left = sampleGamma(Math.max(alpha, 0.001), rng);
    const right = sampleGamma(Math.max(beta, 0.001), rng);
    return left / Math.max(left + right, Number.EPSILON);
}

function sampleProviderReliability(health: ProviderHealth, rng: () => number): {
    sample: number;
    effectiveObservations: number;
} {
    // rate_60s * 60 approximates recent observations in the EWMA window. Cap
    // its confidence so older traffic never prevents renewed exploration.
    const effectiveObservations = Math.max(0, Math.min(60, health.rate_60s * 60));
    const successRate = Math.max(0, Math.min(1, 1 - health.err_ewma_60s));
    const successes = successRate * effectiveObservations;
    const failures = (1 - successRate) * effectiveObservations;
    return {
        // An 80% prior is optimistic enough for unseen providers to be tried,
        // while sustained failures rapidly reduce their selection probability.
        sample: sampleBeta(8 + successes, 2 + failures, rng),
        effectiveObservations,
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

function computePriceCosts(
    endpoint: Endpoint,
    candidates: ProviderCandidate[],
): Map<string, number | null> {
    const meterMaps = candidates.map((candidate) => extractMeterPrices(candidate.pricingCard ?? null));
    const selectedMeters = pickPriceMeters(endpoint, meterMaps);
    const costs = new Map<string, number | null>();
    if (!selectedMeters.length) {
        for (const candidate of candidates) {
            costs.set(getRoutingCandidateKey(candidate), null);
        }
        return costs;
    }

    candidates.forEach((candidate, index) => {
        const meters = meterMaps[index];
        let cost = 0;
        for (const meter of selectedMeters) {
            const value = meters.get(meter);
            if (value === undefined || !Number.isFinite(value)) {
                costs.set(getRoutingCandidateKey(candidate), null);
                return;
            }
            cost += value;
        }
        costs.set(getRoutingCandidateKey(candidate), cost);
    });
    return costs;
}

function computeInverseSquarePriceWeights(
    endpoint: Endpoint,
    candidates: ProviderCandidate[],
): Map<string, number> {
    const costs = computePriceCosts(endpoint, candidates);
    const finiteCosts = Array.from(costs.values()).filter(
        (value): value is number => typeof value === "number" && Number.isFinite(value),
    );
    if (!finiteCosts.length) {
        return new Map(candidates.map((candidate) => [getRoutingCandidateKey(candidate), 0.5]));
    }

    const positiveCosts = finiteCosts.filter((value) => value > 0);
    const freeCostFloor = positiveCosts.length ? Math.min(...positiveCosts) / 10 : 1;
    const rawWeights = new Map<string, number>();
    for (const candidate of candidates) {
        const key = getRoutingCandidateKey(candidate);
        const cost = costs.get(key);
        if (cost === null || cost === undefined) {
            rawWeights.set(key, 0);
            continue;
        }
        const safeCost = cost > 0 ? cost : freeCostFloor;
        rawWeights.set(key, 1 / Math.pow(safeCost, 2));
    }

    const maxWeight = Math.max(...Array.from(rawWeights.values()), 0);
    if (maxWeight <= 0) {
        return new Map(candidates.map((candidate) => [getRoutingCandidateKey(candidate), 0.5]));
    }
    return new Map(
        candidates.map((candidate) => {
            const key = getRoutingCandidateKey(candidate);
            return [key, (rawWeights.get(key) ?? 0) / maxWeight];
        }),
    );
}

function readPriceCapNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function priceCapMetersForField(field: string): string[] {
	if (field === "prompt") {
		return ["input_text_tokens", "input_tokens", "embedding_tokens"];
	}
	if (field === "completion") {
		return ["output_text_tokens", "output_tokens", "output_reasoning_tokens"];
	}
	if (field === "image") {
		return ["output_image", "output_image_tokens"];
	}
	if (field === "audio") {
		return ["input_audio_minutes", "input_audio_tokens", "output_audio_tokens"];
	}
	if (field === "request") {
		return ["requests"];
	}
	return [];
}

function meterPriceForCapComparison(meter: string, pricePerMeterUnit: number): number {
	if (meter.endsWith("_tokens")) {
		return pricePerMeterUnit * TOKEN_PRICE_CAP_UNIT_SIZE;
	}
	return pricePerMeterUnit;
}

function candidateMatchesPriceCaps(candidate: ProviderCandidate, maxPrice: Record<string, any> | null): boolean {
	if (!maxPrice || !candidate.pricingCard) return maxPrice == null;
	const prices = extractMeterPrices(candidate.pricingCard);
	for (const [field, rawCap] of Object.entries(maxPrice)) {
		const cap = readPriceCapNumber(rawCap);
		if (cap === null) continue;
		const meters = priceCapMetersForField(field);
		if (meters.length === 0) continue;
		const matchingPrices = meters
			.map((meter) => {
				const price = prices.get(meter);
				return typeof price === "number" && Number.isFinite(price)
					? meterPriceForCapComparison(meter, price)
					: price;
			})
			.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
		if (matchingPrices.length === 0) {
			return false;
		}
		if (Math.min(...matchingPrices) > cap) {
			return false;
		}
	}
	return true;
}

function preferenceMultiplierForLatency(latencyMs: number, maxLatencySeconds: number | null): number {
	if (!Number.isFinite(latencyMs) || maxLatencySeconds === null || maxLatencySeconds <= 0) {
		return 1;
	}
	const thresholdMs = maxLatencySeconds * 1000;
	if (latencyMs <= thresholdMs) {
		const headroom = thresholdMs <= 0 ? 0 : (thresholdMs - latencyMs) / thresholdMs;
		return 1 + Math.min(0.2, headroom * 0.2);
	}
	const overflow = (latencyMs - thresholdMs) / thresholdMs;
	return Math.max(0.35, 1 - Math.min(0.65, overflow * 0.5));
}

function preferenceMultiplierForThroughput(tps: number, minThroughput: number | null): number {
	if (!Number.isFinite(tps) || minThroughput === null || minThroughput <= 0) {
		return 1;
	}
	if (tps >= minThroughput) {
		return 1 + Math.min(0.2, ((tps - minThroughput) / minThroughput) * 0.1);
	}
	const deficit = (minThroughput - tps) / minThroughput;
	return Math.max(0.35, 1 - Math.min(0.65, deficit * 0.5));
}

function shouldApplyStickyRoutingBoost(
    candidate: ProviderCandidate,
    stickyHint: StickyRoutingEntry
): boolean {
    if (!Number.isFinite(stickyHint.cachedReadTokens) || stickyHint.cachedReadTokens <= 0) {
        return false;
    }

    const meterPrices = extractMeterPrices(candidate.pricingCard ?? null);
    const cachedReadPrice =
        meterPrices.get("implicit_cached_input_text_tokens") ??
        meterPrices.get("cached_read_text_tokens");
    const inputPrice = meterPrices.get("input_text_tokens");

    // If both prices are present, only boost when cache reads are cheaper than standard input.
    if (cachedReadPrice !== undefined && inputPrice !== undefined) {
        return cachedReadPrice < inputPrice;
    }

    // Keep sticky behavior when explicit cache pricing is unavailable.
    return true;
}
export type RoutingScoreFactors = {
    successRate: number;
    latencyScore: number;
    tailLatencyScore: number;
    throughputScore: number;
    priceScore: number;
    reliabilitySample: number;
    reliabilityObservations: number;
    tokenAffinity: number;
    loadPenalty: number;
    baseWeight: number;
    rolloutMultiplier: number;
    routingMultiplier: number;
    cacheBoostMultiplier: number;
    latencyPreferenceMultiplier: number;
    throughputPreferenceMultiplier: number;
};

export type RoutingScoreFactorValues = readonly [
    number, number, number, number, number,
    number, number, number, number, number,
    number, number, number, number, number,
];

function scoreFactorsFromValues(values: RoutingScoreFactorValues): RoutingScoreFactors {
    return {
        successRate: roundDiagnosticNumber(values[0]),
        latencyScore: roundDiagnosticNumber(values[1]),
        tailLatencyScore: roundDiagnosticNumber(values[2]),
        throughputScore: roundDiagnosticNumber(values[3]),
        priceScore: roundDiagnosticNumber(values[4]),
        reliabilitySample: roundDiagnosticNumber(values[5]),
        reliabilityObservations: roundDiagnosticNumber(values[6]),
        tokenAffinity: roundDiagnosticNumber(values[7]),
        loadPenalty: roundDiagnosticNumber(values[8]),
        baseWeight: roundDiagnosticNumber(values[9]),
        rolloutMultiplier: roundDiagnosticNumber(values[10]),
        routingMultiplier: roundDiagnosticNumber(values[11]),
        cacheBoostMultiplier: roundDiagnosticNumber(values[12]),
        latencyPreferenceMultiplier: roundDiagnosticNumber(values[13]),
        throughputPreferenceMultiplier: roundDiagnosticNumber(values[14]),
    };
}

export type RoutedCandidate = {
    candidate: ProviderCandidate;
    adapter: ProviderCandidate["adapter"];
    score: number;
    health: ProviderHealth;
    scoreFactorValues: RoutingScoreFactorValues;
};

export type RoutingFilterStageDiagnostics = {
    stage: "hints.only" | "hints.ignore" | "status_gate" | "provider_routing_status_gate" | "model_routing_status_gate" | "capability_status_gate" | "offer_scope_gate" | "residency_gate" | "pricing_cap_gate" | "health_breaker";
    beforeCount: number;
    afterCount: number;
    droppedProviders: Array<{
        providerId: string;
        apiModelId?: string | null;
        providerModelSlug?: string | null;
        reason: string;
    }>;
};

export type RoutingDiagnostics = {
    model: string;
    endpoint: Endpoint;
    priority: Priority;
    routingMode: RoutingMode;
    requestedRouting: {
        requestedMode: string | null;
        allowFallbacks: boolean;
        requireParameters: boolean;
        returnDiagnostics: boolean;
        requiredExecutionRegion: string | null;
        requiredDataRegion: string | null;
        requireZeroDataRetention: boolean | null;
        maxPrice: Record<string, any> | null;
        preferredMinThroughput: number | Record<string, any> | null;
        preferredMaxLatency: number | Record<string, any> | null;
    };
    strictPriority: boolean;
    testingMode: boolean;
    includeAlpha: boolean;
    includeAlphaHint: boolean;
    betaChannelEnabled: boolean;
    alphaChannelEnabled: boolean;
    providerCapabilitiesBeta: boolean;
    stickyRouting: {
        enabled: boolean;
        contextResolved: boolean;
        contextSource: "prompt_cache_key" | "context_hash" | null;
        hintedProvider: string | null;
        cachedReadTokens: number | null;
        applied: boolean;
    };
    filterStages: RoutingFilterStageDiagnostics[];
    consideredProviders: Array<{
        providerId: string;
        apiModelId: string | null;
        providerModelSlug: string | null;
        providerStatus: ProviderStatus;
        providerRoutingStatus: RoutingStatus;
        modelRoutingStatus: RoutingStatus;
        capabilityStatus: CapabilityStatus;
        baseWeight: number;
    }>;
    rankedProviders: Array<{
        providerId: string;
        apiModelId: string | null;
        providerModelSlug: string | null;
        score: number;
        breaker: ProviderHealth["breaker"];
        breakerUntilMs: number | null;
        scoreFactors: RoutingScoreFactors;
    }>;
    finalCandidateCount: number;
};

function roundDiagnosticNumber(value: number): number {
    return Number.isFinite(value) ? Number(value.toFixed(6)) : 0;
}

function getRoutingCandidateKey(candidate: Pick<ProviderCandidate, "providerId" | "apiModelId" | "providerModelSlug">): string {
    const providerId = String(candidate.providerId ?? "").trim();
    const providerModelSlug = String(candidate.providerModelSlug ?? "").trim();
    const apiModelId = String(candidate.apiModelId ?? "").trim();
    return `${providerId}::${providerModelSlug || apiModelId || "*"}`;
}

function normalizeOfferScope(
    value?: ProviderCandidate["offerScope"] | null,
): ProviderCandidate["offerScope"] {
    if (value === "global" || value === "regional" || value === "specialized") {
        return value;
    }
    return null;
}

function hasGlobalOfferSibling(
	candidates: ProviderCandidate[],
	candidate: ProviderCandidate,
): boolean {
    const familyId = String(candidate.providerFamilyId ?? "").trim().toLowerCase();
    if (!familyId) return false;
    return candidates.some((entry) =>
        String(entry.providerId ?? "").trim().toLowerCase() !==
            String(candidate.providerId ?? "").trim().toLowerCase() &&
        String(entry.providerFamilyId ?? "").trim().toLowerCase() === familyId &&
        normalizeOfferScope(entry.offerScope) === "global",
	);
}

function isZdrSpecializedOffer(candidate: ProviderCandidate): boolean {
	return (
		candidate.dataPolicyVariant === "zdr" &&
		normalizeOfferScope(candidate.offerScope) === "specialized" &&
		candidate.zeroDataRetention === "default"
	);
}

function hasZdrSpecializedSibling(
	candidates: ProviderCandidate[],
	candidate: ProviderCandidate,
): boolean {
	const familyId = String(candidate.providerFamilyId ?? "").trim().toLowerCase();
	if (!familyId) return false;
	return candidates.some((entry) =>
		String(entry.providerId ?? "").trim().toLowerCase() !==
			String(candidate.providerId ?? "").trim().toLowerCase() &&
		String(entry.providerFamilyId ?? "").trim().toLowerCase() === familyId &&
		isZdrSpecializedOffer(entry),
	);
}

function normalizeRequestedServiceTier(body: any): string | null {
	return normalizeTextServiceTier(readRequestedServiceTier(body).value) ?? null;
}

function hasSpecializedTierSibling(args: {
	candidates: ProviderCandidate[];
	candidate: ProviderCandidate;
	tier: string | null;
}): boolean {
	const familyId = String(args.candidate.providerFamilyId ?? "").trim().toLowerCase();
	if (!familyId || !args.tier) return false;
	return args.candidates.some((entry) =>
		String(entry.providerId ?? "").trim().toLowerCase() !==
			String(args.candidate.providerId ?? "").trim().toLowerCase() &&
		String(entry.providerFamilyId ?? "").trim().toLowerCase() === familyId &&
		normalizeOfferScope(entry.offerScope) === "specialized" &&
		String(entry.offerLabel ?? "").trim().toLowerCase() === args.tier,
	);
}

function expandProviderHintsForSpecializedTierOffers(args: {
	candidates: ProviderCandidate[];
	providerIds: string[];
	tier: string | null;
}): string[] {
	if (args.tier !== "priority") return args.providerIds;

	const expanded = new Set(args.providerIds);
	for (const requestedProviderId of args.providerIds) {
		const requestedCandidate = args.candidates.find(
			(candidate) => String(candidate.providerId ?? "").trim().toLowerCase() === requestedProviderId,
		);
		if (!requestedCandidate) continue;

		const familyId = String(requestedCandidate.providerFamilyId ?? "").trim().toLowerCase();
		if (!familyId) continue;

		for (const candidate of args.candidates) {
			if (normalizeOfferScope(candidate.offerScope) !== "specialized") continue;
			if (String(candidate.providerFamilyId ?? "").trim().toLowerCase() !== familyId) continue;
			if (String(candidate.offerLabel ?? "").trim().toLowerCase() !== args.tier) continue;
			expanded.add(candidate.providerId);
		}
	}

	return Array.from(expanded);
}

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
        workspaceId: string;
        body?: any;
        routingMode?: string | null;
        betaChannelEnabled?: boolean;
        alphaChannelEnabled?: boolean;
        providerCapabilitiesBeta?: boolean;
        testingMode?: boolean;
        requestId?: string | null;
        cacheAwareRouting?: boolean;
		collectDetailedDiagnostics?: boolean;
        meta?: {
            debug?: {
                enabled?: boolean;
            };
        };
    }
): Promise<{ ranked: RoutedCandidate[]; diagnostics: RoutingDiagnostics }> {
    const debugEnabled = Boolean(ctx.meta?.debug?.enabled);
	const collectDetailedDiagnostics = ctx.collectDetailedDiagnostics !== false;
    const { base, priority, strict } = parsePriority(ctx.model);
    const routingHints = getEffectiveRoutingHints(ctx.body);
    const requestedRoutingMode = routingHints.requestedMode;
    const requestedServiceTier = normalizeRequestedServiceTier(ctx.body);
    const suffixRoutingMode = priorityDefaultRoutingMode(priority);
    const mode = normalizeRoutingMode(
        requestedRoutingMode ?? suffixRoutingMode ?? ctx.routingMode,
    );
    const deterministicRequestSort = Boolean(requestedRoutingMode);
    const preset = applyRoutingMode(PRESETS[priority], mode);
    const hints = routingHints.merged as {
        mode?: string | null;
        order?: string[];
        only?: string[];
        ignore?: string[];
        include_alpha?: boolean;
        includeAlpha?: boolean;
        required_execution_region?: string | null;
        requiredExecutionRegion?: string | null;
        required_data_region?: string | null;
        requiredDataRegion?: string | null;
        require_zero_data_retention?: boolean | null;
        requireZeroDataRetention?: boolean | null;
    };
    const includeAlphaHint = Boolean(hints.include_alpha ?? hints.includeAlpha);
    const onlyHints = expandProviderHintsForSpecializedTierOffers({
        candidates,
        providerIds: normalizeProviderList(hints.only ?? []),
        tier: requestedServiceTier,
    });
    const ignoreHints = normalizeProviderList(hints.ignore ?? []);
    const orderedHints = expandProviderHintsForSpecializedTierOffers({
        candidates,
        providerIds: normalizeProviderList(hints.order ?? []),
        tier: requestedServiceTier,
    });
    const requiredExecutionRegion = routingHints.requiredExecutionRegion;
    const requiredDataRegion = routingHints.requiredDataRegion;
    const requireZeroDataRetention = routingHints.requireZeroDataRetention;
    const preferredMinThroughputValue = routingHints.preferredMinThroughput;
    const preferredMaxLatencyValue = routingHints.preferredMaxLatency;
    const preferredMinThroughput = extractRoutingPreferenceScalar(
        preferredMinThroughputValue,
    );
    const preferredMaxLatency = extractRoutingPreferenceScalar(
        preferredMaxLatencyValue,
    );
    const maxPrice = routingHints.maxPrice;
    const explicitlySelectedProviders = new Set([
        ...onlyHints,
        ...orderedHints,
    ]);
    const hasExplicitRegionPreference =
        (typeof requiredExecutionRegion === "string" &&
            requiredExecutionRegion.trim().length > 0) ||
        (typeof requiredDataRegion === "string" &&
            requiredDataRegion.trim().length > 0);
    const betaChannelEnabled = Boolean(ctx.betaChannelEnabled);
    const alphaChannelEnabled = Boolean(ctx.alphaChannelEnabled);
    const providerCapabilitiesBeta = Boolean(ctx.providerCapabilitiesBeta);
    const testingMode = Boolean(ctx.testingMode);
    const cacheAwareRoutingEnabled = ctx.cacheAwareRouting !== false;
    const allowBetaProviders = betaChannelEnabled || providerCapabilitiesBeta;
    const includeAlpha = allowBetaProviders && alphaChannelEnabled;
    const requestedMaxTokens = getRequestedMaxTokens(ctx.body);
    const filterStages: RoutingFilterStageDiagnostics[] = [];

    let stickyContext: StickyRoutingContext | null = null;
    let stickyHint: StickyRoutingEntry | null = null;
    let stickyRoutingApplied = false;

    if (cacheAwareRoutingEnabled) {
        try {
            stickyContext = await resolveStickyRoutingContext({
                endpoint: ctx.endpoint,
                body: ctx.body,
            });
            if (stickyContext) {
                stickyHint = readStickyRoutingOptimistic(
                    ctx.workspaceId,
                    ctx.endpoint,
                    base,
                    stickyContext.key,
                );
            }
        } catch (error) {
            console.warn("[gateway] sticky routing read failed", {
                endpoint: ctx.endpoint,
                model: ctx.model,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    const buildStickyDiagnostics = () => ({
        enabled: cacheAwareRoutingEnabled,
        contextResolved: Boolean(stickyContext),
        contextSource: stickyContext?.source ?? null,
        hintedProvider: stickyHint?.providerId ?? null,
        cachedReadTokens:
            typeof stickyHint?.cachedReadTokens === "number"
                ? stickyHint.cachedReadTokens
                : null,
        applied: stickyRoutingApplied,
    });

    const buildDiagnostics = (
        finalCandidateCount: number,
        rankedProviders: RoutingDiagnostics["rankedProviders"] = [],
		forceDetailed = false,
    ): RoutingDiagnostics => ({
        model: ctx.model,
        endpoint: ctx.endpoint,
        priority,
        routingMode: mode,
        requestedRouting: {
            requestedMode: requestedRoutingMode,
            allowFallbacks: routingHints.allowFallbacks,
            requireParameters: routingHints.requireParameters,
            returnDiagnostics: routingHints.returnDiagnostics,
            requiredExecutionRegion,
            requiredDataRegion,
            requireZeroDataRetention,
            maxPrice,
            preferredMinThroughput: preferredMinThroughputValue,
            preferredMaxLatency: preferredMaxLatencyValue,
        },
        strictPriority: strict,
        testingMode,
        includeAlpha,
        includeAlphaHint,
        betaChannelEnabled,
        alphaChannelEnabled,
        providerCapabilitiesBeta,
        stickyRouting: buildStickyDiagnostics(),
        filterStages,
		consideredProviders: collectDetailedDiagnostics || forceDetailed ? candidates.map((candidate) => ({
            providerId: candidate.providerId,
            apiModelId: candidate.apiModelId ?? null,
            providerModelSlug: candidate.providerModelSlug ?? null,
            providerStatus: normalizeProviderStatus(candidate.providerStatus),
            providerRoutingStatus: normalizeRoutingStatus(candidate.providerRoutingStatus),
            modelRoutingStatus: normalizeRoutingStatus(candidate.modelRoutingStatus),
            capabilityStatus: normalizeCapabilityStatus(candidate.capabilityStatus),
            baseWeight: roundDiagnosticNumber(candidate.baseWeight > 0 ? candidate.baseWeight : 1),
		})) : [],
		rankedProviders: collectDetailedDiagnostics || forceDetailed ? rankedProviders : [],
        finalCandidateCount,
    });

    const pushStage = (
        stage: RoutingFilterStageDiagnostics["stage"],
        before: ProviderCandidate[],
        after: ProviderCandidate[],
        reasonForDrop: (candidate: ProviderCandidate) => string,
    ) => {
		if (before.length === after.length) {
			filterStages.push({
				stage,
				beforeCount: before.length,
				afterCount: after.length,
				droppedProviders: [],
			});
			return;
		}
        const afterSet = new Set(after.map((candidate) => getRoutingCandidateKey(candidate)));
        const droppedProviders = before
            .filter((candidate) => !afterSet.has(getRoutingCandidateKey(candidate)))
            .map((candidate) => ({
                providerId: candidate.providerId,
                apiModelId: candidate.apiModelId ?? null,
                providerModelSlug: candidate.providerModelSlug ?? null,
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
		poolCandidates = filterStable(poolCandidates, (candidate) => allow.has(candidate.adapter.name));
        pushStage("hints.only", before, poolCandidates, () => "not_in_provider.only");
    }
    if (ignoreHints.length) {
        const before = poolCandidates;
        const deny = new Set(ignoreHints);
		poolCandidates = filterStable(poolCandidates, (candidate) => !deny.has(candidate.adapter.name));
        pushStage("hints.ignore", before, poolCandidates, () => "listed_in_provider.ignore");
    }
    if (!poolCandidates.length) poolCandidates = candidates;

    // Channel/status gating before health scoring.
    const beforeStatusGate = poolCandidates;
	poolCandidates = filterStable(poolCandidates, (candidate) => {
        if (testingMode) return true;
        const status = normalizeProviderStatus(candidate.providerStatus);
        if (status === "active") return true;
        if (status === "beta") return allowBetaProviders;
        if (status === "alpha") return includeAlpha;
        return false;
    });
    pushStage("status_gate", beforeStatusGate, poolCandidates, (candidate) => {
        const status = normalizeProviderStatus(candidate.providerStatus);
        if (status === "beta") return "beta_requires_team_beta_channel";
        if (status === "alpha") return "alpha_requires_beta_and_alpha_channels";
        if (status === "not_ready") return "provider_status_not_ready";
        return `provider_status_${status}`;
    });

    const beforeProviderRoutingStatusGate = poolCandidates;
	poolCandidates = filterStable(poolCandidates, (candidate) => {
        const routingStatus = normalizeRoutingStatus(candidate.providerRoutingStatus);
        if (routingStatus === "disabled") return false;
        return true;
    });
    pushStage("provider_routing_status_gate", beforeProviderRoutingStatusGate, poolCandidates, (candidate) => {
        const routingStatus = normalizeRoutingStatus(candidate.providerRoutingStatus);
        if (routingStatus === "disabled") return "provider_routing_status_disabled";
        return "provider_routing_status_" + routingStatus;
    });

    const beforeModelRoutingStatusGate = poolCandidates;
	poolCandidates = filterStable(poolCandidates, (candidate) => {
        const routingStatus = normalizeRoutingStatus(candidate.modelRoutingStatus);
        if (routingStatus === "disabled") return false;
        return true;
    });
    pushStage("model_routing_status_gate", beforeModelRoutingStatusGate, poolCandidates, (candidate) => {
        const routingStatus = normalizeRoutingStatus(candidate.modelRoutingStatus);
        if (routingStatus === "disabled") return "model_routing_status_disabled";
        return "model_routing_status_" + routingStatus;
    });

    const beforeCapabilityStatusGate = poolCandidates;
	poolCandidates = filterStable(poolCandidates, (candidate) => {
        const capabilityStatus = normalizeCapabilityStatus(candidate.capabilityStatus);
        if (capabilityStatus === "disabled") return false;
        if (capabilityStatus === "coming_soon") return false;
        if (capabilityStatus === "internal_testing" && !testingMode) return false;
        return true;
    });
    pushStage("capability_status_gate", beforeCapabilityStatusGate, poolCandidates, (candidate) => {
        const capabilityStatus = normalizeCapabilityStatus(candidate.capabilityStatus);
        if (capabilityStatus === "disabled") return "capability_status_disabled";
        if (capabilityStatus === "coming_soon") return "capability_status_coming_soon";
        if (capabilityStatus === "internal_testing") return "capability_status_internal_testing_requires_testing_mode";
        return "capability_status_" + capabilityStatus;
    });

    const beforeOfferScopeGate = poolCandidates;
	poolCandidates = filterStable(poolCandidates, (candidate) => {
        if (testingMode) return true;
        const offerScope = normalizeOfferScope(candidate.offerScope);
		if (explicitlySelectedProviders.has(candidate.providerId)) return true;
		if (isZdrSpecializedOffer(candidate)) return requireZeroDataRetention === true;
		if (
			requireZeroDataRetention === true &&
			candidate.dataPolicyVariant !== "zdr" &&
			hasZdrSpecializedSibling(beforeOfferScopeGate, candidate)
		) {
			return false;
		}
        if (offerScope === null || offerScope === "global") return true;
        if (hasExplicitRegionPreference) return true;
        if (
            offerScope === "specialized" &&
            requestedServiceTier === "priority" &&
            String(candidate.offerLabel ?? "").trim().toLowerCase() === "priority"
        ) {
            return true;
        }
        if (!hasGlobalOfferSibling(beforeOfferScopeGate, candidate)) return true;
        return false;
    });
    if (requestedServiceTier === "priority") {
		poolCandidates = filterStable(poolCandidates, (candidate) => {
            const offerScope = normalizeOfferScope(candidate.offerScope);
            if (offerScope !== "global") return true;
            return !hasSpecializedTierSibling({
                candidates: beforeOfferScopeGate,
                candidate,
                tier: requestedServiceTier,
            });
        });
    }
    pushStage("offer_scope_gate", beforeOfferScopeGate, poolCandidates, (candidate) => {
        const offerScope = normalizeOfferScope(candidate.offerScope);
		if (isZdrSpecializedOffer(candidate) && requireZeroDataRetention !== true) {
			return "zdr_offer_requires_zdr_request";
		}
		if (
			requireZeroDataRetention === true &&
			candidate.dataPolicyVariant !== "zdr" &&
			hasZdrSpecializedSibling(beforeOfferScopeGate, candidate)
		) {
			return "standard_offer_replaced_by_zdr_specialized_offer";
		}
        if (offerScope === "regional") return "regional_offer_requires_explicit_opt_in";
        if (
            offerScope === "global" &&
            requestedServiceTier === "priority" &&
            hasSpecializedTierSibling({
                candidates: beforeOfferScopeGate,
                candidate,
                tier: requestedServiceTier,
            })
        ) {
            return "global_offer_replaced_by_priority_specialized_offer";
        }
        if (offerScope === "specialized") return "specialized_offer_requires_explicit_opt_in";
        return "non_global_offer_requires_explicit_opt_in";
    });

    const beforeResidencyGate = poolCandidates;
	poolCandidates = filterStable(poolCandidates, (candidate) => {
        const result = providerMeetsResidencyRequirement(
            {
                residencyMode: candidate.residencyMode ?? null,
                executionRegions: candidate.executionRegions ?? null,
                dataRegions: candidate.dataRegions ?? null,
                zeroDataRetention: candidate.zeroDataRetention ?? null,
                residencyNotes: null,
                residencySourceUrl: null,
            },
            {
                requiredExecutionRegion,
                requiredDataRegion,
                requireZeroDataRetention,
            },
        );
        return result.ok;
    });
    pushStage("residency_gate", beforeResidencyGate, poolCandidates, (candidate) => {
        const result = providerMeetsResidencyRequirement(
            {
                residencyMode: candidate.residencyMode ?? null,
                executionRegions: candidate.executionRegions ?? null,
                dataRegions: candidate.dataRegions ?? null,
                zeroDataRetention: candidate.zeroDataRetention ?? null,
                residencyNotes: null,
                residencySourceUrl: null,
            },
            {
                requiredExecutionRegion,
                requiredDataRegion,
                requireZeroDataRetention,
            },
        );
        return result.reason ?? "residency_requirement_failed";
    });

    if (maxPrice) {
        const beforePricingCapGate = poolCandidates;
		poolCandidates = filterStable(poolCandidates, (candidate) =>
            candidateMatchesPriceCaps(candidate, maxPrice),
        );
        pushStage("pricing_cap_gate", beforePricingCapGate, poolCandidates, (candidate) => {
            if (!candidate.pricingCard) return "pricing_unavailable_for_max_price_filter";
            return "exceeds_max_price";
        });
    }

    if (!poolCandidates.length) {
		const diagnostics = buildDiagnostics(0, [], true);
        console.warn("[gateway] provider pool empty", {
            model: ctx.model,
            endpoint: ctx.endpoint,
            diagnostics,
        });
        return { ranked: [], diagnostics };
    }

    if (orderedHints.length) {
        const order = orderedHints;
        const ordered = order.flatMap((name) =>
            poolCandidates.filter((candidate) => candidate.adapter.name === name)
        );
        const orderedSet = new Set(ordered.map((candidate) => getRoutingCandidateKey(candidate)));
        const remaining = poolCandidates.filter((candidate) => !orderedSet.has(getRoutingCandidateKey(candidate)));
        poolCandidates = [...ordered, ...remaining];
    }

    const providerIds = poolCandidates.map(c => c.adapter.name);
    const healthMap = readHealthManyOptimistic(ctx.endpoint, base, providerIds);
    const healths = poolCandidates.map(candidate => ({
        candidate,
        adapter: candidate.adapter,
        h: healthMap[candidate.adapter.name],
    }));

    const now = Date.now();
    const isRecentOutage = (entry: { h: ProviderHealth }) =>
        entry.h.breaker === "open" && (entry.h.breaker_until_ms ?? 0) > now;
    const recentOutageCount = healths.filter(isRecentOutage).length;
    const pool = healths;
    if (recentOutageCount > 0) {
        filterStages.push({
            stage: "health_breaker",
            beforeCount: healths.length,
            afterCount: healths.length,
            droppedProviders: healths
                .filter(isRecentOutage)
                .map((entry) => ({
                    providerId: entry.candidate.providerId,
                    apiModelId: entry.candidate.apiModelId ?? null,
                    providerModelSlug: entry.candidate.providerModelSlug ?? null,
                    reason: "breaker_open_deranked",
                })),
        });
    }
    if (debugEnabled) {
        console.log("[gateway] provider pool", {
            model: ctx.model,
            endpoint: ctx.endpoint,
            candidates: candidates.length,
            poolCandidates: poolCandidates.length,
            viable: healths.length - recentOutageCount,
            openBreakers: recentOutageCount,
            filterStages,
        });
    }

    const latP50s = pool.map(v => v.h.lat_ewma_60s);
    const latTail = pool.map(v => Math.max(v.h.lat_ewma_300s, v.h.lat_ewma_60s * 1.6));
    const tpss = pool.map(v => v.h.tp_ewma_60s);
    const minP50 = Math.min(...latP50s), maxP50 = Math.max(...latP50s);
    const minTail = Math.min(...latTail), maxTail = Math.max(...latTail);
    const minTPS = Math.min(...tpss), maxTPS = Math.max(...tpss);

    const rng = seededRandom(hashSeed(`${ctx.requestId ?? ""}:${ctx.workspaceId}:${ctx.model}`));
    const priceScores = preset.wPrice > 0 ? computePriceScores(ctx.endpoint, pool.map((p) => p.candidate)) : new Map();
    const defaultPriceWeights = mode === "balanced"
        ? computeInverseSquarePriceWeights(ctx.endpoint, pool.map((p) => p.candidate))
        : new Map<string, number>();
    const scored = pool.map(v => {
        const h = v.h;
        const weight = v.candidate.baseWeight > 0 ? v.candidate.baseWeight : 1;
        const providerStatus = normalizeProviderStatus(v.candidate.providerStatus);
        const providerRoutingStatus = normalizeRoutingStatus(v.candidate.providerRoutingStatus);
        const modelRoutingStatus = normalizeRoutingStatus(v.candidate.modelRoutingStatus);
        const capabilityStatus = normalizeCapabilityStatus(v.candidate.capabilityStatus);
        const rolloutMultiplier =
            providerStatus === "beta"
                ? 0.05
                : providerStatus === "alpha"
                    ? 0.03
                    : 1;
        const capabilityRoutingMultiplier =
            capabilityStatus === "internal_testing"
                ? (testingMode ? 1 : 0)
                : capabilityStatus === "coming_soon"
                    ? 0
                    : routingStatusMultiplier(capabilityStatus);
        const routingStatusMultiplierCombined =
            routingStatusMultiplier(providerRoutingStatus) *
            routingStatusMultiplier(modelRoutingStatus) *
            capabilityRoutingMultiplier;
        const cacheRoutingMultiplier =
            stickyHint &&
            stickyHint.providerId === v.candidate.providerId &&
            shouldApplyStickyRoutingBoost(v.candidate, stickyHint)
                ? stickyRoutingCacheBoostMultiplier(stickyHint.cachedReadTokens)
                : 1;
        if (cacheRoutingMultiplier > 1) {
            stickyRoutingApplied = true;
        }
        const succ = 1 - h.err_ewma_60s;
        const reliability = sampleProviderReliability(h, rng);
        const p50Curve = 1 / (1 + (h.lat_ewma_60s / preset.L0));
        const p50Norm = 1 - normalise(h.lat_ewma_60s, minP50, maxP50);
        const tailNorm = 1 - normalise(Math.max(h.lat_ewma_300s, h.lat_ewma_60s * 1.6), minTail, maxTail);
        const tpsNorm = maxTPS > 0 ? normalise(h.tp_ewma_60s, minTPS, maxTPS) : 0;
        // A 429 drives request-local fallback. Edge-local in-flight counts are
        // incomplete and must not influence provider selection.
        const loadPen = 0;
        const candidateKey = getRoutingCandidateKey(v.candidate);
        const priceScore = mode === "balanced"
            ? (defaultPriceWeights.get(candidateKey) ?? 0.5)
            : preset.wPrice > 0
                ? (priceScores.get(v.candidate.providerId) ?? 0.5)
                : 0.5;
        const latencyPreferenceMultiplier = preferenceMultiplierForLatency(
            h.lat_ewma_60s,
            preferredMaxLatency,
        );
        const throughputPreferenceMultiplier = preferenceMultiplierForThroughput(
            h.tp_ewma_60s,
            preferredMinThroughput,
        );

        // Token affinity: prefer providers with limits close to requested max_tokens
        const tokenAffinity = calculateTokenAffinityScore(requestedMaxTokens, v.candidate.maxOutputTokens);
        const tokenWeight = 0.10; // 10% weight for token affinity

        const baseScore = mode === "balanced"
            ? priceScore *
                Math.max(0.05, reliability.sample) *
                Math.max(0.05, 1 - loadPen) *
                (0.5 + tokenAffinity)
            : preset.wSucc * succ +
                preset.wP50 * (0.5 * p50Curve + 0.5 * p50Norm) +
                preset.wTail * tailNorm +
                preset.wTPS * tpsNorm -
                preset.wLoad * loadPen +
                preset.wPrice * priceScore +
                tokenWeight * tokenAffinity +
                preset.noise * rng();
        const recentOutageMultiplier = isRecentOutage(v) ? 1e-9 : 1;

        const score = Math.max(
            0,
            baseScore *
                Math.max(weight, 0.0001) *
                rolloutMultiplier *
                routingStatusMultiplierCombined *
                cacheRoutingMultiplier *
                latencyPreferenceMultiplier *
                throughputPreferenceMultiplier *
                recentOutageMultiplier
        );
        const scoreFactorValues: RoutingScoreFactorValues = [
            succ,
            0.5 * p50Curve + 0.5 * p50Norm,
            tailNorm,
            tpsNorm,
            priceScore,
            reliability.sample,
            reliability.effectiveObservations,
            tokenAffinity,
            loadPen,
            weight,
            rolloutMultiplier,
            routingStatusMultiplierCombined,
            cacheRoutingMultiplier,
            latencyPreferenceMultiplier,
            throughputPreferenceMultiplier,
        ];
        return {
            candidate: v.candidate,
            adapter: v.adapter,
            health: h,
            score,
			scoreFactorValues,
			diagnostics: collectDetailedDiagnostics ? {
                providerId: v.candidate.providerId,
                apiModelId: v.candidate.apiModelId ?? null,
                providerModelSlug: v.candidate.providerModelSlug ?? null,
                score: roundDiagnosticNumber(score),
                breaker: h.breaker,
                breakerUntilMs:
                    typeof h.breaker_until_ms === "number" && Number.isFinite(h.breaker_until_ms)
                        ? h.breaker_until_ms
                        : null,
                scoreFactors: scoreFactorsFromValues(scoreFactorValues),
			} : null,
        };
    });
    const routableScored = scored.filter((entry) => entry.score > 0);
	const rankedProviderDiagnostics = (entries: typeof routableScored) =>
		collectDetailedDiagnostics
			? entries.map((entry) => entry.diagnostics!)
			: [];

    if (orderedHints.length) {
        const order = orderedHints;
        const ordered = order.flatMap((name) =>
            routableScored.filter((entry) => entry.adapter.name === name)
        );
        const orderedSet = new Set(
            ordered.map((entry) => getRoutingCandidateKey(entry.candidate))
        );
        const remaining = routableScored.filter(
            (entry) => !orderedSet.has(getRoutingCandidateKey(entry.candidate))
        );
        if (strict || deterministicRequestSort) {
            const ranked = [...ordered, ...remaining.sort((a, b) => b.score - a.score)];
            return {
                ranked,
			diagnostics: buildDiagnostics(ranked.length, rankedProviderDiagnostics(ranked)),
            };
        }
        const remainingRanked = mode === "balanced"
            ? remaining.sort((a, b) => b.score - a.score)
            : weightedOrder(remaining, (s) => s.score, rng);
        const ranked = [...ordered, ...remainingRanked];
        return {
            ranked,
			diagnostics: buildDiagnostics(ranked.length, rankedProviderDiagnostics(ranked)),
        };
    }

    if (strict || deterministicRequestSort) {
        const ranked = [...routableScored].sort((a, b) => b.score - a.score);
        return {
            ranked,
			diagnostics: buildDiagnostics(ranked.length, rankedProviderDiagnostics(ranked)),
        };
    }

    // Balanced/default already contains a Thompson draw. Sorting that sampled
    // utility avoids layering a second lottery on top of exploration.
    const ranked = mode === "balanced"
        ? [...routableScored].sort((a, b) => b.score - a.score)
        : weightedOrder(routableScored, (s) => s.score, rng);
    return {
        ranked,
		diagnostics: buildDiagnostics(ranked.length, rankedProviderDiagnostics(ranked)),
    };
}
