import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

const INTERNAL_PAYMENTS_TOKEN = process.env.INTERNAL_PAYMENTS_TOKEN ?? process.env.INTERNAL_API_TOKEN;
const INTERNAL_HEADER = "x-internal-payments-token";
const TOP_UP_PURPOSES = new Set(["top_up", "top_up_one_off", "auto_top_up", "credits_topup_offsession"]);

function requireInternalCaller(req: NextRequest): NextResponse | null {
    if (!INTERNAL_PAYMENTS_TOKEN) {
        console.error("[payments] INTERNAL_PAYMENTS_TOKEN not configured");
        return NextResponse.json({ error: "payments_not_configured" }, { status: 500 });
    }

    const provided = req.headers.get(INTERNAL_HEADER);
    if (provided !== INTERNAL_PAYMENTS_TOKEN) {
        console.warn("[payments] Blocked unauthorised charge-saved invocation", {
            remote: req.headers.get("x-forwarded-for") ?? "unknown",
        });
        return NextResponse.json({ error: "unauthorised" }, { status: 403 });
    }

    return null;
}

export async function POST(req: NextRequest) {
    const authError = requireInternalCaller(req);
    if (authError) return authError;

    try {
        // Accept both camelCase and snake_case keys from client for robustness
        const body = await req.json();
        const { customerId, amount_pence, currency = "usd", event_type } = body as any;
        const normalizedPurpose =
            typeof event_type === "string" && TOP_UP_PURPOSES.has(event_type) ? event_type : "auto_top_up";
        // support paymentMethodId (camelCase) and payment_method_id (snake_case)
        const paymentMethodId = (body.paymentMethodId ?? body.payment_method_id) as string | undefined;
        const teamId = (body.team_id ?? body.teamId) as string | undefined;
        if (!customerId) return NextResponse.json({ error: "Missing customerId" }, { status: 400 });
        if (!amount_pence || amount_pence < 50) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });

        const stripe = getStripe();

        const pi = await stripe.paymentIntents.create({
            amount: amount_pence,
            currency,
            customer: customerId,
            // If a specific payment method was provided, use it. Otherwise omit
            // the field so Stripe can use the customer's default payment method.
            payment_method: paymentMethodId || undefined,
            off_session: true,
            confirm: true,
            metadata: {
                purpose: normalizedPurpose,
                ...(teamId ? { team_id: teamId } : {}),
            },
        });

        return NextResponse.json({ status: pi.status, clientSecret: pi.client_secret });
    } catch (e: any) {
        // SCA may be required: surface to client if you want to finish in-session
        if (e.code === "requires_action" && e.payment_intent?.client_secret) {
            return NextResponse.json({
                status: "requires_action",
                clientSecret: e.payment_intent.client_secret,
                error: e.message,
            }, { status: 402 });
        }
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
