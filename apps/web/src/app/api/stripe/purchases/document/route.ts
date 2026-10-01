import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { requireActiveTeamStripeCustomer } from "@/lib/server/activeTeamStripe";
import { createAdminClient } from "@/utils/supabase/admin";

const TOP_UP_KINDS = new Set(["top_up", "top_up_one_off", "auto_top_up"]);

function parsePaymentIntentId(body: any): string | null {
    const raw = body?.paymentIntentId ?? body?.payment_intent_id ?? null;
    if (!raw) return null;
    const id = String(raw).trim();
    return id.startsWith("pi_") ? id : null;
}

function isMissingStripePaymentIntentError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;

    const candidate = error as {
        code?: string;
        param?: string;
        message?: string;
        raw?: { code?: string; param?: string; message?: string };
    };
    const code = String(candidate.code ?? candidate.raw?.code ?? "");
    const param = String(candidate.param ?? candidate.raw?.param ?? "").toLowerCase();
    const message = String(candidate.message ?? candidate.raw?.message ?? "").toLowerCase();

    return code === "resource_missing" &&
        (param === "payment_intent" || message.includes("no such payment_intent"));
}

async function resolveChargeWithReceipt(
    stripe: Stripe,
    paymentIntentId: string
): Promise<Stripe.Charge | null> {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge"],
    });

    const latestCharge = pi.latest_charge;
    if (!latestCharge) return null;

    if (typeof latestCharge !== "string") {
        return latestCharge;
    }

    return stripe.charges.retrieve(latestCharge, {
    });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const paymentIntentId = parsePaymentIntentId(body);
        if (!paymentIntentId) {
            return NextResponse.json({ error: "Invalid payment intent id" }, { status: 400 });
        }

        const { workspaceId, customerId } = await requireActiveTeamStripeCustomer();
        const supabase = createAdminClient();

        const { data: purchase, error: purchaseErr } = await supabase
            .from("credit_ledger")
            .select("ref_type,ref_id,kind,status")
            .eq("workspace_id", workspaceId)
            .eq("ref_type", "Stripe_Payment_Intent")
            .eq("ref_id", paymentIntentId)
            .maybeSingle();
        if (purchaseErr) throw purchaseErr;
        if (!purchase || !TOP_UP_KINDS.has(String(purchase.kind ?? ""))) {
            return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
        }

        const stripe = getStripe();
        const charge = await resolveChargeWithReceipt(stripe, paymentIntentId);
        if (!charge) {
            return NextResponse.json({ error: "Receipt not available yet" }, { status: 404 });
        }

        const chargeCustomerId =
            typeof charge.customer === "string"
                ? charge.customer
                : charge.customer?.id ?? null;
        if (!chargeCustomerId || chargeCustomerId !== customerId) {
            return NextResponse.json({ error: "Customer mismatch" }, { status: 403 });
        }

        if (charge.receipt_url) {
            return NextResponse.json({
                ok: true,
                type: "receipt",
                url: charge.receipt_url,
                message: "Receipt ready",
            });
        }

        return NextResponse.json({ error: "Receipt not available for this payment" }, { status: 404 });
    } catch (err: any) {
        if (err?.message === "unauthorized") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (err?.message === "missing_team" || err?.message === "missing_stripe_customer") {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        if (isMissingStripePaymentIntentError(err)) {
            return NextResponse.json({
                error: "Receipt unavailable. This payment may have been created in Stripe test mode or in a different Stripe account.",
            }, { status: 404 });
        }
        console.error("[stripe-receipt] Failed to load payment receipt", {
            error: err?.message ?? String(err),
        });
        return NextResponse.json({ error: "Unable to load receipt" }, { status: 500 });
    }
}
