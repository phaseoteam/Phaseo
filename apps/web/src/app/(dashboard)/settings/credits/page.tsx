import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getActiveWorkspaceIdFromCookieRaw } from "@/utils/workspaceCookie";
import CurrentCredits from "@/components/(gateway)/credits/CurrentCredits";
import Banner from "@/components/(gateway)/credits/Banner";
import BuyCreditsClient from "@/components/(gateway)/credits/CreditPurchases/TopUp/BuyCreditsClient";
import AutoTopUpClient from "@/components/(gateway)/credits/CreditPurchases/AutoTopUp/AutoTopUpClient";
import LowBalanceEmailAlertsClient from "@/components/(gateway)/credits/LowBalanceEmailAlertsClient";
import { getStripe } from "@/lib/stripe";
import { Metadata } from "next";
import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { getUserObfuscationPreference } from "@/lib/fetchers/account/getUserObfuscationPreference";

export const metadata: Metadata = {
	title: "Credits - Settings",
};

function nanosToCredits(value: unknown): number {
	const nanos = Number(value ?? 0);
	return Number.isFinite(nanos) ? nanos / 1_000_000_000 : 0;
}

export default function Page(props: {
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
	return (
		<div className="space-y-6">
			<Suspense fallback={<SettingsSectionFallback />}>
				<CreditsSettingsContent searchParams={props.searchParams} />
			</Suspense>
		</div>
	);
}

async function CreditsSettingsContent(props: {
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
	const logPrefix = "[credits-debug]";
	const searchParams = await props.searchParams;
	const params = new URLSearchParams();
	if (searchParams) {
		for (const [k, v] of Object.entries(searchParams)) {
			if (Array.isArray(v)) v.forEach((val) => params.append(k, val));
			else if (typeof v === "string") params.append(k, v);
		}
	}
	const queryString = params.toString();

	let initialBalance = 0;
	let wallet: any = null;
	let stripeInfo: any = null;
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

	const rawCookieWorkspaceId = (await getActiveWorkspaceIdFromCookieRaw()) ?? "";
	let workspaceId: string | undefined = undefined;
	let workspaceAccess: "none" | "member" | "owner" = "none";

	if (rawCookieWorkspaceId && authData.user?.id) {
		const { data: membershipRow, error: membershipErr } = await readClient
			.from("workspace_members")
			.select("workspace_id")
			.eq("user_id", authData.user.id)
			.eq("workspace_id", rawCookieWorkspaceId)
			.limit(1)
			.maybeSingle();

		if (membershipErr) {
			console.warn(`${logPrefix} membership check error`, {
				userId: authData.user.id,
				rawCookieWorkspaceId,
				code: membershipErr.code ?? null,
				message: membershipErr.message ?? String(membershipErr),
			});
		}

		if (membershipRow?.workspace_id) {
			workspaceId = rawCookieWorkspaceId;
			workspaceAccess = "member";
		} else {
			const { data: ownedWorkspace, error: ownerErr } = await readClient
				.from("workspaces")
				.select("id")
				.eq("id", rawCookieWorkspaceId)
				.eq("owner_user_id", authData.user.id)
				.limit(1)
				.maybeSingle();

			if (ownerErr) {
				console.warn(`${logPrefix} owner check error`, {
					userId: authData.user.id,
					rawCookieWorkspaceId,
					code: ownerErr.code ?? null,
					message: ownerErr.message ?? String(ownerErr),
				});
			}

			if (ownedWorkspace?.id) {
				workspaceId = rawCookieWorkspaceId;
				workspaceAccess = "owner";
			}
		}
	}

	console.info(`${logPrefix} workspace resolution`, {
		userId: authData.user?.id ?? null,
		rawCookieWorkspaceId: rawCookieWorkspaceId || null,
		resolvedWorkspaceId: workspaceId ?? null,
		workspaceAccess,
		hasAdminClient: Boolean(adminClient),
	});

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
				console.error(`${logPrefix} wallet query error`, {
					workspaceId,
					code: walletErr.code ?? null,
					message: walletErr.message ?? String(walletErr),
				});
			} else {
				w = data ?? null;
				wallet = w;
				initialBalance = nanosToCredits(w?.balance_nanos);
				console.info(`${logPrefix} wallet query result`, {
					workspaceId,
					walletFound: Boolean(w),
					balanceNanos: w?.balance_nanos ?? null,
					reservedNanos: w?.reserved_nanos ?? null,
					initialBalance,
				});
			}
		} catch (outerErr) {
			console.error(`${logPrefix} unexpected wallet fetch error`, {
				workspaceId,
				error: String(outerErr),
			});
		}
	} else {
		console.info(`${logPrefix} wallet query skipped (missing workspaceId)`);
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
				console.warn(`${logPrefix} ledger fallback query error`, {
					workspaceId,
					code: ledgerErr.code ?? null,
					message: ledgerErr.message ?? String(ledgerErr),
				});
			} else if (ledgerRow) {
				initialBalance = nanosToCredits(ledgerRow.after_balance_nanos);
				console.info(`${logPrefix} ledger fallback result`, {
					workspaceId,
					afterBalanceNanos: ledgerRow.after_balance_nanos ?? null,
					initialBalance,
				});
			} else {
				console.info(`${logPrefix} ledger fallback empty`, { workspaceId });
			}
		} catch (err) {
			console.warn(`${logPrefix} balance fallback from ledger failed`, {
				workspaceId,
				error: String(err),
			});
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
				console.log("[WARN] fetching team settings:", String(settingsErr));
			} else {
				lowBalanceEmailEnabled = Boolean(settingsRow?.low_balance_email_enabled);
				const nanos = Number(settingsRow?.low_balance_email_threshold_nanos ?? 0);
				lowBalanceEmailThresholdUsd =
					nanos > 0 ? Number((nanos / 1_000_000_000).toFixed(2)) : null;
			}
		} catch (outerErr) {
			console.log("[WARN] unexpected team settings fetch error:", String(outerErr));
		}
	}

	let hasPaymentMethod = false;
	let customerInfo: any = null;
	let paymentMethods: any[] = [];
	let defaultPaymentMethodId: string | null = null;
	const stripe = getStripe();

	try {
		const customerId = w?.stripe_customer_id ?? null;
		if (customerId) {
			try {
				customerInfo = await stripe.customers.retrieve(customerId);
			} catch (custErr) {
				console.log("[WARN] stripe.customer.retrieve failed:", String(custErr));
				customerInfo = null;
			}

			try {
				const pms = await stripe.paymentMethods.list({
					customer: customerId,
					type: "card",
				});

				paymentMethods = (pms?.data ?? []).map((pm) => ({
					id: pm.id,
					card: {
						brand: pm.card?.brand ?? null,
						last4: pm.card?.last4 ?? null,
						exp_month: pm.card?.exp_month ?? null,
						exp_year: pm.card?.exp_year ?? null,
					},
				}));

				hasPaymentMethod = paymentMethods.length > 0;
				defaultPaymentMethodId =
					(customerInfo as any)?.invoice_settings?.default_payment_method ?? null;
			} catch (pmErr) {
				console.log("[WARN] stripe.paymentMethods.list failed:", String(pmErr));
				hasPaymentMethod = Boolean(
					(customerInfo as any)?.invoice_settings?.default_payment_method,
				);
			}
		}
	} catch (e) {
		console.log("[ERROR] unexpected stripe check error:", String(e));
	}

	stripeInfo = {
		customer: {
			id: w?.stripe_customer_id ?? null,
			email: (customerInfo as any)?.email ?? null,
		},
		hasPaymentMethod,
		paymentMethods,
		defaultPaymentMethodId,
	};

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

	console.info(`${logPrefix} final balance resolved`, {
		workspaceId: workspaceId ?? null,
		walletWorkspaceId: w?.workspace_id ?? null,
		initialBalance,
	});

	return (
		<div
			className="space-y-6"
			data-obfuscate-pii={obfuscateInfo ? "true" : "false"}
			data-obfuscation-sync="true"
		>
			<SettingsPageHeader title="Credits" />

			<Banner
				queryString={queryString ?? null}
				latestPaymentSuccessAt={latestPaymentSuccessAt}
			/>

			<CurrentCredits
				balance={initialBalance}
				title="Current Balance"
				refreshAriaLabel="refresh balance"
			/>

			<div className="space-y-6">
				<Card>
					<CardContent className="p-0">
						<div className="grid grid-cols-1 md:grid-cols-2">
							<div className="p-6">
								<BuyCreditsClient
									wallet={wallet}
									stripeInfo={stripeInfo}
									embedded
								/>
							</div>
							<div className="border-t md:border-t-0 md:border-l p-6">
								<AutoTopUpClient
									wallet={wallet}
									stripeInfo={stripeInfo}
									embedded
								/>
							</div>
						</div>
					</CardContent>
				</Card>
				<div>
					<LowBalanceEmailAlertsClient
						enabled={lowBalanceEmailEnabled}
						thresholdUsd={lowBalanceEmailThresholdUsd}
					/>
				</div>
			</div>
		</div>
	);
}
