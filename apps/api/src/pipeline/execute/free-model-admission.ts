import { getBindingsIfConfigured } from "@/runtime/env";
import { countOperation } from "@/runtime/request-operations";
import { isFreePriceCard } from "../pricing/free";
import type { PriceCard } from "../pricing";
import type { PipelineContext } from "../before/types";

// Request-owned only, never cached between HTTP requests. Failed/ambiguous RPCs
// remain failed for every fallback; automatic retries could consume quota twice.
const admissions = new WeakMap<PipelineContext, Promise<Response | null>>();
const OWNER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function denied(code: string, status: number, retryAfter?: number): Response {
    return Response.json({ error: code, error_type: status === 429 ? "user" : "system",
        error_origin: status === 429 ? "user" : "gateway" }, { status,
        headers: { "Cache-Control": "no-store", ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}) } });
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
            return denied("free_model_quota_unavailable", 503);
        }
        try {
            // The edge guard sheds abusive local bursts. The DO owns global quota.
            const edge = await env.FREE_MODEL_RATE_LIMITER.limit({ key: owner });
            if (!edge.success) return denied("free_model_rate_limit", 429, 60);
            countOperation("quotaRpc");
            const decision = await env.FREE_MODEL_QUOTA.getByName(`owner:${owner}`).admit();
            if (decision.allowed === false) return denied(`free_model_${decision.reason}`, 429, decision.retryAfterSeconds);
            if (decision.mode === "overage") {
                // No partial billing rollout: the quoted fee requires durable
                // authorization/settlement recovery before this branch can run.
                return denied("free_model_overage_not_available", 503);
            }
            return null;
        } catch {
            return denied("free_model_quota_unavailable", 503);
        }
    })();
    admissions.set(ctx, pending);
    return (await pending)?.clone() ?? null;
}
