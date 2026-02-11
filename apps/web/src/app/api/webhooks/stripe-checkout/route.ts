import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";

const TOP_UP_PURPOSES = new Set(["top_up", "top_up_one_off", "auto_top_up", "credits_topup_offsession"]);
type AppliedCreditRow = { applied?: boolean; before_balance_nanos?: number; after_balance_nanos?: number };

function readPaymentIntentPurpose(pi: Stripe.PaymentIntent): string | null {
    const raw = typeof pi.metadata?.purpose === "string" ? pi.metadata.purpose.trim() : "";
    return raw.length > 0 ? raw : null;
}

function toLedgerKind(purpose: string): "top_up" | "top_up_one_off" | "auto_top_up" {
    if (purpose === "top_up_one_off") return "top_up_one_off";
    if (purpose === "auto_top_up" || purpose === "credits_topup_offsession") return "auto_top_up";
    return "top_up";
}

function readPaymentMethodId(pi: Stripe.PaymentIntent): string | null {
    if (typeof pi.payment_method === "string" && pi.payment_method.trim().length > 0) {
        return pi.payment_method;
    }
    if (pi.payment_method && typeof pi.payment_method === "object" && "id" in pi.payment_method) {
        const id = (pi.payment_method as Stripe.PaymentMethod).id;
        return typeof id === "string" && id.trim().length > 0 ? id : null;
    }
    return null;
}

function readTeamIdFromPaymentIntent(pi: Stripe.PaymentIntent): string | null {
    const raw = typeof pi.metadata?.team_id === "string" ? pi.metadata.team_id.trim() : "";
    return raw.length > 0 ? raw : null;
}

