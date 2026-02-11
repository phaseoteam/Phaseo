import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { requireActiveTeamStripeCustomer } from "@/lib/server/activeTeamStripe";

function resolveSafeReturnUrl(request: Request, candidate: unknown): string {
    const siteBase = process.env.WEBSITE_URL || new URL(request.url).origin;
    const siteOrigin = new URL(siteBase).origin;
    const fallback = new URL("/dashboard", siteOrigin).toString();

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

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const { customerId } = await requireActiveTeamStripeCustomer();
        const returnUrl = resolveSafeReturnUrl(request, body?.returnUrl);

        const stripe = getStripe();

        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: returnUrl,
        });

        return NextResponse.json({ url: session.url });
    } catch (err: any) {
        if (err?.message === "unauthorized") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (err?.message === "missing_team" || err?.message === "missing_stripe_customer") {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        console.log("[ERROR] /api/stripe/billing-portal:", String(err));
        return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
    }
}
