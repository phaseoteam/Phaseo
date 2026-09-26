import { getBindingsIfConfigured } from "@/runtime/env";
import { countOperation, recordQuotaAdmission, measureDispatchStage, type QuotaAdmissionOutcome } from "@/runtime/request-operations";
import { FREE_MODEL_DAILY_ALLOWANCE, FREE_MODEL_OVERAGE_NANOS, type FreeQuotaDecision } from "@/core/free-model-quota";
import { isFreePriceCard } from "../pricing/free";
import type { PriceCard } from "../pricing";
import type { PipelineContext } from "../before/types";
import { authorizeFreeModelFee, releaseFailedFreeModelFee } from "@/core/free-model-fee";

// Request-owned only, never cached between HTTP requests. Failed/ambiguous RPCs
// remain failed for every fallback; automatic retries could consume quota twice.
const admissions = new WeakMap<PipelineContext, Promise<Response | null>>();
const OWNER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// RPC types do not validate runtime replies (including deployment/version skew).
// An ambiguous admission must not dispatch or be retried against the coordinator.
function isQuotaDecision(value: unknown): value is FreeQuotaDecision {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const reply = value as Record<string, unknown>;
    if (reply.allowed === false) {
        return (reply.reason === "rpm_limit" || reply.reason === "daily_limit")
            && typeof reply.retryAfterSeconds === "number" && Number.isSafeInteger(reply.retryAfterSeconds)
            && reply.retryAfterSeconds >= 1 && reply.retryAfterSeconds <= 86_400;
    }
    if (reply.allowed !== true || typeof reply.policyVersion !== "number"
        || !Number.isSafeInteger(reply.policyVersion) || reply.policyVersion < 0
        || typeof reply.remaining !== "number" || !Number.isSafeInteger(reply.remaining) || reply.remaining < 0) return false;
    return (reply.mode === "included" && reply.feeNanos === 0 && reply.remaining < FREE_MODEL_DAILY_ALLOWANCE)
        || (reply.mode === "overage" && reply.feeNanos === FREE_MODEL_OVERAGE_NANOS && reply.remaining === 0);
}
function denied(code: string, status: number, retryAfter?: number): Response {
    return Response.json({ error: code, error_type: status === 429 ? "user" : "system",
        error_origin: status === 429 ? "user" : "gateway" }, { status,
        headers: { "Cache-Control": "no-store", ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}) } });
}
function quotaDenied(outcome: QuotaAdmissionOutcome, code: string, status: number, retryAfter?: number): Response {
    recordQuotaAdmission(outcome);
    return denied(code, status, retryAfter);
}

export async function guardFreeModelAdmission(ctx: PipelineContext, card: PriceCard, keySource: "gateway" | "byok"): Promise<Response | null> {
    const existing = admissions.get(ctx);
    const freeIntent = [ctx.model, ctx.requestedModel].some(model => typeof model === "string"
        && (model === "phaseo/free" || model.endsWith(":free")));
    if (freeIntent && !isFreePriceCard(card) && getBindingsIfConfigured()?.GATEWAY_FREE_MODEL_QUOTA_ENABLED === "true") {
        return denied("free_model_paid_fallback_blocked", 503);
    }
    // Once admitted as free, a fallback must not silently become paid inference.
    if (existing && !isFreePriceCard(card)) return denied("free_model_paid_fallback_blocked", 503);
    if (existing) return (await existing)?.clone() ?? null;
    if (keySource !== "gateway" || !isFreePriceCard(card)) return null;
    const env = getBindingsIfConfigured();
    if (env?.GATEWAY_FREE_MODEL_QUOTA_ENABLED !== "true") return null;
    const pending = (async (): Promise<Response | null> => {
        const owner = ctx.workspaceOwnerUserId;
        if (!owner || !OWNER_ID.test(owner) || !Number.isFinite(ctx.workspaceRuntimeExpiresAt)
            || (ctx.workspaceRuntimeExpiresAt ?? 0) <= Date.now()
            || !env.FREE_MODEL_QUOTA || !env.FREE_MODEL_RATE_LIMITER) {
            return quotaDenied("unavailable", "free_model_quota_unavailable", 503);
        }
        try {
            // The edge guard sheds abusive local bursts. The DO owns global quota.
            const edge = await measureDispatchStage("quota.edge", () => env.FREE_MODEL_RATE_LIMITER!.limit({ key: owner }));
            if (edge?.success === false) return quotaDenied("edge_limited", "free_model_rate_limit", 429, 60);
            if (edge?.success !== true) return quotaDenied("unavailable", "free_model_quota_unavailable", 503);
            countOperation("quotaRpc");
            const decision = await measureDispatchStage<FreeQuotaDecision>("quota.admission", () => env.FREE_MODEL_QUOTA!.getByName(`owner:${owner}`).admit());
            if (!isQuotaDecision(decision)) return quotaDenied("unavailable", "free_model_quota_unavailable", 503);
            if (decision.allowed === false) return quotaDenied(decision.reason === "rpm_limit" ? "rpm_limited" : "daily_limited",
                `free_model_${decision.reason}`, 429, decision.retryAfterSeconds);
            if (decision.mode === "overage") {
                if (!await authorizeFreeModelFee(ctx, decision.policyVersion)) {
                    await releaseFailedFreeModelFee(ctx);
                    return quotaDenied("overage_blocked", "free_model_overage_not_available", 503);
                }
                recordQuotaAdmission("overage");
                return null;
            }
            recordQuotaAdmission("included");
            return null;
        } catch {
            await releaseFailedFreeModelFee(ctx);
            return quotaDenied("unavailable", "free_model_quota_unavailable", 503);
        }
    })();
    admissions.set(ctx, pending);
    return (await pending)?.clone() ?? null;
}
