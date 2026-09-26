import type { PipelineContext } from "@/pipeline/before/types";
import { getBindingsIfConfigured } from "@/runtime/env";
import { countOperation } from "@/runtime/request-operations";
import { FreeModelReservationIdentitySchema, type FreeModelReservationIdentity } from "./free-model-fee-identity";
import { FREE_MODEL_OVERAGE_NANOS } from "./free-model-quota";

type Fee = { owner: string; identity: FreeModelReservationIdentity; authorized: boolean;
    billable: boolean; outcome?: "capture" | "release"; pending?: Promise<void> };
const fees = new WeakMap<PipelineContext, Fee>();
export function hasFreeModelFee(ctx: PipelineContext): boolean { return fees.has(ctx); }
export function freeModelFeeNanos(ctx: PipelineContext): number {
    const fee = fees.get(ctx);
    return fee?.authorized && fee.billable ? FREE_MODEL_OVERAGE_NANOS : 0;
}

/** Request-owned identity, never accepted from headers/body or cached. */
export async function authorizeFreeModelFee(ctx: PipelineContext, policyVersion: number): Promise<boolean> {
    const env = getBindingsIfConfigured();
    if (env?.GATEWAY_FREE_MODEL_OVERAGE_ENABLED !== "true" || !env.FREE_MODEL_QUOTA || !ctx.workspaceOwnerUserId) return false;
    if (ctx.keyId && ctx.meta.apiKeyId && ctx.keyId !== ctx.meta.apiKeyId) throw new Error("free_model_fee_key_identity_conflict");
    const identity = FreeModelReservationIdentitySchema.parse({ workspaceId: ctx.workspaceId,
        keyId: ctx.keyId ?? ctx.meta.apiKeyId, requestId: ctx.billingRequestId, auditRequestId: ctx.requestId });
    if (fees.has(ctx)) throw new Error("free_model_fee_authorization_repeated");
    const fee: Fee = { owner: ctx.workspaceOwnerUserId, identity, authorized: false, billable: false };
    fees.set(ctx, fee);
    countOperation("quotaRpc");
    const reply = await env.FREE_MODEL_QUOTA.getByName(`owner:${fee.owner}`).prepareFee(identity, policyVersion);
    if (reply?.allowed === false) { fees.delete(ctx); return false; }
    if (reply?.allowed !== true) throw new Error("free_model_fee_authorization_unconfirmed");
    fee.authorized = true;
    // A cached response must not carry another execution's fixed fee.
    if (ctx.responseCache) ctx.responseCache.enabled = false;
    return true;
}

/** Called only after successful-response suppression and provider discounts. */
export function applyFreeModelFee<T extends { pricedUsage: any; totalNanos: number; totalCents: number; billingSuppressed: boolean }>(ctx: PipelineContext, priced: T): T {
    const fee = fees.get(ctx);
    if (!fee?.authorized) return priced;
    fee.billable = !priced.billingSuppressed;
    if (!fee.billable) return priced;
    const pricing = priced.pricedUsage?.pricing ?? {};
    const lines = Array.isArray(pricing.lines) ? pricing.lines : [];
    const prior = lines.filter((line: any) => line.meter === "free_model_overage")
        .reduce((sum: number, line: any) => sum + Number(line.line_nanos || 0), 0);
    const totalNanos = priced.totalNanos - prior + FREE_MODEL_OVERAGE_NANOS;
    const totalCents = Math.ceil(totalNanos / 10_000_000);
    return { ...priced, totalNanos, totalCents, pricedUsage: { ...priced.pricedUsage, pricing: { ...pricing,
        total_nanos: totalNanos, total_cents: totalCents, total_usd_str: (totalNanos / 1e9).toFixed(9),
        lines: [...lines.filter((line: any) => line.meter !== "free_model_overage"), {
            dimension: "requests", meter: "free_model_overage", quantity: 1, billable_units: 1, unit_size: 1,
            unit_price_usd: "0.000100000", line_cost_usd: "0.000100000", line_nanos: FREE_MODEL_OVERAGE_NANOS,
        }],
    } } };
}

export function freeModelFeeAudit(ctx: PipelineContext): Record<string, string> {
    const fee = fees.get(ctx);
    return fee?.authorized && fee.billable ? { free_model_fee_request_id: fee.identity.requestId } : {};
}

/** Success is a fixed fee captured from its hold, not a second ordinary debit. */
export async function settleFreeModelFee(ctx: PipelineContext, success: boolean): Promise<number> {
    const fee = fees.get(ctx);
    if (!fee) return 0;
    const outcome = success && fee.authorized && fee.billable ? "capture" : "release";
    if (fee.outcome && fee.outcome !== outcome) throw new Error("free_model_fee_outcome_conflict");
    fee.outcome = outcome;
    if (!fee.pending) {
        fee.pending = (async () => {
            const env = getBindingsIfConfigured();
            if (!env?.FREE_MODEL_QUOTA) throw new Error("free_model_fee_coordinator_unavailable");
            countOperation("quotaRpc");
            const result = await env.FREE_MODEL_QUOTA.getByName(`owner:${fee.owner}`).finishFee(fee.identity, outcome);
            if (!result || typeof result.settled !== "boolean" || typeof result.review !== "boolean") {
                throw new Error("free_model_fee_outcome_unconfirmed");
            }
            // A false settlement is durably queued/reviewable, not permission to
            // charge again through the ordinary usage ledger.
        })().catch(error => { fee.pending = undefined; throw error; });
    }
    await fee.pending;
    return outcome === "capture" ? FREE_MODEL_OVERAGE_NANOS : 0;
}

export async function releaseFailedFreeModelFee(ctx: PipelineContext): Promise<void> {
    // An audit/cache error after a successful capture must never refund it.
    if (fees.get(ctx)?.outcome === "capture") return;
    const fee = fees.get(ctx);
    if (fee) { fee.authorized = false; fee.billable = false; }
    try { await settleFreeModelFee(ctx, false); }
    catch { console.error("free_model_fee_release_unconfirmed", { requestId: ctx.billingRequestId }); }
}
