import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { normalizeQuantizationScheme } from "@/lib/quantization";

/** mirrors new rules schema */
export interface PricingRule {
    id: string;                 // rule_id
    model_key: string;          // `${provider}:${model}:${endpoint}`
    pricing_plan: string;       // standard|batch|flex|priority
    meter: string;              // e.g. input_text_tokens
    unit: string;               // token|image|second|minute|...
    unit_size: number;
    price_per_unit: number;     // numeric -> number (cast below)
    currency: string;           // USD (for now)
    note: string | null;
    match: any[];               // conditions
    priority: number;
    effective_from: string;     // timestamptz
    effective_to: string | null;
    billing_timestamp_basis?: "request_start" | "provider_accept" | "completion" | "unknown";
    time_windows?: Array<{
        label: string;
        timezone: "UTC";
        start_time: string;
        end_time: string;
        price_per_unit?: number | string | null;
        priority?: number | null;
    }>;
}

function extractModelIdFromModelKey(modelKey: string): string {
    const firstColon = modelKey.indexOf(":");
    const lastColon = modelKey.lastIndexOf(":");
    if (firstColon < 0 || lastColon <= firstColon) return "";
    return modelKey.slice(firstColon + 1, lastColon).trim();
}

function shouldTreatRuleAsFree(modelKey: string, note: string | null | undefined): boolean {
    const normalizedModelId = extractModelIdFromModelKey(modelKey).toLowerCase();
    const normalizedNote = String(note ?? "").trim().toLowerCase();
    return (
        normalizedModelId.endsWith(":free") ||
        normalizedModelId.endsWith("-free") ||
        normalizedNote === "free" ||
        normalizedNote.startsWith("free ")
    );
}

function normalizePricingPlanForRule(
    pricingPlan: string | null | undefined,
    modelKey: string,
    note: string | null | undefined
): string {
    const normalizedPlan = String(pricingPlan ?? "").trim().toLowerCase();
    const inferredFree = shouldTreatRuleAsFree(modelKey, note);

    if (!normalizedPlan) {
        return inferredFree ? "free" : "standard";
    }
    if (normalizedPlan === "standard" && inferredFree) {
        return "free";
    }
    return normalizedPlan;
}

function isWithinActiveOrUpcomingPricingWindow(
    effectiveFrom: string | null | undefined,
    effectiveTo: string | null | undefined,
    nowMs: number
): boolean {
    const toMsRaw = effectiveTo ? Date.parse(effectiveTo) : Number.POSITIVE_INFINITY;
    const toMs = Number.isFinite(toMsRaw) ? toMsRaw : Number.POSITIVE_INFINITY;
    if (toMs <= nowMs) return false;
    return true;
}
export interface ProviderModel {
    id: string;                 // provider_api_model_id
    api_provider_id: string;
    provider_model_slug?: string | null;
    model_id: string;
    endpoint: string;
    capability_status?: string | null;
    routing_status?: string | null;
    is_active_gateway: boolean;
    input_modalities: string;   // CSV in your current schema
    output_modalities: string;  // CSV in your current schema
    quantization_scheme?: string | null;
    context_length?: number | null;
    prompt_training_policy_override?: string | null;
    prompt_training_override_notes?: string | null;
    prompt_training_override_source_url?: string | null;
    effective_from?: string | null;
    effective_to?: string | null;
    created_at?: string;
    updated_at?: string;
    params?: Record<string, unknown> | null;
    max_input_tokens?: number | null;
    max_output_tokens?: number | null;
}

