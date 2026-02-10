import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

function getStripe(): Stripe {
    const key = process.env.STRIPE_SECRET_KEY ?? process.env.TEST_STRIPE_SECRET_KEY;
    if (!key) throw new Error("Stripe secret key missing");
    return new Stripe(key, { apiVersion: "2025-06-30" as any });
}

function getWebhookSecret(): string {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error("Stripe webhook signing secret missing");
    return secret;
}

function getSupabase() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceRoleKey) {
        throw new Error("Supabase env not set");
    }
    return createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

/* Fees: Reverse-engineer the original amount from the total received, then apply tier-based fee */
function computeNetAndFeeFromGross(grossNanos: number, feePct: number) {
    const minFeeNanos = 1_000_000_000; // $1 in nanos

    // Reverse-engineer: if user paid $X total including our fee, what was the original amount?
    // Original = Total / (1 + fee_rate)
    const originalNanos = Math.round(grossNanos / (1 + feePct / 100));
    const feeNanos = grossNanos - originalNanos;

    // Ensure minimum fee when percentage fee falls below $1
    if (feeNanos < minFeeNanos) {
        const adjustedFeeNanos = Math.min(grossNanos, minFeeNanos);
        const adjustedOriginalNanos = Math.max(grossNanos - adjustedFeeNanos, 0);
        return { netNanos: adjustedOriginalNanos, feeNanos: adjustedFeeNanos };
    }

    return { netNanos: originalNanos, feeNanos };
}

