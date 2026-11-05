// Type-only: Stripe calls go through the small REST client, not the SDK (bundle size).
import type Stripe from "stripe";
// Purpose: Pricing rules, billing, and persistence helpers.
// Why: Centralizes all cost calculations.
// How: Persists pricing/usage data into storage.

import { createStripeRestClient, type StripeApiError, type StripeRestClient } from "../../lib/stripe/rest";
import {
    creditWriteBackEnabled,
    invalidateGatewayCreditCache,
    writeBackGatewayCreditCache,
} from "../../core/gateway-credit-cache";
import { getSupabaseAdmin, ensureRuntimeForBackground } from "../../runtime/env";
import { enqueueAutoTopUpFailedEmail } from "../notifications/billing-alerts";

export type ChargeRpcResult = {
    status: string;
    auto_top_up_amount_nanos: number;
    auto_top_up_account_id: string | null;
    stripe_customer_id: string | null;
    applied?: boolean;
    already_applied?: boolean;
    invalidate_credit_cache?: boolean;
    /** Exact post-charge available balance, present only for newly applied charges. */
    available_nanos?: number | null;
};

async function getStripe(): Promise<StripeRestClient> {
    const key = process.env.STRIPE_SECRET_KEY ?? process.env.TEST_STRIPE_SECRET_KEY;
    if (!key) throw new Error("Stripe secret key missing");
    return createStripeRestClient(key);
}

async function resolveDefaultPaymentMethod(stripe: StripeRestClient, customerId: string): Promise<string | null> {
    if (!customerId) return null;
    const customer = (await stripe.customers.retrieve(customerId)) as any;
    if (typeof customer === "string") return null;
    const invoiceDefault = customer.invoice_settings?.default_payment_method;
    if (typeof invoiceDefault === "string") return invoiceDefault;
    const legacyDefault = customer.default_source;
    if (typeof legacyDefault === "string") return legacyDefault;
    const methods = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card",
        limit: 1,
    });
    return methods.data?.[0]?.id ?? null;
}

function normalizeChargeRpcResult(data: any): ChargeRpcResult | null {
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object") return null;
    const amountRaw = Number((row as any).auto_top_up_amount_nanos ?? 0);
    return {
        status: String((row as any).status ?? "unknown"),
        auto_top_up_amount_nanos: Number.isFinite(amountRaw) ? amountRaw : 0,
        auto_top_up_account_id:
            typeof (row as any).auto_top_up_account_id === "string"
                ? (row as any).auto_top_up_account_id
                : null,
        stripe_customer_id:
            typeof (row as any).stripe_customer_id === "string"
                ? (row as any).stripe_customer_id
                : null,
        applied: (row as any).applied === true,
        already_applied: (row as any).already_applied === true,
        invalidate_credit_cache: typeof row.invalidate_credit_cache === "boolean" ? row.invalidate_credit_cache : undefined,
        available_nanos: row.available_nanos == null ? null : Number(row.available_nanos),
    };
}

function buildAutoTopUpIdempotencyKey(args: { workspaceId: string; requestId: string }): string {
    const normalizedTeamId = args.workspaceId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const normalizedRequestId = args.requestId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return `auto_top_up:${normalizedTeamId}:${normalizedRequestId}`.slice(0, 255);
}

const AUTO_TOP_UP_FAILURE_EMAIL_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export function buildAutoTopUpFailureDedupeId(args: {
    workspaceId: string;
    failure: "payment_method_lookup" | "no_payment_method" | "payment_failed";
    nowMs?: number;
}): string {
    const normalizedWorkspaceId = args.workspaceId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const bucket = Math.floor((args.nowMs ?? Date.now()) / AUTO_TOP_UP_FAILURE_EMAIL_COOLDOWN_MS);
    return `${args.failure}:${normalizedWorkspaceId}:${bucket}`;
}

// src/lib/gateway/pricing/persist.ts
export async function recordUsageAndCharge(args: {
    requestId: string;
    workspaceId: string;
    cost_nanos: number;
    creditSnapshotBalanceNanos?: number | null;
}): Promise<ChargeRpcResult> {
    const releaseRuntime = ensureRuntimeForBackground();
    try {
        const supabase = getSupabaseAdmin();
        // The wrapper uses the same idempotent debit and returns an authoritative
        // cache decision in this round trip. No local or KV spending counter.
        const snapshotBalance = args.creditSnapshotBalanceNanos;
        const onceRpc = await supabase.rpc("gateway_charge_with_credit_cache", {
            p_workspace_id: args.workspaceId,
            p_request_id: args.requestId,
            p_cost_nanos: args.cost_nanos,
            p_credit_snapshot_balance_nanos: Number.isSafeInteger(snapshotBalance) && snapshotBalance! >= 0 ? snapshotBalance : null,
        });
        return await settleChargeRpcResult(args, onceRpc);
    } finally {
        releaseRuntime();
    }
}

