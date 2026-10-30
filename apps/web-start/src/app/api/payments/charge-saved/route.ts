import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/utils/supabase/admin";
import { isValidTopUpAmountPence, TOP_UP_CURRENCY } from "@/lib/server/topUpValidation";

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
        const { customerId, amount_pence, event_type, country_code } = body as any;
        const normalizedPurpose =
            typeof event_type === "string" && TOP_UP_PURPOSES.has(event_type) ? event_type : "auto_top_up";
        // support paymentMethodId (camelCase) and payment_method_id (snake_case)
        const paymentMethodId = (body.paymentMethodId ?? body.payment_method_id) as string | undefined;
        const workspaceId = (body.workspace_id ?? body.workspaceId) as string | undefined;
        if (!customerId || !workspaceId) return NextResponse.json({ error: "Missing workspace billing identity" }, { status: 400 });
        if (!isValidTopUpAmountPence(amount_pence)) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
		const { data: wallet, error: walletError } = await createAdminClient()
			.from("wallets")
			.select("stripe_customer_id")
			.eq("workspace_id", workspaceId)
			.maybeSingle();
		if (walletError) return NextResponse.json({ error: "Billing identity unavailable" }, { status: 503 });
		if (wallet?.stripe_customer_id !== customerId) {
			return NextResponse.json({ error: "Workspace billing identity mismatch" }, { status: 403 });
		}
        const purchaseCountry = typeof country_code === "string" && /^[A-Z]{2}$/.test(country_code)
            ? country_code
            : null;
        if (["top_up", "top_up_one_off"].includes(normalizedPurpose) && !purchaseCountry) {
            return NextResponse.json({ error: "Missing country" }, { status: 400 });
        }

        const stripe = getStripe();
		if (paymentMethodId) {
			const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
			const boundCustomerId = typeof paymentMethod.customer === "string"
				? paymentMethod.customer
				: paymentMethod.customer?.id;
			if (boundCustomerId !== customerId) {
				return NextResponse.json({ error: "Payment method mismatch" }, { status: 403 });
			}
		}

        const pi = await stripe.paymentIntents.create({
            amount: amount_pence,
            currency: TOP_UP_CURRENCY,
            customer: customerId,
            // If a specific payment method was provided, use it. Otherwise omit
            // the field so Stripe can use the customer's default payment method.
            payment_method: paymentMethodId || undefined,
            off_session: true,
            confirm: true,
            metadata: {
                purpose: normalizedPurpose,
                ...(purchaseCountry ? { country_code: purchaseCountry } : {}),
                ...(workspaceId ? { workspace_id: workspaceId } : {}),
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
