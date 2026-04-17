// lib/fetchers/api-providers/getAllAPIProviders.ts
import { cacheLife, cacheTag } from "next/cache";
import { filterVisibleAPIProviders } from "./visibility";
import { createAdminClient } from "@/utils/supabase/admin";

export type ProviderModalityKey =
    | "text"
    | "image"
    | "video"
    | "audio"
    | "moderation"
    | "embedding";

export type ProviderModalitySupport = Record<
    ProviderModalityKey,
    {
        input: number;
        output: number;
    }
>;

export interface APIProviderCard {
    api_provider_id: string;
    api_provider_name: string;
    colour?: string | null;
    country_code: string;
    total_models: number;
    active_models: number;
    free_models: number;
    total_daily_tokens: number;
    total_monthly_tokens: number;
    daily_share_pct: number;
    modality_support: ProviderModalitySupport;
}

type ProviderModelRow = {
    provider_id?: string | null;
    api_model_id?: string | null;
    provider_api_model_id?: string | null;
    provider_model_slug?: string | null;
    is_active_gateway?: boolean | null;
    effective_from?: string | null;
    effective_to?: string | null;
    input_modalities?: string[] | string | null;
    output_modalities?: string[] | string | null;
};

type PricingRuleRow = {
    model_key?: string | null;
    pricing_plan?: string | null;
    price_per_unit?: number | string | null;
    effective_from?: string | null;
    effective_to?: string | null;
};

type MarketShareRow = {
    name?: string | null;
    tokens?: number | string | null;
    share_pct?: number | string | null;
};

const MODALITY_KEYS: ProviderModalityKey[] = [
    "text",
    "image",
    "video",
    "audio",
    "moderation",
    "embedding",
];

function createEmptyModalitySupport(): ProviderModalitySupport {
    return {
        text: { input: 0, output: 0 },
        image: { input: 0, output: 0 },
        video: { input: 0, output: 0 },
        audio: { input: 0, output: 0 },
        moderation: { input: 0, output: 0 },
        embedding: { input: 0, output: 0 },
    };
}

function createModalitySetMap(): Record<ProviderModalityKey, Set<string>> {
    return {
        text: new Set<string>(),
        image: new Set<string>(),
        video: new Set<string>(),
        audio: new Set<string>(),
        moderation: new Set<string>(),
        embedding: new Set<string>(),
    };
}

function normalizeModality(raw: string): ProviderModalityKey | null {
    const value = String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/[._/-]+/g, " ");
    if (!value) return null;
    if (value.includes("text")) return "text";
    if (value.includes("image")) return "image";
    if (value.includes("video")) return "video";
    if (value.includes("audio") || value.includes("music")) return "audio";
    if (value.includes("moderat")) return "moderation";
    if (value.includes("embed")) return "embedding";
    return null;
}

function parseModalities(raw: string[] | string | null | undefined): string[] {
    if (Array.isArray(raw)) {
        return raw.map((value) => String(value ?? "").trim()).filter(Boolean);
    }
    if (typeof raw === "string") {
        const normalized = raw.trim();
        if (!normalized) return [];
        return normalized
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
    }
    return [];
}

function parseModelKey(modelKey: string | null | undefined): {
    providerId: string;
    apiModelId: string;
} | null {
    if (!modelKey) return null;
    const parts = String(modelKey).split(":");
    if (parts.length < 3) return null;
    const providerId = parts.shift() ?? "";
    const apiModelId = parts.slice(0, -1).join(":");
    if (!providerId || !apiModelId) return null;
    return { providerId, apiModelId };
}

function isFreePricingRule(row: PricingRuleRow): boolean {
    return String(row.model_key ?? "").toLowerCase().includes(":free:");
}

function toTokenMap(rows: unknown): Map<string, number> {
    const out = new Map<string, number>();
    for (const row of (rows ?? []) as MarketShareRow[]) {
        const providerId = String(row.name ?? "").trim();
        if (!providerId) continue;
        const tokens = Number(row.tokens ?? 0);
        out.set(providerId, Number.isFinite(tokens) ? Math.max(0, tokens) : 0);
    }
    return out;
}

function toShareMap(rows: unknown): Map<string, number> {
    const out = new Map<string, number>();
    for (const row of (rows ?? []) as MarketShareRow[]) {
        const providerId = String(row.name ?? "").trim();
        if (!providerId) continue;
        const share = Number(row.share_pct ?? 0);
        out.set(providerId, Number.isFinite(share) ? Math.max(0, share) : 0);
    }
    return out;
}

