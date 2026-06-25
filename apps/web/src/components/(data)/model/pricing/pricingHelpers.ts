import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import {
    formatProviderOfferDisplayName,
    resolveProviderLogoId,
} from "@/lib/providers/providerOffers";
import { getProviderPricingRulesForPlan } from "@/components/(data)/model/pricing/providerPlanRouting";

/* ---------- shared types ---------- */
export type Direction = "input" | "output" | "cached" | "cachewrite" | "other";
export type Modality = "text" | "image" | "audio" | "video" | "embeddings" | "multimodal" | "other";
export type UnitClass = "token" | "pixel" | "image" | "video" | "minute" | "second" | "call" | "character" | "unknown";

export type Condition = { op: string; path: string; value: any; or_group?: number; and_index?: number };

export type PriceComparisonKind = "discount" | "vs-standard";
export type PriceComparisonDirection = "cheaper" | "pricier" | "same" | null;

export type TokenTier = {
    per1M: number;
    price: number;
    label: string; // range or condition label
    basePer1M?: number | null;
    basePrice?: number | null;
    comparisonKind?: PriceComparisonKind | null;
    comparisonDirection?: PriceComparisonDirection;
    discountEndsAt?: string | null;
    endpoint?: string | null;
    effFrom?: string | null;
    effTo?: string | null;
    ruleId?: string | null;
    isCurrent: boolean;
};

export type TokenTriple = {
    in: TokenTier[];
    cached: TokenTier[];
    write: TokenTier[];
    out: TokenTier[];
};

export type QualityRow = {
    quality: string;
    items: {
        label: string;
        price: number;
        basePrice?: number | null;
        comparisonKind?: PriceComparisonKind | null;
        comparisonDirection?: PriceComparisonDirection;
        discountEndsAt?: string | null;
    }[];
};
export type ResolutionRow = {
    resolution: string;
    unitLabel: string;
    price: number;
    audioMode?: "with-audio" | "without-audio" | null;
    basePrice?: number | null;
    comparisonKind?: PriceComparisonKind | null;
    comparisonDirection?: PriceComparisonDirection;
    discountEndsAt?: string | null;
};
export type UsageRow = {
    label: string;
    price: number;
    unitLabel: string;
    mod: "image" | "video";
    basePrice?: number | null;
    comparisonKind?: PriceComparisonKind | null;
    comparisonDirection?: PriceComparisonDirection;
    discountEndsAt?: string | null;
    endpoint?: string | null;
    ruleId?: string | null;
    isCurrent: boolean;
};

export type PricingSectionKey =
    | "textTokens"
    | "requests"
    | "imageInputs"
    | "videoInputs"
    | "imageTokens"
    | "imageGen"
    | "audioTokens"
    | "videoTokens"
    | "videoGen"
    | "other";

export type UpcomingPricingChange = {
    sectionKey: PricingSectionKey;
    title: string;
    subtitle?: string | null;
    price: number;
    currentPrice?: number | null;
    unitLabel: string;
    effectiveFrom: string;
    endpoint?: string | null;
    trend?: "up" | "down" | "flat" | null;
};

