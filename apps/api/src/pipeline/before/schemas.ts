// Purpose: Pipeline module for the gateway request lifecycle.
// Why: Keeps stage-specific logic isolated and testable.
// How: Exposes helpers used by before/execute/after orchestration.

import { z } from "zod";
import type { PriceCard } from "../pricing";
import type { PriceRule, PricingDimensionKey } from "../pricing/types";
import type {
    GateCheck,
    ByokKeyMeta,
    GatewayProviderSnapshot,
    GatewayContextData,
    PresetConfig,
    PresetData,
    TeamEnrichment,
    KeyEnrichment,
} from "./types";

const bucketSchema = z
    .object({
        window_start: z.string().nullable().optional(),
        requests_used: z.coerce.number().optional().default(0),
        requests_limit: z.coerce.number().optional().default(0),
        cost_used_nanos: z.coerce.number().optional().default(0),
        cost_limit_nanos: z.coerce.number().optional().default(0),
    })
    .transform((bucket) => ({
        windowStart: bucket.window_start ?? null,
        requestsUsed: bucket.requests_used ?? 0,
        requestsLimit: bucket.requests_limit ?? 0,
        costUsedNanos: bucket.cost_used_nanos ?? 0,
        costLimitNanos: bucket.cost_limit_nanos ?? 0,
    }));

const gateCheckSchema = z
    .union([
        z.boolean(),
        z.object({
            ok: z.boolean(),
            reason: z.string().nullable().optional(),
            reset_at: z.string().nullable().optional(),
            now: z.string().nullable().optional(),
            balance_nanos: z.coerce.number().nullable().optional(),
            buckets: z
                .object({
                    daily: bucketSchema.optional(),
                    weekly: bucketSchema.optional(),
                    monthly: bucketSchema.optional(),
                })
                .nullable()
                .optional(),
        }),
    ])
    .transform<GateCheck>((value) => {
        if (typeof value === "boolean") {
            return { ok: value, reason: null, resetAt: null };
        }
        return {
            ok: value.ok,
            reason: value.reason ?? null,
            resetAt: value.reset_at ?? null,
            now: value.now ?? null,
            balanceNanos: value.balance_nanos ?? null,
            buckets: value.buckets ?? null,
        };
    });

const priceRuleSchema = z
    .object({
        pricing_plan: z.string(),
        meter: z.string(),
        unit: z.string(),
        unit_size: z.coerce.number(),
        price_per_unit: z.union([z.string(), z.number()]).transform((value) => String(value)),
        currency: z.string().default("USD"),
        match: z.array(z.any()).optional().default([]),
        priority: z.coerce.number().optional().default(100),
        id: z.string().optional(),
    })
    .transform<PriceRule>((rule) => ({
        pricing_plan: rule.pricing_plan,
        meter: rule.meter as PricingDimensionKey,
        unit: rule.unit,
        unit_size: rule.unit_size,
        price_per_unit: rule.price_per_unit,
        currency: rule.currency,
        match: rule.match,
        priority: rule.priority,
        id: rule.id,
    }));

const priceCardSchema = z
    .object({
        provider: z.string(),
        model: z.string(),
        endpoint: z.string(),
        effective_from: z.string().nullable(),
        effective_to: z.string().nullable().optional(),
        currency: z.string().default("USD"),
        version: z.string().nullable(),
        rules: z.array(priceRuleSchema),
    })
    .transform<PriceCard>((card) => ({
        provider: card.provider,
        model: card.model,
        endpoint: card.endpoint,
        effective_from: card.effective_from,
        effective_to: card.effective_to ?? null,
        currency: card.currency as PriceCard["currency"],
        version: card.version,
        rules: card.rules,
    }));

const byokMetaSchema = z
    .object({
        id: z.string(),
        provider_id: z.string().nullable().optional(),
        fingerprint_sha256: z.string(),
        key_version: z.union([z.string(), z.number()]).nullable().optional(),
        always_use: z.boolean().optional().default(false),
        key: z.string().optional().nullable(),
        api_key: z.string().optional().nullable(),
        raw_key: z.string().optional().nullable(),
    })
    .transform<ByokKeyMeta>((meta) => ({
        id: meta.id,
        providerId: meta.provider_id ?? null,
        fingerprintSha256: meta.fingerprint_sha256,
        keyVersion:
            meta.key_version === undefined || meta.key_version === null
                ? null
                : String(meta.key_version),
        alwaysUse: Boolean(meta.always_use),
        key: meta.key ?? meta.api_key ?? meta.raw_key ?? null,
    }));

const providerSchema = z
    .object({
        provider_id: z.string(),
        provider_status: z.string().nullable().optional(),
        provider_model_slug: z.string().nullable().optional(),
        supports_endpoint: z.boolean().optional().default(true),
        base_weight: z.coerce.number().optional().default(1),
        byok_meta: z.array(byokMetaSchema).optional().default([]),
        capability_params: z.record(z.any()).optional().default({}),
        max_input_tokens: z.coerce.number().nullable().optional(),
        max_output_tokens: z.coerce.number().nullable().optional(),
    })
    .transform<GatewayProviderSnapshot>((provider) => ({
        providerId: provider.provider_id,
        providerStatus: (provider.provider_status ?? null) as GatewayProviderSnapshot["providerStatus"],
        providerModelSlug: provider.provider_model_slug ?? null,
        supportsEndpoint: provider.supports_endpoint ?? true,
        baseWeight: Number.isFinite(provider.base_weight) ? provider.base_weight : 1,
        byokMeta: provider.byok_meta,
        capabilityParams: provider.capability_params ?? {},
        maxInputTokens: provider.max_input_tokens ?? null,
        maxOutputTokens: provider.max_output_tokens ?? null,
    }));

