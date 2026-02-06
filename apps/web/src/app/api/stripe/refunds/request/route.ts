import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { requireActiveTeamStripeCustomer } from "@/lib/server/activeTeamStripe";
import { createAdminClient } from "@/utils/supabase/admin";

function parsePaymentIntentId(body: any): string | null {
    const value = body?.paymentIntentId ?? body?.payment_intent_id ?? null;
    if (!value) return null;
    const trimmed = String(value).trim();
    if (!trimmed.startsWith("pi_")) return null;
    return trimmed;
}

type RefundClaimResult = {
    ok: boolean;
    reason: string | null;
    amount_nanos: number | null;
    before_balance_nanos: number | null;
    purchase_time: string | null;
};

function claimReasonToResponse(reason: string | null): { status: number; error: string } {
    switch (reason) {
        case "purchase_not_found":
            return { status: 404, error: "Purchase not found" };
        case "purchase_not_paid":
            return { status: 409, error: "This purchase is not in a refundable state" };
        case "window_expired":
            return { status: 409, error: "Self-serve refunds are only available for 24 hours after purchase." };
        case "refund_claim_in_progress":
            return { status: 409, error: "A refund for this purchase is already in progress." };
        case "refund_already_exists":
            return { status: 409, error: "A refund for this purchase already exists." };
        case "lot_used":
            return {
                status: 409,
                error: "This top-up has already been used, so it is not eligible for self-serve refund.",
            };
        default:
            return { status: 409, error: "This purchase is not eligible for self-serve refund." };
    }
}

function refundInfoMessage(status: string): string {
    if (status === "succeeded") {
        return "Your refund is confirmed. Most banks post refunds in 5-10 business days.";
    }
    return "Your refund request is processing. Once confirmed, most banks post refunds in 5-10 business days.";
}

export async function POST(req: NextRequest) {
    let claimAcquired = false;
    let refundCreated = false;
    let claimTeamId: string | null = null;
    let claimPaymentIntentId: string | null = null;
    let claimUserId: string | null = null;

    try {
        const body = await req.json();
        const paymentIntentId = parsePaymentIntentId(body);
        if (!paymentIntentId) {
            return NextResponse.json({ error: "Invalid payment intent id" }, { status: 400 });
        }

        const { teamId, customerId, userId } = await requireActiveTeamStripeCustomer();
        const supabase = createAdminClient();
        claimTeamId = teamId;
        claimPaymentIntentId = paymentIntentId;
        claimUserId = userId;

        const { data: claimData, error: claimErr } = await supabase.rpc("stripe_claim_self_serve_refund", {
            p_team_id: teamId,
            p_payment_intent_id: paymentIntentId,
            p_user_id: userId,
        });
        if (claimErr) throw claimErr;

        const claimRow = (Array.isArray(claimData) ? claimData[0] : claimData) as RefundClaimResult | null;
        if (!claimRow?.ok) {
            const mapped = claimReasonToResponse(claimRow?.reason ?? null);
            return NextResponse.json({ error: mapped.error }, { status: mapped.status });
        }
        claimAcquired = true;

        const stripe = getStripe();
        const existingStripeRefunds = await stripe.refunds.list({
            payment_intent: paymentIntentId,
            limit: 10,
        });
        if (
            existingStripeRefunds.data.some((entry) => {
                const status = String(entry.status ?? "").toLowerCase();
                return status && status !== "failed" && status !== "canceled";
            })
        ) {
            const hasSucceeded = existingStripeRefunds.data.some(
                (entry) => String(entry.status ?? "").toLowerCase() === "succeeded"
            );
            await supabase
                .from("credit_ledger")
                .update({
                    refund_claim_state: hasSucceeded ? "succeeded" : "requested",
                    refund_claim_reason: hasSucceeded ? null : "Refund already exists in Stripe.",
                    refund_claimed_at: new Date().toISOString(),
                    refund_claimed_by_user_id: userId,
                })
                .eq("team_id", teamId)
                .eq("ref_type", "Stripe_Payment_Intent")
                .eq("ref_id", paymentIntentId);
            return NextResponse.json(
                { error: "A refund for this purchase already exists in Stripe." },
                { status: 409 }
            );
        }

        const refund = await stripe.refunds.create(
            {
                payment_intent: paymentIntentId,
                reason: "requested_by_customer",
                metadata: {
                    purpose: "self_serve_unused_lot_refund",
                    team_id: teamId,
                    user_id: userId,
                    stripe_customer_id: customerId,
                },
            },
            {
                idempotencyKey: `self_serve_refund:${teamId}:${paymentIntentId}`,
            }
        );
        refundCreated = true;

        await supabase.from("credit_ledger").upsert(
            [
                {
                    team_id: teamId,
                    kind: "refund",
                    amount_nanos: 0,
                    before_balance_nanos: 0,
                    after_balance_nanos: 0,
                    ref_type: "Stripe_Refund",
                    ref_id: refund.id,
                    status: "Pending",
                    event_time: new Date().toISOString(),
                    source_ref_type: "Stripe_Payment_Intent",
                    source_ref_id: paymentIntentId,
                },
            ],
            {
                onConflict: "ref_type,ref_id",
                ignoreDuplicates: true,
            }
        );

        const status = String(refund.status ?? "pending").toLowerCase();
        await supabase
            .from("credit_ledger")
            .update({
                refund_claim_state: status === "succeeded" ? "succeeded" : "requested",
                refund_claim_reason: null,
                refund_claimed_at: new Date().toISOString(),
                refund_claimed_by_user_id: userId,
            })
            .eq("team_id", teamId)
            .eq("ref_type", "Stripe_Payment_Intent")
            .eq("ref_id", paymentIntentId);

        return NextResponse.json({
            ok: true,
            refundId: refund.id,
            status,
            message: refundInfoMessage(status),
        });
    } catch (err: any) {
        if (err?.message === "unauthorized") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (err?.message === "missing_team" || err?.message === "missing_stripe_customer") {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }

        if (claimAcquired && claimTeamId && claimPaymentIntentId) {
            const supabase = createAdminClient();
            await supabase
                .from("credit_ledger")
                .update({
                    refund_claim_state: refundCreated ? "requested" : "failed",
                    refund_claim_reason: refundCreated
                        ? "Refund created in Stripe and is awaiting webhook confirmation."
                        : String(err?.message ?? "Refund request failed"),
                    refund_claimed_at: new Date().toISOString(),
                    refund_claimed_by_user_id: claimUserId,
                })
                .eq("team_id", claimTeamId)
                .eq("ref_type", "Stripe_Payment_Intent")
                .eq("ref_id", claimPaymentIntentId);
        }
        return NextResponse.json({ error: err?.message ?? "refund_request_failed" }, { status: 500 });
    }
}
