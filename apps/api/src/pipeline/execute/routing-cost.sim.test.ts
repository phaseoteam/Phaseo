// Offline before/after comparison of default text routing (provider-score-v8 vs routing-cost-v9).
// Opt-in: ROUTING_COST_SIM=1 pnpm exec vitest run src/pipeline/execute/routing-cost.sim.test.ts
// Each request goes through the real routeProviders; attempts then succeed, fail or hit a
// rate limit with each simulated provider's true rates, falling back down the ranked list.
import { describe, expect, it, vi } from "vitest";
import { routeProviders } from "./routing";

let algorithmSetting = "v9";
let healthByProvider: Record<string, any> = {};

vi.mock("@/runtime/env", async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    getBindings: () => ({ GATEWAY_ROUTING_ALGORITHM: algorithmSetting }),
}));
vi.mock("@core/provider-rate-limits", () => ({
    providerLimitModel: () => null,
    providerQuotaPressure: () => 0,
    providerQuotaHeadroom: () => 1,
}));
vi.mock("./health", () => ({
    readHealthManyOptimistic: (_endpoint: string, _model: string, ids: string[]) =>
        Object.fromEntries(ids.map((id) => [id, healthByProvider[id]])),
}));
vi.mock("./sticky-routing", () => ({
    readStickyRoutingForRouting: async () => null,
    resolveStickyRoutingContext: async () => null,
    STICKY_ROUTING_PIN_MULTIPLIER: 1_000_000,
}));

type SimProvider = {
    id: string;
    /** USD per million tokens. */
    input: number;
    cachedRead?: number;
    output: number;
    /** Share of prompt tokens this provider actually serves from cache. */
    hitRate?: number;
    ttftMs: number;
    tps: number;
    /** Provider-caused failures, and rate-limit rejections, per attempt. */
    errorRate: number;
    limitRate: number;
};

type Scenario = { name: string; promptTokens: number; outputTokens: number; providers: SimProvider[] };

const PER_M = 1 / 1_000_000;
const FAILED_ATTEMPT_MS = 1_500;
const REJECTED_ATTEMPT_MS = 250;

function card(p: SimProvider) {
    const rule = (meter: string, perM: number) => ({
        pricing_plan: "standard", meter, unit: "token", unit_size: 1, price_per_unit: String(perM * PER_M),
        currency: "USD", match: [], priority: 1,
    });
    return {
        provider: p.id, model: "sim/model", endpoint: "chat.completions", effective_from: null, effective_to: null,
        currency: "USD", version: "1",
        rules: [
            rule("input_text_tokens", p.input),
            rule("output_text_tokens", p.output),
            ...(p.cachedRead !== undefined ? [rule("cached_read_text_tokens", p.cachedRead)] : []),
        ],
    };
}

/** Steady-state health, as the live trackers would converge to under this traffic. */
function steadyHealth(p: SimProvider, s: Scenario, now: number) {
    const failures = p.errorRate + p.limitRate;
    return {
        endpoint: "chat.completions", provider: p.id, model: "sim/model",
        lat_ewma_10s: p.ttftMs, lat_ewma_60s: p.ttftMs, lat_ewma_300s: p.ttftMs * 1.3,
        err_ewma_10s: failures, err_ewma_60s: failures, err_ewma_300s: failures,
        rate_10s: 2, rate_60s: 2, tp_ewma_60s: s.outputTokens / ((p.ttftMs + (s.outputTokens / p.tps) * 1000) / 1000),
        rec_ok_ew_60s: 60 * (1 - failures), rec_tot_ew_60s: 60, rec_ok_ew_10s: 20 * (1 - failures), rec_tot_ew_10s: 20,
        rec_rate_limited_ew_10s: 20 * p.limitRate,
        prompt_tok_ewma: s.promptTokens, cached_tok_ewma: s.promptTokens * (p.hitRate ?? 0), out_tok_ewma: s.outputTokens, tok_weight: 20,
        last_success_ms: now, inflight: 0, current_load: 0,
        breaker: "closed", breaker_until_ms: 0, breaker_attempts: 0,
        last_ts_10s: now, last_ts_60s: now, last_ts_300s: now, last_updated: now,
    };
}

function rng(seed: number) {
    let x = seed >>> 0 || 1;
    return () => {
        x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
        return x / 4294967296;
    };
}

function percentile(values: number[], q: number) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
}