/**
 * Charge a request's total so far, for a stream charged in steps (checkpoints while it drains
 * after the client left, then its final bill). The database keeps the charged total and charges,
 * or on the final call refunds, the difference, so a call whose response was lost is reconciled
 * by the next. Checkpoints never refund; after the final call, later calls change nothing.
 */
export async function recordRequestChargeTotal(args: {
    requestId: string;
    workspaceId: string;
    total_nanos: number;
    final: boolean;
    creditSnapshotBalanceNanos?: number | null;
}): Promise<ChargeRpcResult> {
    const releaseRuntime = ensureRuntimeForBackground();
    try {
        const totalRpc = await getSupabaseAdmin().rpc("gateway_charge_request_total", {
            p_workspace_id: args.workspaceId,
            p_request_id: args.requestId,
            p_total_nanos: args.total_nanos,
            p_final: args.final,
            p_credit_snapshot_balance_nanos: Number.isSafeInteger(args.creditSnapshotBalanceNanos) && args.creditSnapshotBalanceNanos! >= 0 ? args.creditSnapshotBalanceNanos : null,
        });
        return await settleChargeRpcResult(args, totalRpc);
    } finally {
        releaseRuntime();
    }
}

/**
 * The total charged for a request so far (its gateway_request_charges row), or 0 when it has
 * no applied charge. Throws when the row cannot be read.
 */
export async function readRequestChargeTotal(args: { requestId: string; workspaceId: string }): Promise<number> {
    const releaseRuntime = ensureRuntimeForBackground();
    try {
        const { data, error } = await getSupabaseAdmin()
            .from("gateway_request_charges")
            .select("cost_nanos, status")
            .eq("workspace_id", args.workspaceId)
            .eq("request_id", args.requestId)
            .maybeSingle();
        if (error) throw error;
        const row = data as { cost_nanos?: number | string | null; status?: string | null } | null;
        const total = row?.status === "applied" ? Number(row.cost_nanos) : 0;
        return Number.isFinite(total) && total > 0 ? Math.round(total) : 0;
    } finally {
        releaseRuntime();
    }
}

