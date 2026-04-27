import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { requireActiveTeamStripeCustomer } from "@/lib/server/activeTeamStripe";

export async function POST(req: NextRequest) {
    try {
        const { kind, amount_pence, currency = "usd", workspace_id } = await req.json();
        const requestedTeamId =
            typeof workspace_id === "string" && workspace_id.trim().length > 0
                ? workspace_id.trim()
                : undefined;
        const { workspaceId, customerId } = await requireActiveTeamStripeCustomer({
            createIfMissing: true,
        });

        if (requestedTeamId && requestedTeamId !== workspaceId) {
            return NextResponse.json({ error: "Team mismatch" }, { status: 403 });
        }

        // Derive a base URL: prefer NEXT_PUBLIC_BASE_URL, fall back to request origin, then localhost.
        const requestOrigin = req.headers.get("origin") || req.headers.get("referer") || "http://localhost:3000";
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || requestOrigin.replace(/\/$/, "");

        const settingsCreditsUrl = `${baseUrl}/settings/credits`;
        const successUrl = `${settingsCreditsUrl}?checkout=success&kind=${kind}`;
        const cancelUrl = `${baseUrl}/settings/credits/?checkout=cancelled`;

        const stripe = getStripe();

        // 1) One-off payment (do NOT save card)
        if (kind === "oneoff") {
            if (!amount_pence || amount_pence < 500) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
            const paymentAttempt = Date.now();
            const paymentSuccessUrl = `${settingsCreditsUrl}?checkout=success&kind=${kind}&payment_attempt=${paymentAttempt}`;

            const session = await stripe.checkout.sessions.create({
                mode: "payment",
                // Allow card wallets (Apple Pay / Google Pay) to surface when
                // available on the customer's device/browser. Including "link"
                // also enables Stripe Link as an option.
                payment_method_types: ["card", "link"],
                payment_method_options: {
                    card: {
                        // Let Stripe decide whether to request 3DS when needed
                        request_three_d_secure: "automatic",
                    },
                },
                customer: customerId,
                line_items: [{
                    quantity: 1,
                    price_data: {
                        currency,
                        unit_amount: amount_pence,
                        product_data: { name: "AI Credits top-up (one-off)" },
                    },
                }],
                payment_intent_data: {
                    metadata: {
                        purpose: "top_up_one_off",
                        ...(workspaceId ? { workspace_id: workspaceId } : {}),
                    },
                },
                // Do NOT set setup_future_usage here (keeps it strictly one-off)
                success_url: paymentSuccessUrl,
                cancel_url: cancelUrl,
                // optional niceties:
                allow_promotion_codes: false,
                billing_address_collection: "auto",
                metadata: {
                    purpose: "top_up_one_off",
                    ...(workspaceId ? { workspace_id: workspaceId } : {}),
                },
            });

            return NextResponse.json({ url: session.url });
        }

        // 2) One-off but ALSO save for future (charge now + store card)
        if (kind === "pay_and_save") {
            if (!amount_pence || amount_pence < 500) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
            const paymentAttempt = Date.now();
            const paymentSuccessUrl = `${settingsCreditsUrl}?checkout=success&kind=${kind}&payment_attempt=${paymentAttempt}`;

            const session = await stripe.checkout.sessions.create({
                mode: "payment",
                payment_method_types: ["card", "link"],
                payment_method_options: {
                    card: { request_three_d_secure: "automatic" },
                },
                customer: customerId,
                line_items: [{
                    quantity: 1,
                    price_data: {
                        currency,
                        unit_amount: amount_pence,
                        product_data: { name: "AI Credits top-up (save card)" },
                    },
                }],
                payment_intent_data: {
                    setup_future_usage: "off_session", // Save the card for later server-side charging
                    metadata: {
                        purpose: "top_up",
                        ...(workspaceId ? { workspace_id: workspaceId } : {}),
                    },
                },
                success_url: paymentSuccessUrl,
                cancel_url: cancelUrl,
            });

            return NextResponse.json({ url: session.url });
        }

        // 3) Save card ONLY (no immediate charge)
        if (kind === "save_only") {
            // debug info
            // eslint-disable-next-line no-console
            console.log(`creating setup session (save_only) customerId=${customerId}`);
            const session = await stripe.checkout.sessions.create({
                mode: "setup",
                payment_method_types: ["card", "link"],
                customer: customerId,
                success_url: successUrl,
                cancel_url: cancelUrl,
                setup_intent_data: {
                    metadata: {
                        purpose: "auto_topup_setup",
                        ...(workspaceId ? { workspace_id: workspaceId } : {}),
                    },
                },
            });

            return NextResponse.json({ url: session.url });
        }

        return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
    } catch (e: any) {
        if (e?.message === "unauthorized") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (e?.message === "missing_team") {
            return NextResponse.json({ error: "Missing team" }, { status: 400 });
        }
        // log full error server-side for debugging
        // eslint-disable-next-line no-console
        console.error("checkout.create route error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
