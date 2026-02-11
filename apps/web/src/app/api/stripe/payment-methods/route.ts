import { NextResponse } from "next/server";
import Stripe from "stripe";
import { revalidatePath } from "next/cache";
import { getStripe } from "@/lib/stripe";
import { requireActiveTeamStripeCustomer } from "@/lib/server/activeTeamStripe";
import { createClient } from "@/utils/supabase/server";

type PaymentMethodSummary = {
    id: string;
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
    funding: string | null;
    created: number | null;
};

function toErrorResponse(error: unknown, status = 500) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status });
}

function resolveSafeReturnUrl(request: Request, candidate: unknown): string {
    const siteBase = process.env.WEBSITE_URL || new URL(request.url).origin;
    const siteOrigin = new URL(siteBase).origin;
    const fallback = new URL("/settings/payment-methods", siteOrigin).toString();

    if (typeof candidate !== "string" || !candidate.trim()) {
        return fallback;
    }

    try {
        const parsed = new URL(candidate, siteOrigin);
        if (parsed.origin !== siteOrigin) {
            return fallback;
        }
        return parsed.toString();
    } catch {
        return fallback;
    }
}

function extractCustomerId(value: Stripe.PaymentMethod["customer"]): string | null {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
    return null;
}

function mapPaymentMethod(pm: Stripe.PaymentMethod): PaymentMethodSummary {
    return {
        id: pm.id,
        brand: pm.card?.brand ?? null,
        last4: pm.card?.last4 ?? null,
        expMonth: pm.card?.exp_month ?? null,
        expYear: pm.card?.exp_year ?? null,
        funding: pm.card?.funding ?? null,
        created: pm.created ?? null,
    };
}

async function listPaymentMethods(stripe: Stripe, customerId: string) {
    const customerResp = await stripe.customers.retrieve(customerId);
    let customerEmail: string | null = null;
    let defaultPaymentMethodId: string | null = null;

    if (!("deleted" in customerResp && customerResp.deleted)) {
        customerEmail = customerResp.email ?? null;
        const rawDefault = customerResp.invoice_settings?.default_payment_method ?? null;
        defaultPaymentMethodId =
            typeof rawDefault === "string" ? rawDefault : rawDefault?.id ?? null;
    }

    const methods = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card",
        limit: 100,
    });

    return {
        customer: {
            id: customerId,
            email: customerEmail,
        },
        defaultPaymentMethodId,
        paymentMethods: methods.data.map(mapPaymentMethod),
    };
}

export async function GET() {
    try {
        const { customerId } = await requireActiveTeamStripeCustomer();
        const stripe = getStripe();
        const payload = await listPaymentMethods(stripe, customerId);
        return NextResponse.json(payload);
    } catch (error: any) {
        if (error?.message === "unauthorized") return toErrorResponse("Unauthorized", 401);
        if (error?.message === "missing_team" || error?.message === "missing_stripe_customer") {
            return toErrorResponse(error.message, 400);
        }
        return toErrorResponse(error, 500);
    }
}

export async function POST(request: Request) {
    try {
        const stripe = getStripe();
        const { customerId, teamId } = await requireActiveTeamStripeCustomer();
        const body = await request.json().catch(() => ({}));
        const returnUrl = resolveSafeReturnUrl(request, body?.returnUrl);

        const session = await stripe.checkout.sessions.create({
            mode: "setup",
            payment_method_types: ["card", "link"],
            customer: customerId,
            success_url: returnUrl,
            cancel_url: returnUrl,
            setup_intent_data: {
                metadata: {
                    purpose: "auto_topup_setup",
                    team_id: teamId,
                },
            },
        });

        return NextResponse.json({ url: session.url });
    } catch (error: any) {
        if (error?.message === "unauthorized") return toErrorResponse("Unauthorized", 401);
        if (error?.message === "missing_team" || error?.message === "missing_stripe_customer") {
            return toErrorResponse(error.message, 400);
        }
        return toErrorResponse(error, 500);
    }
}

export async function PATCH(request: Request) {
    try {
        const stripe = getStripe();
        const { customerId } = await requireActiveTeamStripeCustomer();
        const body = await request.json().catch(() => ({}));
        const paymentMethodId = typeof body?.paymentMethodId === "string" ? body.paymentMethodId.trim() : "";
        if (!paymentMethodId) {
            return toErrorResponse("Missing paymentMethodId", 400);
        }

        const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
        const pmCustomerId = extractCustomerId(paymentMethod.customer);
        if (pmCustomerId && pmCustomerId !== customerId) {
            return toErrorResponse("Payment method does not belong to this customer", 403);
        }

        if (!pmCustomerId) {
            await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
        }

        await stripe.customers.update(customerId, {
            invoice_settings: { default_payment_method: paymentMethodId },
        });

        revalidatePath("/settings/payment-methods");
        revalidatePath("/settings/credits");

        const payload = await listPaymentMethods(stripe, customerId);
        return NextResponse.json(payload);
    } catch (error: any) {
        if (error?.message === "unauthorized") return toErrorResponse("Unauthorized", 401);
        if (error?.message === "missing_team" || error?.message === "missing_stripe_customer") {
            return toErrorResponse(error.message, 400);
        }
        return toErrorResponse(error, 500);
    }
}

export async function DELETE(request: Request) {
    try {
        const stripe = getStripe();
        const { customerId, teamId } = await requireActiveTeamStripeCustomer();
        const body = await request.json().catch(() => ({}));
        const paymentMethodId = typeof body?.paymentMethodId === "string" ? body.paymentMethodId.trim() : "";
        if (!paymentMethodId) {
            return toErrorResponse("Missing paymentMethodId", 400);
        }

        const before = await listPaymentMethods(stripe, customerId);
        const exists = before.paymentMethods.some((pm) => pm.id === paymentMethodId);
        if (!exists) {
            return toErrorResponse("Payment method not found", 404);
        }

        const nextDefaultId = before.paymentMethods.find((pm) => pm.id !== paymentMethodId)?.id ?? null;
        if (before.defaultPaymentMethodId === paymentMethodId) {
            await stripe.customers.update(customerId, {
                invoice_settings: { default_payment_method: nextDefaultId ?? undefined },
            });
        }

        await stripe.paymentMethods.detach(paymentMethodId);

        const supabase = await createClient();
        const { data: wallet } = await supabase
            .from("wallets")
            .select("auto_top_up_enabled, auto_top_up_account_id")
            .eq("team_id", teamId)
            .maybeSingle();

        if (wallet?.auto_top_up_account_id === paymentMethodId) {
            await supabase
                .from("wallets")
                .update({
                    auto_top_up_account_id: nextDefaultId,
                    auto_top_up_enabled: nextDefaultId ? (wallet?.auto_top_up_enabled ?? false) : false,
                })
                .eq("team_id", teamId);
            revalidatePath("/settings/credits");
        }

        revalidatePath("/settings/payment-methods");

        const payload = await listPaymentMethods(stripe, customerId);
        return NextResponse.json(payload);
    } catch (error: any) {
        if (error?.message === "unauthorized") return toErrorResponse("Unauthorized", 401);
        if (error?.message === "missing_team" || error?.message === "missing_stripe_customer") {
            return toErrorResponse(error.message, 400);
        }
        return toErrorResponse(error, 500);
    }
}