export async function POST(req: Request) {
    const stripe = getStripe();
    const supabase = getSupabase();

    // IMPORTANT: read raw body for signature verification
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature") ?? "";

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(rawBody, signature, getWebhookSecret());
    } catch (err: any) {
        return NextResponse.json(
            { message: `Webhook Error: ${err?.message || String(err)}` },
            { status: 400 }
        );
    }

    async function upsertLedger(row: any) {
        return supabase.from("credit_ledger").upsert([row], {
            onConflict: "ref_type,ref_id",
            ignoreDuplicates: true,
        });
    }

    try {
        switch (event.type) {
            case "payment_intent.created": {
                const pi = event.data.object as Stripe.PaymentIntent;
                if (pi.metadata?.purpose !== "credits_topup_offsession") break;

                const stripeCustomerId = (pi.customer as string) ?? null;
                if (!stripeCustomerId) break;

                const { data: wallet } = await supabase
                    .from("wallets")
                    .select("team_id, stripe_customer_id, balance_nanos")
                    .eq("stripe_customer_id", stripeCustomerId)
                    .maybeSingle();

                if (!wallet?.team_id) break;

                const beforeBalanceNanos = Number(wallet.balance_nanos ?? 0);

                await supabase
                    .from("credit_ledger")
                    .upsert(
                        [
                            {
                                team_id: wallet.team_id,
                                kind: "top_up",
                                amount_nanos: 0,
                                before_balance_nanos: beforeBalanceNanos,
                                after_balance_nanos: beforeBalanceNanos,
                                ref_type: "Stripe_Payment_Intent",
                                ref_id: pi.id,
                                status: "Processing",
                                event_time: new Date().toISOString(),
                            },
                        ],
                        { onConflict: "ref_type,ref_id", ignoreDuplicates: true as any }
                    );

                break;
            }

            case "payment_intent.succeeded": {
                const pi = event.data.object as Stripe.PaymentIntent;
                if (pi.status !== "succeeded") break;

                const stripeCustomerId = (pi.customer as string) ?? null;
                if (!stripeCustomerId) break;

                const { data: wallet } = await supabase
                    .from("wallets")
                    .select("team_id, balance_nanos")
                    .eq("stripe_customer_id", stripeCustomerId)
                    .maybeSingle();

                if (!wallet?.team_id) break;

                const grossCents = Number(pi.amount_received ?? pi.amount ?? 0);
                // Stripe amounts are in cents; convert to nanos (1 USD = 1e9 nanos).
                const grossNanos = grossCents * 10_000_000;

                // Fetch the team's CURRENT tier from database (includes instant upgrades)
                const { data: teamData, error: teamErr } = await supabase
                    .from('teams')
                    .select('tier')
                    .eq('id', wallet.team_id)
                    .single();

                if (teamErr) {
                    console.error(`[stripe-webhook] Failed to fetch team tier:`, teamErr);
                }

                // Determine fee percentage based on tier (with fallback)
                const tier = teamData?.tier ?? 'basic';
                const feePct = tier === 'enterprise' ? 5.0 : 7.0;

                console.log(`[stripe-webhook] Team ${wallet.team_id} tier: ${tier}, fee: ${feePct}%`);

                const { netNanos, feeNanos } = computeNetAndFeeFromGross(grossNanos, feePct);
                const beforeBalanceNanos = Number(wallet.balance_nanos ?? 0);
                const afterBalanceNanos = beforeBalanceNanos + netNanos;

                console.log(
                    `[stripe-webhook] Payment credited net=$${(netNanos / 1_000_000_000).toFixed(2)} fee=$${(
                        feeNanos / 1_000_000_000
                    ).toFixed(2)} balance_before=$${(beforeBalanceNanos / 1_000_000_000).toFixed(2)} balance_after=$${(
                        afterBalanceNanos / 1_000_000_000
                    ).toFixed(2)}`
                );

                await supabase
                    .from("wallets")
                    .update({ balance_nanos: afterBalanceNanos, stripe_customer_id: stripeCustomerId })
                    .eq("team_id", wallet.team_id);

                const kind = (pi.metadata?.purpose as string | undefined) ?? "top_up";

                await upsertLedger({
                    team_id: wallet.team_id,
                    kind,
                    amount_nanos: netNanos,
                    before_balance_nanos: beforeBalanceNanos,
                    after_balance_nanos: afterBalanceNanos,
                    ref_type: "Stripe_Payment_Intent",
                    ref_id: pi.id,
                    status: "Paid",
                    event_time: new Date().toISOString(),
                });

                break;
            }

            case "payment_intent.payment_failed": {
                const pi = event.data.object as Stripe.PaymentIntent;
                if (pi.metadata?.purpose !== "credits_topup_offsession") break;

                await supabase
                    .from("credit_ledger")
                    .update({ status: "Failed", event_time: new Date().toISOString() })
                    .eq("ref_type", "Stripe_Payment_Intent")
                    .eq("ref_id", pi.id);
                break;
            }

            case "refund.created": {
                const refund = event.data.object as Stripe.Refund;
                const piId = (refund.payment_intent as string) ?? null;
                if (!piId) break;

                const { data: piLedger } = await supabase
                    .from("credit_ledger")
                    .select("team_id, amount_nanos, after_balance_nanos")
                    .eq("ref_type", "Stripe_Payment_Intent")
                    .eq("ref_id", piId)
                    .maybeSingle();

                const teamId = piLedger?.team_id ?? null;
                const originalNetNanos = Number(piLedger?.amount_nanos ?? 0);

                const pi = await stripe.paymentIntents.retrieve(piId);
                const originalGrossCents = Number(pi.amount_received ?? pi.amount ?? 0) || 0;
                const originalGrossNanos = originalGrossCents * 10_000_000;
                const refundGrossCents = Number(refund.amount ?? 0) || 0;
                const refundGrossNanos = refundGrossCents * 10_000_000;

                const ratio = originalGrossNanos > 0 ? Math.min(1, refundGrossNanos / originalGrossNanos) : 1;
                const refundNetNanos = Math.max(0, Math.round(originalNetNanos * ratio));
                const negativeNetNanos = -refundNetNanos;

                await upsertLedger({
                    team_id: teamId,
                    kind: "refund",
                    amount_nanos: negativeNetNanos,
                    before_balance_nanos: piLedger ? Number(piLedger.after_balance_nanos ?? 0) : 0,
                    after_balance_nanos: piLedger ? Number(piLedger.after_balance_nanos ?? 0) : 0,
                    ref_type: "Stripe_Refund",
                    ref_id: refund.id,
                    status: "Pending",
                    event_time: new Date().toISOString(),
                });

                break;
            }

            case "refund.updated": {
                const refund = event.data.object as Stripe.Refund;
                const status = refund.status as string | undefined;

                await supabase
                    .from("credit_ledger")
                    .update({
                        status:
                            status === "succeeded"
                                ? "Succeeded"
                                : status === "failed"
                                    ? "Failed"
                                    : status === "canceled"
                                        ? "Canceled"
                                        : status,
                        event_time: new Date().toISOString(),
                    })
                    .eq("ref_type", "Stripe_Refund")
                    .eq("ref_id", refund.id);

                if (status === "succeeded") {
                    const { data: refRow } = await supabase
                        .from("credit_ledger")
                        .select("team_id, amount_nanos, before_balance_nanos")
                        .eq("ref_type", "Stripe_Refund")
                        .eq("ref_id", refund.id)
                        .maybeSingle();

                    const teamId = refRow?.team_id ?? null;
                    const refundNetNegativeNanos = Number(refRow?.amount_nanos ?? 0);

                    if (teamId && refundNetNegativeNanos < 0) {
                        const { data: wallet } = await supabase
                            .from("wallets")
                            .select("balance_nanos")
                            .eq("team_id", teamId)
                            .maybeSingle();

                        const beforeBalanceNanos =
                            refRow?.before_balance_nanos != null
                                ? Number(refRow.before_balance_nanos)
                                : Number(wallet?.balance_nanos ?? 0);

                        const afterBalanceNanos = beforeBalanceNanos + refundNetNegativeNanos;

                        await supabase.from("wallets").update({ balance_nanos: afterBalanceNanos }).eq("team_id", teamId);

                        await supabase
                            .from("credit_ledger")
                            .update({
                                before_balance_nanos: beforeBalanceNanos,
                                after_balance_nanos: afterBalanceNanos,
                                status: "Succeeded",
                                event_time: new Date().toISOString(),
                            })
                            .eq("ref_type", "Stripe_Refund")
                            .eq("ref_id", refund.id);
                    }
                }

                break;
            }

            default:
                return NextResponse.json({ ignored: true });
        }

        return NextResponse.json({ received: true });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
    }
}
