import { getBindingsIfConfigured, getSupabaseAdmin } from "@/runtime/env";
import { tieredRead } from "@core/tiered-cache";

/**
 * Successor routing for models no provider serves any more. A request is only
 * redirected when every one of these holds:
 * - the model has had no routable route for the grace period (72h, tracked in
 *   `v2_model_successor_routing.unserved_since`);
 * - an admin approved each hop to the current replacement model;
 * - the target is not a paid model replacing a free one;
 * - the workspace turned redirects on and the price policy allows the target.
 * Model and key restrictions are enforced on the target afterwards, as for any
 * other model; they are never widened.
 */
export type ModelSuccessorResolution = {
    model: string;
    replacementModel: string | null;
    unservedSince: string | null;
    target: string | null;
    chain: string[];
    reason: string | null;
    priceRatio: number | null;
    priceComparable: boolean;
};

export type SuccessorPricePolicy = "never" | "limit" | "any";

export type SuccessorRedirectPolicy = {
    enabled: boolean;
    pricePolicy: SuccessorPricePolicy;
    maxPriceIncreasePercent: number;
};

export type ModelSubstitution = {
    from: string;
    to: string;
    reason: "unserved";
    chain: string[];
    unservedSince: string | null;
    priceRatio: number | null;
};

const RESOLUTION_KEY_PREFIX = "gateway:model-successor:v1:";
const POLICY_KEY_PREFIX = "gateway:model-successor-policy:v1:";
const MAX_MODEL_LENGTH = 512;
const DISABLED_POLICY: SuccessorRedirectPolicy = { enabled: false, pricePolicy: "never", maxPriceIncreasePercent: 0 };

export function successorRedirectEnabled(): boolean {
    return getBindingsIfConfigured()?.GATEWAY_MODEL_SUCCESSOR_REDIRECT_ENABLED !== "false";
}

function stringOrNull(value: unknown): string | null {
    return typeof value === "string" && value ? value : null;
}

function finiteOrNull(value: unknown): number | null {
    const number = typeof value === "string" ? Number(value) : value;
    return typeof number === "number" && Number.isFinite(number) ? number : null;
}

export function parseModelSuccessorResolution(value: unknown): ModelSuccessorResolution | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    const model = stringOrNull(row.model);
    if (!model) return null;
    return {
        model,
        replacementModel: stringOrNull(row.replacement_model ?? row.replacementModel),
        unservedSince: stringOrNull(row.unserved_since ?? row.unservedSince),
        target: stringOrNull(row.target),
        chain: Array.isArray(row.chain) ? row.chain.filter((item): item is string => typeof item === "string") : [],
        reason: stringOrNull(row.reason),
        priceRatio: finiteOrNull(row.price_ratio ?? row.priceRatio),
        priceComparable: (row.price_comparable ?? row.priceComparable) === true,
    };
}

function isResolution(value: unknown): value is ModelSuccessorResolution {
    if (!value || typeof value !== "object") return false;
    const row = value as Record<string, unknown>;
    return typeof row.model === "string" && Array.isArray(row.chain) && typeof row.priceComparable === "boolean";
}

async function loadResolution(model: string): Promise<ModelSuccessorResolution | null> {
    const { data, error } = await getSupabaseAdmin().rpc("gateway_resolve_model_successor", { p_model_slug: model });
    if (error) throw new Error("gateway_model_successor_failed");
    return parseModelSuccessorResolution(data);
}

/** Successor routing state for a model with no providers, or `null` when unknown or unavailable. */
export async function findModelSuccessor(model: string): Promise<ModelSuccessorResolution | null> {
    const slug = model.trim();
    if (!slug || slug.length > MAX_MODEL_LENGTH || slug.startsWith("@")) return null;
    try {
        return await tieredRead<ModelSuccessorResolution>({
            key: `${RESOLUTION_KEY_PREFIX}${slug}`,
            loader: () => loadResolution(slug),
            l1FreshMs: 60_000,
            l2: { freshS: 300, storeS: 3_600 },
            l3: false,
            validate: isResolution,
            // Unknown names can be workspace-private model identifiers.
            isShareable: (value) => value !== null,
        });
    } catch {
        return null;
    }
}

