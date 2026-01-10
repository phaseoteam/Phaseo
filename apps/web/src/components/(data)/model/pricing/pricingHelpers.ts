import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";

/* ---------- shared types ---------- */
export type Direction = "input" | "output" | "cached" | "cachewrite" | "other";
export type Modality = "text" | "image" | "audio" | "video" | "embeddings" | "multimodal" | "other";
export type UnitClass = "token" | "image" | "minute" | "second" | "call" | "character" | "unknown";

export type Condition = { op: string; path: string; value: any; or_group?: number; and_index?: number };

export type TokenTier = {
    per1M: number;
    price: number;
    label: string; // range or condition label
    basePer1M?: number | null;
    discountEndsAt?: string | null;
    endpoint?: string | null;
    effFrom?: string | null;
    effTo?: string | null;
    ruleId?: string | null;
    isCurrent: boolean;
};

export type TokenTriple = { in: TokenTier[]; cached: TokenTier[]; out: TokenTier[]; };

export type QualityRow = { quality: string; items: { label: string; price: number }[]; };
export type ResolutionRow = { resolution: string; unitLabel: string; price: number };

export type ProviderSections = {
    providerName: string;
    providerId: string;
    textTokens?: TokenTriple;
    imageTokens?: TokenTriple;
    audioTokens?: TokenTriple;
    videoTokens?: TokenTriple;
    cacheWrites?: TokenTier[];               // NEW: cached_write_text_tokens etc.
    imageGen?: QualityRow[];
    videoGen?: ResolutionRow[];
    requests?: TokenTier[];                  // NEW: requests pricing
    otherRules: {
        meter: string;
        unitLabel: string;
        price: number;
        basePrice?: number | null;
        discountEndsAt?: string | null;
        endpoint?: string | null;
        ruleId?: string | null;
        conditions?: Condition[] | null;
    }[];
};

/* ---------- small utils ---------- */
export function fmtUSD(n: number, max = 6) {
    if (!isFinite(n)) return "—";
    const s = n.toFixed(max);
    return "$" + s.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}