async function ensureReusablePaymentMethod(
    stripe: Stripe,
    customerId: string,
    paymentMethodId: string
): Promise<void> {
    try {
        await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    } catch (err: any) {
        const msg = String(err?.message ?? "");
        // Already attached is fine and expected on retries.
        if (!msg.toLowerCase().includes("already attached")) {
            throw err;
        }
    }

    const customer = await stripe.customers.retrieve(customerId);
    if ("deleted" in customer && customer.deleted) return;

    const defaultPm = customer.invoice_settings?.default_payment_method;
    const defaultPmId = typeof defaultPm === "string" ? defaultPm : (defaultPm as Stripe.PaymentMethod | null)?.id;

    if (!defaultPmId) {
        await stripe.customers.update(customerId, {
            invoice_settings: { default_payment_method: paymentMethodId },
        });
    }
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

function mapStripeRefundStatus(status?: string | null): "Pending" | "Succeeded" | "Failed" | "Canceled" {
    const normalized = String(status ?? "").toLowerCase();
    if (normalized === "succeeded") return "Succeeded";
    if (normalized === "failed") return "Failed";
    if (normalized === "canceled" || normalized === "cancelled") return "Canceled";
    return "Pending";
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
        });
    }

    try {
        switch (event.type) {
            case "payment_intent.created": {
                const pi = event.data.object as Stripe.PaymentIntent;
                const purpose = readPaymentIntentPurpose(pi);
                if (!purpose || !TOP_UP_PURPOSES.has(purpose)) break;

                const stripeCustomerId = (pi.customer as string) ?? null;
                if (!stripeCustomerId) break;
                const metadataTeamId = readTeamIdFromPaymentIntent(pi);

                let { data: wallet } = await supabase
                    .from("wallets")
                    .select("team_id, stripe_customer_id, balance_nanos")
                    .eq("stripe_customer_id", stripeCustomerId)
                    .maybeSingle();

                if (!wallet?.team_id && metadataTeamId) {
                    const { data: byTeamWallet } = await supabase
                        .from("wallets")
                        .select("team_id, stripe_customer_id, balance_nanos")
                        .eq("team_id", metadataTeamId)
                        .maybeSingle();

                    if (byTeamWallet?.team_id) {
                        wallet = byTeamWallet;
                        // Only backfill customer ID if the wallet doesn't have one yet
                        if (!byTeamWallet.stripe_customer_id) {
                            await supabase
                                .from("wallets")
                                .update({ stripe_customer_id: stripeCustomerId })
                                .eq("team_id", byTeamWallet.team_id);
                        }
                    }
                }

                if (!wallet?.team_id) break;

                const beforeBalanceNanos = Number(wallet.balance_nanos ?? 0);

                await supabase
                    .from("credit_ledger")
                    .upsert(
                        [
                            {
                                team_id: wallet.team_id,
                                kind: toLedgerKind(purpose),
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
                const purpose = readPaymentIntentPurpose(pi);
                if (!purpose || !TOP_UP_PURPOSES.has(purpose)) {
                    console.warn("[stripe-webhook] Ignored payment_intent.succeeded with unsupported purpose", {
                        paymentIntentId: pi.id,
                        purpose: purpose ?? null,
                    });
                    break;
                }

                const stripeCustomerId = (pi.customer as string) ?? null;
                if (!stripeCustomerId) break;
                const paymentMethodId = readPaymentMethodId(pi);
                const metadataTeamId = readTeamIdFromPaymentIntent(pi);

                let { data: wallet } = await supabase
                    .from("wallets")
                    .select("team_id, stripe_customer_id")
                    .eq("stripe_customer_id", stripeCustomerId)
                    .maybeSingle();

                if (!wallet?.team_id && metadataTeamId) {
                    const { data: byTeamWallet } = await supabase
                        .from("wallets")
                        .select("team_id, stripe_customer_id")
                        .eq("team_id", metadataTeamId)
                        .maybeSingle();

                    if (byTeamWallet?.team_id) {
                        wallet = byTeamWallet;
                        // Only backfill customer ID if the wallet doesn't have one yet
                        if (!byTeamWallet.stripe_customer_id) {
                            await supabase
                                .from("wallets")
                                .update({ stripe_customer_id: stripeCustomerId })
                                .eq("team_id", byTeamWallet.team_id);
                        }
                    }
                }

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

                if (paymentMethodId) {
                    try {
                        await ensureReusablePaymentMethod(stripe, stripeCustomerId, paymentMethodId);
                    } catch (pmErr) {
                        console.warn("[stripe-webhook] Failed to attach/set default payment method", {
                            paymentIntentId: pi.id,
                            customerId: stripeCustomerId,
                            paymentMethodId,
                            error: String((pmErr as any)?.message ?? pmErr),
                        });
                    }
                }

                const { netNanos, feeNanos } = computeNetAndFeeFromGross(grossNanos, feePct);
                const kind = toLedgerKind(purpose);
                const { data: appliedRows, error: applyErr } = await supabase.rpc("stripe_apply_payment_intent_credit", {
                    p_team_id: wallet.team_id,
                    p_payment_intent_id: pi.id,
                    p_kind: kind,
                    p_amount_nanos: netNanos,
                    p_event_time: new Date().toISOString(),
                });

                if (applyErr) throw applyErr;

                const applied = (appliedRows?.[0] as AppliedCreditRow | undefined) ?? { applied: false };

                if (!applied.applied) {
                    console.log("[stripe-webhook] Duplicate payment_intent.succeeded ignored", {
                        paymentIntentId: pi.id,
                    });
                    break;
                }

                const beforeBalanceNanos = Number(applied.before_balance_nanos ?? 0);
                const afterBalanceNanos = Number(applied.after_balance_nanos ?? 0);
                const netUsd = (netNanos / 1_000_000_000).toFixed(2);
                const feeUsd = (feeNanos / 1_000_000_000).toFixed(2);
                const beforeUsd = (beforeBalanceNanos / 1_000_000_000).toFixed(2);
                const afterUsd = (afterBalanceNanos / 1_000_000_000).toFixed(2);

                console.log(
                    `[stripe-webhook] Payment credited net=$${netUsd} fee=$${feeUsd} balance_before=$${beforeUsd} balance_after=$${afterUsd}`
                );

                break;
            }

            case "payment_intent.payment_failed": {
                const pi = event.data.object as Stripe.PaymentIntent;
                const purpose = readPaymentIntentPurpose(pi);
                if (!purpose || !TOP_UP_PURPOSES.has(purpose)) break;

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
                    .select("team_id, amount_nanos")
                    .eq("ref_type", "Stripe_Payment_Intent")
                    .eq("ref_id", piId)
                    .maybeSingle();

                const teamId = piLedger?.team_id ?? null;
                if (!teamId) {
                    console.warn("[stripe-webhook] refund.created: no matching payment ledger entry", {
                        refundId: refund.id,
                        paymentIntentId: piId,
                    });
                    break;
                }

                const originalNetNanos = Number(piLedger?.amount_nanos ?? 0);

                const pi = await stripe.paymentIntents.retrieve(piId);
                const originalGrossCents = Number(pi.amount_received ?? pi.amount ?? 0) || 0;
                const originalGrossNanos = originalGrossCents * 10_000_000;
                const refundGrossCents = Number(refund.amount ?? 0) || 0;
                const refundGrossNanos = refundGrossCents * 10_000_000;

                const ratio = originalGrossNanos > 0 ? Math.min(1, refundGrossNanos / originalGrossNanos) : 1;
                const refundNetNanos = Math.max(0, Math.round(originalNetNanos * ratio));
                const negativeNetNanos = -refundNetNanos;
                const mappedStatus = mapStripeRefundStatus(refund.status);

                // Read current wallet balance for a more accurate placeholder
                const { data: currentWallet } = await supabase
                    .from("wallets")
                    .select("balance_nanos")
                    .eq("team_id", teamId)
                    .maybeSingle();
                const currentBalance = Number(currentWallet?.balance_nanos ?? 0);

                // Insert only if missing. Do not overwrite existing rows from API path.
                await supabase.from("credit_ledger").upsert(
                    [
                        {
                            team_id: teamId,
                            kind: "refund",
                            amount_nanos: negativeNetNanos,
                            before_balance_nanos: currentBalance,
                            after_balance_nanos: currentBalance,
                            ref_type: "Stripe_Refund",
                            ref_id: refund.id,
                            status: mappedStatus,
                            event_time: new Date().toISOString(),
                            source_ref_type: "Stripe_Payment_Intent",
                            source_ref_id: piId,
                        },
                    ],
                    {
                        onConflict: "ref_type,ref_id",
                        ignoreDuplicates: true,
                    }
                );

                // Always align mutable fields without touching before/after balances.
                await supabase
                    .from("credit_ledger")
                    .update({
                        status: mappedStatus,
                        amount_nanos: negativeNetNanos,
                        source_ref_type: "Stripe_Payment_Intent",
                        source_ref_id: piId,
                        event_time: new Date().toISOString(),
                    })
                    .eq("ref_type", "Stripe_Refund")
                    .eq("ref_id", refund.id);

                if (mappedStatus === "Succeeded") {
                    const { data: refRow } = await supabase
                        .from("credit_ledger")
                        .select("team_id, amount_nanos, before_balance_nanos, after_balance_nanos, status")
                        .eq("ref_type", "Stripe_Refund")
                        .eq("ref_id", refund.id)
                        .maybeSingle();

                    const priorStatus = String(refRow?.status ?? "").toLowerCase();
                    const priorBefore = Number(refRow?.before_balance_nanos ?? 0);
                    const priorAfter = Number(refRow?.after_balance_nanos ?? 0);
                    const alreadyApplied = priorStatus === "succeeded" && priorBefore !== priorAfter;

                    if (!alreadyApplied) {
                        const applyTeamId = refRow?.team_id ?? teamId;
                        const applyDeltaNanos = Number(refRow?.amount_nanos ?? negativeNetNanos);

                        if (applyTeamId && applyDeltaNanos < 0) {
                            const { data: deltaRows, error: deltaErr } = await supabase.rpc("wallet_apply_delta", {
                                p_team_id: applyTeamId,
                                p_delta_nanos: applyDeltaNanos,
                            });

                            if (deltaErr) {
                                console.error("[stripe-webhook] wallet_apply_delta failed for refund.created", {
                                    refundId: refund.id,
                                    teamId: applyTeamId,
                                    error: deltaErr.message,
                                });
                                throw deltaErr;
                            }

                            const balanceResult = deltaRows?.[0] ?? {};
                            const beforeBalanceNanos = Number(balanceResult.before_balance_nanos ?? priorBefore);
                            const afterBalanceNanos = Number(balanceResult.after_balance_nanos ?? priorAfter);

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
                }

                break;
            }

            case "refund.updated": {
                const refund = event.data.object as Stripe.Refund;
                const status = refund.status as string | undefined;
                const { data: existingRefundRow } = await supabase
                    .from("credit_ledger")
                    .select("team_id, amount_nanos, before_balance_nanos, after_balance_nanos, status")
                    .eq("ref_type", "Stripe_Refund")
                    .eq("ref_id", refund.id)
                    .maybeSingle();

                const priorStatus = String(existingRefundRow?.status ?? "").toLowerCase();
                const priorBefore = Number(existingRefundRow?.before_balance_nanos ?? 0);
                const priorAfter = Number(existingRefundRow?.after_balance_nanos ?? 0);
                const alreadyApplied = priorStatus === "succeeded" && priorBefore !== priorAfter;

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

                if (status === "succeeded" && !alreadyApplied) {
                    let teamId = existingRefundRow?.team_id ?? null;
                    let refundNetNegativeNanos = Number(existingRefundRow?.amount_nanos ?? 0);

                    if (!teamId) {
                        const { data: fallbackRow } = await supabase
                            .from("credit_ledger")
                            .select("team_id, amount_nanos")
                            .eq("ref_type", "Stripe_Refund")
                            .eq("ref_id", refund.id)
                            .maybeSingle();
                        teamId = fallbackRow?.team_id ?? null;
                        refundNetNegativeNanos = Number(fallbackRow?.amount_nanos ?? 0);
                    }

                    if (teamId && refundNetNegativeNanos < 0) {
                        // Use atomic RPC to prevent race conditions with concurrent balance changes
                        const { data: deltaRows, error: deltaErr } = await supabase.rpc("wallet_apply_delta", {
                            p_team_id: teamId,
                            p_delta_nanos: refundNetNegativeNanos,
                        });

                        if (deltaErr) {
                            console.error("[stripe-webhook] wallet_apply_delta failed for refund", {
                                refundId: refund.id,
                                teamId,
                                error: deltaErr.message,
                            });
                            throw deltaErr;
                        }

                        const balanceResult = deltaRows?.[0] ?? {};
                        const beforeBalanceNanos = Number(balanceResult.before_balance_nanos ?? 0);
                        const afterBalanceNanos = Number(balanceResult.after_balance_nanos ?? 0);

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
