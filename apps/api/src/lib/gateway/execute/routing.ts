// file: lib/gateway/execute/routing.ts
import type { Endpoint } from "../../types";
import type { ProviderCandidate } from "../before/types";
import { readHealthMany, ProviderHealth } from "./health";

type Priority = "default" | "fast" | "quick";
const PRESETS: Record<Priority, { wSucc: number; wP50: number; wTail: number; wTPS: number; wLoad: number; noise: number; L0: number }> = {
    default: { wSucc: 0.35, wP50: 0.35, wTail: 0.15, wTPS: 0.10, wLoad: 0.05, noise: 0.02, L0: 800 },
    fast: { wSucc: 0.30, wP50: 0.50, wTail: 0.15, wTPS: 0.03, wLoad: 0.02, noise: 0.005, L0: 600 },
    quick: { wSucc: 0.25, wP50: 0.45, wTail: 0.20, wTPS: 0.08, wLoad: 0.02, noise: 0.015, L0: 500 },
};

function parsePriority(model: string): { base: string; priority: Priority; strict: boolean } {
    const lower = model.toLowerCase();
    if (lower.endsWith(":fast")) {
        return { base: model, priority: "fast", strict: true };
    }
    if (lower.endsWith(":quick")) {
        return { base: model, priority: "quick", strict: true };
    }
    return { base: model, priority: "default", strict: false };
}

function normalise(v: number, min: number, max: number) {
    if (max === min) return 0.5;
    const x = (v - min) / (max - min);
    return Math.max(0, Math.min(1, x));
}

function weightedOrder<T>(items: T[], weight: (x: T) => number): T[] {
    const bag = items.map(i => ({ i, w: Math.max(0.0001, weight(i)) }));
    const out: T[] = [];
    while (bag.length) {
        const total = bag.reduce((s, b) => s + b.w, 0);
        let r = Math.random() * total;
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

export type RoutedCandidate = {
    candidate: ProviderCandidate;
    adapter: ProviderCandidate["adapter"];
    score: number;
    health: ProviderHealth;
};

export async function routeProviders(
    candidates: ProviderCandidate[],
    ctx: { endpoint: Endpoint; model: string; teamId: string; body?: any }
): Promise<RoutedCandidate[]> {
    const { base, priority, strict } = parsePriority(ctx.model);
    const preset = PRESETS[priority];
    const hints = (ctx.body?.provider ?? {}) as { only?: string[]; ignore?: string[] };

    let poolCandidates = candidates;
    if (hints.only?.length) {
        const allow = new Set(hints.only);
        poolCandidates = poolCandidates.filter(c => allow.has(c.adapter.name));
    }
    if (hints.ignore?.length) {
        const deny = new Set(hints.ignore);
        poolCandidates = poolCandidates.filter(c => !deny.has(c.adapter.name));
    }
    if (!poolCandidates.length) poolCandidates = candidates;

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
    });

    const latP50s = pool.map(v => v.h.lat_ewma_10s);
    const latTail = pool.map(v => Math.max(v.h.lat_ewma_60s, v.h.lat_ewma_10s * 1.6));
    const tpss = pool.map(v => v.h.tp_ewma_60s);
    const loads = pool.map(v => v.h.current_load);

    const minP50 = Math.min(...latP50s), maxP50 = Math.max(...latP50s);
    const minTail = Math.min(...latTail), maxTail = Math.max(...latTail);
    const minTPS = Math.min(...tpss), maxTPS = Math.max(...tpss);

    const scored = pool.map(v => {
        const h = v.h;
        const weight = v.candidate.baseWeight > 0 ? v.candidate.baseWeight : 1;
        const succ = 1 - h.err_ewma_10s;
        const p50Curve = 1 / (1 + (h.lat_ewma_10s / preset.L0));
        const p50Norm = 1 - normalise(h.lat_ewma_10s, minP50, maxP50);
        const tailNorm = 1 - normalise(Math.max(h.lat_ewma_60s, h.lat_ewma_10s * 1.6), minTail, maxTail);
        const tpsNorm = maxTPS > 0 ? normalise(h.tp_ewma_60s, minTPS, maxTPS) : 0;
        const loadPen = h.current_load;

        const baseScore =
            preset.wSucc * succ +
            preset.wP50 * (0.5 * p50Curve + 0.5 * p50Norm) +
            preset.wTail * tailNorm +
            preset.wTPS * tpsNorm -
            preset.wLoad * loadPen +
            preset.noise * Math.random();

        const score = Math.max(0, baseScore * Math.max(weight, 0.0001));
        return { candidate: v.candidate, adapter: v.adapter, health: h, score };
    });

    if (strict) {
        return [...scored].sort((a, b) => b.score - a.score);
    }

    return weightedOrder(scored, s => s.score);
}
