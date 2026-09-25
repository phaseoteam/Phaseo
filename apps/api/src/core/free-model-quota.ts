/** One quota per workspace OWNER, shared across every owned workspace and key.
 * Model/pricing data and wallet balances deliberately do not belong here. */
export const FREE_MODEL_DAILY_ALLOWANCE = 1_500;
export const FREE_MODEL_RPM = 25;
export const FREE_MODEL_OVERAGE_NANOS = 100_000; // $0.10 / 1,000 requests
const DAY_MS = 86_400_000;
const REFILL_MS = 60_000 / FREE_MODEL_RPM;

export type FreeQuotaState = {
    day: number;
    used: number;
    tokens: number;
    updatedAt: number;
    allowOverage: boolean;
    policyVersion: number;
};

export function parseFreeQuotaState(raw: string): FreeQuotaState {
    const value = JSON.parse(raw) as FreeQuotaState;
    if (!value || !Number.isSafeInteger(value.day) || value.day < 0 || !Number.isSafeInteger(value.used)
        || value.used < 0 || value.used > FREE_MODEL_DAILY_ALLOWANCE || !Number.isFinite(value.tokens)
        || value.tokens < 0 || value.tokens > FREE_MODEL_RPM || !Number.isSafeInteger(value.updatedAt)
        || value.updatedAt < 0 || value.day !== Math.floor(value.updatedAt / DAY_MS)
        || typeof value.allowOverage !== "boolean" || !Number.isSafeInteger(value.policyVersion) || value.policyVersion < 0) {
        throw new Error("invalid_free_model_quota_state");
    }
    return value;
}
export type FreeQuotaDecision =
    | { allowed: true; mode: "included" | "overage"; feeNanos: number; remaining: number; policyVersion: number }
    | { allowed: false; reason: "rpm_limit" | "daily_limit"; retryAfterSeconds: number };

export function initialFreeQuota(now: number): FreeQuotaState {
    return { day: Math.floor(now / DAY_MS), used: 0, tokens: FREE_MODEL_RPM, updatedAt: now, allowOverage: false, policyVersion: 0 };
}

/** Pure transition; caller persists next before acknowledging. No refund RPC on
 * the normal path: an admitted gateway attempt consumes allowance, even if the
 * provider subsequently fails. Internal fallback reuses this admission. */
export function decideFreeQuota(state: FreeQuotaState, clock: number): { decision: FreeQuotaDecision; next?: FreeQuotaState } {
    const now = Math.max(clock, state.updatedAt); // Clock regression cannot refill/reset quota.
    const day = Math.floor(now / DAY_MS);
    const used = day > state.day ? 0 : state.used;
    const tokens = Math.min(FREE_MODEL_RPM, state.tokens + (now - state.updatedAt) / REFILL_MS);
    if (tokens < 1) return { decision: { allowed: false, reason: "rpm_limit", retryAfterSeconds: Math.max(1, Math.ceil((1 - tokens) * REFILL_MS / 1000)) } };
    if (used >= FREE_MODEL_DAILY_ALLOWANCE && !state.allowOverage) {
        return { decision: { allowed: false, reason: "daily_limit", retryAfterSeconds: Math.max(1, Math.ceil(((day + 1) * DAY_MS - now) / 1000)) } };
    }
    const included = used < FREE_MODEL_DAILY_ALLOWANCE;
    const next = { ...state, day, used: included ? used + 1 : used, tokens: tokens - 1, updatedAt: now };
    return { next, decision: { allowed: true, mode: included ? "included" : "overage",
        feeNanos: included ? 0 : FREE_MODEL_OVERAGE_NANOS,
        remaining: Math.max(0, FREE_MODEL_DAILY_ALLOWANCE - next.used), policyVersion: state.policyVersion } };
}

export function freeQuotaSettings(state: FreeQuotaState, now: number) {
    const day = Math.floor(Math.max(now, state.updatedAt) / DAY_MS);
    return { allowOverage: state.allowOverage, policyVersion: state.policyVersion,
        requestsUsedToday: day > state.day ? 0 : state.used, requestsIncluded: FREE_MODEL_DAILY_ALLOWANCE,
        rpm: FREE_MODEL_RPM, overageFeeNanos: FREE_MODEL_OVERAGE_NANOS, resetsAtMs: (day + 1) * DAY_MS };
}
