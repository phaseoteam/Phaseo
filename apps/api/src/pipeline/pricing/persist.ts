import Stripe from "stripe";
import { getSupabaseAdmin, ensureRuntimeForBackground } from "../../runtime/env";

function getStripe(): Stripe {
    const key = process.env.STRIPE_SECRET_KEY ?? process.env.TEST_STRIPE_SECRET_KEY;
    if (!key) throw new Error("Stripe secret key missing");
    return new Stripe(key, { apiVersion: "2025-06-30" as any });
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
            // Trigger charge
            const stripe = getStripe();
            const amount_cents = Math.round(data.auto_top_up_amount_nanos / 10_000_000); // since 1 cent = 10,000,000 nanos

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount_cents,
                currency: 'usd',
                customer: data.stripe_customer_id,
                payment_method: data.auto_top_up_account_id,
                off_session: true,
                confirm: true,
                metadata: { purpose: 'credits_topup_offsession' }
            });

            // Log success or handle failure
            console.log(`Auto top up initiated for team ${args.teamId}, payment intent ${paymentIntent.id}`);
        }
    } finally {
        releaseRuntime();
    }
}
