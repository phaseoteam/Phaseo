import { getStripe } from "@/lib/stripe";
import { NextRequest, NextResponse } from "next/server";

// Minimal Stripe integration. Requires STRIPE_SECRET_KEY in environment.
// Creates a Checkout session for a single one-time payment in cents (integer) passed as { amount }

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const purchaseAmount = Number(body?.purchase_amount_cents);
        const totalAmount = Number(body?.total_amount_cents) || purchaseAmount;
        const teamId =
            typeof body?.team_id === "string" && body.team_id.trim().length > 0
                ? body.team_id.trim()
                : null;
        if (!purchaseAmount || isNaN(purchaseAmount) || purchaseAmount < 50) {
            return NextResponse.json({ error: "Invalid purchase amount. Minimum 50 cents." }, { status: 400 });
        }

        const stripeSecret = process.env.STRIPE_SECRET_KEY;
        if (!stripeSecret) {
            return NextResponse.json({ error: "Stripe key not configured" }, { status: 500 });
        }

        const stripe = getStripe();

        const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

        // allow optional user_id to be passed from client so webhook can directly credit
        const userId = body?.user_id;

        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            payment_method_types: ["card"],
            line_items: [
                {
                    price_data: {
                        currency: "usd",
                        product_data: { name: "Credits" },
                        unit_amount: totalAmount,
                    },
                    quantity: 1,
                },
            ],
            metadata: userId ? { user_id: String(userId), purchase_amount_cents: String(purchaseAmount) } : { purchase_amount_cents: String(purchaseAmount) },
            payment_intent_data: {
                description: 'Credits purchase',
                metadata: {
                    purpose: "top_up_one_off",
                    ...(teamId ? { team_id: teamId } : {}),
                },
            },
            success_url: `${origin}/settings/credits?checkout=success`,
            cancel_url: `${origin}/settings/credits?checkout=cancelled`,
        });

        return NextResponse.json({ url: session.url });
    } catch (err: any) {
        // don't leak internals; return generic message
        return NextResponse.json({ error: err?.message || "unknown" }, { status: 500 });
    }
}