async function run(s: Scenario, algorithm: "v8" | "v9", requests: number) {
    algorithmSetting = algorithm;
    const now = Date.now();
    healthByProvider = Object.fromEntries(s.providers.map((p) => [p.id, steadyHealth(p, s, now)]));
    const candidates = s.providers.map((p) => ({
        providerId: p.id, providerFamilyId: null, offerScope: null, offerLabel: null, dataPolicyVariant: "standard",
        providerStatus: "active", externalRoutingOverride: false, providerRoutingStatus: "active", modelRoutingStatus: "active",
        capabilityStatus: "active", residencyMode: "unknown", executionRegions: null, dataRegions: null,
        zeroDataRetention: false, availabilityPolicy: null, apiModelId: null, adapter: { name: p.id },
        baseWeight: 1, byokMeta: [], pricingCard: card(p), providerModelSlug: null,
    })) as any[];
    const byId = new Map(s.providers.map((p) => [p.id, p]));
    const random = rng(17);
    const ttft: number[] = [], total: number[] = [], speed: number[] = [];
    let cost = 0, retried = 0, limited = 0, failed = 0, wastedMs = 0;
    const share = new Map<string, number>();
    let version = "";
    for (let i = 0; i < requests; i++) {
        const routed = await routeProviders(candidates, {
            endpoint: "chat.completions", model: "sim/model", workspaceId: "sim", requestId: `${s.name}-${i}`, body: {},
        });
        version ||= routed.diagnostics.algorithm.version;
        let waited = 0, hitLimit = false, served: SimProvider | null = null;
        for (const entry of routed.ranked) {
            const p = byId.get(entry.candidate.providerId)!;
            const roll = random();
            if (roll < p.limitRate) { hitLimit = true; waited += REJECTED_ATTEMPT_MS; continue; }
            if (roll < p.limitRate + p.errorRate) { waited += FAILED_ATTEMPT_MS; continue; }
            served = p;
            break;
        }
        if (waited > 0) retried++;
        if (hitLimit) limited++;
        wastedMs += waited;
        if (!served) { failed++; continue; }
        share.set(served.id, (share.get(served.id) ?? 0) + 1);
        const hit = served.hitRate ?? 0;
        cost += s.promptTokens * (1 - hit) * served.input * PER_M +
            s.promptTokens * hit * (served.cachedRead ?? served.input) * PER_M +
            s.outputTokens * served.output * PER_M;
        const generationMs = (s.outputTokens / served.tps) * 1000;
        ttft.push(waited + served.ttftMs);
        total.push(waited + served.ttftMs + generationMs);
        speed.push(s.outputTokens / ((served.ttftMs + generationMs) / 1000));
    }
    return {
        version,
        ttftP50: percentile(ttft, 0.5), ttftP95: percentile(ttft, 0.95),
        tpsP50: percentile(speed, 0.5),
        totalP50: percentile(total, 0.5), totalP95: percentile(total, 0.95),
        costPer1k: (cost / (requests - failed)) * 1000,
        retryPct: (retried / requests) * 100, limitPct: (limited / requests) * 100,
        wastedMsPerRequest: wastedMs / requests,
        share: Object.fromEntries([...share].map(([id, n]) => [id, Math.round((n / requests) * 1000) / 10])),
    };
}

const SCENARIOS: Scenario[] = [
    {
        // A popular open-weight model with a wide spread of hosts.
        name: "open-model-six-hosts", promptTokens: 6_000, outputTokens: 600,
        providers: [
            { id: "cheap-slow-flaky", input: 0.20, output: 0.80, ttftMs: 2_400, tps: 25, errorRate: 0.03, limitRate: 0.06 },
            { id: "budget", input: 0.25, output: 1.00, ttftMs: 900, tps: 60, errorRate: 0.005, limitRate: 0.01 },
            { id: "cached", input: 0.30, cachedRead: 0.03, output: 1.20, hitRate: 0.5, ttftMs: 600, tps: 90, errorRate: 0.003, limitRate: 0.005 },
            { id: "fast", input: 0.35, output: 1.40, ttftMs: 400, tps: 150, errorRate: 0.002, limitRate: 0 },
            { id: "premium", input: 0.60, output: 2.40, ttftMs: 300, tps: 250, errorRate: 0.001, limitRate: 0 },
            { id: "cheap-input-pricey-output", input: 0.15, output: 2.50, ttftMs: 800, tps: 70, errorRate: 0.01, limitRate: 0.01 },
        ],
    },
    {
        // Agent loops: long, mostly cached prompts and short replies.
        name: "agent-long-context", promptTokens: 90_000, outputTokens: 900,
        providers: [
            { id: "lowest-list-price", input: 0.50, cachedRead: 0.05, output: 2.00, hitRate: 0.05, ttftMs: 2_000, tps: 40, errorRate: 0.01, limitRate: 0.04 },
            { id: "good-cache", input: 0.60, cachedRead: 0.12, output: 2.20, hitRate: 0.8, ttftMs: 900, tps: 70, errorRate: 0.004, limitRate: 0.01 },
            { id: "no-cache-price", input: 0.55, output: 2.00, ttftMs: 1_200, tps: 60, errorRate: 0.004, limitRate: 0.01 },
            { id: "fast-pricey", input: 0.90, cachedRead: 0.09, output: 3.00, hitRate: 0.7, ttftMs: 500, tps: 120, errorRate: 0.002, limitRate: 0 },
        ],
    },
    {
        // Two equally priced hosts; one is degrading.
        name: "equal-price-one-degrading", promptTokens: 3_000, outputTokens: 400,
        providers: [
            { id: "healthy", input: 1.00, output: 3.00, ttftMs: 700, tps: 80, errorRate: 0.002, limitRate: 0.005 },
            { id: "degrading", input: 0.95, output: 2.90, ttftMs: 1_100, tps: 70, errorRate: 0.08, limitRate: 0.02 },
        ],
    },
];

describe.runIf(process.env.ROUTING_COST_SIM === "1")("routing cost simulation", () => {
    it("compares v8 and v9 on each scenario", { timeout: 600_000 }, async () => {
        const requests = Number(process.env.ROUTING_COST_SIM_REQUESTS ?? 20_000);
        const report: Record<string, unknown> = {};
        for (const scenario of SCENARIOS) {
            const before = await run(scenario, "v8", requests);
            const after = await run(scenario, "v9", requests);
            expect(before.version).toBe("provider-score-v8");
            expect(after.version).toBe("routing-cost-v9");
            report[scenario.name] = { before, after };
        }
        console.log(JSON.stringify({ requests, report }, null, 2));
    });
});