export interface ProviderInfo {
    api_provider_id: string;
    api_provider_name: string;
    provider_family_id?: string | null;
    offer_label?: string | null;
    offer_scope?: "global" | "regional" | "specialized" | null;
    colour?: string | null;
    link?: string | null;
    country_code?: string | null;
    status?: string | null;
    routing_status?: string | null;
    residency_mode?:
        | "unknown"
        | "provider_managed"
        | "customer_selectable"
        | "account_selected"
        | null;
    default_execution_regions?: string[] | null;
    default_data_regions?: string[] | null;
    zero_data_retention?:
        | "unknown"
        | "unsupported"
        | "optional"
        | "default"
        | null;
    residency_source_url?: string | null;
    residency_notes?: string | null;
    regional_pricing_mode?:
        | "unknown"
        | "same_as_global"
        | "uplift"
        | "source_region_rates"
        | "offer_specific"
        | null;
    regional_pricing_uplift_percent?: number | null;
    pricing_source_url?: string | null;
    regional_pricing_notes?: string | null;
    prompt_training_policy?: string | null;
    prompt_training_notes?: string | null;
    prompt_training_source_url?: string | null;
    data_policy_tier?: string | null;
    data_policy_confidence?: string | null;
    data_policy_contract_mode?: string | null;
    data_policy_contract_notes?: string | null;
    user_identifier_policy?: string | null;
    user_identifier_notes?: string | null;
    privacy_policy_url?: string | null;
    terms_of_service_url?: string | null;
}

export interface ProviderPricing {
    provider: ProviderInfo;
    provider_models: ProviderModel[];
    pricing_rules: PricingRule[];
}

type ProviderModelCapability = {
    capability_id?: string | null;
    params?: Record<string, unknown> | null;
    max_input_tokens?: number | null;
    max_output_tokens?: number | null;
    status?: string | null;
};

function normalizeCapabilityStatus(value: unknown): string {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
}

function isInternalTestingCapability(value: unknown): boolean {
    return normalizeCapabilityStatus(value) === "internal_testing";
}

function isMissingProviderModelColumnError(error: unknown): boolean {
    const value = error as {
        message?: unknown;
        details?: unknown;
        hint?: unknown;
        code?: unknown;
    };
    const message = String(value?.message ?? "").toLowerCase();
    const details = String(value?.details ?? "").toLowerCase();
    const hint = String(value?.hint ?? "").toLowerCase();
    const code = String(value?.code ?? "").toUpperCase();
    const text = `${message} ${details} ${hint}`;
    const mentionsTargetColumn =
        text.includes("context_length") ||
        text.includes("max_output_tokens") ||
        text.includes("prompt_training_policy") ||
        text.includes("prompt_training_notes") ||
        text.includes("prompt_training_source_url") ||
        text.includes("data_policy_tier") ||
        text.includes("data_policy_confidence") ||
        text.includes("data_policy_contract_mode") ||
        text.includes("data_policy_contract_notes") ||
        text.includes("residency_mode") ||
        text.includes("default_execution_regions") ||
        text.includes("default_data_regions") ||
        text.includes("zero_data_retention") ||
        text.includes("residency_source_url") ||
        text.includes("residency_notes") ||
        text.includes("regional_pricing_mode") ||
        text.includes("regional_pricing_uplift_percent") ||
        text.includes("pricing_source_url") ||
        text.includes("regional_pricing_notes") ||
        text.includes("prompt_training_policy_override") ||
        text.includes("prompt_training_override_notes") ||
        text.includes("prompt_training_override_source_url") ||
        text.includes("user_identifier_policy") ||
        text.includes("user_identifier_notes") ||
        text.includes("privacy_policy_url") ||
        text.includes("terms_of_service_url");
    const mentionsRoutingStatusColumn = text.includes("routing_status");

    if (!mentionsTargetColumn && !mentionsRoutingStatusColumn) return false;
    if (code === "PGRST204" || code === "42703") return true;
    if (text.includes("does not exist")) return true;
    if (text.includes("could not find") && text.includes("column")) return true;
    if (text.includes("schema cache")) return true;

    return false;
}

