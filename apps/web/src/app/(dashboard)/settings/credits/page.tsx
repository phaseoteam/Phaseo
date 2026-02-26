import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import CurrentCredits from "@/components/(gateway)/credits/CurrentCredits";
import Banner from "@/components/(gateway)/credits/Banner";
import BuyCreditsClient from "@/components/(gateway)/credits/CreditPurchases/TopUp/BuyCreditsClient";
import AutoTopUpClient from "@/components/(gateway)/credits/CreditPurchases/AutoTopUp/AutoTopUpClient";
import LowBalanceEmailAlertsClient from "@/components/(gateway)/credits/LowBalanceEmailAlertsClient";
import { getStripe } from "@/lib/stripe";
import {
	GATEWAY_TIERS,
	computeTierInfo,
} from "@/components/(gateway)/credits/tiers";
import { TierBadge } from "@/components/(gateway)/credits/TierBadge";
import { Metadata } from "next";
import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata: Metadata = {
	title: "Credits - Settings",
};

function money(amount: number, currency: string) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
		maximumFractionDigits: 0,
	}).format(amount);
}

function formatDate(dateLike: string | Date) {
	const date = typeof dateLike === "string" ? new Date(dateLike) : dateLike;
	if (!Number.isFinite(date.getTime())) return "";
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(date);
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
	const searchParams = await props.searchParams;
	const params = new URLSearchParams();
	if (searchParams) {
		for (const [k, v] of Object.entries(searchParams)) {
			if (Array.isArray(v)) v.forEach((val) => params.append(k, val));
			else if (typeof v === "string") params.append(k, v);
		}
	}
	const queryString = params.toString();

	// defaults
	let initialBalance = 0;
	let wallet: any = null;
	let stripeInfo: any = null;
	let lowBalanceEmailEnabled = false;
	let lowBalanceEmailThresholdUsd: number | null = null;
	let billingMode: "wallet" | "invoice" = "wallet";
	let teamTier: "basic" | "enterprise" = "basic";
	let invoiceOnboardingStatus: "none" | "pre_invoice" | "completed" = "none";
	let invoiceProfileEnabled = false;
	let invoiceBillingDay = 1;
	let nextInvoiceAmount = 0;
	let nextInvoiceDateIso: string | null = null;
	let tierStats: {
		lastMonth: number;
		mtd: number;
	} = { lastMonth: 0, mtd: 0 };

	const teamId = await getTeamIdFromCookie();
	const supabase = await createClient();

	// Fetch wallet (best-effort)
	let w: any = null;
	try {
		const { data, error: walletErr } = await supabase
			.from("wallets")
			.select(
				"team_id,stripe_customer_id,balance_nanos,auto_top_up_enabled,low_balance_threshold,auto_top_up_amount,auto_top_up_account_id"
			)
			.eq("team_id", teamId)
			.maybeSingle();

		if (walletErr) {
			console.log("[ERROR] fetching wallet:", String(walletErr));
		} else {
			w = data ?? null;
			wallet = w;
			try {
				const nanos = Number(w?.balance_nanos ?? 0);
				initialBalance = nanos / 1_000_000_000;
			} catch {
				initialBalance = 0;
			}
		}
	} catch (outerErr) {
		console.log("[ERROR] unexpected wallet fetch error:", String(outerErr));
	}

	// Team settings (best-effort)
	try {
		const { data: settingsRow, error: settingsErr } = await supabase
			.from("team_settings")
			.select("low_balance_email_enabled,low_balance_email_threshold_nanos")
			.eq("team_id", teamId)
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

	// Team billing mode (best-effort)
	try {
		const { data: teamRow, error: teamErr } = await supabase
			.from("teams")
			.select("billing_mode,tier,invoice_onboarding_status")
			.eq("id", teamId)
			.maybeSingle();

		if (teamErr) {
			console.log("[WARN] fetching team billing mode:", String(teamErr));
		} else {
			billingMode = teamRow?.billing_mode === "invoice" ? "invoice" : "wallet";
			teamTier = String(teamRow?.tier ?? "basic").toLowerCase() === "enterprise"
				? "enterprise"
				: "basic";
			const status = String(teamRow?.invoice_onboarding_status ?? "none").toLowerCase();
			invoiceOnboardingStatus =
				status === "pre_invoice"
					? "pre_invoice"
					: status === "completed"
						? "completed"
						: "none";
		}
	} catch (outerErr) {
		console.log("[WARN] unexpected billing mode fetch error:", String(outerErr));
	}

	// Invoice profile (best-effort)
	try {
		const { data: invoiceProfileRow, error: invoiceProfileErr } = await supabase
			.from("team_invoice_profiles")
			.select("enabled,billing_day")
			.eq("team_id", teamId)
			.maybeSingle();

		if (invoiceProfileErr) {
			console.log("[WARN] fetching invoice profile:", String(invoiceProfileErr));
		} else {
			invoiceProfileEnabled = Boolean(invoiceProfileRow?.enabled);
			if (Number.isFinite(Number(invoiceProfileRow?.billing_day))) {
				invoiceBillingDay = Number(invoiceProfileRow?.billing_day);
			}
		}
	} catch (outerErr) {
		console.log("[WARN] unexpected invoice profile fetch error:", String(outerErr));
	}

	// Stripe: customer + payment methods
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
				console.log(
					"[WARN] stripe.customer.retrieve failed:",
					String(custErr)
				);
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
					(customerInfo as any)?.invoice_settings
						?.default_payment_method ?? null;
			} catch (pmErr) {
				console.log(
					"[WARN] stripe.paymentMethods.list failed:",
					String(pmErr)
				);
				hasPaymentMethod = Boolean(
					(customerInfo as any)?.invoice_settings
						?.default_payment_method
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

	// Latest success timestamp (for the checkout banner's payment_attempt flow)
	let latestPaymentSuccessAt: string | null = null;
	try {
		const { data: latestRow, error: latestErr } = await supabase
			.from("credit_ledger")
			.select("event_time,status,amount_nanos")
			.eq("team_id", teamId)
			.in("status", ["paid", "succeeded"])
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

	// Tier stats (best-effort)
	if (teamId) {
		try {
			const [{ data: prev, error: e1 }, { data: mtd, error: e2 }] =
				await Promise.all([
					supabase
						.rpc("monthly_spend_prev_cents", {
							p_team: teamId,
						})
						.single(),
					supabase
						.rpc("mtd_spend_cents", {
							p_team: teamId,
						})
						.single(),
				]);

			if (e1)
				console.log(
					"[WARN] prev month spend (tier badge):",
					String(e1)
				);
			if (e2) console.log("[WARN] MTD spend (tier badge):", String(e2));

			tierStats = {
                                lastMonth: Number(prev ?? 0) / 1_000_000_000,
                                mtd: Number(mtd ?? 0) / 1_000_000_000,
			};
		} catch (err) {
			console.log("[ERROR] tier stats fetch:", String(err));
			tierStats = { lastMonth: 0, mtd: 0 };
		}
	}

	const tiers = GATEWAY_TIERS;
	const {
		current,
		next,
		topTier,
		savingVsBase,
		projectedSavings,
		remainingToNext,
		nextDiscountDelta,
	} = computeTierInfo({
		lastMonth: tierStats.lastMonth,
		mtd: tierStats.mtd,
		currentTierKey: teamTier,
		tiers,
	});

	const currency = "USD";
	const badgeSavingsFormatted =
		projectedSavings > 0 ? money(projectedSavings, currency) : null;
	const badgeRemainingFormatted =
		!topTier && remainingToNext > 0
			? money(remainingToNext, currency)
			: null;
	const isEnterpriseInvoiceMode =
		billingMode === "invoice" && teamTier === "enterprise";
	const needsInvoiceOnboarding = isEnterpriseInvoiceMode && !invoiceProfileEnabled;

	if (isEnterpriseInvoiceMode) {
		// Fallback to MTD usage if invoice preview RPC is unavailable.
		nextInvoiceAmount = Math.max(0, tierStats.mtd);
		try {
			const { data: previewRows, error: previewErr } = await supabase.rpc(
				"get_team_invoice_preview",
				{ p_team_id: teamId }
			);

			if (previewErr) {
				console.log("[WARN] fetching invoice preview:", String(previewErr));
			} else {
				const row = Array.isArray(previewRows)
					? previewRows[0]
					: previewRows;
				const amountNanos = Number(row?.next_invoice_amount_nanos ?? 0);
				nextInvoiceAmount =
					Number.isFinite(amountNanos) && amountNanos > 0
						? amountNanos / 1_000_000_000
						: 0;
				invoiceBillingDay = Number(row?.billing_day ?? 1) || 1;
				nextInvoiceDateIso =
					typeof row?.cycle_end === "string"
						? row.cycle_end
						: nextInvoiceDateIso;
			}
		} catch (err) {
			console.log("[WARN] unexpected invoice preview fetch error:", String(err));
		}
	}

	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Credits"
				actions={
					<TierBadge
						href="/settings/tiers"
						tierName={current.name}
						feePct={current.feePct}
						savingsPoints={savingVsBase}
						savingsAmountFormatted={badgeSavingsFormatted}
						nextTierName={next?.name ?? null}
						nextFeePct={next?.feePct ?? null}
						nextDiscountDelta={nextDiscountDelta}
						remainingFormatted={badgeRemainingFormatted}
						topTier={topTier}
					/>
				}
			/>

			<Banner
				queryString={queryString ?? null}
				latestPaymentSuccessAt={latestPaymentSuccessAt}
			/>

			<CurrentCredits
				balance={isEnterpriseInvoiceMode ? nextInvoiceAmount : initialBalance}
				title={isEnterpriseInvoiceMode ? "Next Invoice Amount" : "Current Balance"}
				subtitle={
					isEnterpriseInvoiceMode
						? nextInvoiceDateIso
							? `Current cycle closes on ${formatDate(nextInvoiceDateIso)}`
							: `Current cycle closes on billing day ${invoiceBillingDay}`
						: null
				}
				refreshAriaLabel={
					isEnterpriseInvoiceMode
						? "refresh invoice amount"
						: "refresh balance"
				}
			/>

			{needsInvoiceOnboarding ? (
				<Card className="border-amber-300/70 bg-amber-50/50 dark:border-amber-800/80 dark:bg-amber-950/20">
					<CardHeader className="pb-2">
						<CardTitle className="text-base">Complete invoice setup</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-wrap items-center justify-between gap-3">
						<p className="text-sm text-muted-foreground">
							This team is in invoice mode, but billing day and terms are not fully configured yet.
						</p>
						<Button asChild size="sm">
							<Link href="/settings/credits/onboarding">Finish setup</Link>
						</Button>
					</CardContent>
				</Card>
			) : null}

			<div className="space-y-6">
				{isEnterpriseInvoiceMode ? (
					<Card>
						<CardHeader className="pb-2">
							<CardTitle>Enterprise Invoicing</CardTitle>
						</CardHeader>
						<CardContent className="space-y-2 text-sm text-muted-foreground">
							<p>
								Post-usage invoicing is enabled for this team. Wallet
								top-ups and auto top-up are not used in invoice mode.
							</p>
							<p>
								Billing day: <span className="font-medium text-foreground">{invoiceBillingDay}</span>
							</p>
							{nextInvoiceDateIso ? (
								<p>
									Next invoice date:{" "}
									<span className="font-medium text-foreground">
										{formatDate(nextInvoiceDateIso)}
									</span>
								</p>
							) : null}
						</CardContent>
					</Card>
				) : (
					<>
						<Card>
							<CardContent className="p-0">
								<div className="grid grid-cols-1 md:grid-cols-2">
									<div className="p-6">
										<BuyCreditsClient
											wallet={wallet}
											stripeInfo={stripeInfo}
											embedded
											invoiceInviteStatus={invoiceOnboardingStatus}
											tierInfo={{
												current,
												next,
												topTier,
												savingVsBase,
												projectedSavings,
												remainingToNext,
												nextDiscountDelta,
											}}
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
					</>
				)}
			</div>
		</div>
	);
}
