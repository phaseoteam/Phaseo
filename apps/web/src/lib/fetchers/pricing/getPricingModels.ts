import { cacheLife, cacheTag } from "next/cache";
import { applyHiddenFilter } from "@/lib/fetchers/models/visibility";
import { createAdminClient } from "@/utils/supabase/admin";

export interface PricingMeter {
    meter: string;
    unit: string;
    unit_size: number;
    price_per_unit: string;
    currency: string;
    conditions?: any[];
    billing_timestamp_basis?: PricingTimestampBasis;
    time_windows?: PricingTimeWindow[];
}

type PricingTimestampBasis =
    | "request_start"
    | "provider_accept"
    | "completion"
    | "unknown";

type PricingTimeWindow = {
    label: string;
    timezone: "UTC";
    start_time: string;
    end_time: string;
    price_per_unit?: string | number | null;
    priority?: number | null;
};

export interface PricingModel {
    provider: string;
    model: string;
    api_model_id?: string;
    endpoint: string;
    display_name?: string;
    pricing_plan?: string | null;
    meters: PricingMeter[];
}

interface PricingRuleRow {
    rule_id: string;
    model_key: string;
    capability_id: string;
    pricing_plan: string | null;
    meter: string;
    unit: string;
    unit_size: number;
    price_per_unit: string;
    currency: string;
    priority: number;
    effective_from: string;
    effective_to: string | null;
    match: any[] | null;
    billing_timestamp_basis: PricingTimestampBasis | null;
    time_windows: PricingTimeWindow[] | null;
}

const MODEL_KEY_BATCH_SIZE = 250;
const PRICING_RULE_SELECT =
    "rule_id, model_key, capability_id, pricing_plan, meter, unit, unit_size, price_per_unit, currency, priority, effective_from, effective_to, match, billing_timestamp_basis, time_windows";
const PRICING_RULE_SELECT_LEGACY =
    "rule_id, model_key, capability_id, pricing_plan, meter, unit, unit_size, price_per_unit, currency, priority, effective_from, effective_to, match";

function getNormalizedMeterPrice(meter: Pick<PricingMeter, "price_per_unit" | "unit_size">) {
    const rawPrice = Number(meter.price_per_unit ?? 0);
    const unitSize = Number(meter.unit_size ?? 1) || 1;
    if (!Number.isFinite(rawPrice) || rawPrice < 0) return Number.POSITIVE_INFINITY;
    return rawPrice / unitSize;
}

const parseModelKey = (modelKey: string) => {
    const first = modelKey.indexOf(":");
    const last = modelKey.lastIndexOf(":");
    if (first <= 0 || last <= first) return null;
    return {
        provider_id: modelKey.slice(0, first),
        api_model_id: modelKey.slice(first + 1, last),
        capability_id: modelKey.slice(last + 1),
    };
};

/**
 * Fetch all models that have pricing rules configured, grouped by provider/model/endpoint
 */
