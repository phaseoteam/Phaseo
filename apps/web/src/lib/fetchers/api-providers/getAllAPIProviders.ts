// lib/fetchers/api-providers/getAllAPIProviders.ts
import { cacheLife, cacheTag } from "next/cache";
import { filterVisibleAPIProviders } from "./visibility";
import {
	groupProviderIndexCards,
	type APIProviderCard,
	type APIProviderIndexVariant,
	type ProviderModalityKey,
	type ProviderModalitySupport,
} from "./providerIndexGrouping";
import { resolveEffectiveProviderModalities } from "./providerModalities";
import { fetchPublicGatewayRequestRows } from "@/lib/fetchers/gateway/fetchPublicGatewayRequests";
import { createAdminClient } from "@/utils/supabase/admin";
import { sumTokens } from "@/lib/utils/sumTokens";
export type {
	APIProviderCard,
	ProviderModalityKey,
	ProviderModalitySupport,
};

type ProviderModelRow = {
    provider_id?: string | null;
    model_id?: string | null;
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

type ProviderRow = {
	api_provider_id?: string | null;
	api_provider_name?: string | null;
	colour?: string | null;
	country_code?: string | null;
	provider_family_id?: string | null;
	offer_label?: string | null;
	offer_scope?: "global" | "regional" | "specialized" | null;
};

type CanonicalModelRow = {
	model_id?: string | null;
	input_types?: string[] | string | null;
	output_types?: string[] | string | null;
	input_modalities?: string[] | string | null;
	output_modalities?: string[] | string | null;
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

function hasCanonicalModelModalities(row?: CanonicalModelRow | null): boolean {
    const inputValue = String(
        row?.input_types ?? row?.input_modalities ?? "",
    ).trim();
    const outputValue = String(
        row?.output_types ?? row?.output_modalities ?? "",
    ).trim();
    return inputValue.length > 0 || outputValue.length > 0;
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

function toTokenCount(value: unknown): number {
    return Math.max(0, Math.round(sumTokens(value)));
}

function chunkValues<T>(values: readonly T[], size: number): T[][] {
	const normalizedSize = Math.max(1, Math.floor(size));
	const chunks: T[][] = [];
	for (let index = 0; index < values.length; index += normalizedSize) {
		chunks.push(values.slice(index, index + normalizedSize));
	}
	return chunks;
}

function pickLatestIsoDate(
	current: string | null | undefined,
	candidate: string | null | undefined,
): string | null {
	const currentMs = current ? Date.parse(current) : Number.NEGATIVE_INFINITY;
	const candidateMs = candidate ? Date.parse(candidate) : Number.NEGATIVE_INFINITY;
	if (!Number.isFinite(candidateMs)) {
		return current ?? null;
	}
	if (!Number.isFinite(currentMs) || candidateMs > currentMs) {
		return candidate ?? null;
	}
	return current ?? null;
}

export async function getAllAPIProviders(): Promise<APIProviderCard[]> {
    let supabase: ReturnType<typeof createAdminClient> | null = null;
    try {
        supabase = createAdminClient();
    } catch (error) {
        console.warn(
            "[getAllAPIProviders] admin client unavailable; returning no providers.",
            error instanceof Error ? error.message : String(error),
        );
        return [];
    }
    const nowIso = new Date().toISOString();
    const activeWindowClause = [
        "and(effective_from.is.null,effective_to.is.null)",
        `and(effective_from.is.null,effective_to.gt.${nowIso})`,
        `and(effective_from.lte.${nowIso},effective_to.is.null)`,
        `and(effective_from.lte.${nowIso},effective_to.gt.${nowIso})`,
    ].join(",");

    const [providersRes, providerModelsRes, pricingRulesRes, gatewayUsageRows] = await Promise.all([
        supabase
            .from("data_api_providers")
            .select(
                "api_provider_id, api_provider_name, colour, country_code, provider_family_id, offer_label, offer_scope"
            )
            .order("api_provider_name", { ascending: true }),
        supabase
            .from("data_api_provider_models")
            .select(
                "provider_id, model_id, api_model_id, provider_api_model_id, provider_model_slug, is_active_gateway, effective_from, effective_to, input_modalities, output_modalities"
            ),
        supabase
            .from("data_api_pricing_rules")
            .select("model_key, effective_from, effective_to")
            .ilike("model_key", "%:free:%")
            .or(activeWindowClause),
        fetchPublicGatewayRequestRows(30, { successOnly: true }),
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

    const canonicalModelIds = Array.from(
        new Set(
            providerModelsData
                .map((row) => String(row.model_id ?? "").trim())
                .filter(Boolean),
        ),
    );
    const canonicalModelsById = new Map<string, CanonicalModelRow>();
    if (canonicalModelIds.length > 0) {
		for (const modelIdChunk of chunkValues(canonicalModelIds, 100)) {
			const canonicalModelsRes = await supabase
				.from("data_models")
				.select("model_id, input_types, output_types")
				.in("model_id", modelIdChunk);
			if (canonicalModelsRes.error) {
				throw canonicalModelsRes.error;
			}
			for (const row of (canonicalModelsRes.data ?? []) as CanonicalModelRow[]) {
				const modelId = String(row.model_id ?? "").trim();
				if (!modelId) continue;
				canonicalModelsById.set(modelId, row);
			}
		}
    }

    const now = Date.now();
    const totalModelsByProvider = new Map<string, Set<string>>();
    const activeModelsByProvider = new Map<string, Set<string>>();
    const freeModelsByProvider = new Map<string, Set<string>>();
    const lastUpdatedAtByProvider = new Map<string, string | null>();
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

        lastUpdatedAtByProvider.set(
            providerId,
            pickLatestIsoDate(
                lastUpdatedAtByProvider.get(providerId) ?? null,
                row.effective_from ?? row.effective_to ?? null,
            ),
        );

        const totalSet = totalModelsByProvider.get(providerId) ?? new Set<string>();
        totalSet.add(modelKey);
        totalModelsByProvider.set(providerId, totalSet);

        const inputModalitySets =
            inputModalityModelSetsByProvider.get(providerId) ??
            createModalitySetMap();
        const outputModalitySets =
            outputModalityModelSetsByProvider.get(providerId) ??
            createModalitySetMap();
        const dbCanonicalModel = canonicalModelsById.get(
            String(row.model_id ?? "").trim(),
        );
        const canonicalModel = dbCanonicalModel;
        const { inputModalities, outputModalities } =
            resolveEffectiveProviderModalities({
                providerModel: row,
                canonicalModel,
            });
        for (const modalityRaw of inputModalities) {
            const modality = normalizeModality(modalityRaw);
            if (!modality) continue;
            inputModalitySets[modality].add(modelKey);
        }
        for (const modalityRaw of outputModalities) {
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

    const dayStartMs = Date.now() - 24 * 60 * 60 * 1000;
    const dailyRequestsByProvider = new Map<string, number>();
    const dailyTokensByProvider = new Map<string, number>();
    const monthlyTokensByProvider = new Map<string, number>();

    for (const row of gatewayUsageRows) {
        const providerId = String(row.provider ?? "").trim();
        if (!providerId) continue;

        const createdAtMs = row.created_at ? new Date(row.created_at).getTime() : Number.NaN;
        const tokens = toTokenCount(row.usage);

        monthlyTokensByProvider.set(
            providerId,
            (monthlyTokensByProvider.get(providerId) ?? 0) + tokens,
        );
        lastUpdatedAtByProvider.set(
            providerId,
            pickLatestIsoDate(
                lastUpdatedAtByProvider.get(providerId) ?? null,
                row.created_at ?? null,
            ),
        );

        if (!Number.isFinite(createdAtMs) || createdAtMs < dayStartMs) continue;

        dailyRequestsByProvider.set(
            providerId,
            (dailyRequestsByProvider.get(providerId) ?? 0) + 1,
        );
        dailyTokensByProvider.set(
            providerId,
            (dailyTokensByProvider.get(providerId) ?? 0) + tokens,
        );
    }

    const providerVariants = filterVisibleAPIProviders(
        (providersData as ProviderRow[])
            .map((row): APIProviderIndexVariant | null => {
				const providerId = String(row.api_provider_id ?? "").trim();
				if (!providerId) return null;
				const inputModalitySets =
					inputModalityModelSetsByProvider.get(providerId) ??
					createModalitySetMap();
                const outputModalitySets =
                    outputModalityModelSetsByProvider.get(providerId) ??
                    createModalitySetMap();

                return {
					api_provider_id: providerId,
					api_provider_name: row.api_provider_name ?? "",
					colour:
						typeof row.colour === "string" && row.colour.trim().length > 0
							? row.colour.trim()
							: null,
                    country_code: row.country_code ?? "",
                    provider_family_id: row.provider_family_id ?? null,
                    offer_label: row.offer_label ?? null,
                    offer_scope: row.offer_scope ?? null,
                    total_model_ids: Array.from(
                        totalModelsByProvider.get(providerId) ?? new Set<string>(),
                    ),
                    active_model_ids: Array.from(
                        activeModelsByProvider.get(providerId) ?? new Set<string>(),
                    ),
                    free_model_ids: Array.from(
                        freeModelsByProvider.get(providerId) ?? new Set<string>(),
                    ),
                    total_daily_requests: dailyRequestsByProvider.get(providerId) ?? 0,
                    total_daily_tokens: dailyTokensByProvider.get(providerId) ?? 0,
                    total_monthly_tokens:
                        monthlyTokensByProvider.get(providerId) ?? 0,
                    last_updated_at:
                        lastUpdatedAtByProvider.get(providerId) ?? null,
                    modality_model_ids: Object.fromEntries(
                        MODALITY_KEYS.map((key) => [
                            key,
                            {
                                input: Array.from(inputModalitySets[key]),
                                output: Array.from(outputModalitySets[key]),
                            },
                        ]),
                    ) as APIProviderIndexVariant["modality_model_ids"],
                };
            })
            .filter((provider): provider is APIProviderIndexVariant => Boolean(provider)),
    );

    return groupProviderIndexCards(providerVariants);
}

export async function getAllAPIProvidersCached(): Promise<APIProviderCard[]> {
    "use cache";

    cacheLife("days");
    cacheTag("data:api_providers");
    cacheTag("data:api_providers:list");

    console.log("[fetch] HIT JSON for API providers");
    return getAllAPIProviders();
}