export type ProviderSections = {
    providerName: string;
    providerId: string;
    logoProviderId: string;
    textTokens?: TokenTriple;
    imageTokens?: TokenTriple;
    audioTokens?: TokenTriple;
    videoTokens?: TokenTriple;
    imageGen?: QualityRow[];
    videoGen?: ResolutionRow[];
    mediaInputs?: UsageRow[];                // NEW: input_image, input_video_seconds
    requests?: TokenTier[];                  // NEW: requests pricing
    upcomingChanges?: UpcomingPricingChange[];
    otherRules: {
        meter: string;
        unitLabel: string;
        price: number;
        basePrice?: number | null;
        comparisonKind?: PriceComparisonKind | null;
        comparisonDirection?: PriceComparisonDirection;
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
        case "pixel":
            if (u === 1_000_000) return "Per 1M pixels";
            return u === 1 ? "Per pixel" : `Per ${u} pixels`;
        case "image": return u === 1 ? "Per image" : `Per ${u} images`;
        case "video": return u === 1 ? "Per video" : `Per ${u} videos`;
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

function normalizePricingPlan(plan?: string | null) {
    const normalized = String(plan ?? "").trim().toLowerCase();
    return normalized || "standard";
}

/* ---------- parsing & labels ---------- */
export function parseMeter(meter?: string, explicitUnit?: string | null): { dir: Direction; mod: Modality; unit: UnitClass; raw: string } {
    const m = (meter || "").toLowerCase();
    const u = (explicitUnit || "").toLowerCase();
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
        u.includes("token") ? "token" :
            u.includes("pixel") ? "pixel" :
            u.includes("image") ? "image" :
                (u.includes("video") || u.includes("clip")) ? "video" :
                    u.includes("minute") ? "minute" :
                        u.includes("second") ? "second" :
                            u.includes("character") ? "character" :
                                (u.includes("call") || u.includes("request")) ? "call" :
                                    m.includes("token") ? "token" :
                                        m.includes("pixel") ? "pixel" :
                                        (m.includes("image") && !m.includes("tokens")) ? "image" :
                                            m.includes("video") ? "video" :
                                                m.includes("minute") ? "minute" :
                                                    m.includes("second") ? "second" :
                                                        m.includes("character") ? "character" :
                                                            (m.includes("call") || m.includes("request")) ? "call" : "unknown";

    return { dir, mod, unit, raw: m };
}

function endpointToModality(endpoint?: string | null): Modality | null {
    const normalized = String(endpoint ?? "").trim().toLowerCase();
    if (!normalized) return null;
    if (normalized.startsWith("text.")) return "text";
    if (
        normalized.startsWith("chat.") ||
        normalized === "responses" ||
        normalized.startsWith("responses.")
    ) {
        return "text";
    }
    if (normalized.startsWith("image.")) return "image";
    if (normalized.startsWith("audio.")) return "audio";
    if (normalized.startsWith("video.")) return "video";
    if (normalized.includes("embed")) return "embeddings";
    return null;
}

function classifyMeterWithEndpoint(
    meter?: string,
    explicitUnit?: string | null,
    endpoint?: string | null,
): { dir: Direction; mod: Modality; unit: UnitClass; raw: string } {
    const parsed = parseMeter(meter, explicitUnit);
    if (parsed.mod !== "other" || parsed.unit !== "token") return parsed;
    const endpointModality = endpointToModality(endpoint);
    return endpointModality ? { ...parsed, mod: endpointModality } : parsed;
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
    if (typeof val === "number" || typeof val === "boolean") {
        return [String(val)];
    }
    return [];
}
export function extractResolutionLabels(conds?: Condition[] | null): string[] {
    if (!conds?.length) return [];
    const c = conds.find(x => String(x.path).toLowerCase().includes("resolution"));
    if (!c) return [];
    return normaliseResolutionValues(c.value);
}

function extractVideoDurationLabels(conds?: Condition[] | null): string[] {
    if (!conds?.length) return [];
    const c = conds.find((x) => {
        const path = String(x.path).toLowerCase();
        return path.includes("seconds") || path.includes("duration");
    });
    if (!c) return [];
    return normaliseResolutionValues(c.value)
        .map((value) => {
            const n = Number(value);
            if (!Number.isFinite(n)) return `${String(value).trim()}s`;
            return `${n}s`;
        })
        .filter(Boolean);
}

function extractVideoAudioMode(conds?: Condition[] | null): "with-audio" | "without-audio" | null {
    if (!conds?.length) return null;
    const parseBoolValues = (value: any): boolean[] => {
        const rawValues = Array.isArray(value) ? value : [value];
        return rawValues
            .map((v) => {
                if (typeof v === "boolean") return v;
                const s = String(v).trim().toLowerCase();
                if (s === "true" || s === "1" || s === "yes" || s === "enabled" || s === "t" || s === "on") return true;
                if (s === "false" || s === "0" || s === "no" || s === "disabled" || s === "f" || s === "off") return false;
                return null;
            })
            .filter((v): v is boolean => v !== null);
    };
    const resolveFromCondition = (c: Condition): "with-audio" | "without-audio" | null => {
        const boolValues = parseBoolValues(c.value);
        if (!boolValues.length) return null;
        const hasTrue = boolValues.includes(true);
        const hasFalse = boolValues.includes(false);
        const op = String(c.op ?? "").toLowerCase();
        const isNegation = op === "ne" || op === "neq" || op === "not_eq";

        if (isNegation) {
            if (hasTrue && !hasFalse) return "without-audio";
            if (hasFalse && !hasTrue) return "with-audio";
            return null;
        }
        if (hasTrue && !hasFalse) return "with-audio";
        if (hasFalse && !hasTrue) return "without-audio";
        return null;
    };
    const audioCandidates = conds.filter((x) =>
        String(x.path ?? "").trim().toLowerCase() === "video_params.audio"
    );
    const fallbackAudioCandidates =
        audioCandidates.length > 0
            ? []
            : conds.filter((x) => String(x.path ?? "").toLowerCase().includes("audio"));
    for (const candidate of [...audioCandidates, ...fallbackAudioCandidates]) {
        const resolved = resolveFromCondition(candidate);
        if (resolved) return resolved;
    }
    return null;
}

function videoAudioModeLabel(mode: "with-audio" | "without-audio" | null): string | null {
    if (mode === "with-audio") return "With audio";
    if (mode === "without-audio") return "No audio";
    return null;
}

export function qualityRank(q: string) {
    const s = q.toLowerCase();
    if (s.includes("low")) return 0;
    if (s.includes("medium") || s.includes("med")) return 1;
    if (s.includes("high")) return 2;
    return 99;
}

function directionLabel(dir: Direction): string | null {
    if (dir === "input") return "Input";
    if (dir === "output") return "Output";
    if (dir === "cached") return "Cache Reads";
    if (dir === "cachewrite") return "Cache Writes";
    return null;
}

function cacheWriteTtlLabelFromMeter(meter?: string | null): string | null {
    const normalized = String(meter ?? "").trim().toLowerCase();
    if (normalized === "cached_write_text_tokens_5m") return "5 min TTL";
    if (normalized === "cached_write_text_tokens_1h") return "1 hour TTL";
    return null;
}

function modalityLabel(mod: Modality): string | null {
    if (mod === "text") return "Text";
    if (mod === "image") return "Image";
    if (mod === "audio") return "Audio";
    if (mod === "video") return "Video";
    if (mod === "embeddings") return "Embeddings";
    if (mod === "multimodal") return "Multimodal";
    return null;
}

function buildUpcomingChangeLabels(
    rule: any,
    endpoint?: string | null,
): {
    sectionKey: PricingSectionKey;
    title: string;
    subtitle?: string | null;
} {
    const { dir, mod, unit } = classifyMeterWithEndpoint(
        rule.meter || "",
        rule.unit || "",
        endpoint,
    );
    const conds: Condition[] = Array.isArray(rule.match)
        ? rule.match.map((m: any) => ({
            op: String(m.op ?? ""),
            path: String(m.path ?? ""),
            value: m.value,
            or_group: m.or_group,
            and_index: m.and_index,
        }))
        : [];

    if (unit === "token" && ["text", "image", "audio", "video"].includes(mod)) {
        const modLabel = modalityLabel(mod) ?? "Token";
        const scope =
            cacheWriteTtlLabelFromMeter(rule.meter) ??
            tokenRangeFromConditions(conds) ??
            conciseConditionLabel(conds);
        return {
            sectionKey:
                mod === "text"
                    ? "textTokens"
                    : mod === "image"
                    ? "imageTokens"
                    : mod === "audio"
                    ? "audioTokens"
                    : mod === "video"
                    ? "videoTokens"
                    : "other",
            title: `${modLabel} Tokens${directionLabel(dir) ? ` · ${directionLabel(dir)}` : ""}`,
            subtitle: scope === "All usage" ? null : scope,
        };
    }

    if (mod === "image" && dir === "output" && unit === "image") {
        const qualityCondition = conds.find((c) => c.path.toLowerCase().includes("quality"));
        const resVals = extractResolutionLabels(conds);
        const quality = qualityCondition?.value ? String(qualityCondition.value) : null;
        const resolution = resVals.length ? resVals.join(" / ") : null;
        return {
            sectionKey: "imageGen",
            title: "Image Generation",
            subtitle: [quality, resolution].filter(Boolean).join(" · ") || null,
        };
    }

    if ((mod === "image" || mod === "video") && unit === "pixel") {
        const scope = conciseConditionLabel(conds);
        return {
            sectionKey: mod === "image" ? "imageInputs" : "videoInputs",
            title: mod === "image" ? "Image Pixels" : "Video Pixels",
            subtitle: scope === "All usage" ? null : scope,
        };
    }

    if (mod === "video" && dir === "output" && (unit === "second" || unit === "minute" || unit === "video")) {
        const resVals = extractResolutionLabels(conds);
        const durations = extractVideoDurationLabels(conds);
        const audioLabel = videoAudioModeLabel(extractVideoAudioMode(conds));
        let subtitle: string | null = null;
        const parts: string[] = [];
        if (resVals.length) parts.push(resVals.join(" / "));
        if (durations.length) parts.push(durations.join(" / "));
        if (audioLabel) parts.push(audioLabel);
        if (parts.length) subtitle = parts.join(" - ");
        return { sectionKey: "videoGen", title: "Video Generation", subtitle };
    }

    if (unit === "call" && String(rule.meter || "").toLowerCase().includes("request")) {
        const scope = conciseConditionLabel(conds);
        return {
            sectionKey: "requests",
            title: "Requests",
            subtitle: scope === "All usage" ? null : scope,
        };
    }

    if (
        dir === "input" &&
        ((mod === "image" && unit === "image") || (mod === "video" && (unit === "second" || unit === "minute")))
    ) {
        const scope = conciseConditionLabel(conds);
        return {
            sectionKey: mod === "image" ? "imageInputs" : "videoInputs",
            title: `${modalityLabel(mod) ?? "Media"} Inputs`,
            subtitle: scope === "All usage" ? null : scope,
        };
    }

    const fallbackScope = conciseConditionLabel(conds);
    return {
        sectionKey: "other",
        title: formatMeterName(rule.meter || "Other"),
        subtitle: fallbackScope === "All usage" ? null : fallbackScope,
    };
}

function ruleConditions(rule: any): Condition[] {
    return Array.isArray(rule?.match)
        ? rule.match.map((m: any) => ({
            op: String(m.op ?? "").toLowerCase(),
            path: String(m.path ?? "").toLowerCase(),
            value: m.value,
            or_group: m.or_group,
            and_index: m.and_index,
        }))
        : [];
}

function normalizeConditionValues(value: any): string[] {
    if (Array.isArray(value)) return value.map((v) => String(v).toLowerCase());
    if (typeof value === "string") return normaliseResolutionValues(value).map((v) => String(v).toLowerCase());
    if (typeof value === "number" || typeof value === "boolean") return [String(value).toLowerCase()];
    return [];
}

function normalizeNumericConditionValues(value: any): number[] {
    const rawValues = Array.isArray(value) ? value : [value];
    return rawValues
        .map((entry) => {
            if (typeof entry === "number") return Number.isFinite(entry) ? entry : null;
            if (typeof entry === "string") {
                const trimmed = entry.trim();
                if (!trimmed) return null;
                const parsed = Number(trimmed);
                return Number.isFinite(parsed) ? parsed : null;
            }
            return null;
        })
        .filter((entry): entry is number => entry !== null);
}

function isLowerBoundOp(op: string): boolean {
    return op === "gt" || op === "gte";
}

function isUpperBoundOp(op: string): boolean {
    return op === "lt" || op === "lte";
}

function coversNumericValue(candidate: Condition, value: number): boolean {
    const op = String(candidate.op ?? "").toLowerCase();
    const numericValues = normalizeNumericConditionValues(candidate.value);
    if (!numericValues.length) return false;

    if (op === "eq") return numericValues[0] === value;
    if (op === "in") return numericValues.includes(value);
    if (op === "gt") return value > numericValues[0]!;
    if (op === "gte") return value >= numericValues[0]!;
    if (op === "lt") return value < numericValues[0]!;
    if (op === "lte") return value <= numericValues[0]!;
    return false;
}

function lowerBoundCovers(candidateOp: string, candidateValue: number, targetOp: string, targetValue: number): boolean {
    if (Number.isInteger(candidateValue) && Number.isInteger(targetValue)) {
        const candidateMin = candidateOp === "gt" ? candidateValue + 1 : candidateValue;
        const targetMin = targetOp === "gt" ? targetValue + 1 : targetValue;
        return candidateMin <= targetMin;
    }

    if (candidateValue < targetValue) return true;
    if (candidateValue > targetValue) return false;
    const candidateInclusive = candidateOp === "gte";
    const targetInclusive = targetOp === "gte";
    return candidateInclusive || !targetInclusive;
}

function upperBoundCovers(candidateOp: string, candidateValue: number, targetOp: string, targetValue: number): boolean {
    if (Number.isInteger(candidateValue) && Number.isInteger(targetValue)) {
        const candidateMax = candidateOp === "lt" ? candidateValue - 1 : candidateValue;
        const targetMax = targetOp === "lt" ? targetValue - 1 : targetValue;
        return candidateMax >= targetMax;
    }

    if (candidateValue > targetValue) return true;
    if (candidateValue < targetValue) return false;
    const candidateInclusive = candidateOp === "lte";
    const targetInclusive = targetOp === "lte";
    return candidateInclusive || !targetInclusive;
}

function numericConditionCovers(candidate: Condition, target: Condition): boolean {
    const cOp = String(candidate.op ?? "").toLowerCase();
    const tOp = String(target.op ?? "").toLowerCase();
    const cNums = normalizeNumericConditionValues(candidate.value);
    const tNums = normalizeNumericConditionValues(target.value);

    if (!cNums.length || !tNums.length) return false;

    if (tOp === "eq") {
        const targetValue = tNums[0];
        return targetValue == null ? false : coversNumericValue(candidate, targetValue);
    }

    if (tOp === "in") {
        return tNums.every((value) => coversNumericValue(candidate, value));
    }

    if (isLowerBoundOp(cOp) && isLowerBoundOp(tOp)) {
        const candidateValue = cNums[0];
        const targetValue = tNums[0];
        return candidateValue == null || targetValue == null
            ? false
            : lowerBoundCovers(cOp, candidateValue, tOp, targetValue);
    }

    if (isUpperBoundOp(cOp) && isUpperBoundOp(tOp)) {
        const candidateValue = cNums[0];
        const targetValue = tNums[0];
        return candidateValue == null || targetValue == null
            ? false
            : upperBoundCovers(cOp, candidateValue, tOp, targetValue);
    }

    return false;
}

function conditionCovers(candidate: Condition, target: Condition): boolean {
    if ((candidate.path ?? "").toLowerCase() !== (target.path ?? "").toLowerCase()) return false;
    const cOp = String(candidate.op ?? "").toLowerCase();
    const tOp = String(target.op ?? "").toLowerCase();
    const cVals = normalizeConditionValues(candidate.value);
    const tVals = normalizeConditionValues(target.value);

    if (tOp === "eq") {
        const wanted = tVals[0];
        if (!wanted) return false;
        if (cOp === "eq") return cVals[0] === wanted;
        if (cOp === "in") return cVals.includes(wanted);
        return false;
    }

    if (tOp === "in") {
        if (!tVals.length) return false;
        if (cOp === "in") return tVals.every((v) => cVals.includes(v));
        if (cOp === "eq") return tVals.length === 1 && cVals[0] === tVals[0];
        return numericConditionCovers(candidate, target);
    }

    return numericConditionCovers(candidate, target) || (
        cOp === tOp &&
        JSON.stringify(candidate.value) === JSON.stringify(target.value)
    );
}

export function ruleMatchCovers(candidateRule: any, targetRule: any): boolean {
    const targetConds = ruleConditions(targetRule);
    if (!targetConds.length) return true;
    const candidateConds = ruleConditions(candidateRule);
    if (!candidateConds.length) return false;
    return targetConds.every((targetCond) =>
        candidateConds.some((candidateCond) => conditionCovers(candidateCond, targetCond))
    );
}

/* ---------- section builder (uses fixes) ---------- */
export function buildProviderSections(p: ProviderPricing, plan: string): ProviderSections {
    const now = new Date();
    const nowMs = now.getTime();
    const normalizedPlan = normalizePricingPlan(plan);
    const standardRules = getProviderPricingRulesForPlan(p, "standard");
    const rules = getProviderPricingRulesForPlan(p, normalizedPlan);
    const endpointByKey = new Map<string, string>();
    for (const pm of p.provider_models) {
        if (!pm.endpoint) continue;
        if (pm.id) endpointByKey.set(pm.id, pm.endpoint);
        if (pm.api_provider_id && pm.model_id) {
            endpointByKey.set(
                `${pm.api_provider_id}:${pm.model_id}:${pm.endpoint}`,
                pm.endpoint,
            );
        }
    }

    const out: ProviderSections = {
        providerName: formatProviderOfferDisplayName({
            providerId: p.provider.api_provider_id,
            providerName: p.provider.api_provider_name || p.provider.api_provider_id,
            offerLabel: p.provider.offer_label ?? null,
            offerScope: p.provider.offer_scope ?? null,
        }),
        providerId: p.provider.api_provider_id,
        logoProviderId: resolveProviderLogoId({
            providerId: p.provider.api_provider_id,
            providerFamilyId: p.provider.provider_family_id ?? null,
        }),
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
    const toMs = (value?: string | null) => {
        if (!value) return null;
        const ms = new Date(value).getTime();
        return Number.isFinite(ms) ? ms : null;
    };
    const isCurrentRule = (r: any) => {
        const from = toMs(r.effective_from);
        if (from !== null && from > nowMs) return false;
        const to = toMs(r.effective_to);
        if (to !== null && to <= nowMs) return false;
        return true;
    };
    const sortByPriorityAndFromDesc = (a: any, b: any) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        const aFrom = toMs(a.effective_from);
        const bFrom = toMs(b.effective_from);
        return (bFrom ?? -Infinity) - (aFrom ?? -Infinity);
    };
    const ruleSignature = (r: any) => {
        const endpoint = endpointByKey.get(r.model_key) ?? "unknown";
        return `${endpoint}|${r.meter}|${r.unit}|${r.unit_size}`;
    };
    const ruleSignatureIgnoringEndpoint = (r: any) =>
        `${r.meter}|${r.unit}|${r.unit_size}`;
    const currentRulesBySignature = new Map<string, any[]>();
    for (const r of rules as any[]) {
        if (!isCurrentRule(r)) continue;
        const sig = ruleSignature(r);
        const list = currentRulesBySignature.get(sig) ?? [];
        list.push(r);
        currentRulesBySignature.set(sig, list);
    }
    const currentStandardRulesBySignature = new Map<string, any[]>();
    const currentStandardRulesBySignatureIgnoringEndpoint = new Map<string, any[]>();
    for (const r of standardRules as any[]) {
        if (!isCurrentRule(r)) continue;
        const sig = ruleSignature(r);
        const list = currentStandardRulesBySignature.get(sig) ?? [];
        list.push(r);
        currentStandardRulesBySignature.set(sig, list);
        const endpointAgnosticSig = ruleSignatureIgnoringEndpoint(r);
        const endpointAgnosticList =
            currentStandardRulesBySignatureIgnoringEndpoint.get(
                endpointAgnosticSig,
            ) ?? [];
        endpointAgnosticList.push(r);
        currentStandardRulesBySignatureIgnoringEndpoint.set(
            endpointAgnosticSig,
            endpointAgnosticList,
        );
    }

    for (const r of rules as any[]) {
        const endpoint = endpointByKey.get(r.model_key) ?? null;
        const matchKey = JSON.stringify(r.match ?? []);
        const groupKey = `${endpoint ?? "unknown"}|${r.meter}|${r.unit}|${r.unit_size}|${matchKey}`;
        if (!grouped.has(groupKey)) grouped.set(groupKey, []);
        grouped.get(groupKey)!.push(r);
    }
    const standardGrouped = new Map<string, any[]>();
    for (const r of standardRules as any[]) {
        const endpoint = endpointByKey.get(r.model_key) ?? null;
        const matchKey = JSON.stringify(r.match ?? []);
        const groupKey = `${endpoint ?? "unknown"}|${r.meter}|${r.unit}|${r.unit_size}|${matchKey}`;
        if (!standardGrouped.has(groupKey)) standardGrouped.set(groupKey, []);
        standardGrouped.get(groupKey)!.push(r);
    }

    const entries: RuleEntry[] = [];
    const upcomingChanges: UpcomingPricingChange[] = [];
    for (const [groupKey, group] of grouped) {
        const currentRules = group.filter(isCurrentRule);
        const upcomingRules = group
            .filter((r) => {
                const from = toMs(r.effective_from);
                return from !== null && from > nowMs;
            })
            .sort((a, b) => {
                const aFrom = toMs(a.effective_from) ?? Infinity;
                const bFrom = toMs(b.effective_from) ?? Infinity;
                if (aFrom !== bFrom) return aFrom - bFrom;
                if (a.priority !== b.priority) return b.priority - a.priority;
                return 0;
            });
        const nextUpcoming = upcomingRules[0];

        if (nextUpcoming?.effective_from) {
            const { sectionKey, title, subtitle } = buildUpcomingChangeLabels(
                nextUpcoming,
                endpointByKey.get(nextUpcoming.model_key) ?? null,
            );
            const nextPriceRaw = Number(nextUpcoming.price_per_unit ?? Number.NaN);
            const nextPrice = Number.isFinite(nextPriceRaw) ? nextPriceRaw : null;
            const exactCurrentCandidate = [...currentRules].sort(sortByPriorityAndFromDesc)[0];
            const signatureCurrentPool =
                currentRulesBySignature.get(ruleSignature(nextUpcoming)) ?? [];
            const coverageCurrentCandidate = signatureCurrentPool
                .filter((candidate) => ruleMatchCovers(candidate, nextUpcoming))
                .sort(sortByPriorityAndFromDesc)[0];
            const currentCandidate = exactCurrentCandidate ?? coverageCurrentCandidate;
            const currentPriceRaw = currentCandidate ? Number(currentCandidate.price_per_unit ?? Number.NaN) : Number.NaN;
            const currentPrice = Number.isFinite(currentPriceRaw) ? currentPriceRaw : null;
            let trend: UpcomingPricingChange["trend"] = null;
            if (nextPrice != null && currentPrice != null) {
                if (nextPrice > currentPrice) trend = "up";
                else if (nextPrice < currentPrice) trend = "down";
                else trend = "flat";
            }
            if (nextPrice != null) {
                upcomingChanges.push({
                    sectionKey,
                    title,
                    subtitle,
                    price: nextPrice,
                    currentPrice,
                    unitLabel: unitLabel(
                        classifyMeterWithEndpoint(
                            nextUpcoming.meter || "",
                            nextUpcoming.unit || "",
                            endpointByKey.get(nextUpcoming.model_key) ?? null,
                        ).unit,
                        nextUpcoming.unit_size ?? 1,
                    ),
                    effectiveFrom: nextUpcoming.effective_from,
                    endpoint: endpointByKey.get(nextUpcoming.model_key) ?? null,
                    trend,
                });
            }
        }

        if (!currentRules.length) continue;

        const sorted = [...currentRules].sort(sortByPriorityAndFromDesc);
        const current = sorted[0];
        const currentPrice = Number(current.price_per_unit ?? Number.NaN);
        const currentFrom = toMs(current.effective_from) ?? -Infinity;

        let baseCandidates = currentRules.filter((r) => r.priority < current.priority);
        if (!baseCandidates.length) {
            baseCandidates = currentRules.filter((r) => {
                if (r.priority !== current.priority) return false;
                const from = toMs(r.effective_from) ?? -Infinity;
                return from < currentFrom;
            });
        }

        const base = [...baseCandidates]
            .sort((a, b) => {
                if (a.priority !== b.priority) return b.priority - a.priority;
                const aFrom = toMs(a.effective_from);
                const bFrom = toMs(b.effective_from);
                return (bFrom ?? -Infinity) - (aFrom ?? -Infinity);
            })
            .find((candidate) => {
                const candidatePrice = Number(candidate.price_per_unit ?? Number.NaN);
                if (!Number.isFinite(candidatePrice) || !Number.isFinite(currentPrice)) {
                    return false;
                }
                return candidatePrice > currentPrice;
            });
        const scheduledBase =
            !base && nextUpcoming
                ? (() => {
                      const nextPrice = Number(nextUpcoming.price_per_unit ?? Number.NaN);
                      if (!Number.isFinite(nextPrice) || !Number.isFinite(currentPrice)) {
                          return null;
                      }
                      return nextPrice > currentPrice ? nextUpcoming : null;
                  })()
                : null;
        const endpoint = endpointByKey.get(current.model_key) ?? null;
        const matchKey = JSON.stringify(current.match ?? []);
        const dedupeKey = `${current.meter}|${current.unit}|${current.unit_size}|${matchKey}`;
        entries.push({
            rule: current,
            base: base ?? scheduledBase ?? null,
            endpoint,
            groupKey,
            dedupeKey,
        });
    }

    if (upcomingChanges.length) {
        const seenUpcoming = new Set<string>();
        out.upcomingChanges = upcomingChanges
            .sort((a, b) => {
                const aFrom = new Date(a.effectiveFrom).getTime();
                const bFrom = new Date(b.effectiveFrom).getTime();
                if (aFrom !== bFrom) return aFrom - bFrom;
                return a.title.localeCompare(b.title);
            })
            .filter((row) => {
                const key = `${row.title}|${row.subtitle ?? ""}|${row.price}|${row.effectiveFrom}|${row.unitLabel}`;
                if (seenUpcoming.has(key)) return false;
                seenUpcoming.add(key);
                return true;
            });
    }

    const seen = new Set<string>();
    const filteredEntries = entries.filter((e) => {
        if (seen.has(e.dedupeKey)) return false;
        seen.add(e.dedupeKey);
        return true;
    });

    for (const entry of filteredEntries) {
        const r = entry.rule;
        const base = entry.base;
        const { dir, mod, unit } = classifyMeterWithEndpoint(
            r.meter || "",
            r.unit || "",
            entry.endpoint,
        );
        const unitSize = r.unit_size ?? 1;
        const price = Number(r.price_per_unit ?? 0);
        const per1M = perMillionIfTokens(unit, price, unitSize);
        const current = isCurrentWindow(r.effective_from, r.effective_to);
        const conds: Condition[] = Array.isArray(r.match)
            ? r.match.map((m: any) => ({ op: String(m.op ?? ""), path: String(m.path ?? ""), value: m.value, or_group: m.or_group, and_index: m.and_index }))
            : [];

        const basePriceRaw = base ? Number(base.price_per_unit ?? Number.NaN) : Number.NaN;
        const basePrice = Number.isFinite(basePriceRaw) ? basePriceRaw : null;
        const effectiveToMs = toMs(r.effective_to);
        const currentPriority = Number(r.priority ?? Number.NaN);
        const basePriority = Number(base?.priority ?? Number.NaN);
        const hasPriorityOverride =
            Number.isFinite(currentPriority) &&
            Number.isFinite(basePriority) &&
            currentPriority !== basePriority;
        const hasFutureEnd = effectiveToMs != null && effectiveToMs > nowMs;
        const hasActiveDiscount =
            basePrice != null &&
            basePrice > price &&
            (hasFutureEnd || hasPriorityOverride);
        let displayBasePrice = hasActiveDiscount ? basePrice : null;
        let comparisonBaseUnitSize = base?.unit_size ?? unitSize;
        let comparisonKind: PriceComparisonKind | null = hasActiveDiscount ? "discount" : null;
        let comparisonDirection: PriceComparisonDirection =
            hasActiveDiscount ? "cheaper" : null;
        if (!hasActiveDiscount && normalizedPlan !== "standard") {
            const standardCurrentGroup = (standardGrouped.get(entry.groupKey) ?? [])
                .filter(isCurrentRule)
                .sort(sortByPriorityAndFromDesc);
            const exactStandard = standardCurrentGroup[0];
            const signatureStandardPool =
                currentStandardRulesBySignature.get(ruleSignature(r)) ?? [];
            const coveringStandard = signatureStandardPool
                .filter((candidate) => ruleMatchCovers(candidate, r))
                .sort(sortByPriorityAndFromDesc)[0];
            const endpointAgnosticStandardPool =
                currentStandardRulesBySignatureIgnoringEndpoint.get(
                    ruleSignatureIgnoringEndpoint(r),
                ) ?? [];
            const endpointAgnosticCoveringStandard = endpointAgnosticStandardPool
                .filter((candidate) => ruleMatchCovers(candidate, r))
                .sort(sortByPriorityAndFromDesc)[0];
            const standardBaseRule =
                exactStandard ??
                coveringStandard ??
                endpointAgnosticCoveringStandard;
            const standardBasePriceRaw = standardBaseRule
                ? Number(standardBaseRule.price_per_unit ?? Number.NaN)
                : Number.NaN;
            const standardBasePrice = Number.isFinite(standardBasePriceRaw)
                ? standardBasePriceRaw
                : null;
            if (standardBasePrice != null && standardBasePrice !== price) {
                displayBasePrice = standardBasePrice;
                comparisonBaseUnitSize = standardBaseRule?.unit_size ?? unitSize;
                comparisonKind = "vs-standard";
                comparisonDirection = standardBasePrice > price ? "cheaper" : "pricier";
            }
        }
        const basePer1M =
            displayBasePrice != null && unit === "token"
                ? perMillionIfTokens(
                    unit,
                    displayBasePrice,
                    comparisonBaseUnitSize
                )
                : null;
        const discountEndsAt = hasActiveDiscount && hasFutureEnd ? r.effective_to ?? null : null;

        // 1) token tiles (text/image/audio/video)
        if (unit === "token" && ["text", "image", "audio", "video"].includes(mod)) {
            const range = tokenRangeFromConditions(conds);
            const label =
                cacheWriteTtlLabelFromMeter(r.meter) ??
                range ??
                conciseConditionLabel(conds);  // <-- FIX: show cache_ttl etc. instead of "All usage"
            const tier: TokenTier = {
                per1M: per1M ?? 0,
                price,
                label,
                basePer1M: basePer1M ?? null,
                basePrice: displayBasePrice,
                comparisonKind,
                comparisonDirection,
                discountEndsAt,
                endpoint: entry.endpoint,
                effFrom: r.effective_from ?? null,
                effTo: r.effective_to ?? null,
                ruleId: r.id ?? null,
                isCurrent: current,
            };
            const push = (triple: TokenTriple | undefined, which: "in" | "cached" | "write" | "out") => {
                const t = triple ?? { in: [], cached: [], write: [], out: [] };
                t[which].push(tier);
                return t;
            };

            if (mod === "text") {
                if (dir === "input") out.textTokens = push(out.textTokens, "in");
                else if (dir === "cached") out.textTokens = push(out.textTokens, "cached");
                else if (dir === "output") out.textTokens = push(out.textTokens, "out");
                else if (dir === "cachewrite") out.textTokens = push(out.textTokens, "write");
            } else if (mod === "image") {
                if (dir === "input") out.imageTokens = push(out.imageTokens, "in");
                else if (dir === "cached") out.imageTokens = push(out.imageTokens, "cached");
                else if (dir === "output") out.imageTokens = push(out.imageTokens, "out");
                else if (dir === "cachewrite") out.imageTokens = push(out.imageTokens, "write");
            } else if (mod === "audio") {
                if (dir === "input") out.audioTokens = push(out.audioTokens, "in");
                else if (dir === "cached") out.audioTokens = push(out.audioTokens, "cached");
                else if (dir === "output") out.audioTokens = push(out.audioTokens, "out");
                else if (dir === "cachewrite") out.audioTokens = push(out.audioTokens, "write");
            } else if (mod === "video") {
                if (dir === "input") out.videoTokens = push(out.videoTokens, "in");
                else if (dir === "cached") out.videoTokens = push(out.videoTokens, "cached");
                else if (dir === "output") out.videoTokens = push(out.videoTokens, "out");
                else if (dir === "cachewrite") out.videoTokens = push(out.videoTokens, "write");
            }
            continue;
        }

        // 2) image generation (per image, output)
        if (mod === "image" && dir === "output" && unit === "image") {
            const qualityCondition = conds.find(c => c.path.toLowerCase().includes("quality"));
            const resVals = extractResolutionLabels(conds);
            const quality = (qualityCondition?.value ?? (resVals.length ? "Standard" : "Unspecified")) as string;
            const resolution = resVals.length ? resVals.join(" • ") : "Any resolution";
            (out.imageGen ??= []);
            let q = out.imageGen.find(x => x.quality.toLowerCase() === String(quality).toLowerCase());
            if (!q) { q = { quality: String(quality), items: [] }; out.imageGen.push(q); }
            q.items.push({
                label: String(resolution),
                price,
                basePrice: displayBasePrice,
                comparisonKind,
                comparisonDirection,
                discountEndsAt,
            });
            continue;
        }

        // 3) video generation per time
        if (mod === "video" && dir === "output" && (unit === "second" || unit === "minute" || unit === "video")) {
            const res = extractResolutionLabels(conds);
            const durations = extractVideoDurationLabels(conds);
            const audioMode = extractVideoAudioMode(conds);
            const audioHintCondition = conds.find((c) =>
                String(c.path ?? "").toLowerCase().includes("audio")
            );
            const audioHintLabel =
                audioMode == null && audioHintCondition
                    ? conciseConditionLabel([audioHintCondition], { prefer: ["audio"] })
                    : null;
            let labels: string[] = [];
            if (res.length > 0 && durations.length > 0) {
                labels = res.flatMap((resolution) =>
                    durations.map((duration) => `${resolution} - ${duration}`)
                );
            } else if (res.length > 0) {
                labels = res;
            } else if (durations.length > 0) {
                labels = durations;
            } else {
                labels = ["Any resolution"];
            }
            for (const label of labels) {
                const rowLabel = audioHintLabel ? `${label} - ${audioHintLabel}` : label;
                (out.videoGen ??= []).push({
                    resolution: rowLabel,
                    unitLabel: unitLabel(unit, unitSize),
                    price,
                    audioMode,
                    basePrice: displayBasePrice,
                    comparisonKind,
                    comparisonDirection,
                    discountEndsAt,
                });
            }
            continue;
        }

        // 4) media inputs (per image / per second)
        if (
            ((mod === "image" && unit === "pixel") || (mod === "video" && unit === "pixel")) ||
            (dir === "input" &&
                ((mod === "image" && unit === "image") ||
                    (mod === "video" && (unit === "second" || unit === "minute"))))
        ) {
            const label = conciseConditionLabel(conds);
            (out.mediaInputs ??= []).push({
                label,
                price,
                unitLabel: unitLabel(unit, unitSize),
                mod: mod === "image" ? "image" : "video",
                basePrice: displayBasePrice,
                comparisonKind,
                comparisonDirection,
                discountEndsAt,
                endpoint: entry.endpoint,
                ruleId: r.id ?? null,
                isCurrent: current,
            });
            continue;
        }

        // 5) requests (per call/request)
        if (unit === "call" && (r.meter || "").toLowerCase().includes("request")) {
            const label = conciseConditionLabel(conds);
            const tier: TokenTier = {
                per1M: 0, // Not applicable for requests
                price,
                label,
                basePer1M: null,
                basePrice: displayBasePrice,
                comparisonKind,
                comparisonDirection,
                discountEndsAt,
                endpoint: entry.endpoint,
                effFrom: r.effective_from ?? null,
                effTo: r.effective_to ?? null,
                ruleId: r.id ?? null,
                isCurrent: current,
            };
            (out.requests ??= []).push(tier);
            continue;
        }

        // 6) everything else → Advanced
        out.otherRules.push({
            meter: r.meter || "—",
            unitLabel: unitLabel(unit, unitSize),
            price,
            basePrice: displayBasePrice,
            comparisonKind,
            comparisonDirection,
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
        s(tt.in); s(tt.cached); s(tt.write); s(tt.out);
    };
    sortTiers(out.textTokens);
    sortTiers(out.imageTokens);
    sortTiers(out.audioTokens);
    sortTiers(out.videoTokens);
    out.imageGen?.forEach((q) => q.items.sort((a, b) => a.label.localeCompare(b.label)));
    out.imageGen?.sort((a, b) => {
        const ra = qualityRank(a.quality), rb = qualityRank(b.quality);
        if (ra !== rb) return ra - rb;
        const mina = Math.min(...a.items.map((i) => i.price));
        const minb = Math.min(...b.items.map((i) => i.price));
        return mina - minb;
    });
    out.videoGen?.sort((a, b) => a.resolution.localeCompare(b.resolution));
    out.mediaInputs?.sort((a, b) => a.price - b.price);
    out.requests?.sort((a, b) => a.price - b.price);

    return out;
}

/* ---------- pricing calculator helpers ---------- */

export interface PricingMeter {
    meter: string;
    unit: string;
    unit_size: number;
    price_per_unit: string;
    currency: string;
    conditions?: any[];
}

/**
 * Calculate the cost for a given quantity of usage
 */
export function calculateCost(
    quantity: number,
    meter: Pick<PricingMeter, 'unit_size' | 'price_per_unit'>
): number {
    const unitSize = Number(meter.unit_size) > 0 ? Number(meter.unit_size) : 1;
    const billableUnits = Math.max(0, quantity) / unitSize;
    const pricePerUnit = parseFloat(meter.price_per_unit) || 0;
    return billableUnits * pricePerUnit;
}

/**
 * Inverse calculation: given a budget, how many units can you get?
 */
export function calculateUnits(
    budget: number,
    meter: Pick<PricingMeter, 'unit_size' | 'price_per_unit'>
): number {
    const pricePerUnit = parseFloat(meter.price_per_unit);
    const unitSize = meter.unit_size || 1;
    if (pricePerUnit === 0) return 0;
    return (budget / pricePerUnit) * unitSize;
}

/**
 * Format numbers with K/M/B/T/Q suffixes
 */
export function formatQuantity(n: number): string {
    if (n >= 1_000_000_000_000_000) return `${(n / 1_000_000_000_000_000).toFixed(1)}Q`;
    if (n >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(1)}T`;
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return `${n}`;
}

/**
 * Get example quantities for a meter based on its unit type
 */
export function getExamplesForMeter(meter: PricingMeter): number[] {
    const unit = meter.unit.toLowerCase();
    const meterName = meter.meter.toLowerCase();
    if (unit.includes("token")) {
        return [1000, 1_000_000, 1_000_000_000]; // 1K, 1M, 1B
    } else if (unit.includes("pixel") || meterName.includes("pixel")) {
        return [1_000_000, 2_000_000, 8_000_000];
    } else if (
        unit.includes("second") ||
        unit.includes("minute") ||
        unit.includes("hour") ||
        meterName.includes("second") ||
        meterName.includes("minute")
    ) {
        return [1, 10, 60]; // 1s, 10s, 1min
    } else if (unit.includes("request") || unit.includes("call")) {
        return [1, 10, 100]; // 1, 10, 100
    } else if (unit.includes("image") || meterName.includes("image")) {
        return [1, 5, 20];
    } else {
        return [1, 10, 100]; // default
    }
}

/**
 * Convert snake_case meter names to Title Case
 */
export function formatMeterName(meter: string): string {
    return meter
        .replace(/_/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Get input configuration (type, step, placeholder) based on unit type
 */
export function getMeterInputConfig(
    unit: string,
    meterName?: string
): {
    type: string;
    step: string;
    placeholder: string;
} {
    const u = unit.toLowerCase();
    const m = (meterName || "").toLowerCase();

    if (u.includes("token")) {
        return { type: "number", step: "1000", placeholder: "e.g., 10000" };
    }
    if (u.includes("pixel") || m.includes("pixel")) {
        return { type: "number", step: "1000", placeholder: "e.g., 1048576" };
    }
    if (u.includes("second") || m.includes("second")) {
        return { type: "number", step: "1", placeholder: "e.g., 60" };
    }
    if (u.includes("minute") || m.includes("minute")) {
        return { type: "number", step: "1", placeholder: "e.g., 10" };
    }
    if (u.includes("request") || u.includes("call")) {
        return { type: "number", step: "1", placeholder: "e.g., 100" };
    }
    if (u.includes("image") || m.includes("image")) {
        return { type: "number", step: "1", placeholder: "e.g., 10" };
    }

    return { type: "number", step: "1", placeholder: "Enter value..." };
}