export function parseSuccessorRedirectPolicy(row: unknown): SuccessorRedirectPolicy {
    if (!row || typeof row !== "object") return DISABLED_POLICY;
    const record = row as Record<string, unknown>;
    const pricePolicy = record.model_successor_price_policy;
    const percent = finiteOrNull(record.model_successor_max_price_increase_percent);
    return {
        enabled: record.model_successor_redirect_enabled === true,
        pricePolicy: pricePolicy === "limit" || pricePolicy === "any" ? pricePolicy : "never",
        maxPriceIncreasePercent: percent !== null && percent > 0 ? percent : 0,
    };
}

function isPolicy(value: unknown): value is SuccessorRedirectPolicy {
    if (!value || typeof value !== "object") return false;
    const policy = value as Record<string, unknown>;
    return typeof policy.enabled === "boolean" &&
        ["never", "limit", "any"].includes(String(policy.pricePolicy)) &&
        typeof policy.maxPriceIncreasePercent === "number";
}

async function loadPolicy(workspaceId: string): Promise<SuccessorRedirectPolicy> {
    const { data, error } = await getSupabaseAdmin()
        .from("workspace_settings")
        .select("model_successor_redirect_enabled,model_successor_price_policy,model_successor_max_price_increase_percent")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
    if (error) throw new Error("gateway_model_successor_policy_failed");
    return parseSuccessorRedirectPolicy(data);
}

/** The workspace's successor redirect settings; off when unset or unreadable. */
export async function loadSuccessorRedirectPolicy(workspaceId: string): Promise<SuccessorRedirectPolicy> {
    try {
        return await tieredRead<SuccessorRedirectPolicy>({
            key: `${POLICY_KEY_PREFIX}${workspaceId}`,
            loader: () => loadPolicy(workspaceId),
            l1FreshMs: 30_000,
            l2: { freshS: 60, storeS: 300 },
            l3: false,
            validate: isPolicy,
        }) ?? DISABLED_POLICY;
    } catch {
        return DISABLED_POLICY;
    }
}

/** Whether the workspace's price policy allows the target. An unknown price ratio is only allowed by "any". */
export function successorPriceAllowed(resolution: ModelSuccessorResolution, policy: SuccessorRedirectPolicy): boolean {
    if (policy.pricePolicy === "any") return true;
    if (!resolution.priceComparable || resolution.priceRatio === null) return false;
    const limit = policy.pricePolicy === "limit" ? 1 + policy.maxPriceIncreasePercent / 100 : 1;
    // Ratios are rounded to 6 places in SQL; tolerate that rounding at the limit.
    return resolution.priceRatio <= limit + 1e-6;
}

/** The substitution to apply, or `null` when the request must fail as it would today. */
export function successorRedirectTarget(
    resolution: ModelSuccessorResolution | null,
    policy: SuccessorRedirectPolicy,
): ModelSubstitution | null {
    if (!resolution?.target || resolution.reason !== "eligible") return null;
    if (!policy.enabled || !successorPriceAllowed(resolution, policy)) return null;
    return {
        from: resolution.model,
        to: resolution.target,
        reason: "unserved",
        chain: resolution.chain.length ? resolution.chain : [resolution.target],
        unservedSince: resolution.unservedSince,
        priceRatio: resolution.priceRatio,
    };
}

/** `X-Phaseo-Model-Substitution` value, for example `reason=unserved; from=a/old; to=a/new`. */
export function modelSubstitutionHeader(substitution: ModelSubstitution): string {
    return `reason=${substitution.reason}; from=${substitution.from}; to=${substitution.to}`;
}