export default async function getModelPricing(
    modelId: string,
    includeHidden: boolean,
    includeInternal = false
): Promise<ProviderPricing[]> {
    // console.log(`[getModelPricing] Starting for modelId: ${modelId}`);
    const supabase = createAdminClient();

    const { data: modelRow, error: modelError } = await supabase
        .from("data_models")
        .select("hidden")
        .eq("model_id", modelId)
        .maybeSingle();

    if (modelError) throw new Error(modelError.message || "Failed to load model metadata");
    if (modelRow && !includeHidden && modelRow.hidden) {
        throw new Error("Model not found");
    }

    const nowIso = new Date().toISOString();
    const activeWindowClause = [
        "and(effective_from.is.null,effective_to.is.null)",
        `and(effective_from.is.null,effective_to.gt.${nowIso})`,
        `and(effective_from.lte.${nowIso},effective_to.is.null)`,
        `and(effective_from.lte.${nowIso},effective_to.gt.${nowIso})`,
        `and(effective_from.gt.${nowIso},effective_to.is.null)`,
        `and(effective_from.gt.${nowIso},effective_to.gt.${nowIso})`,
    ].join(",");

    const providerModelSelect = `
        provider_api_model_id,
        provider_id,
        api_model_id,
        model_id,
        provider_model_slug,
        is_active_gateway,
        routing_status,
        input_modalities,
        output_modalities,
        quantization_scheme,
        context_length,
        max_output_tokens,
        prompt_training_policy_override,
        prompt_training_override_notes,
        prompt_training_override_source_url,
        effective_from,
        effective_to,
        created_at,
        updated_at,
        data_api_provider_model_capabilities (
            capability_id,
            params,
            max_input_tokens,
            max_output_tokens,
            status
        ),
        data_api_providers (
            api_provider_name,
            provider_family_id,
            offer_label,
            offer_scope,
            colour,
            link,
            country_code,
            status,
            routing_status,
            residency_mode,
            default_execution_regions,
            default_data_regions,
            zero_data_retention,
            residency_source_url,
            residency_notes,
            regional_pricing_mode,
            regional_pricing_uplift_percent,
            pricing_source_url,
            regional_pricing_notes,
            prompt_training_policy,
            prompt_training_notes,
            prompt_training_source_url,
            data_policy_tier,
            data_policy_confidence,
            data_policy_contract_mode,
            data_policy_contract_notes,
            user_identifier_policy,
            user_identifier_notes,
            privacy_policy_url,
            terms_of_service_url
        )
    `;

    const providerModelSelectWithoutDataPolicy = `
        provider_api_model_id,
        provider_id,
        api_model_id,
        model_id,
        provider_model_slug,
        is_active_gateway,
        routing_status,
        input_modalities,
        output_modalities,
        quantization_scheme,
        context_length,
        max_output_tokens,
        prompt_training_policy_override,
        prompt_training_override_notes,
        prompt_training_override_source_url,
        effective_from,
        effective_to,
        created_at,
        updated_at,
        data_api_provider_model_capabilities (
            capability_id,
            params,
            max_input_tokens,
            max_output_tokens,
            status
        ),
        data_api_providers (
            api_provider_name,
            provider_family_id,
            offer_label,
            offer_scope,
            colour,
            link,
            country_code,
            status,
            routing_status,
            residency_mode,
            default_execution_regions,
            default_data_regions,
            zero_data_retention,
            residency_source_url,
            residency_notes,
            regional_pricing_mode,
            regional_pricing_uplift_percent,
            pricing_source_url,
            regional_pricing_notes,
            prompt_training_policy,
            prompt_training_notes,
            prompt_training_source_url,
            user_identifier_policy,
            user_identifier_notes,
            privacy_policy_url,
            terms_of_service_url
        )
    `;

    const providerModelSelectLegacy = `
        provider_api_model_id,
        provider_id,
        api_model_id,
        model_id,
        provider_model_slug,
        is_active_gateway,
        routing_status,
        input_modalities,
        output_modalities,
        quantization_scheme,
        effective_from,
        effective_to,
        created_at,
        updated_at,
        data_api_provider_model_capabilities (
            capability_id,
            params,
            max_input_tokens,
            max_output_tokens,
            status
        ),
        data_api_providers (
            api_provider_name,
            colour,
            link,
            country_code,
            status,
            routing_status
        )
    `;

    // Fetch provider models with capabilities and provider info in one query.
    // Temporary compatibility: allow pre-migration DBs that don't yet have
    // context_length / max_output_tokens columns on data_api_provider_models.
    let pmRows: any[] | null = null;
    let pmError: any = null;
    let providerModelSelectForSiblingLookup = providerModelSelect;
    const mergeProviderRowsById = (rows: any[]): any[] => {
        const byProviderApiModelId = new Map<string, any>();
        for (const row of rows) {
            const key = String(row?.provider_api_model_id ?? "").trim();
            if (!key) continue;
            byProviderApiModelId.set(key, row);
        }
        return Array.from(byProviderApiModelId.values());
    };

    const fetchProviderRows = async (args: {
        selectClause: string;
        modelIds: string[];
        providerIds?: string[];
    }) => {
        const modelIds = args.modelIds.filter(Boolean);
        if (!modelIds.length) {
            return {
                rows: [] as any[],
                error: null as any,
            };
        }

        let byInternalQuery = supabase
            .from("data_api_provider_models")
            .select(args.selectClause);
        let byApiQuery = supabase
            .from("data_api_provider_models")
            .select(args.selectClause);

        if (args.providerIds?.length) {
            byInternalQuery = byInternalQuery.in("provider_id", args.providerIds);
            byApiQuery = byApiQuery.in("provider_id", args.providerIds);
        }

        const [byInternalRes, byApiRes] = await Promise.all([
            byInternalQuery.in("model_id", modelIds),
            byApiQuery.in("api_model_id", modelIds),
        ]);

        if (byInternalRes.error && byApiRes.error) {
            return {
                rows: null as any[] | null,
                error: byInternalRes.error,
            };
        }

        const mergedRows = [
            ...((byInternalRes.data ?? []) as any[]),
            ...((byApiRes.data ?? []) as any[]),
        ];

        return {
            rows: mergeProviderRowsById(mergedRows),
            error: byInternalRes.error ?? byApiRes.error ?? null,
        };
    };

    {
        const res = await fetchProviderRows({
            selectClause: providerModelSelect,
            modelIds: [modelId],
        });
        pmRows = res.rows;
        pmError = res.error;
    }

    if (pmError && isMissingProviderModelColumnError(pmError)) {
        const compatRes = await fetchProviderRows({
            selectClause: providerModelSelectWithoutDataPolicy,
            modelIds: [modelId],
        });
        if (compatRes.error && isMissingProviderModelColumnError(compatRes.error)) {
            providerModelSelectForSiblingLookup = providerModelSelectLegacy;
            const legacyRes = await fetchProviderRows({
                selectClause: providerModelSelectLegacy,
                modelIds: [modelId],
            });
            pmRows = legacyRes.rows;
            pmError = legacyRes.error;
        } else {
            providerModelSelectForSiblingLookup = providerModelSelectWithoutDataPolicy;
            pmRows = compatRes.rows;
            pmError = compatRes.error;
        }
    }

    if (pmError) throw new Error(pmError.message || "Failed to fetch provider models");

    const normalizedModelId = modelId.toLowerCase();
    const siblingModelIds =
        normalizedModelId.endsWith("-fast") || normalizedModelId.endsWith("-flex")
            ? []
            : [`${modelId}-fast`, `${modelId}-flex`];
    const providerIdsForSiblingLookup = Array.from(
        new Set(
            ((pmRows ?? []) as any[])
                .map((row) => (typeof row?.provider_id === "string" ? row.provider_id : ""))
                .filter(Boolean)
        )
    );
    if (siblingModelIds.length > 0 && providerIdsForSiblingLookup.length > 0) {
        const siblingRes = await fetchProviderRows({
            selectClause: providerModelSelectForSiblingLookup,
            modelIds: siblingModelIds,
            providerIds: providerIdsForSiblingLookup,
        });
        if (!siblingRes.error && siblingRes.rows?.length) {
            pmRows = mergeProviderRowsById([...(pmRows ?? []), ...siblingRes.rows]);
        }
    }

    // console.log(`[getModelPricing] Fetched ${pmRows?.length || 0} provider model rows for providers: ${(pmRows ?? []).map(r => r.provider_id).join(', ')}`);

    // Build provider models list
    const providerModels: any[] = [];
    const providerMap = new Map<string, ProviderPricing>();

    const providerModelPrefixes = new Set<string>();

    for (const row of (pmRows ?? []) as any[]) {
        // console.log(`[getModelPricing] Processing row:`, JSON.stringify(row, null, 2));
        const pid = row.provider_id;
        const apiModelId = row.api_model_id;
        if (pid && apiModelId) {
            providerModelPrefixes.add(`${pid}:${apiModelId}:`);
        }
        if (!providerMap.has(pid)) {
            providerMap.set(pid, {
                provider: {
                    api_provider_id: pid,
                    api_provider_name: row.data_api_providers?.api_provider_name || pid,
                    provider_family_id:
                        row.data_api_providers?.provider_family_id ?? pid,
                    offer_label: row.data_api_providers?.offer_label ?? null,
                    offer_scope: row.data_api_providers?.offer_scope ?? "global",
                    colour: row.data_api_providers?.colour ?? null,
                    link: row.data_api_providers?.link || null,
                    country_code: row.data_api_providers?.country_code || null,
                    status: row.data_api_providers?.status ?? null,
                    routing_status:
                        row.data_api_providers?.routing_status ?? null,
                    residency_mode:
                        row.data_api_providers?.residency_mode ?? null,
                    default_execution_regions: Array.isArray(
                        row.data_api_providers?.default_execution_regions
                    )
                        ? row.data_api_providers.default_execution_regions
                        : null,
                    default_data_regions: Array.isArray(
                        row.data_api_providers?.default_data_regions
                    )
                        ? row.data_api_providers.default_data_regions
                        : null,
                    zero_data_retention:
                        row.data_api_providers?.zero_data_retention ?? null,
                    residency_source_url:
                        row.data_api_providers?.residency_source_url ?? null,
                    residency_notes:
                        row.data_api_providers?.residency_notes ?? null,
                    regional_pricing_mode:
                        row.data_api_providers?.regional_pricing_mode ?? null,
                    regional_pricing_uplift_percent:
                        row.data_api_providers?.regional_pricing_uplift_percent ?? null,
                    pricing_source_url:
                        row.data_api_providers?.pricing_source_url ?? null,
                    regional_pricing_notes:
                        row.data_api_providers?.regional_pricing_notes ?? null,
                    prompt_training_policy:
                        row.data_api_providers?.prompt_training_policy ?? null,
                    prompt_training_notes:
                        row.data_api_providers?.prompt_training_notes ?? null,
                    prompt_training_source_url:
                        row.data_api_providers?.prompt_training_source_url ?? null,
                    data_policy_tier:
                        row.data_api_providers?.data_policy_tier ?? null,
                    data_policy_confidence:
                        row.data_api_providers?.data_policy_confidence ?? null,
                    data_policy_contract_mode:
                        row.data_api_providers?.data_policy_contract_mode ?? null,
                    data_policy_contract_notes:
                        row.data_api_providers?.data_policy_contract_notes ?? null,
                    user_identifier_policy:
                        row.data_api_providers?.user_identifier_policy ?? null,
                    user_identifier_notes:
                        row.data_api_providers?.user_identifier_notes ?? null,
                    privacy_policy_url:
                        row.data_api_providers?.privacy_policy_url ?? null,
                    terms_of_service_url:
                        row.data_api_providers?.terms_of_service_url ?? null,
                },
                provider_models: [],
                pricing_rules: [],
            });
        }

        const rawCapabilities = Array.isArray(row.data_api_provider_model_capabilities)
            ? (row.data_api_provider_model_capabilities as ProviderModelCapability[])
            : [];
        const capabilities = includeInternal
            ? rawCapabilities
            : rawCapabilities.filter(
                    (capability) => !isInternalTestingCapability(capability?.status)
                );
        if (rawCapabilities.length > 0 && capabilities.length === 0) {
            continue;
        }
        const entry = providerMap.get(pid)!;

        if (!capabilities.length) {
            const providerModel: ProviderModel = {
                id: row.provider_api_model_id,
                api_provider_id: row.provider_id,
                provider_model_slug: row.provider_model_slug,
                model_id: row.api_model_id,
                endpoint: "unmapped",
                capability_status: null,
                routing_status: row.routing_status ?? null,
                is_active_gateway: row.is_active_gateway,
                input_modalities: Array.isArray(row.input_modalities)
                    ? row.input_modalities.join(",")
                    : row.input_modalities ?? "",
                output_modalities: Array.isArray(row.output_modalities)
                    ? row.output_modalities.join(",")
                    : row.output_modalities ?? "",
                effective_from: row.effective_from,
                effective_to: row.effective_to,
                created_at: row.created_at,
                updated_at: row.updated_at,
                params: null,
                quantization_scheme: normalizeQuantizationScheme(
                    row.quantization_scheme ?? null
                ),
                context_length: row.context_length ?? null,
                prompt_training_policy_override:
                    row.prompt_training_policy_override ?? null,
                prompt_training_override_notes:
                    row.prompt_training_override_notes ?? null,
                prompt_training_override_source_url:
                    row.prompt_training_override_source_url ?? null,
                max_input_tokens: null,
                max_output_tokens: row.max_output_tokens ?? null,
            };

            providerModels.push(providerModel);
            entry.provider_models.push(providerModel);
            continue;
        }

        for (const capability of capabilities) {
            if (!capability?.capability_id) continue;
            const providerModel: ProviderModel = {
                id: row.provider_api_model_id,
                api_provider_id: row.provider_id,
                provider_model_slug: row.provider_model_slug,
                model_id: row.api_model_id,
                endpoint: capability.capability_id,
                capability_status: capability.status ?? null,
                routing_status: row.routing_status ?? null,
                is_active_gateway: row.is_active_gateway,
                input_modalities: Array.isArray(row.input_modalities)
                    ? row.input_modalities.join(",")
                    : row.input_modalities ?? "",
                output_modalities: Array.isArray(row.output_modalities)
                    ? row.output_modalities.join(",")
                    : row.output_modalities ?? "",
                effective_from: row.effective_from,
                effective_to: row.effective_to,
                created_at: row.created_at,
                updated_at: row.updated_at,
                params: capability.params ?? null,
                quantization_scheme: normalizeQuantizationScheme(
                    row.quantization_scheme ?? null
                ),
                context_length: row.context_length ?? null,
                prompt_training_policy_override:
                    row.prompt_training_policy_override ?? null,
                prompt_training_override_notes:
                    row.prompt_training_override_notes ?? null,
                prompt_training_override_source_url:
                    row.prompt_training_override_source_url ?? null,
                max_input_tokens: capability.max_input_tokens ?? null,
                max_output_tokens:
                    capability.max_output_tokens ?? row.max_output_tokens ?? null,
            };

            providerModels.push(providerModel);
            entry.provider_models.push(providerModel);
        }
    }

    // console.log(`[getModelPricing] Built ${providerModels.length} provider models, ${providerMap.size} providers: ${Array.from(providerMap.keys()).join(', ')}`);
    const modelKeys = Array.from(
        new Set(
            providerModels.map(
                (pm) => `${pm.api_provider_id}:${pm.model_id}:${pm.endpoint}`
            )
        )
    ).filter(Boolean);

    // console.log(`[getModelPricing] Model keys: ${modelKeys.join(', ')}`);

    // Fetch all rules for those keys in one query
    let rules: PricingRule[] = [];
    const mapRule = (x: any): PricingRule => ({
        id: x.rule_id,
        model_key: x.model_key,
        pricing_plan: normalizePricingPlanForRule(
            x.pricing_plan,
            String(x.model_key ?? ""),
            x.note ?? null
        ),
        meter: x.meter,
        unit: x.unit ?? "token",
        unit_size: Number(x.unit_size ?? 1),
        price_per_unit: Number(x.price_per_unit),
        currency: x.currency ?? "USD",
        note: x.note ?? null,
        match: x.match ?? [],
        priority: Number(x.priority ?? 100),
        effective_from: x.effective_from,
        effective_to: x.effective_to ?? null,
        billing_timestamp_basis: x.billing_timestamp_basis ?? "request_start",
        time_windows: Array.isArray(x.time_windows) ? x.time_windows : [],
    });

    const nowMs = Date.now();

    if (modelKeys.length) {
        const { data: r, error: prErr } = await supabase
            .from("data_api_pricing_rules")
            .select(
                "rule_id, model_key, pricing_plan, meter, unit, unit_size, price_per_unit, currency, note, priority, effective_from, effective_to, match, billing_timestamp_basis, time_windows"
            )
            .in("model_key", modelKeys)
            .or(activeWindowClause)
            .order("priority", { ascending: false })
            .order("effective_from", { ascending: false });

        if (prErr) throw new Error(prErr.message || "Failed to fetch pricing rules");

        rules = (r || [])
            .filter((row) =>
                isWithinActiveOrUpcomingPricingWindow(
                    row.effective_from ?? null,
                    row.effective_to ?? null,
                    nowMs
                )
            )
            .map(mapRule);

        // console.log(`[getModelPricing] Fetched ${rules.length} pricing rules: ${rules.slice(0, 5).map(r => `${r.id} (${r.meter})`).join(', ')}${rules.length > 5 ? '...' : ''}`);
    }

    // Fallback for incomplete capability rows in DB: fetch rules by provider:model:* prefix.
    if (providerModelPrefixes.size > 0) {
        const knownPrefixes = new Set<string>();
        for (const rule of rules) {
            const lastColon = rule.model_key.lastIndexOf(":");
            if (lastColon <= 0) continue;
            knownPrefixes.add(`${rule.model_key.slice(0, lastColon)}:`);
        }

        const missingPrefixes = [...providerModelPrefixes].filter(
            (prefix) => !knownPrefixes.has(prefix)
        );

        for (const prefix of missingPrefixes) {
            const { data: fallbackRows, error: fallbackError } = await supabase
                .from("data_api_pricing_rules")
                .select(
                    "rule_id, model_key, pricing_plan, meter, unit, unit_size, price_per_unit, currency, note, priority, effective_from, effective_to, match, billing_timestamp_basis, time_windows"
                )
                .like("model_key", `${prefix}%`)
                .or(activeWindowClause)
                .order("priority", { ascending: false })
                .order("effective_from", { ascending: false });

            if (fallbackError) {
                console.warn(
                    "[getModelPricing] Fallback pricing lookup failed",
                    modelId,
                    prefix,
                    fallbackError.message
                );
                continue;
            }

            for (const row of fallbackRows ?? []) {
                if (
                    !isWithinActiveOrUpcomingPricingWindow(
                        row.effective_from ?? null,
                        row.effective_to ?? null,
                        nowMs
                    )
                ) {
                    continue;
                }
                rules.push(mapRule(row));
            }
        }
    }

    if (rules.length > 1) {
        const dedup = new Map<string, PricingRule>();
        for (const rule of rules) dedup.set(rule.id, rule);
        rules = [...dedup.values()];
    }

    // Attach rules to providers
    const byKeyToProvider = new Map<string, string>();
    const byPrefixToProvider = new Map<string, string>();
    for (const [pid, entry] of providerMap) {
        for (const pm of entry.provider_models) {
            byKeyToProvider.set(
                `${pm.api_provider_id}:${pm.model_id}:${pm.endpoint}`,
                pid
            );
            byPrefixToProvider.set(`${pm.api_provider_id}:${pm.model_id}:`, pid);
        }
    }
    for (const rule of rules) {
        const lastColon = rule.model_key.lastIndexOf(":");
        const prefix =
            lastColon > 0 ? `${rule.model_key.slice(0, lastColon)}:` : null;
        const pid = byKeyToProvider.get(rule.model_key) ||
            (prefix ? byPrefixToProvider.get(prefix) : undefined);
        if (!pid) continue;
        providerMap.get(pid)!.pricing_rules.push(rule);
    }

    const result = [...providerMap.values()].filter(
        (entry) => entry.provider_models.length > 0
    ).sort((a, b) => {
        const an = a.provider.api_provider_name || a.provider.api_provider_id;
        const bn = b.provider.api_provider_name || b.provider.api_provider_id;
        return an.localeCompare(bn);
    });

    // console.log(`[getModelPricing] Returning ${result.length} providers with pricing: ${result.map(p => p.provider.api_provider_name || p.provider.api_provider_id).join(', ')}`);

    return result;
}

/**
 * Cached version of getModelPricing.
 *
 * Usage: await getModelPricingCached(modelId)
 *
 * This wraps the fetcher with `unstable_cache` for at least 1 week of caching.
 */
export async function getModelPricingCached(
    modelId: string,
    includeHidden: boolean,
    includeInternal = false
): Promise<ProviderPricing[]> {
    "use cache";

    cacheLife("hours");
    cacheTag("public-model-catalogue");
    cacheTag("data:models");
    cacheTag(`data:models:${modelId}`);
    cacheTag(`model:api:${modelId}`);
    cacheTag("data:data_api_pricing_rules");
    cacheTag("data:data_api_provider_models");
    cacheTag("frontend:model-pricing");
    cacheTag("frontend:model-pricing-history");

    // console.log("[fetch] HIT DB for model pricing", modelId);
    return getModelPricing(modelId, includeHidden, includeInternal);
}
