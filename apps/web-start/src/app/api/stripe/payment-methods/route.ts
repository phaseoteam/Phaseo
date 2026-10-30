import { NextResponse } from "next/server";
import Stripe from "stripe";
import { revalidatePath } from "next/cache";
import { getStripe } from "@/lib/stripe";
import { requireActiveTeamStripeCustomer } from "@/lib/server/activeTeamStripe";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

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
        const { customerId } = await requireActiveTeamStripeCustomer({ createIfMissing: true });
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
        const { customerId, workspaceId } = await requireActiveTeamStripeCustomer({ createIfMissing: true });
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
                    workspace_id: workspaceId,
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
        const { customerId } = await requireActiveTeamStripeCustomer({ createIfMissing: true });
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
	let lease: { workspaceId: string; claimToken: string } | null = null;
    try {
        const stripe = getStripe();
        const { customerId, workspaceId } = await requireActiveTeamStripeCustomer({ createIfMissing: true });
        const body = await request.json().catch(() => ({}));
        const paymentMethodId = typeof body?.paymentMethodId === "string" ? body.paymentMethodId.trim() : "";
        if (!paymentMethodId) {
            return toErrorResponse("Missing paymentMethodId", 400);
        }
		const claimToken = crypto.randomUUID();
		const admin = createAdminClient();
		const claim = await admin.rpc("claim_payment_method_mutation", {
			p_workspace_id: workspaceId,
			p_claim_token: claimToken,
		});
		if (claim.error) return toErrorResponse("Payment method mutation unavailable", 503);
		if (claim.data !== true) return toErrorResponse("Another payment method change is in progress", 409);
		lease = { workspaceId, claimToken };
		const renewLease = async () => {
			const renewed = await admin.rpc("renew_payment_method_mutation", {
				p_workspace_id: workspaceId,
				p_claim_token: claimToken,
			});
			if (renewed.error || renewed.data !== true) throw new Error("payment_method_mutation_claim_lost");
		};

        const before = await listPaymentMethods(stripe, customerId);
        const exists = before.paymentMethods.some((pm) => pm.id === paymentMethodId);
        if (!exists) {
            return toErrorResponse("Payment method not found", 404);
        }

		await renewLease();
		await stripe.paymentMethods.detach(paymentMethodId);
		let payload = await listPaymentMethods(stripe, customerId);
		const attachedIds = new Set(payload.paymentMethods.map((method) => method.id));
		const reconciledDefaultId = payload.defaultPaymentMethodId && attachedIds.has(payload.defaultPaymentMethodId)
			? payload.defaultPaymentMethodId
			: payload.paymentMethods[0]?.id ?? null;
		if (payload.defaultPaymentMethodId !== reconciledDefaultId) {
			await renewLease();
			await stripe.customers.update(customerId, {
				invoice_settings: { default_payment_method: reconciledDefaultId ?? "" },
			});
			payload = await listPaymentMethods(stripe, customerId);
		}

        const supabase = await createClient();
        const { data: wallet, error: walletError } = await supabase
            .from("wallets")
            .select("auto_top_up_enabled, auto_top_up_account_id")
            .eq("workspace_id", workspaceId)
            .maybeSingle();
		if (walletError) throw new Error(`wallet_payment_method_lookup_failed:${walletError.message}`);

		const walletPaymentMethodIsAttached = wallet?.auto_top_up_account_id
			? attachedIds.has(wallet.auto_top_up_account_id)
			: true;
        if (!walletPaymentMethodIsAttached) {
			await renewLease();
            const walletUpdate = await supabase
                .from("wallets")
                .update({
					auto_top_up_account_id: reconciledDefaultId,
					auto_top_up_enabled: reconciledDefaultId ? (wallet?.auto_top_up_enabled ?? false) : false,
                })
                .eq("workspace_id", workspaceId);
			if (walletUpdate.error) throw new Error(`wallet_payment_method_reconciliation_failed:${walletUpdate.error.message}`);
            revalidatePath("/settings/credits");
        }

        revalidatePath("/settings/payment-methods");

        return NextResponse.json(payload);
    } catch (error: any) {
        if (error?.message === "unauthorized") return toErrorResponse("Unauthorized", 401);
        if (error?.message === "missing_team" || error?.message === "missing_stripe_customer") {
            return toErrorResponse(error.message, 400);
        }
		return toErrorResponse(error, 500);
	} finally {
		if (lease) {
			try {
				await createAdminClient().rpc("release_payment_method_mutation", {
					p_workspace_id: lease.workspaceId,
					p_claim_token: lease.claimToken,
				});
			} catch {
				// The lease expires automatically; do not mask the mutation response.
			}
		}
    }
}
