import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { requireActiveTeamStripeCustomer } from "@/lib/server/activeTeamStripe";
import { createAdminClient } from "@/utils/supabase/admin";
import { rejectCrossOriginRequest } from "@/lib/http/sameOrigin";

const REFUND_REASON_LABELS: Record<string, string> = {
    no_comment: "No comment",
    accidental_purchase: "Accidental purchase",
    duplicate_purchase: "Duplicate purchase",
    wrong_amount: "Wrong amount selected",
    testing_only: "Testing / sandbox use",
    no_longer_needed: "No longer needed",
    other: "Other",
};
const REFUND_REASON_CODES = new Set(Object.keys(REFUND_REASON_LABELS));
const IN_PROGRESS_ERROR = "A refund for this purchase is already in progress or completed.";
// Reasons returned by stripe_claim_self_serve_refund.
const CLAIM_REJECTIONS: Record<string, { error: string; status: number }> = {
    purchase_not_found: { error: "Purchase not found", status: 404 },
    purchase_not_paid: { error: "This purchase is not in a refundable state", status: 409 },
    window_expired: { error: "Self-serve refunds are only available for 24 hours after purchase.", status: 409 },
    invalid_amount: { error: "Invalid purchase amount", status: 400 },
    refund_claim_in_progress: { error: IN_PROGRESS_ERROR, status: 409 },
    refund_already_exists: { error: IN_PROGRESS_ERROR, status: 409 },
    lot_used: { error: "This top-up has already been used, so it is not eligible for self-serve refund.", status: 409 },
    wallet_not_found: { error: "Wallet not found", status: 404 },
};
const DEFAULT_CLAIM_REJECTION = { error: "This purchase is not eligible for self-serve refund.", status: 409 };
const CLAIM_UNCERTAIN_ERROR =
    "We couldn't confirm your refund request, and no refund was sent. Please try again in 15 minutes.";

function parsePaymentIntentId(body: any): string | null {
    const value = body?.paymentIntentId ?? body?.payment_intent_id ?? null;
    if (!value) return null;
    const trimmed = String(value).trim();
    if (!trimmed.startsWith("pi_")) return null;
    return trimmed;
}

function parseRefundReasonCode(body: any): string {
    const value = body?.reason ?? body?.refundReason ?? null;
    if (!value) return "no_comment";
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return "no_comment";
    return REFUND_REASON_CODES.has(normalized) ? normalized : "no_comment";
}

function refundInfoMessage(status: string): string {
    if (status === "succeeded") {
        return "Your refund is confirmed. Most banks post refunds in 5-10 business days.";
    }
    return "Your refund request is processing. Once confirmed, most banks post refunds in 5-10 business days.";
}