export function fmtCompact(n: number) {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}b`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
    return `${n}`;
}
export function unitLabel(unit: UnitClass, unitSize?: number | null) {
    const u = Number(unitSize ?? 1);
    switch (unit) {
        case "token": return "Per 1M tokens";
        case "image": return u === 1 ? "Per image" : `Per ${u} images`;
        case "second": return u === 1 ? "Per second" : `Per ${u} seconds`;
        case "minute": return u === 1 ? "Per minute" : `Per ${u} minutes`;
        case "call": return u === 1 ? "Per call" : `Per ${u} calls`;
        case "character": return u === 1 ? "Per character" : `Per ${u} characters`;
        default: return u === 1 ? "Per unit" : `Per ${u} units`;
    }
}
export function perMillionIfTokens(unit: UnitClass, usdPerUnit: number, unitSize?: number | null) {
    if (unit !== "token") return null;
    const perToken = Number(unitSize ?? 1) > 0 ? usdPerUnit / Number(unitSize) : usdPerUnit;
    return perToken * 1_000_000;
}
export function isCurrentWindow(effFrom?: string | null, effTo?: string | null) {
    const n = new Date();
    if (effFrom && new Date(effFrom) > n) return false;
    if (effTo && new Date(effTo) < n) return false;
    return true;
}

/* ---------- parsing & labels ---------- */
export function parseMeter(meter?: string): { dir: Direction; mod: Modality; unit: UnitClass; raw: string } {
    const m = (meter || "").toLowerCase();
    let dir: Direction = "other";
    if (m.startsWith("input")) dir = "input";
    else if (m.startsWith("output")) dir = "output";
    else if (m.startsWith("cached_write")) dir = "cachewrite";
    else if (m.startsWith("cached")) dir = "cached";

    const mod: Modality =
        m.includes("text") ? "text" :
            m.includes("embed") ? "embeddings" :
                m.includes("image") ? "image" :
                    m.includes("audio") ? "audio" :
                        m.includes("video") ? "video" :
                            m.includes("multimodal") ? "multimodal" : "other";

    const unit: UnitClass =
        m.includes("token") ? "token" :
            (m.includes("image") && !m.includes("tokens")) ? "image" :
                m.includes("minute") ? "minute" :
                    m.includes("second") ? "second" :
                        m.includes("character") ? "character" :
                            (m.includes("call") || m.includes("request")) ? "call" : "unknown";

    return { dir, mod, unit, raw: m };
}

export type ConditionLabelPref = { prefer?: string[] }; // e.g. ['cache_ttl','quality','resolution']

export function conciseConditionLabel(conds?: Condition[] | null, pref: ConditionLabelPref = {}) {
    if (!conds?.length) return "All usage";
    const picks = pref.prefer ?? ["cache_ttl", "quality", "resolution", "size"];
    for (const key of picks) {
        const c = conds.find(x => x.path?.toLowerCase().includes(key));
        if (c) {
            const val = Array.isArray(c.value) ? c.value.join(" | ") : String(c.value);
            if (key === "cache_ttl" && val.toLowerCase() === "nx") {
                return "No cache";
            }
            if (key === "cache_ttl") {
                return `${val} Cache TTL`;
            }
            return `${key} = ${val}`;
        }
    }
    // else fall back to first condition
    const c = conds[0];
    const val = Array.isArray(c.value) ? c.value.join(" | ") : String(c.value);
    return `${c.path} ${c.op} ${val}`;
}

export function tokenRangeFromConditions(conds?: Condition[] | null) {
    if (!conds?.length) return null;
    const relevant = conds.filter(c => typeof c?.path === "string" && c.path.toLowerCase().includes("token"));
    if (!relevant.length) return null;

    let lower: number | null = null, upper: number | null = null, incLower = false, incUpper = false;
    for (const c of relevant) {
        const v = Number(c.value);
        if (!Number.isFinite(v)) continue;
        switch (String(c.op).toLowerCase()) {
            case "gt": lower = Math.max(lower ?? -Infinity, v); incLower = false; break;
            case "gte": lower = Math.max(lower ?? -Infinity, v); incLower = true; break;
            case "lt": upper = Math.min(upper ?? Infinity, v); incUpper = false; break;
            case "lte": upper = Math.min(upper ?? Infinity, v); incUpper = true; break;
        }
    }
    if (lower != null && upper != null) {
        const lo = incLower ? fmtCompact(lower) : fmtCompact(lower + 1);
        const hi = incUpper ? fmtCompact(upper) : fmtCompact(upper - 1);
        return `${lo} - ${hi}`;
    }
    if (upper != null) return `${incUpper ? "≤" : "<"} ${fmtCompact(upper)}`;
    if (lower != null) return `${incLower ? "≥" : ">"} ${fmtCompact(lower)}`;
    return null;
}

/* image/video helpers */
function normaliseResolutionValues(val: any): string[] {
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === "string") {
        const s = val.trim();
        if (s.startsWith("[") && s.endsWith("]")) {
            const jsonish = s.replace(/''/g, '"');
            try { const arr = JSON.parse(jsonish); if (Array.isArray(arr)) return arr.map(String); }
            catch { }
            return s.slice(1, -1).split(",").map((x) => x.replace(/['"]/g, "").trim());
        }
        return [s.replace(/['"]/g, "")];
    }
    return [];
}
export function extractResolutionLabels(conds?: Condition[] | null): string[] {
    if (!conds?.length) return [];
    const c = conds.find(x => String(x.path).toLowerCase().includes("resolution"));
    if (!c) return [];
    return normaliseResolutionValues(c.value);
}

export function qualityRank(q: string) {
    const s = q.toLowerCase();
    if (s.includes("low")) return 0;
    if (s.includes("medium") || s.includes("med")) return 1;
    if (s.includes("high")) return 2;
    return 99;
}

/* ---------- section builder (uses fixes) ---------- */
export function buildProviderSections(p: ProviderPricing, plan: string): ProviderSections {
    const rules = p.pricing_rules.filter(r => (r.pricing_plan || "standard") === plan);
    const endpointByKey = new Map<string, string>();
    for (const pm of p.provider_models) {
        if (pm.key && pm.endpoint) endpointByKey.set(pm.key, pm.endpoint);
    }

    const out: ProviderSections = {
        providerName: p.provider.api_provider_name || p.provider.api_provider_id,
        providerId: p.provider.api_provider_id,
        otherRules: [],
    };

    type RuleEntry = {
        rule: any;
        base?: any;
        endpoint: string | null;
        groupKey: string;
        dedupeKey: string;
    };
    const grouped = new Map<string, any[]>();
    for (const r of rules as any[]) {
        const endpoint = endpointByKey.get(r.model_key) ?? null;
        const matchKey = JSON.stringify(r.match ?? []);
        const groupKey = `${endpoint ?? "unknown"}|${r.meter}|${r.unit}|${r.unit_size}|${matchKey}`;
        if (!grouped.has(groupKey)) grouped.set(groupKey, []);
        grouped.get(groupKey)!.push(r);
    }

    const entries: RuleEntry[] = [];
    for (const [groupKey, group] of grouped) {
        const sorted = [...group].sort((a, b) => {
            if (a.priority !== b.priority) return b.priority - a.priority;
            const aFrom = a.effective_from ? new Date(a.effective_from).getTime() : 0;
            const bFrom = b.effective_from ? new Date(b.effective_from).getTime() : 0;
            return bFrom - aFrom;
        });
        const current = sorted[0];
        const base = sorted.find((r) => r.priority < current.priority);
        const endpoint = endpointByKey.get(current.model_key) ?? null;
        const matchKey = JSON.stringify(current.match ?? []);
        const dedupeKey = `${current.meter}|${current.unit}|${current.unit_size}|${matchKey}`;
        entries.push({ rule: current, base, endpoint, groupKey, dedupeKey });
    }

    const hasDiscounts = entries.some(
        (e) => e.base && e.rule.effective_to
    );
    const seen = new Set<string>();
    const filteredEntries = entries.filter((e) => {
        if (hasDiscounts) return true;
        if (seen.has(e.dedupeKey)) return false;
        seen.add(e.dedupeKey);
        return true;
    });

    for (const entry of filteredEntries) {
        const r = entry.rule;
        const base = entry.base;
        const { dir, mod, unit } = parseMeter(r.meter || "");
        const unitSize = r.unit_size ?? 1;
        const price = Number(r.price_per_unit ?? 0);
        const per1M = perMillionIfTokens(unit, price, unitSize);
        const current = isCurrentWindow(r.effective_from, r.effective_to);
        const conds: Condition[] = Array.isArray(r.match)
            ? r.match.map((m: any) => ({ op: String(m.op ?? ""), path: String(m.path ?? ""), value: m.value, or_group: m.or_group, and_index: m.and_index }))
            : [];

        if (!current) continue; // core shows now-effective only
        const basePrice = base ? Number(base.price_per_unit ?? 0) : null;
        const basePer1M =
            basePrice != null && unit === "token"
                ? perMillionIfTokens(
                    unit,
                    basePrice,
                    base.unit_size ?? unitSize
                )
                : null;
        const discountEndsAt = base && r.effective_to ? r.effective_to : null;

        // 1) token tiles (text/image/audio/video)
        if (unit === "token" && ["text", "image", "audio", "video"].includes(mod)) {
            const range = tokenRangeFromConditions(conds);
            const label = range ?? conciseConditionLabel(conds);  // <-- FIX: show cache_ttl etc. instead of "All usage"
            const tier: TokenTier = {
                per1M: per1M ?? 0,
                price,
                label,
                basePer1M: basePer1M ?? null,
                discountEndsAt,
                endpoint: entry.endpoint,
                effFrom: r.effective_from ?? null,
                effTo: r.effective_to ?? null,
                ruleId: r.id ?? null,
                isCurrent: true,
            };
            const push = (triple: TokenTriple | undefined, which: "in" | "cached" | "out") => {
                const t = triple ?? { in: [], cached: [], out: [] };
                t[which].push(tier);
                return t;
            };

            if (mod === "text") {
                if (dir === "input") out.textTokens = push(out.textTokens, "in");
                else if (dir === "cached") out.textTokens = push(out.textTokens, "cached");
                else if (dir === "output") out.textTokens = push(out.textTokens, "out");
                else if (dir === "cachewrite") {    // cache writes as own section
                    (out.cacheWrites ??= []).push(tier);
                }
            } else if (mod === "image") {
                if (dir === "input") out.imageTokens = push(out.imageTokens, "in");
                else if (dir === "cached") out.imageTokens = push(out.imageTokens, "cached");
                else if (dir === "output") out.imageTokens = push(out.imageTokens, "out");
                else if (dir === "cachewrite") (out.cacheWrites ??= []).push(tier);
            } else if (mod === "audio") {
                if (dir === "input") out.audioTokens = push(out.audioTokens, "in");
                else if (dir === "cached") out.audioTokens = push(out.audioTokens, "cached");
                else if (dir === "output") out.audioTokens = push(out.audioTokens, "out");
                else if (dir === "cachewrite") (out.cacheWrites ??= []).push(tier);
            } else if (mod === "video") {
                if (dir === "input") out.videoTokens = push(out.videoTokens, "in");
                else if (dir === "cached") out.videoTokens = push(out.videoTokens, "cached");
                else if (dir === "output") out.videoTokens = push(out.videoTokens, "out");
                else if (dir === "cachewrite") (out.cacheWrites ??= []).push(tier);
            }
            continue;
        }

        // 2) image generation (per image, output)
        if (mod === "image" && dir === "output" && unit === "image") {
            const quality = (conds.find(c => c.path.toLowerCase().includes("quality"))?.value ?? "Unspecified") as string;
            const resVals = extractResolutionLabels(conds);
            const resolution = resVals.length ? resVals.join(" • ") : "Any resolution";
            (out.imageGen ??= []);
            let q = out.imageGen.find(x => x.quality.toLowerCase() === String(quality).toLowerCase());
            if (!q) { q = { quality: String(quality), items: [] }; out.imageGen.push(q); }
            q.items.push({ label: String(resolution), price });
            continue;
        }

        // 3) video generation per time
        if (mod === "video" && dir === "output" && (unit === "second" || unit === "minute")) {
            const res = extractResolutionLabels(conds);
            const label = res.length ? res.join(" • ") : "Any resolution";
            (out.videoGen ??= []).push({ resolution: label, unitLabel: unitLabel(unit, unitSize), price });
            continue;
        }

        // 4) requests (per call/request)
        if (unit === "call" && (r.meter || "").toLowerCase().includes("request")) {
            const label = conciseConditionLabel(conds);
            const tier: TokenTier = {
                per1M: 0, // Not applicable for requests
                price,
                label,
                basePer1M: null,
                discountEndsAt,
                endpoint: entry.endpoint,
                effFrom: r.effective_from ?? null,
                effTo: r.effective_to ?? null,
                ruleId: r.id ?? null,
                isCurrent: true,
            };
            (out.requests ??= []).push(tier);
            continue;
        }

        // 5) everything else → Advanced
        out.otherRules.push({
            meter: r.meter || "—",
            unitLabel: unitLabel(unit, unitSize),
            price,
            basePrice,
            discountEndsAt,
            endpoint: entry.endpoint,
            ruleId: r.id ?? null,
            conditions: conds.length ? conds : null,
        });
    }

    // Sorts
    const sortTiers = (tt?: TokenTriple) => {
        if (!tt) return;
        const s = (arr: TokenTier[]) => arr.sort((a, b) => a.per1M - b.per1M);
        s(tt.in); s(tt.cached); s(tt.out);
    };
    sortTiers(out.textTokens);
    sortTiers(out.imageTokens);
    sortTiers(out.audioTokens);
    sortTiers(out.videoTokens);
    out.cacheWrites?.sort((a, b) => a.per1M - b.per1M);

    out.imageGen?.forEach((q) => q.items.sort((a, b) => a.label.localeCompare(b.label)));
    out.imageGen?.sort((a, b) => {
        const ra = qualityRank(a.quality), rb = qualityRank(b.quality);
        if (ra !== rb) return ra - rb;
        const mina = Math.min(...a.items.map((i) => i.price));
        const minb = Math.min(...b.items.map((i) => i.price));
        return mina - minb;
    });
    out.videoGen?.sort((a, b) => a.resolution.localeCompare(b.resolution));
    out.requests?.sort((a, b) => a.price - b.price);

    return out;
}
