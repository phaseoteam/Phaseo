import { z } from "zod";

export const WORKSPACE_RUNTIME_MAX_AGE_MS = 60_000;
export const WORKSPACE_RUNTIME_MAX_CACHE_BYTES = 256 * 1024;
// Match the public catalog's bounded database/Worker clock-skew allowance.
export const WORKSPACE_RUNTIME_CLOCK_SKEW_MS = 1_000;
const nullableBoolean = z.boolean().nullable();
const nullableText = z.string().nullable();
const nullableList = z.array(z.string()).nullable();
const nullableInteger = z.number().int().safe().nullable();

export const workspaceRuntimeSettingsSchema = z.object({
    routing_mode: nullableText, byok_fallback_enabled: nullableBoolean,
    beta_channel_enabled: nullableBoolean, alpha_channel_enabled: nullableBoolean,
    cache_aware_routing_enabled: nullableBoolean, privacy_zdr_only: nullableBoolean,
    privacy_enable_paid_may_train: nullableBoolean, privacy_enable_free_may_train: nullableBoolean,
    privacy_enable_input_output_logging: nullableBoolean, privacy_enable_free_may_publish_prompts: nullableBoolean,
    provider_restriction_mode: nullableText, provider_restriction_provider_ids: nullableList,
    provider_restriction_enforce_allowed: nullableBoolean, model_restriction_mode: nullableText,
    model_restriction_model_ids: nullableList, io_logging_enabled: nullableBoolean,
    io_logging_retention_days: nullableInteger, io_logging_include_provider_payloads: nullableBoolean,
    data_contribution_enabled: nullableBoolean, data_contribution_policy_version: nullableText,
    data_contribution_sample_rate_bps: nullableInteger, data_contribution_classifier_sample_rate_bps: nullableInteger,
    data_contribution_discount_bps: nullableInteger, response_healing_enabled: nullableBoolean,
    response_healing_locked: nullableBoolean, response_healing_mode: nullableText,
    auto_routing_allowed_patterns: nullableList, auto_routing_spend_profile: nullableText,
    auto_routing_max_input_price_per_million: z.number().finite().nullable(),
    auto_routing_max_output_price_per_million: z.number().finite().nullable(),
    auto_routing_objective: nullableText, auto_routing_fallbacks_enabled: nullableBoolean,
    auto_routing_revision: z.uuid().nullable(),
}).strict();

const byokReference = z.object({
    provider_id: z.string().min(1).max(256), id: z.uuid(), fingerprint_sha256: nullableText,
    key_version: nullableInteger, always_use: nullableBoolean,
}).strict();

/** Private workspace settings and credential REFERENCES only. Not an admission
 * decision: balances, budgets, effective tier and key authorization stay separate. */
export const workspaceRuntimeSchema = z.object({
    version: z.literal(1), workspaceId: z.uuid(),
    // Optional only for rolling deployment. Quota admission rejects absent identity.
    ownerUserId: z.uuid().nullable().optional(),
    checkedAtMs: z.number().int().safe().nonnegative(), expiresAtMs: z.number().int().safe().nonnegative(),
    configuredTier: nullableText, billingMode: z.enum(["wallet", "invoice"]),
    settings: workspaceRuntimeSettingsSchema,
    byok: z.record(z.string().min(1).max(256), z.array(byokReference)),
}).strict().superRefine((snapshot, context) => {
    if (snapshot.expiresAtMs <= snapshot.checkedAtMs || snapshot.expiresAtMs - snapshot.checkedAtMs > WORKSPACE_RUNTIME_MAX_AGE_MS) {
        context.addIssue({ code: "custom", message: "Invalid workspace runtime lease" });
    }
    for (const [provider, references] of Object.entries(snapshot.byok)) {
        if (references.some(reference => reference.provider_id !== provider)) {
            context.addIssue({ code: "custom", message: "Workspace BYOK provider mismatch" });
        }
    }
});
export type WorkspaceRuntimeSnapshot = z.infer<typeof workspaceRuntimeSchema>;

export function isWorkspaceRuntimeFresh(snapshot: WorkspaceRuntimeSnapshot, workspaceId: string, now = Date.now()): boolean {
    return snapshot.workspaceId === workspaceId && snapshot.checkedAtMs <= now + WORKSPACE_RUNTIME_CLOCK_SKEW_MS
        && snapshot.expiresAtMs > now;
}

/** Reject oversized cache entries before parsing; valid oversized source data is
 * not truncated and can still serve uncached through the existing source path. */
export function decodeWorkspaceRuntimeCache(raw: string, workspaceId: string, now = Date.now()): WorkspaceRuntimeSnapshot | null {
    if (raw.length * 2 > WORKSPACE_RUNTIME_MAX_CACHE_BYTES) return null;
    try {
        const parsed = workspaceRuntimeSchema.safeParse(JSON.parse(raw));
        return parsed.success && isWorkspaceRuntimeFresh(parsed.data, workspaceId, now) ? parsed.data : null;
    } catch { return null; }
}