export async function getAllAPIProviders(): Promise<APIProviderCard[]> {
    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();
    const activeWindowClause = [
        "and(effective_from.is.null,effective_to.is.null)",
        `and(effective_from.is.null,effective_to.gt.${nowIso})`,
        `and(effective_from.lte.${nowIso},effective_to.is.null)`,
        `and(effective_from.lte.${nowIso},effective_to.gt.${nowIso})`,
    ].join(",");

    const [providersRes, providerModelsRes, pricingRulesRes, dailyUsageRes, monthlyUsageRes] = await Promise.all([
        supabase
            .from("data_api_providers")
            .select("api_provider_id, api_provider_name, colour, country_code")
            .order("api_provider_name", { ascending: true }),
        supabase
            .from("data_api_provider_models")
            .select(
                "provider_id, api_model_id, provider_api_model_id, provider_model_slug, is_active_gateway, effective_from, effective_to, input_modalities, output_modalities"
            ),
        supabase
            .from("data_api_pricing_rules")
            .select("model_key, effective_from, effective_to")
            .ilike("model_key", "%:free:%")
            .or(activeWindowClause),
        supabase.rpc("get_public_market_share", {
            p_dimension: "provider",
            p_time_range: "today",
        }),
        supabase.rpc("get_public_market_share", {
            p_dimension: "provider",
            p_time_range: "month",
        }),
    ]);

    if (providersRes.error) {
        throw providersRes.error;
    }
    if (providerModelsRes.error) {
        throw providerModelsRes.error;
    }

    const providersData = providersRes.data ?? [];
    const providerModelsData = (providerModelsRes.data ?? []) as ProviderModelRow[];
    const pricingRulesData = (pricingRulesRes.data ?? []) as PricingRuleRow[];
    if (!providersData.length) return [];

    const now = Date.now();
    const totalModelsByProvider = new Map<string, Set<string>>();
    const activeModelsByProvider = new Map<string, Set<string>>();
    const freeModelsByProvider = new Map<string, Set<string>>();
    const inputModalityModelSetsByProvider = new Map<
        string,
        Record<ProviderModalityKey, Set<string>>
    >();
    const outputModalityModelSetsByProvider = new Map<
        string,
        Record<ProviderModalityKey, Set<string>>
    >();

    for (const row of providerModelsData) {
        const providerId = String(row.provider_id ?? "").trim();
        if (!providerId) continue;
        const modelKey =
            String(row.api_model_id ?? "").trim() ||
            String(row.provider_api_model_id ?? "").trim();
        if (!modelKey) continue;

        const totalSet = totalModelsByProvider.get(providerId) ?? new Set<string>();
        totalSet.add(modelKey);
        totalModelsByProvider.set(providerId, totalSet);

        const inputModalitySets =
            inputModalityModelSetsByProvider.get(providerId) ??
            createModalitySetMap();
        const outputModalitySets =
            outputModalityModelSetsByProvider.get(providerId) ??
            createModalitySetMap();
        for (const modalityRaw of parseModalities(row.input_modalities)) {
            const modality = normalizeModality(modalityRaw);
            if (!modality) continue;
            inputModalitySets[modality].add(modelKey);
        }
        for (const modalityRaw of parseModalities(row.output_modalities)) {
            const modality = normalizeModality(modalityRaw);
            if (!modality) continue;
            outputModalitySets[modality].add(modelKey);
        }
        inputModalityModelSetsByProvider.set(providerId, inputModalitySets);
        outputModalityModelSetsByProvider.set(providerId, outputModalitySets);

        if (
            modelKey.toLowerCase().includes(":free") ||
            String(row.provider_model_slug ?? "").toLowerCase().includes("free")
        ) {
            const freeSet =
                freeModelsByProvider.get(providerId) ?? new Set<string>();
            freeSet.add(modelKey);
            freeModelsByProvider.set(providerId, freeSet);
        }

        const fromMs = row.effective_from
            ? new Date(row.effective_from).getTime()
            : Number.NEGATIVE_INFINITY;
        const toMs = row.effective_to
            ? new Date(row.effective_to).getTime()
            : Number.POSITIVE_INFINITY;
        const isActiveNow =
            Boolean(row.is_active_gateway) && now >= fromMs && now < toMs;
        if (!isActiveNow) continue;

        const activeSet = activeModelsByProvider.get(providerId) ?? new Set<string>();
        activeSet.add(modelKey);
        activeModelsByProvider.set(providerId, activeSet);
    }

    for (const pricingRow of pricingRulesData) {
        const fromMsRaw = pricingRow.effective_from
            ? new Date(pricingRow.effective_from).getTime()
            : Number.NEGATIVE_INFINITY;
        const toMsRaw = pricingRow.effective_to
            ? new Date(pricingRow.effective_to).getTime()
            : Number.POSITIVE_INFINITY;
        const fromMs = Number.isFinite(fromMsRaw) ? fromMsRaw : Number.NEGATIVE_INFINITY;
        const toMs = Number.isFinite(toMsRaw) ? toMsRaw : Number.POSITIVE_INFINITY;
        if (!(now >= fromMs && now < toMs)) continue;
        if (!isFreePricingRule(pricingRow)) continue;
        const parsed = parseModelKey(pricingRow.model_key ?? null);
        if (!parsed) continue;
        const freeSet =
            freeModelsByProvider.get(parsed.providerId) ?? new Set<string>();
        freeSet.add(parsed.apiModelId);
        freeModelsByProvider.set(parsed.providerId, freeSet);
    }

    if (pricingRulesRes.error) {
        console.warn(
            "[getAllAPIProviders] failed to read pricing rules; free model counts may be incomplete.",
            pricingRulesRes.error.message
        );
    }

    if (dailyUsageRes.error) {
        console.warn(
            "[getAllAPIProviders] get_public_market_share(today) failed; defaulting daily token stats to 0.",
            dailyUsageRes.error.message
        );
    }
    if (monthlyUsageRes.error) {
        console.warn(
            "[getAllAPIProviders] get_public_market_share(month) failed; defaulting monthly token stats to 0.",
            monthlyUsageRes.error.message
        );
    }

    const dailyTokensByProvider = toTokenMap(dailyUsageRes.data);
    const monthlyTokensByProvider = toTokenMap(monthlyUsageRes.data);
    const dailyShareByProvider = toShareMap(dailyUsageRes.data);

    const modalitySupportByProvider = new Map<string, ProviderModalitySupport>();
    for (const providerId of new Set([
        ...Array.from(inputModalityModelSetsByProvider.keys()),
        ...Array.from(outputModalityModelSetsByProvider.keys()),
    ])) {
        const inputSets =
            inputModalityModelSetsByProvider.get(providerId) ??
            createModalitySetMap();
        const outputSets =
            outputModalityModelSetsByProvider.get(providerId) ??
            createModalitySetMap();
        const support = createEmptyModalitySupport();
        for (const key of MODALITY_KEYS) {
            support[key].input = inputSets[key].size;
            support[key].output = outputSets[key].size;
        }
        modalitySupportByProvider.set(providerId, support);
    }

    return filterVisibleAPIProviders(
        providersData
            .map((r: any) => ({
                api_provider_id: r.api_provider_id,
                api_provider_name: r.api_provider_name ?? r.name ?? "",
                colour:
                    typeof r.colour === "string" && r.colour.trim().length > 0
                        ? r.colour.trim()
                        : null,
                country_code: r.country_code ?? "",
                total_models:
                    totalModelsByProvider.get(r.api_provider_id)?.size ?? 0,
                active_models:
                    activeModelsByProvider.get(r.api_provider_id)?.size ?? 0,
                free_models:
                    freeModelsByProvider.get(r.api_provider_id)?.size ?? 0,
                total_daily_tokens:
                    dailyTokensByProvider.get(r.api_provider_id) ?? 0,
                total_monthly_tokens:
                    monthlyTokensByProvider.get(r.api_provider_id) ?? 0,
                daily_share_pct:
                    dailyShareByProvider.get(r.api_provider_id) ?? 0,
                modality_support:
                    modalitySupportByProvider.get(r.api_provider_id) ??
                    createEmptyModalitySupport(),
            }))
            .filter((p) => p.api_provider_id)
    );
}

export async function getAllAPIProvidersCached(): Promise<APIProviderCard[]> {
    "use cache";

    cacheLife("days");
    cacheTag("data:api_providers");
    cacheTag("data:api_providers:list");

    console.log("[fetch] HIT JSON for API providers");
    return getAllAPIProviders();
}
