import { NextResponse } from "next/server";
import { getUserObfuscationPreference } from "@/lib/fetchers/account/getUserObfuscationPreference";
import { ensureWorkspaceStripeWallet } from "@/lib/server/activeTeamStripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

export type SettingsCreditsInitialData = {
	initialBalance: number;
	latestPaymentSuccessAt: string | null;
	lowBalanceEmailEnabled: boolean;
	lowBalanceEmailThresholdUsd: number | null;
	obfuscateInfo: boolean;
	stripeInfo: {
		customer: {
			email: string | null;
			id: string | null;
		};
		defaultPaymentMethodId: string | null;
		hasPaymentMethod: boolean;
		paymentMethods: Array<{
			card: {
				brand: string | null;
				exp_month: number | null;
				exp_year: number | null;
				last4: string | null;
			};
			id: string;
		}>;
	};
	wallet: any;
};

function nanosToCredits(value: unknown): number {
	const nanos = Number(value ?? 0);
	return Number.isFinite(nanos) ? nanos / 1_000_000_000 : 0;
}

export async function GET() {
	let initialBalance = 0;
	let wallet: any = null;
	let lowBalanceEmailEnabled = false;
	let lowBalanceEmailThresholdUsd: number | null = null;

	const supabase = await createClient();
	let adminClient: ReturnType<typeof createAdminClient> | null = null;
	try {
		adminClient = createAdminClient();
	} catch {
		adminClient = null;
	}
	const readClient: any = adminClient ?? supabase;

	const { data: authData } = await supabase.auth.getUser();
	const obfuscateInfo = await getUserObfuscationPreference(authData.user?.id ?? null);
	const workspaceId = await getWorkspaceIdFromCookie();

	if (workspaceId && authData.user?.id) {
		try {
			await ensureWorkspaceStripeWallet({
				workspaceId,
				userId: authData.user.id,
				email: authData.user.email ?? undefined,
			});
		} catch (error) {
			void error;
		}
	}

	let w: any = null;
	if (workspaceId) {
		try {
			const { data, error: walletErr } = await readClient
				.from("wallets")
				.select(
					"workspace_id,stripe_customer_id,balance_nanos,reserved_nanos,auto_top_up_enabled,low_balance_threshold,auto_top_up_amount,auto_top_up_account_id",
				)
				.eq("workspace_id", workspaceId)
				.maybeSingle();

			if (walletErr) {
				void walletErr;
			} else {
				w = data ?? null;
				wallet = w;
				initialBalance = nanosToCredits(w?.balance_nanos);
			}
		} catch (outerErr) {
			void outerErr;
		}
	}

	if (workspaceId && !w) {
		try {
			const { data: ledgerRow, error: ledgerErr } = await readClient
				.from("credit_ledger")
				.select("after_balance_nanos,event_time")
				.eq("workspace_id", workspaceId)
				.order("event_time", { ascending: false })
				.limit(1)
				.maybeSingle();
			if (ledgerErr) {
				void ledgerErr;
			} else if (ledgerRow) {
				initialBalance = nanosToCredits(ledgerRow.after_balance_nanos);
			}
		} catch (err) {
			void err;
		}
	}

	if (workspaceId) {
		try {
			const { data: settingsRow, error: settingsErr } = await readClient
				.from("workspace_settings")
				.select("low_balance_email_enabled,low_balance_email_threshold_nanos")
				.eq("workspace_id", workspaceId)
				.maybeSingle();

			if (settingsErr) {
				void settingsErr;
			} else {
				lowBalanceEmailEnabled = Boolean(settingsRow?.low_balance_email_enabled);
				const nanos = Number(settingsRow?.low_balance_email_threshold_nanos ?? 0);
				lowBalanceEmailThresholdUsd =
					nanos > 0 ? Number((nanos / 1_000_000_000).toFixed(2)) : null;
			}
		} catch (outerErr) {
			void outerErr;
		}
	}

	let hasPaymentMethod = false;
	let customerInfo: any = null;
	let paymentMethods: SettingsCreditsInitialData["stripeInfo"]["paymentMethods"] = [];
	let defaultPaymentMethodId: string | null = null;
	const stripe = getStripe();

	try {
		const customerId = w?.stripe_customer_id ?? null;
		if (customerId) {
			try {
				customerInfo = await stripe.customers.retrieve(customerId);
			} catch (custErr) {
				void custErr;
				customerInfo = null;
			}

			try {
				const pms = await stripe.paymentMethods.list({
					customer: customerId,
					type: "card",
				});

				paymentMethods = (pms?.data ?? []).map((paymentMethod) => ({
					id: paymentMethod.id,
					card: {
						brand: paymentMethod.card?.brand ?? null,
						last4: paymentMethod.card?.last4 ?? null,
						exp_month: paymentMethod.card?.exp_month ?? null,
						exp_year: paymentMethod.card?.exp_year ?? null,
					},
				}));

				hasPaymentMethod = paymentMethods.length > 0;
				defaultPaymentMethodId =
					(customerInfo as any)?.invoice_settings?.default_payment_method ?? null;
			} catch (pmErr) {
				void pmErr;
				hasPaymentMethod = Boolean(
					(customerInfo as any)?.invoice_settings?.default_payment_method,
				);
			}
		}
	} catch (error) {
		void error;
	}

	let latestPaymentSuccessAt: string | null = null;
	if (workspaceId) {
		try {
			const { data: latestRow, error: latestErr } = await readClient
				.from("credit_ledger")
				.select("event_time,status,amount_nanos")
				.eq("workspace_id", workspaceId)
				.eq("ref_type", "Stripe_Payment_Intent")
				.or("status.ilike.paid,status.ilike.succeeded")
				.gt("amount_nanos", 0)
				.order("event_time", { ascending: false })
				.limit(1)
				.maybeSingle();

			if (!latestErr && latestRow?.event_time) {
				latestPaymentSuccessAt = String(latestRow.event_time);
			}
		} catch {
			latestPaymentSuccessAt = null;
		}
	}

	return NextResponse.json({
		initialBalance,
		latestPaymentSuccessAt,
		lowBalanceEmailEnabled,
		lowBalanceEmailThresholdUsd,
		obfuscateInfo,
		stripeInfo: {
			customer: {
				id: w?.stripe_customer_id ?? null,
				email: (customerInfo as any)?.email ?? null,
			},
			hasPaymentMethod,
			paymentMethods,
			defaultPaymentMethodId,
		},
		wallet,
	} satisfies SettingsCreditsInitialData);
}