export default async function getPricingModels(
    includeHidden: boolean
): Promise<PricingModel[]> {
    try {
        const supabase = createAdminClient();
        const nowIso = new Date().toISOString();
        const activeWindowClause = [
            "and(effective_from.is.null,effective_to.is.null)",
            `and(effective_from.is.null,effective_to.gt.${nowIso})`,
            `and(effective_from.lte.${nowIso},effective_to.is.null)`,
            `and(effective_from.lte.${nowIso},effective_to.gt.${nowIso})`,
        ].join(",");

        const { data: providerModels, error: pmError } = await supabase
            .from("data_api_provider_models")
            .select(
                "provider_api_model_id, provider_id, api_model_id, model_id, provider_model_slug, is_active_gateway, effective_from, effective_to"
            )
            .eq("is_active_gateway", true)
            .or(activeWindowClause);

        if (pmError) {
            console.error("[pricing-models] failed to load provider models", pmError);
            return [];
        }

        const providerModelIds = (providerModels ?? [])
            .map((row) => row.provider_api_model_id)
            .filter((id): id is string => Boolean(id));
        if (providerModelIds.length === 0) {
            return [];
        }

        const capabilities: Array<{
            provider_api_model_id: string | null;
            capability_id: string | null;
            status: string | null;
        }> = [];
        for (let i = 0; i < providerModelIds.length; i += MODEL_KEY_BATCH_SIZE) {
            const batch = providerModelIds.slice(i, i + MODEL_KEY_BATCH_SIZE);
            const { data: batchRows, error: capError } = await supabase
                .from("data_api_provider_model_capabilities")
                .select("provider_api_model_id, capability_id, status")
                .in("provider_api_model_id", batch)
                .neq("status", "disabled");

            if (capError) {
                console.error("[pricing-models] failed to load provider capabilities", capError);
                return [];
            }

            capabilities.push(...(batchRows ?? []));
        }

        const modelNameMap = new Map<string, string>();
        const visibleModelIds = new Set<string>();
        const modelIds = Array.from(
            new Set((providerModels ?? []).map((row) => row.model_id).filter(Boolean))
        );
        if (modelIds.length) {
            const { data: models } = await applyHiddenFilter(
                supabase
                    .from("data_models")
                    .select("model_id, name, hidden")
                    .in("model_id", modelIds),
                includeHidden
            );
            for (const model of models ?? []) {
                if (model.model_id) {
                    visibleModelIds.add(model.model_id);
                    if (model.name) modelNameMap.set(model.model_id, model.name);
                }
            }
        }

        const modelMap = new Map<string, PricingModel>();
        const providerById = new Map<string, any>();
        for (const row of providerModels ?? []) {
            if (row.provider_api_model_id) {
                providerById.set(row.provider_api_model_id, row);
            }
        }

        const comboMap = new Map<
            string,
            { model_id: string | null; api_model_id: string | null }
        >();
        for (const cap of capabilities ?? []) {
            if (!cap.provider_api_model_id || !cap.capability_id) continue;
            const pm = providerById.get(cap.provider_api_model_id);
            if (!pm) continue;
            const comboKey = `${pm.provider_id}:${pm.api_model_id}:${cap.capability_id}`;
            comboMap.set(comboKey, {
                model_id: pm.model_id ?? null,
                api_model_id: pm.api_model_id ?? null,
            });
        }

        const comboKeys = Array.from(comboMap.keys()).filter(Boolean);
        if (comboKeys.length === 0) {
            return [];
        }

        const pricingRules: PricingRuleRow[] = [];
        for (let i = 0; i < comboKeys.length; i += MODEL_KEY_BATCH_SIZE) {
            const batch = comboKeys.slice(i, i + MODEL_KEY_BATCH_SIZE);
            const pricingResult = await supabase
                .from("data_api_pricing_rules")
                .select(PRICING_RULE_SELECT)
                .in("model_key", batch)
                .or(activeWindowClause)
                .order("priority", { ascending: false });
            let batchRows = pricingResult.data as any[] | null;
            let prError = pricingResult.error as any;

            if (
                prError &&
                (
                    (prError as { code?: string }).code === "42703" ||
                    String((prError as { message?: string }).message ?? "").includes("does not exist")
                )
            ) {
                const legacyResult = await supabase
                    .from("data_api_pricing_rules")
                    .select(PRICING_RULE_SELECT_LEGACY)
                    .in("model_key", batch)
                    .or(activeWindowClause)
                    .order("priority", { ascending: false });
                batchRows = legacyResult.data;
                prError = legacyResult.error;
            }

            if (prError) {
                console.error("[pricing-models] failed to load pricing rules", prError);
                return [];
            }

            pricingRules.push(...((batchRows ?? []) as PricingRuleRow[]));
        }

        for (const rule of pricingRules) {
            const parsed = parseModelKey(rule.model_key);
            if (!parsed) continue;
            const comboKey = `${parsed.provider_id}:${parsed.api_model_id}:${rule.capability_id}`;
            const combo = comboMap.get(comboKey);
            if (!combo) continue;
            if (!includeHidden && combo.model_id && !visibleModelIds.has(combo.model_id)) {
                continue;
            }
            const modelId = combo.model_id ?? parsed.api_model_id;
            const key = `${parsed.provider_id}:${modelId}:${rule.capability_id}:${rule.pricing_plan || "standard"}`;

            if (!modelMap.has(key)) {
                modelMap.set(key, {
                    provider: parsed.provider_id,
                    model: modelId,
                    api_model_id: combo.api_model_id ?? parsed.api_model_id,
                    endpoint: rule.capability_id,
                    display_name: combo.model_id
                        ? modelNameMap.get(combo.model_id)
                        : undefined,
                    pricing_plan: rule.pricing_plan || "standard",
                    meters: [],
                });
            }

            const model = modelMap.get(key)!;

            const nextMeter: PricingMeter = {
                meter: rule.meter,
                unit: rule.unit,
                unit_size: Number(rule.unit_size ?? 1),
                price_per_unit: String(rule.price_per_unit ?? "0"),
                currency: rule.currency ?? "USD",
                conditions: rule.match ?? [],
                billing_timestamp_basis: rule.billing_timestamp_basis ?? "request_start",
                time_windows: Array.isArray(rule.time_windows) ? rule.time_windows : [],
            };

            const existingIndex = model.meters.findIndex(
                (m) =>
                    m.meter === nextMeter.meter &&
                    m.unit === nextMeter.unit &&
                    m.currency === nextMeter.currency
            );

            if (existingIndex === -1) {
                model.meters.push(nextMeter);
                continue;
            }

            const existingMeter = model.meters[existingIndex];
            const existingNormalizedPrice = getNormalizedMeterPrice(existingMeter);
            const nextNormalizedPrice = getNormalizedMeterPrice(nextMeter);

            if (nextNormalizedPrice < existingNormalizedPrice) {
                model.meters[existingIndex] = nextMeter;
            }
        }

        const pricingModels = Array.from(modelMap.values());

        pricingModels.sort((a, b) => {
            if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
            if (a.model !== b.model) return a.model.localeCompare(b.model);
            return a.endpoint.localeCompare(b.endpoint);
        });

        return pricingModels;
    } catch (error) {
        console.error("[pricing-models] unexpected failure", error);
        return [];
    }
}

/**
 * Cached version of getPricingModels.
 */
export async function getPricingModelsCached(
    includeHidden: boolean
): Promise<PricingModel[]> {
    "use cache";

    cacheLife("hours"); // Cache for shorter time since pricing can change
    cacheTag("public-model-catalogue");
    cacheTag("data:data_api_pricing_rules");
    cacheTag("data:data_api_provider_models");
    cacheTag("data:models");
    cacheTag("frontend:pricing-models");

    return getPricingModels(includeHidden);
}
