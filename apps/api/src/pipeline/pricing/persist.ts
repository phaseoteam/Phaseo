import Stripe from "stripe";
// Purpose: Pricing rules, billing, and persistence helpers.
// Why: Centralizes all cost calculations.
// How: Persists pricing/usage data into storage.

import { getSupabaseAdmin, ensureRuntimeForBackground } from "../../runtime/env";

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

// src/lib/gateway/pricing/persist.ts
export async function recordUsageAndCharge(args: {
    requestId: string;
    teamId: string;
    cost_nanos: number;
}) {
    const releaseRuntime = ensureRuntimeForBackground();
    try {
        const supabase = getSupabaseAdmin();

        const { data, error } = await supabase.rpc('deduct_and_check_top_up', {
            p_team_id: args.teamId,
            p_cost_nanos: args.cost_nanos
        });

        if (error) throw error;

        if (data.status === 'top_up_required') {
            // Trigger auto-recharge
            // NOTE: The amount charged is the raw auto_top_up_amount
            // The Stripe webhook will:
            // 1. Fetch the team's current tier from database (uses rolling 30-day calculation)
            // 2. Apply reverse calculation: net = gross / (1 + tier_fee_rate)
            // 3. Credit wallet with net amount (after tier-based fee deduction)
            const stripe = getStripe();
            const minTopUpNanos = 10 * 1_000_000_000;
            if (data.auto_top_up_amount_nanos < minTopUpNanos) {
                console.error("[auto-recharge] Skipped: auto top-up amount below $10", {
                    teamId: args.teamId,
                    amount_nanos: data.auto_top_up_amount_nanos,
                });
                return;
            }
            const amount_cents = Math.round(data.auto_top_up_amount_nanos / 10_000_000); // since 1 cent = 10,000,000 nanos
            const paymentMethod =
                data.auto_top_up_account_id ??
                (data.stripe_customer_id
                    ? await resolveDefaultPaymentMethod(stripe, data.stripe_customer_id)
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
                customer: data.stripe_customer_id,
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










