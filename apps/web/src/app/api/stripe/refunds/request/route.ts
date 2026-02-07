import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { requireActiveTeamStripeCustomer } from "@/lib/server/activeTeamStripe";
import { createAdminClient } from "@/utils/supabase/admin";

const REFUND_WINDOW_MS = 24 * 60 * 60 * 1000;
const TOP_UP_KINDS = new Set(["top_up", "top_up_one_off", "auto_top_up"]);
const ACTIVE_REFUND_STATUSES = new Set(["Pending", "Applying", "Processing", "Succeeded"]);

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
        if ((existingRefunds ?? []).some((row) => ACTIVE_REFUND_STATUSES.has(String(row.status ?? "")))) {
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
                    status: mapRefundStatus(refund.status),
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