// Cache write-back or invalidation and auto top-up, shared by both charge RPCs.
async function settleChargeRpcResult(
    args: { requestId: string; workspaceId: string },
    onceRpc: { data: unknown; error: unknown },
): Promise<ChargeRpcResult> {
    if (onceRpc.error) {
        // In particular, insufficient funds must not leave a high cached
        // balance reusable after a failed debit or an uncertain response.
        await invalidateGatewayCreditCache(args.workspaceId);
        throw onceRpc.error;
    }
    const chargeResult = normalizeChargeRpcResult(onceRpc.data);

    if (!chargeResult) throw new Error("gateway_charge_result_missing");
    if (!chargeResult.applied && !chargeResult.already_applied) {
        throw new Error(`gateway_charge_not_applied:${chargeResult.status || "unknown"}`);
    }
    if (chargeResult.invalidate_credit_cache === true ||
        (chargeResult.applied && chargeResult.invalidate_credit_cache !== false)) {
        // Replays never carry a balance, so they always invalidate.
        const availableNanos = chargeResult.applied && !chargeResult.already_applied &&
            chargeResult.status === "top_up_not_required" && chargeResult.available_nanos != null
            ? Number(chargeResult.available_nanos)
            : Number.NaN;
        if (creditWriteBackEnabled() && Number.isSafeInteger(availableNanos)) {
            await writeBackGatewayCreditCache(args.workspaceId, availableNanos);
        } else {
            await invalidateGatewayCreditCache(args.workspaceId);
        }
    }
    if (chargeResult.already_applied) return chargeResult;

    // The low-balance email is not checked here: a scheduled sweep compares wallets with the
    // workspace threshold every five minutes (pipeline/notifications/low-balance.ts), so a
    // charge reads nothing beyond the charge RPC.

    if (chargeResult.status === "top_up_required") {
        // Trigger auto-recharge
        // NOTE: The amount charged is the raw auto_top_up_amount
        // The Stripe webhook will:
        // 1. Apply reverse calculation: net = gross / (1 + fee_rate)
        // 2. Use the flat 5% top-up fee
        // 3. Credit wallet with net amount after the fee deduction
        const stripe = await getStripe();
        // The Stripe webhook only credits top-ups of $5 or more.
        const minTopUpNanos = 5 * 1_000_000_000;
        if (chargeResult.auto_top_up_amount_nanos < minTopUpNanos) {
            console.error("[auto-recharge] Skipped: auto top-up amount below $5", {
                workspaceId: args.workspaceId,
                amount_nanos: chargeResult.auto_top_up_amount_nanos,
            });
            return chargeResult;
        }
        const amount_cents = Math.round(chargeResult.auto_top_up_amount_nanos / 10_000_000); // since 1 cent = 10,000,000 nanos
        let paymentMethod: string | null;
        try {
            paymentMethod =
                chargeResult.auto_top_up_account_id ??
                (chargeResult.stripe_customer_id
                    ? await resolveDefaultPaymentMethod(stripe, chargeResult.stripe_customer_id)
                    : null);
        } catch (error) {
            await enqueueAutoTopUpFailedEmail({
                workspaceId: args.workspaceId,
                dedupeId: buildAutoTopUpFailureDedupeId({
                    workspaceId: args.workspaceId,
                    failure: "payment_method_lookup",
                }),
                reason: "The saved payment method could not be loaded for Auto Top-Up.",
            }).catch((enqueueError) => {
                console.error("[auto-recharge] Failed to enqueue failure notification", {
                    workspaceId: args.workspaceId,
                    error: enqueueError instanceof Error ? enqueueError.message : String(enqueueError),
                });
            });
            console.error("[auto-recharge] Failed to resolve payment method", {
                workspaceId: args.workspaceId,
                error: error instanceof Error ? error.message : String(error),
            });
            return chargeResult;
        }
        if (!paymentMethod) {
            console.error("[auto-recharge] Skipped: no payment method available", {
                workspaceId: args.workspaceId,
            });
            await enqueueAutoTopUpFailedEmail({
                workspaceId: args.workspaceId,
                dedupeId: buildAutoTopUpFailureDedupeId({
                    workspaceId: args.workspaceId,
                    failure: "no_payment_method",
                }),
                reason: "No saved payment method is available for Auto Top-Up.",
            }).catch((error) => {
                console.error("[auto-recharge] Failed to enqueue failure notification", {
                    workspaceId: args.workspaceId,
                    error: error instanceof Error ? error.message : String(error),
                });
            });
            return chargeResult;
        }

        const topUpMetadata: Record<string, string> = {
            purpose: "credits_topup_offsession",
            workspace_id: args.workspaceId,
            request_id: args.requestId,
            auto_top_up_amount_nanos: String(chargeResult.auto_top_up_amount_nanos),
            auto_top_up_payment_method_id: paymentMethod,
        };

        let paymentIntent: Stripe.PaymentIntent;
        try {
            paymentIntent = await stripe.paymentIntents.create(
                {
                    amount: amount_cents,
                    currency: "usd",
                    customer: chargeResult.stripe_customer_id ?? undefined,
                    payment_method: paymentMethod,
                    off_session: true,
                    confirm: true,
                    metadata: topUpMetadata,
                },
                {
                    idempotencyKey: buildAutoTopUpIdempotencyKey({
                        workspaceId: args.workspaceId,
                        requestId: args.requestId,
                    }),
                }
            );
        } catch (error) {
            const stripeError = error as Partial<StripeApiError> & {
                payment_intent?: Stripe.PaymentIntent;
                raw?: { payment_intent?: Stripe.PaymentIntent };
            };
            const failedIntent = stripeError.payment_intent ?? stripeError.raw?.payment_intent;
            await enqueueAutoTopUpFailedEmail({
                workspaceId: args.workspaceId,
                dedupeId: failedIntent?.id ?? buildAutoTopUpFailureDedupeId({
                    workspaceId: args.workspaceId,
                    failure: "payment_failed",
                }),
                reason: stripeError.message || "The saved payment method could not be charged.",
            }).catch((enqueueError) => {
                console.error("[auto-recharge] Failed to enqueue failure notification", {
                    workspaceId: args.workspaceId,
                    error: enqueueError instanceof Error ? enqueueError.message : String(enqueueError),
                });
            });
            console.error("[auto-recharge] Payment failed", {
                workspaceId: args.workspaceId,
                paymentIntentId: failedIntent?.id ?? null,
                error: stripeError.message || String(error),
            });
            return chargeResult;
        }

        // Log success or handle failure
        console.log(`[auto-recharge] Initiated for team ${args.workspaceId}, payment intent ${paymentIntent.id}, amount: $${(amount_cents / 100).toFixed(2)}`);
    }
    return chargeResult;
}









