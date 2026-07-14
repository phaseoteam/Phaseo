import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getUserObfuscationPreference } from "@/lib/fetchers/account/getUserObfuscationPreference";
import { ensureWorkspaceStripeWallet } from "@/lib/server/activeTeamStripe";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

export type SettingsPaymentMethodsInitialData = {
	customerId: string | null;
	initialData: {
		customer: {
			id: string;
			email: string | null;
		};
		defaultPaymentMethodId: string | null;
		paymentMethods: Array<{
			brand: string | null;
			created: number | null;
			expMonth: number | null;
			expYear: number | null;
			funding: string | null;
			id: string;
			last4: string | null;
		}>;
	};
	obfuscateInfo: boolean;
};

export async function GET() {
	const supabase = await createClient();
	const { data: authData } = await supabase.auth.getUser();
	const user = authData.user;
	const obfuscateInfo = await getUserObfuscationPreference(user?.id ?? null);
	const workspaceId = await getWorkspaceIdFromCookie();
	const stripe = getStripe();

	if (workspaceId && user?.id) {
		try {
			await ensureWorkspaceStripeWallet({
				workspaceId,
				userId: user.id,
				email: user.email ?? undefined,
			});
		} catch {
			// Wallet creation is best-effort; the page can still render an empty state.
		}
	}

	let customerId: string | null = null;
	let customer: Stripe.Customer | null = null;
	let paymentMethods: Stripe.PaymentMethod[] = [];
	let defaultPaymentMethodId: string | null = null;

	if (workspaceId) {
		const { data, error } = await supabase
			.from("wallets")
			.select("stripe_customer_id")
			.eq("workspace_id", workspaceId)
			.maybeSingle();
		if (error) throw new Error(error.message);
		customerId = data?.stripe_customer_id ?? null;
	}

	if (customerId) {
		try {
			const customerResp = await stripe.customers.retrieve(customerId);
			if ("deleted" in customerResp && customerResp.deleted) {
				customer = null;
				defaultPaymentMethodId = null;
			} else {
				customer = customerResp as Stripe.Customer;
				defaultPaymentMethodId = (customer.invoice_settings
					?.default_payment_method ?? null) as string | null;
			}

			const list = await stripe.paymentMethods.list({
				customer: customerId,
				type: "card",
			});
			paymentMethods = list.data ?? [];
		} catch {
			paymentMethods = [];
		}
	}

	return NextResponse.json({
		customerId,
		initialData: {
			customer: {
				id: customerId ?? "",
				email: customer?.email ?? null,
			},
			defaultPaymentMethodId,
			paymentMethods: paymentMethods.map((paymentMethod) => ({
				id: paymentMethod.id,
				brand: paymentMethod.card?.brand ?? null,
				last4: paymentMethod.card?.last4 ?? null,
				expMonth: paymentMethod.card?.exp_month ?? null,
				expYear: paymentMethod.card?.exp_year ?? null,
				funding: paymentMethod.card?.funding ?? null,
				created: paymentMethod.created ?? null,
			})),
		},
		obfuscateInfo,
	} satisfies SettingsPaymentMethodsInitialData);
}
