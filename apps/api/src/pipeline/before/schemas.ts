import { z } from "zod";
import type { PriceCard } from "../pricing";
import type { PriceRule, PricingDimensionKey } from "../pricing/types";
import type {
    GateCheck,
    ByokKeyMeta,
    GatewayProviderSnapshot,
    GatewayContextData,
} from "./types";

const gateCheckSchema = z
    .union([
        z.boolean(),
        z.object({
            ok: z.boolean(),
            reason: z.string().nullable().optional(),
            reset_at: z.string().nullable().optional(),
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
        tiering_mode: z.string().nullable().optional(),
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
        tiering_mode: (rule.tiering_mode ?? null) as PriceRule["tiering_mode"],
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
        provider_model_slug: z.string().nullable().optional(),
        supports_endpoint: z.boolean().optional().default(true),
        base_weight: z.coerce.number().optional().default(1),
        byok_meta: z.array(byokMetaSchema).optional().default([]),
    })
    .transform<GatewayProviderSnapshot>((provider) => ({
        providerId: provider.provider_id,
        providerModelSlug: provider.provider_model_slug ?? null,
        supportsEndpoint: provider.supports_endpoint ?? true,
        baseWeight: Number.isFinite(provider.base_weight) ? provider.base_weight : 1,
        byokMeta: provider.byok_meta,
    }));

const contextSchema = z
    .object({
        team_id: z.string(),
        resolved_model: z.string().nullable().optional(),
        key_ok: gateCheckSchema,
        key_limit_ok: gateCheckSchema,
        credit_ok: gateCheckSchema,
        providers: z.array(providerSchema).default([]),
        pricing: z.record(priceCardSchema).default({}),
    })
    .transform<GatewayContextData>((payload) => ({
        teamId: payload.team_id,
        resolvedModel: payload.resolved_model ?? undefined,
        key: payload.key_ok,
        keyLimit: payload.key_limit_ok,
        credit: payload.credit_ok,
        providers: payload.providers,
        pricing: payload.pricing,
    }));

export {
    gateCheckSchema,
    priceRuleSchema,
    priceCardSchema,
    byokMetaSchema,
    providerSchema,
    contextSchema,
};
