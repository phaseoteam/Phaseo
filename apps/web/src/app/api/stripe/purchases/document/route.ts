import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { requireActiveTeamStripeCustomer } from "@/lib/server/activeTeamStripe";
import { createAdminClient } from "@/utils/supabase/admin";

const TOP_UP_KINDS = new Set(["top_up", "top_up_one_off", "auto_top_up"]);
type ChargeWithInvoice = Stripe.Charge & {
    invoice?: string | Stripe.Invoice | null;
};

function parsePaymentIntentId(body: any): string | null {
    const raw = body?.paymentIntentId ?? body?.payment_intent_id ?? null;
    if (!raw) return null;
    const id = String(raw).trim();
    return id.startsWith("pi_") ? id : null;
}

async function resolveChargeWithInvoice(
    stripe: Stripe,
    paymentIntentId: string
): Promise<Stripe.Charge | null> {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge", "latest_charge.invoice"],
    });

    const latestCharge = pi.latest_charge;
    if (!latestCharge) return null;

    if (typeof latestCharge !== "string") {
        return latestCharge;
    }

    return stripe.charges.retrieve(latestCharge, {
        expand: ["invoice"],
    });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const paymentIntentId = parsePaymentIntentId(body);
        if (!paymentIntentId) {
            return NextResponse.json({ error: "Invalid payment intent id" }, { status: 400 });
        }

        const { teamId, customerId } = await requireActiveTeamStripeCustomer();
        const supabase = createAdminClient();

        const { data: purchase, error: purchaseErr } = await supabase
            .from("credit_ledger")
            .select("ref_type,ref_id,kind,status")
            .eq("team_id", teamId)
            .eq("ref_type", "Stripe_Payment_Intent")
            .eq("ref_id", paymentIntentId)
            .maybeSingle();
        if (purchaseErr) throw purchaseErr;
        if (!purchase || !TOP_UP_KINDS.has(String(purchase.kind ?? ""))) {
            return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
        }

        const stripe = getStripe();
        const charge = await resolveChargeWithInvoice(stripe, paymentIntentId);
        if (!charge) {
            return NextResponse.json({ error: "Document not available yet" }, { status: 404 });
        }

        const chargeCustomerId =
            typeof charge.customer === "string"
                ? charge.customer
                : charge.customer?.id ?? null;
        if (!chargeCustomerId || chargeCustomerId !== customerId) {
            return NextResponse.json({ error: "Customer mismatch" }, { status: 403 });
        }

        const invoice = (charge as ChargeWithInvoice).invoice;
        if (invoice && typeof invoice !== "string") {
            const invoiceUrl = invoice.hosted_invoice_url ?? invoice.invoice_pdf ?? null;
            if (invoiceUrl) {
                return NextResponse.json({
                    ok: true,
                    type: "invoice",
                    url: invoiceUrl,
                    message: "Invoice ready",
                });
            }
        }

        if (charge.receipt_url) {
            return NextResponse.json({
                ok: true,
                type: "receipt",
                url: charge.receipt_url,
                message: "Receipt ready",
            });
        }

        return NextResponse.json({ error: "Document not available yet" }, { status: 404 });
    } catch (err: any) {
        if (err?.message === "unauthorized") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (err?.message === "missing_team" || err?.message === "missing_stripe_customer") {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        return NextResponse.json({ error: err?.message ?? "document_lookup_failed" }, { status: 500 });
    }
}