export async function POST(req: NextRequest) {
    const crossOrigin = rejectCrossOriginRequest(req); if (crossOrigin) return crossOrigin;
    try {
        const body = await req.json();
        const paymentIntentId = parsePaymentIntentId(body);
        const refundReasonCode = parseRefundReasonCode(body);
        const refundReasonLabel = REFUND_REASON_LABELS[refundReasonCode] ?? REFUND_REASON_LABELS.no_comment;
        if (!paymentIntentId) {
            return NextResponse.json({ error: "Invalid payment intent id" }, { status: 400 });
        }

        const { workspaceId, customerId, userId } = await requireActiveTeamStripeCustomer();
        const supabase = createAdminClient();

        // Eligibility and the wallet debit happen in one SQL transaction before any money moves:
        // the purchase and wallet rows are locked, usage is summed in SQL, held credits stay
        // covered and the wallet never goes below zero.
        const { data: claimRows, error: claimErr } = await supabase.rpc("stripe_claim_self_serve_refund", {
            p_team_id: workspaceId,
            p_payment_intent_id: paymentIntentId,
            p_user_id: userId,
        });
        if (claimErr) {
            // The claim may have committed even though its response was lost. No Stripe refund is
            // created, and the claim can't be told apart from a concurrent request's, so it isn't
            // released here: the next claim after 15 minutes gives an unlinked claim back
            // (stripe_claim_self_serve_refund).
            console.error("[refund.request] refund claim outcome unknown", {
                workspaceId,
                paymentIntentId,
                error: claimErr.message,
            });
            return NextResponse.json({ error: CLAIM_UNCERTAIN_ERROR }, { status: 503 });
        }
        const claim = (Array.isArray(claimRows) ? claimRows[0] : claimRows) as
            | { ok?: boolean; reason?: string | null; amount_nanos?: number | string | null; claim_ref_id?: string | null }
            | null
            | undefined;
        if (!claim?.ok) {
            const rejection = CLAIM_REJECTIONS[String(claim?.reason ?? "")] ?? DEFAULT_CLAIM_REJECTION;
            return NextResponse.json({ error: rejection.error }, { status: rejection.status });
        }
        const refundNetNanos = Number(claim.amount_nanos ?? 0);
        // One Stripe refund per claim: a retry after a failed refund must not get the old refund back.
        const claimRefId = String(claim.claim_ref_id ?? "").trim() || `self_serve_claim:${paymentIntentId}:${crypto.randomUUID()}`;

        // Gives the claimed credits back when no Stripe refund was created.
        const releaseClaim = async () => {
            const { error } = await supabase.rpc("stripe_apply_refund_once", {
                p_workspace_id: workspaceId,
                p_payment_intent_id: paymentIntentId,
                p_refund_id: null,
                p_refund_net_nanos: null,
                p_status: "failed",
            });
            if (error) {
                console.error("[refund.request] failed to release refund claim", {
                    workspaceId,
                    paymentIntentId,
                    error: error.message,
                });
            }
        };

        const stripe = getStripe();
        let refund: Awaited<ReturnType<typeof stripe.refunds.create>>;
        try {
            const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
                expand: ["latest_charge"],
            });

            let originalGrossCents = Number(paymentIntent.amount ?? 0) || 0;
            let refundedGrossCents = 0;
            const latestCharge = paymentIntent.latest_charge;
            if (latestCharge && typeof latestCharge === "object") {
                originalGrossCents = Number((latestCharge as any).amount ?? originalGrossCents) || originalGrossCents;
                refundedGrossCents = Number((latestCharge as any).amount_refunded ?? 0) || 0;
            } else if (typeof latestCharge === "string" && latestCharge.trim().length > 0) {
                const charge = await stripe.charges.retrieve(latestCharge);
                originalGrossCents = Number(charge.amount ?? originalGrossCents) || originalGrossCents;
                refundedGrossCents = Number(charge.amount_refunded ?? 0) || 0;
            }

            // The claim took the whole top-up out of the wallet, so only a payment with nothing
            // refunded yet is refunded here.
            if (originalGrossCents <= 0 || refundedGrossCents > 0) {
                await releaseClaim();
                return NextResponse.json(
                    { error: "This payment no longer has a refundable amount." },
                    { status: 409 }
                );
            }

            refund = await stripe.refunds.create(
                {
                    payment_intent: paymentIntentId,
                    amount: originalGrossCents,
                    reason: "requested_by_customer",
                    metadata: {
                        purpose: "self_serve_unused_lot_refund",
                        workspace_id: workspaceId,
                        user_id: userId,
                        stripe_customer_id: customerId,
                        user_reason: refundReasonLabel,
                        user_reason_code: refundReasonCode,
                        refund_claim_id: claimRefId,
                    },
                },
                {
                    idempotencyKey: `self_serve_refund:${workspaceId}:${claimRefId}`,
                }
            );
        } catch (stripeErr) {
            // If Stripe did create the refund, its webhook debits the wallet again (by refund id).
            await releaseClaim();
            throw stripeErr;
        }

        const status = String(refund.status ?? "pending").toLowerCase();

        // Links the claim's debit to this refund id. The refund webhooks call the same function,
        // so whichever runs first applies it and the wallet is debited once.
        const { error: applyErr } = await supabase.rpc("stripe_apply_refund_once", {
            p_workspace_id: workspaceId,
            p_payment_intent_id: paymentIntentId,
            p_refund_id: refund.id,
            p_refund_net_nanos: refundNetNanos,
            p_status: status,
        });
        if (applyErr) {
            console.warn("[refund.request] stripe_apply_refund_once failed; waiting for webhook reconciliation", {
                workspaceId,
                refundId: refund.id,
                error: applyErr.message,
            });
        }

        const { error: claimUpdateErr } = await supabase
            .from("credit_ledger")
            .update({ refund_claim_reason: refundReasonLabel })
            .eq("workspace_id", workspaceId)
            .eq("ref_type", "Stripe_Payment_Intent")
            .eq("ref_id", paymentIntentId);
        if (claimUpdateErr) {
            console.warn("[refund.request] failed to persist refund claim reason", {
                workspaceId,
                paymentIntentId,
                error: claimUpdateErr.message,
            });
        }

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
        return NextResponse.json({ error: err?.message ?? "refund_request_failed" }, { status: 500 });
    }
}
