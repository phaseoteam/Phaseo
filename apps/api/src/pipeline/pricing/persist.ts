import Stripe from "stripe";
// Purpose: Pricing rules, billing, and persistence helpers.
// Why: Centralizes all cost calculations.
// How: Persists pricing/usage data into storage.

import { getSupabaseAdmin, ensureRuntimeForBackground } from "../../runtime/env";

type ChargeRpcResult = {
    status: string;
    auto_top_up_amount_nanos: number;
    auto_top_up_account_id: string | null;
    stripe_customer_id: string | null;
    applied?: boolean;
    already_applied?: boolean;
};

let chargeOnceRpcAvailable: boolean | null = null;
let chargeOnceRpcRetryAfterMs = 0;
const CHARGE_ONCE_RPC_RETRY_BACKOFF_MS = 60_000;

function getStripe(): Stripe {
    const key = process.env.STRIPE_SECRET_KEY ?? process.env.TEST_STRIPE_SECRET_KEY;
    if (!key) throw new Error("Stripe secret key missing");
    return new Stripe(key, { apiVersion: "2025-06-30" as any });
}

async function resolveDefaultPaymentMethod(stripe: Stripe, customerId: string): Promise<string | null> {
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
    };
}

function isMissingRpcFunction(error: any, functionName: string): boolean {
    const message = String(error?.message ?? "");
    const details = String(error?.details ?? "");
    return (
        message.includes(functionName) ||
        details.includes(functionName) ||
        message.includes("Could not find the function")
    );
}

function isChargeOnceRpcIncompatible(error: any): boolean {
    const code = String(error?.code ?? "");
    const message = String(error?.message ?? "").toLowerCase();
    const details = String(error?.details ?? "").toLowerCase();
    if (code === "42703") return true;
    return (
        (message.includes("v_result") && message.includes("status")) ||
        (details.includes("v_result") && details.includes("status")) ||
        message.includes("has no field")
    );
}

// src/lib/gateway/pricing/persist.ts
export async function recordUsageAndCharge(args: {
    requestId: string;
    teamId: string;
    cost_nanos: number;
}) {
    const releaseRuntime = ensureRuntimeForBackground();
    try {
        const supabase = getSupabaseAdmin();

        // Enterprise invoice mode is post-paid: skip wallet debit + auto top-up.
        // Usage is still recorded in gateway_requests during the after-stage.
        try {
            const { data: teamRow, error: teamErr } = await supabase
                .from("teams")
                .select("tier,billing_mode")
                .eq("id", args.teamId)
                .maybeSingle();
            if (!teamErr) {
                const tier = String(teamRow?.tier ?? "basic").toLowerCase();
                const billingMode = String(teamRow?.billing_mode ?? "wallet").toLowerCase();
                if (tier === "enterprise" && billingMode === "invoice") {
                    return;
                }
            }
        } catch {
            // Continue with wallet flow if team billing state cannot be read.
        }

        let chargeResult: ChargeRpcResult | null = null;
        const now = Date.now();
        const shouldTryChargeOnceRpc =
            chargeOnceRpcAvailable !== false || now >= chargeOnceRpcRetryAfterMs;
        if (shouldTryChargeOnceRpc) {
            const onceRpc = await supabase.rpc("gateway_deduct_and_check_top_up_once", {
                p_team_id: args.teamId,
                p_request_id: args.requestId,
                p_cost_nanos: args.cost_nanos,
            });
            if (onceRpc.error) {
                if (
                    !isMissingRpcFunction(onceRpc.error, "gateway_deduct_and_check_top_up_once") &&
                    !isChargeOnceRpcIncompatible(onceRpc.error)
                ) {
                    throw onceRpc.error;
                }
                chargeOnceRpcAvailable = false;
                chargeOnceRpcRetryAfterMs = now + CHARGE_ONCE_RPC_RETRY_BACKOFF_MS;
            } else {
                chargeOnceRpcAvailable = true;
                chargeOnceRpcRetryAfterMs = 0;
                chargeResult = normalizeChargeRpcResult(onceRpc.data);
            }
        }

        if (!chargeResult) {
            const fallbackRpc = await supabase.rpc("deduct_and_check_top_up", {
                p_team_id: args.teamId,
                p_cost_nanos: args.cost_nanos,
            });
            if (fallbackRpc.error) throw fallbackRpc.error;
            chargeResult = normalizeChargeRpcResult(fallbackRpc.data);
        }

        if (!chargeResult) return;
        if (chargeResult.already_applied) return;

        if (chargeResult.status === "top_up_required") {
            // Trigger auto-recharge
            // NOTE: The amount charged is the raw auto_top_up_amount
            // The Stripe webhook will:
            // 1. Fetch the team's current tier from database (uses rolling 30-day calculation)
            // 2. Apply reverse calculation: net = gross / (1 + tier_fee_rate)
            // 3. Credit wallet with net amount (after tier-based fee deduction)
            const stripe = getStripe();
            const minTopUpNanos = 10 * 1_000_000_000;
            if (chargeResult.auto_top_up_amount_nanos < minTopUpNanos) {
                console.error("[auto-recharge] Skipped: auto top-up amount below $10", {
                    teamId: args.teamId,
                    amount_nanos: chargeResult.auto_top_up_amount_nanos,
                });
                return;
            }
            const amount_cents = Math.round(chargeResult.auto_top_up_amount_nanos / 10_000_000); // since 1 cent = 10,000,000 nanos
            const paymentMethod =
                chargeResult.auto_top_up_account_id ??
                (chargeResult.stripe_customer_id
                    ? await resolveDefaultPaymentMethod(stripe, chargeResult.stripe_customer_id)
                    : null);
            if (!paymentMethod) {
                console.error("[auto-recharge] Skipped: no payment method available", {
                    teamId: args.teamId,
                });
                return;
            }

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount_cents,
                currency: 'usd',
                customer: chargeResult.stripe_customer_id,
                payment_method: paymentMethod,
                off_session: true,
                confirm: true,
                metadata: { purpose: 'credits_topup_offsession' }
            });

            // Log success or handle failure
            console.log(`[auto-recharge] Initiated for team ${args.teamId}, payment intent ${paymentIntent.id}, amount: $${(amount_cents / 100).toFixed(2)}`);
        }
    } finally {
        releaseRuntime();
    }
}










