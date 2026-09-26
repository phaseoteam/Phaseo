import { z } from "zod";

export const PUBLIC_CATALOG_MAX_AGE_MS = 300_000;
export const PUBLIC_CATALOG_MAX_BYTES = 256_000;
const text = z.string().max(2048).nullable().optional();
const number = z.number().finite().nullable().optional();
const boolean = z.boolean().nullable().optional();
const strings = z.array(z.string().max(2048)).max(512).nullable().optional();
const record = z.record(z.string(), z.unknown());
const availability = z.union([z.string(), z.object({
    mode: z.string(), countries: strings, country_source: text, unknown_country: text,
    blocked_subdivisions: strings, unknown_subdivision: text, reason: text,
    source_url: text, effective_from: text, effective_to: text,
})]).nullable().optional();

// Deliberately enumerate routing fields. Adding UI/admin fields to the database
// projection must not silently publish them into a shared cache.
const dataPolicy = {
    prompt_training_policy: text, data_policy_tier: text, data_policy_confidence: text,
    data_policy_contract_mode: text, data_policy_variant: text,
};
const publicProvider = z.object({
    provider_id: z.string(), api_model_id: z.string(), byok_meta: z.array(z.never()).max(0),
    provider_model_slug: text, pricing_key: text, availability, model_status: text,
    input_modalities: z.union([strings, z.string()]), output_modalities: z.union([strings, z.string()]), ...dataPolicy,
    capability_status: text, capability_params: z.union([record, z.array(z.union([z.string(), record]))]).nullable().optional(),
    max_input_tokens: number, max_output_tokens: number, supports_endpoint: boolean, base_weight: number,
});
const providerRow = z.object({
    provider_slug: z.string(), status: text, routing_enabled: boolean, routable: boolean,
    credential_mode: text, provider_family_slug: text, offer_scope: text, offer_label: text,
    residency_mode: text, default_execution_regions: strings, default_data_regions: strings,
    zero_data_retention: z.union([z.boolean(), z.string()]).nullable().optional(), ...dataPolicy,
    stream_cancellation_support: text, stream_cancellation_stops_provider_billing: boolean,
    stream_cancellation_usage_recovery: text, stream_cancellation_evidence_kind: text,
    stream_cancellation_source_url: text,
    metadata: z.object({ availability }).nullable().optional(),
});
const priceRule = z.object({
    id: text, pricing_plan: text, meter: z.string(), unit: text, unit_size: number,
    price_per_unit: z.union([z.string(), z.number().finite()]), included_quantity: number,
    currency: text, priority: number, billing_timestamp_basis: text,
    match: z.array(z.object({
        path: z.string(), op: z.string(), value: z.unknown().optional(), or_group: number, and_index: number,
    })).nullable().optional(),
    time_windows: z.array(z.object({
        label: z.string(), timezone: z.string(), days_of_week: strings,
        start_time: z.string(), end_time: z.string(),
        price_per_unit: z.union([z.string(), z.number().finite()]).nullable().optional(), priority: number,
    })).nullable().optional(),
});
const priceCard = z.object({
    provider: z.string(), model: z.string(), endpoint: z.string(), effective_from: text,
    effective_to: text, currency: z.string(), version: text, rules: z.array(priceRule),
});

const privateFields = new Set([
    "workspace_id", "private_endpoint", "api_key", "enc_value", "fingerprint_sha256",
    "key_hash", "key_encrypted", "encrypted_key", "authorization", "__proto__", "constructor", "prototype",
]);
function hasPrivateFields(value: unknown, depth = 0): boolean {
    if (depth > 32) return true;
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some(item => hasPrivateFields(item, depth + 1));
    return Object.entries(value).some(([key, item]) => privateFields.has(key.toLowerCase()) || hasPrivateFields(item, depth + 1));
}

export const publicCatalogSchema = z.unknown().superRefine((value, ctx) => {
    if (hasPrivateFields(value)) ctx.addIssue({ code: "custom", message: "Private data in public catalog" });
}).pipe(z.object({
    version: z.literal(1), model: z.string().min(1).max(512), resolvedModel: z.string().min(1).max(512),
    endpoints: z.array(z.string()).min(1).max(2), checkedAt: z.number().finite(), expiresAt: z.number().finite(),
    variants: z.array(z.object({
        endpoint: z.string(), providers: z.array(publicProvider), pricing: z.record(z.string(), priceCard),
    }).strict()).min(1).max(2),
    providerRows: z.array(providerRow),
    routeModes: z.array(z.object({ provider_slug: z.string(), credential_mode: text })),
}).strict());

export type PublicCatalogSnapshot = z.infer<typeof publicCatalogSchema>;

export function isPublicCatalogFresh(value: PublicCatalogSnapshot, model: string, endpoints: string[], now = Date.now()): boolean {
    // Independent DB/edge clocks; never re-age a copy or extend a price deadline.
    return value.model === model && value.checkedAt <= now + 1_000 && value.expiresAt > now &&
        value.expiresAt > value.checkedAt && value.expiresAt <= value.checkedAt + PUBLIC_CATALOG_MAX_AGE_MS &&
        JSON.stringify(value.endpoints) === JSON.stringify(endpoints) && value.variants.length === endpoints.length &&
        value.variants.every((variant, index) => variant.endpoint === endpoints[index]);
}

function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.entries(value).filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
    return JSON.stringify(value) ?? "null";
}

function freeze<T>(value: T): T {
    if (value && typeof value === "object") {
        for (const item of Object.values(value)) freeze(item);
        Object.freeze(value);
    }
    return value;
}

/** Content revision excludes the lease envelope, so unchanged publications have
 * the same revision. The absolute timestamps are still checked independently. */
export async function createPublicRoutingSnapshot(input: unknown) {
    // Zod's unknown-valued capability/condition leaves retain their input
    // identity. Own those leaves too before freezing a shared snapshot.
    const catalog = structuredClone(publicCatalogSchema.parse(input));
    if (JSON.stringify(catalog).length * 2 > PUBLIC_CATALOG_MAX_BYTES) throw new Error("public_catalog_too_large");
    const { checkedAt: _checkedAt, expiresAt: _expiresAt, ...content } = catalog;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(content)));
    const revision = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    return freeze({ version: 2 as const, revision, catalog });
}

export type PublicRoutingSnapshot = Awaited<ReturnType<typeof createPublicRoutingSnapshot>>;
