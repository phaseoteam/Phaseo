import { getStripe } from "@/lib/stripe";
import { NextRequest, NextResponse } from "next/server";
import {
	deriveFirstName,
	sendCheckoutStartedEvent,
} from "@/lib/automations/resend-events";
import { requireActiveWorkspaceStripeCustomer } from "@/lib/server/activeTeamStripe";

// Minimal Stripe integration. Requires STRIPE_SECRET_KEY in environment.
// Creates a Checkout session for a single one-time payment in cents (integer) passed as { amount }

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const purchaseAmount = Number(body?.purchase_amount_cents);
        const totalAmount = Number(body?.total_amount_cents) || purchaseAmount;
        const requestedTeamId =
            typeof body?.workspace_id === "string" && body.workspace_id.trim().length > 0
                ? body.workspace_id.trim()
                : null;
        const {
            workspaceId,
            customerId,
            userId: authenticatedUserId,
            userEmail,
            userDisplayName,
        } = await requireActiveWorkspaceStripeCustomer({
            createIfMissing: true,
        });
        const firstName = deriveFirstName(userDisplayName);
        if (requestedTeamId && requestedTeamId !== workspaceId) {
            return NextResponse.json({ error: "Workspace mismatch" }, { status: 403 });
        }
        if (!purchaseAmount || isNaN(purchaseAmount) || purchaseAmount < 500) {
            return NextResponse.json({ error: "Invalid purchase amount. Minimum $5 (500 cents)." }, { status: 400 });
        }

        const stripeSecret = process.env.STRIPE_SECRET_KEY;
        if (!stripeSecret) {
            return NextResponse.json({ error: "Stripe key not configured" }, { status: 500 });
        }

        const stripe = getStripe();

        const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const paymentAttempt = Date.now();

        // allow optional user_id to be passed from client so webhook can directly credit
        const checkoutUserId = body?.user_id;

        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            payment_method_types: ["card"],
            customer: customerId,
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
            metadata: checkoutUserId ? { user_id: String(checkoutUserId), purchase_amount_cents: String(purchaseAmount) } : { purchase_amount_cents: String(purchaseAmount) },
            payment_intent_data: {
                description: 'Credits purchase',
                metadata: {
                    purpose: "top_up_one_off",
                    workspace_id: workspaceId,
                },
            },
            success_url: `${origin}/settings/credits?checkout=success&payment_attempt=${paymentAttempt}`,
            cancel_url: `${origin}/settings/credits?checkout=cancelled`,
        });
        if (userEmail) {
            try {
                await sendCheckoutStartedEvent({
                    email: userEmail,
                    payload: {
                        workspaceId,
                        userId: authenticatedUserId,
                        firstName,
                        checkoutSessionId: session.id,
                        checkoutKind: "legacy_checkout",
                        currency: "usd",
                        amountPence: Number(totalAmount),
                        startedAtIso: new Date().toISOString(),
                    },
                });
            } catch (error) {
                console.error("Failed sending checkout.started event for legacy checkout", {
                    workspaceId,
                    userId: authenticatedUserId,
                    checkoutSessionId: session.id,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }

        return NextResponse.json({ url: session.url });
    } catch (err: any) {
        if (err?.message === "unauthorized") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (err?.message === "missing_workspace") {
            return NextResponse.json({ error: "Missing workspace" }, { status: 400 });
        }
        // don't leak internals; return generic message
        return NextResponse.json({ error: err?.message || "unknown" }, { status: 500 });
    }
}
