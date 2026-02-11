import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { requireActiveTeamStripeCustomer } from "@/lib/server/activeTeamStripe";
import { createAdminClient } from "@/utils/supabase/admin";

const REFUND_WINDOW_MS = 24 * 60 * 60 * 1000;
const TOP_UP_KINDS = new Set(["top_up", "top_up_one_off", "auto_top_up"]);
const ACTIVE_REFUND_STATUSES = new Set(["pending", "applying", "processing", "succeeded"]);
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

function isPaidStatus(status: string | null | undefined): boolean {
    const normalized = String(status ?? "").toLowerCase();
    return normalized === "paid" || normalized === "succeeded";
}

function mapRefundStatus(status?: string | null): string {
    const raw = String(status ?? "").toLowerCase();
    if (!raw) return "Pending";
    if (raw === "succeeded") return "Succeeded";
    if (raw === "failed") return "Failed";
    if (raw === "canceled") return "Canceled";
    if (raw === "pending") return "Pending";
    if (raw === "requires_action") return "Pending";
    return "Pending";
}

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
    try {
        const body = await req.json();
        const paymentIntentId = parsePaymentIntentId(body);
        const refundReasonCode = parseRefundReasonCode(body);
        const refundReasonLabel = REFUND_REASON_LABELS[refundReasonCode] ?? REFUND_REASON_LABELS.no_comment;
        if (!paymentIntentId) {
            return NextResponse.json({ error: "Invalid payment intent id" }, { status: 400 });
        }

        const { teamId, customerId, userId } = await requireActiveTeamStripeCustomer();
        const supabase = createAdminClient();

        const { data: purchase, error: purchaseErr } = await supabase
            .from("credit_ledger")
            .select("team_id,event_time,kind,amount_nanos,before_balance_nanos,status,ref_type,ref_id")
            .eq("team_id", teamId)
            .eq("ref_type", "Stripe_Payment_Intent")
            .eq("ref_id", paymentIntentId)
            .maybeSingle();

        if (purchaseErr) throw purchaseErr;
        if (!purchase) {
            return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
        }

        if (!TOP_UP_KINDS.has(String(purchase.kind ?? ""))) {
            return NextResponse.json({ error: "Only credit top-ups can be refunded here" }, { status: 400 });
        }
        if (!isPaidStatus(purchase.status)) {
            return NextResponse.json({ error: "This purchase is not in a refundable state" }, { status: 409 });
        }

        const purchaseTs = new Date(String(purchase.event_time ?? "")).getTime();
        if (!Number.isFinite(purchaseTs)) {
            return NextResponse.json({ error: "Invalid purchase timestamp" }, { status: 400 });
        }
        if (Date.now() - purchaseTs > REFUND_WINDOW_MS) {
            return NextResponse.json(
                { error: "Self-serve refunds are only available for 24 hours after purchase." },
                { status: 409 }
            );
        }

        const amountNanos = Number(purchase.amount_nanos ?? 0);
        const beforeBalanceNanos = Number(purchase.before_balance_nanos ?? 0);
        if (!Number.isFinite(amountNanos) || amountNanos <= 0) {
            return NextResponse.json({ error: "Invalid purchase amount" }, { status: 400 });
        }

        const { data: existingRefunds, error: refundLookupErr } = await supabase
            .from("credit_ledger")
            .select("ref_id,status")
            .eq("team_id", teamId)
            .eq("kind", "refund")
            .eq("source_ref_type", "Stripe_Payment_Intent")
            .eq("source_ref_id", paymentIntentId);

        if (refundLookupErr) throw refundLookupErr;
        if (
            (existingRefunds ?? []).some((row) =>
                ACTIVE_REFUND_STATUSES.has(String(row.status ?? "").toLowerCase())
            )
        ) {
            return NextResponse.json(
                { error: "A refund for this purchase is already in progress or completed." },
                { status: 409 }
            );
        }

        const { data: usageRows, error: usageErr } = await supabase
            .from("gateway_requests")
            .select("cost_nanos")
            .eq("team_id", teamId)
            .eq("success", true)
            .gte("created_at", new Date(purchaseTs).toISOString());
        if (usageErr) throw usageErr;

        const usageSincePurchaseNanos = (usageRows ?? []).reduce((sum, row) => {
            const nanos = Number(row.cost_nanos ?? 0);
            return sum + (Number.isFinite(nanos) && nanos > 0 ? nanos : 0);
        }, 0);

        // Full-lot only: if usage exceeded the pre-purchase balance, this lot has been consumed.
        if (usageSincePurchaseNanos > beforeBalanceNanos) {
            return NextResponse.json(
                {
                    error: "This top-up has already been used, so it is not eligible for self-serve refund.",
                },
                { status: 409 }
            );
        }

        const stripe = getStripe();
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

        const refundableGrossCents = Math.max(0, originalGrossCents - refundedGrossCents);
        if (refundableGrossCents <= 0) {
            return NextResponse.json(
                { error: "This payment no longer has a refundable amount." },
                { status: 409 }
            );
        }

        const refund = await stripe.refunds.create(
            {
                payment_intent: paymentIntentId,
                amount: refundableGrossCents,
                reason: "requested_by_customer",
                metadata: {
                    purpose: "self_serve_unused_lot_refund",
                    team_id: teamId,
                    user_id: userId,
                    stripe_customer_id: customerId,
                    user_reason: refundReasonLabel,
                    user_reason_code: refundReasonCode,
                },
            },
            {
                idempotencyKey: `self_serve_refund:${teamId}:${paymentIntentId}`,
            }
        );

        const refundGrossCents = Number(refund.amount ?? refundableGrossCents) || refundableGrossCents;
        const ratio = originalGrossCents > 0 ? Math.min(1, refundGrossCents / originalGrossCents) : 1;
        const refundNetNanos = Math.max(0, Math.round(amountNanos * ratio));
        const negativeNetNanos = -refundNetNanos;

        const { data: wallet, error: walletErr } = await supabase
            .from("wallets")
            .select("balance_nanos")
            .eq("team_id", teamId)
            .maybeSingle();
        if (walletErr) throw walletErr;
        const currentBalanceNanos = Number(wallet?.balance_nanos ?? 0);

        const { error: refundLedgerErr } = await supabase.from("credit_ledger").upsert(
            [
                {
                    team_id: teamId,
                    kind: "refund",
                    amount_nanos: negativeNetNanos,
                    before_balance_nanos: currentBalanceNanos,
                    after_balance_nanos: currentBalanceNanos,
                    ref_type: "Stripe_Refund",
                    ref_id: refund.id,
                    status: mapRefundStatus(refund.status),
                    event_time: new Date().toISOString(),
                    source_ref_type: "Stripe_Payment_Intent",
                    source_ref_id: paymentIntentId,
                },
            ],
            {
                onConflict: "ref_type,ref_id",
            }
        );
        if (refundLedgerErr) throw refundLedgerErr;

        let claimStateToWrite = "Requested";
        const status = String(refund.status ?? "pending").toLowerCase();

        if (status === "succeeded" && negativeNetNanos < 0) {
            const { data: deltaRows, error: deltaErr } = await supabase.rpc("wallet_apply_delta", {
                p_team_id: teamId,
                p_delta_nanos: negativeNetNanos,
            });

            if (deltaErr) {
                console.warn("[refund.request] inline wallet_apply_delta failed; waiting for webhook reconciliation", {
                    teamId,
                    refundId: refund.id,
                    error: deltaErr.message,
                });
            } else {
                const deltaRow = deltaRows?.[0] ?? {};
                const beforeBalanceAfterRefund = Number(deltaRow.before_balance_nanos ?? currentBalanceNanos);
                const afterBalanceAfterRefund = Number(deltaRow.after_balance_nanos ?? currentBalanceNanos);
                claimStateToWrite = "Succeeded";

                await supabase
                    .from("credit_ledger")
                    .update({
                        before_balance_nanos: beforeBalanceAfterRefund,
                        after_balance_nanos: afterBalanceAfterRefund,
                        status: "Succeeded",
                        event_time: new Date().toISOString(),
                    })
                    .eq("ref_type", "Stripe_Refund")
                    .eq("ref_id", refund.id);
            }
        }

        const { error: claimUpdateErr } = await supabase
            .from("credit_ledger")
            .update({
                refund_claim_state: claimStateToWrite,
                refund_claim_reason: refundReasonLabel,
                refund_claimed_at: new Date().toISOString(),
                refund_claimed_by_user_id: userId,
            })
            .eq("team_id", teamId)
            .eq("ref_type", "Stripe_Payment_Intent")
            .eq("ref_id", paymentIntentId);
        if (claimUpdateErr && !String(claimUpdateErr.message ?? "").toLowerCase().includes("column")) {
            console.warn("[refund.request] failed to persist refund claim metadata", {
                teamId,
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