const presetConfigSchema = z
    .object({
        systemPrompt: z.string().nullable().optional(),
        allowedModels: z.array(z.string()).nullable().optional(),
        defaultModel: z.string().nullable().optional(),
        model: z.string().nullable().optional(),
        allowedProviders: z.array(z.string()).nullable().optional(),
        deniedProviders: z.array(z.string()).nullable().optional(),
        defaultParams: z.record(z.any()).nullable().optional(),
        providerPreferences: z.record(z.number()).nullable().optional(),
    })
    .transform<PresetConfig>((config) => ({
        systemPrompt: config.systemPrompt ?? null,
        allowedModels: config.allowedModels ?? null,
        defaultModel: config.defaultModel ?? config.model ?? null,
        model: config.model ?? null,
        allowedProviders: config.allowedProviders ?? null,
        deniedProviders: config.deniedProviders ?? null,
        defaultParams: config.defaultParams ?? null,
        providerPreferences: config.providerPreferences ?? null,
    }));

const presetDataSchema = z
    .object({
        id: z.string(),
        name: z.string(),
        description: z.string().nullable().optional(),
        config: presetConfigSchema,
        visibility: z.enum(["private", "team", "public"]),
    })
    .transform<PresetData>((preset) => ({
        id: preset.id,
        name: preset.name,
        description: preset.description ?? null,
        config: preset.config,
        visibility: preset.visibility,
    }));

const teamEnrichmentSchema = z
    .object({
        tier: z.string(),
        created_at: z.string(),
        account_age_days: z.coerce.number(),
        balance_nanos: z.coerce.number(),
        balance_usd: z.coerce.number(),
        balance_is_low: z.boolean(),
        total_requests: z.coerce.number(),
        total_spend_nanos: z.coerce.number(),
        total_spend_usd: z.coerce.number(),
        spend_24h_nanos: z.coerce.number(),
        spend_24h_usd: z.coerce.number(),
        spend_7d_nanos: z.coerce.number(),
        spend_7d_usd: z.coerce.number(),
        spend_30d_nanos: z.coerce.number(),
        spend_30d_usd: z.coerce.number(),
        requests_1h: z.coerce.number(),
        requests_24h: z.coerce.number(),
    })
    .transform<TeamEnrichment>((data) => ({
        tier: data.tier,
        created_at: data.created_at,
        account_age_days: data.account_age_days,
        balance_nanos: data.balance_nanos,
        balance_usd: data.balance_usd,
        balance_is_low: data.balance_is_low,
        total_requests: data.total_requests,
        total_spend_nanos: data.total_spend_nanos,
        total_spend_usd: data.total_spend_usd,
        spend_24h_nanos: data.spend_24h_nanos,
        spend_24h_usd: data.spend_24h_usd,
        spend_7d_nanos: data.spend_7d_nanos,
        spend_7d_usd: data.spend_7d_usd,
        spend_30d_nanos: data.spend_30d_nanos,
        spend_30d_usd: data.spend_30d_usd,
        requests_1h: data.requests_1h,
        requests_24h: data.requests_24h,
    }));

const keyEnrichmentSchema = z
    .object({
        name: z.string().nullable(),
        created_at: z.string(),
        key_age_days: z.coerce.number(),
        total_requests: z.coerce.number(),
        total_spend_nanos: z.coerce.number(),
        total_spend_usd: z.coerce.number(),
        requests_today: z.coerce.number(),
        spend_today_nanos: z.coerce.number(),
        spend_today_usd: z.coerce.number(),
        daily_limit_pct: z.coerce.number().nullable(),
    })
    .transform<KeyEnrichment>((data) => ({
        name: data.name,
        created_at: data.created_at,
        key_age_days: data.key_age_days,
        total_requests: data.total_requests,
        total_spend_nanos: data.total_spend_nanos,
        total_spend_usd: data.total_spend_usd,
        requests_today: data.requests_today,
        spend_today_nanos: data.spend_today_nanos,
        spend_today_usd: data.spend_today_usd,
        daily_limit_pct: data.daily_limit_pct,
    }));

const contextSchema = z
    .object({
        team_id: z.string(),
        resolved_model: z.string().nullable().optional(),
        preset: presetDataSchema.nullable().optional(),
        key_ok: gateCheckSchema,
        key_limit_ok: gateCheckSchema,
        credit_ok: gateCheckSchema,
        providers: z.array(providerSchema).default([]),
        pricing: z.record(priceCardSchema).default({}),
        team_enrichment: teamEnrichmentSchema.nullable().optional(),
        key_enrichment: keyEnrichmentSchema.nullable().optional(),
    })
    .transform<GatewayContextData>((payload) => ({
        teamId: payload.team_id,
        resolvedModel: payload.resolved_model ?? undefined,
        preset: payload.preset ?? null,
        key: payload.key_ok,
        keyLimit: payload.key_limit_ok,
        credit: payload.credit_ok,
        providers: payload.providers,
        pricing: payload.pricing,
        teamEnrichment: payload.team_enrichment ?? null,
        keyEnrichment: payload.key_enrichment ?? null,
    }));

export {
    gateCheckSchema,
    priceRuleSchema,
    priceCardSchema,
    byokMetaSchema,
    providerSchema,
    presetConfigSchema,
    presetDataSchema,
    teamEnrichmentSchema,
    keyEnrichmentSchema,
    contextSchema,
};

