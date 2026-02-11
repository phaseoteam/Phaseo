import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import CurrentCredits from "@/components/(gateway)/credits/CurrentCredits";
import RecentTransactions from "@/components/(gateway)/credits/RecentTransactions";
import Banner from "@/components/(gateway)/credits/Banner";
import BuyCreditsClient from "@/components/(gateway)/credits/CreditPurchases/TopUp/BuyCreditsClient";
import AutoTopUpClient from "@/components/(gateway)/credits/CreditPurchases/AutoTopUp/AutoTopUpClient";
import { getStripe } from "@/lib/stripe";
import {
	GATEWAY_TIERS,
	computeTierInfo,
} from "@/components/(gateway)/credits/tiers";
import { TierBadge } from "@/components/(gateway)/credits/TierBadge";
import { Metadata } from "next";
import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";

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
	let recentTransactions: any[] = [];
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
                                initialBalance = Number((nanos / 1_000_000_000).toFixed(5));
			} catch {
				initialBalance = 0;
			}
		}
	} catch (outerErr) {
		console.log("[ERROR] unexpected wallet fetch error:", String(outerErr));
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

	// Recent transactions (best-effort)
	try {
		const { data: tx, error: txErr } = await supabase
			.from("credit_ledger")
			.select(
				"id,event_time,kind,amount_nanos,before_balance_nanos,after_balance_nanos,status,ref_type,ref_id,source_ref_type,source_ref_id,created_at"
			)
			.eq("team_id", teamId)
			.order("event_time", { ascending: false })
			.limit(100);

		if (txErr) {
			console.log("[ERROR] fetching recent transactions:", String(txErr));
		} else if (tx) {
			recentTransactions = (tx as any[]).map((r) => ({
				id: r.id,
				amount_nanos: Number(r.amount_nanos ?? 0),
				description:
					r.kind ??
					(r.ref_type ? `${r.ref_type}:${r.ref_id}` : "Purchase"),
				created_at: r.event_time ?? r.created_at ?? null,
				status: r.status ?? null,
				kind: r.kind ?? null,
				ref_type: r.ref_type ?? null,
				ref_id: r.ref_id ?? null,
				source_ref_type: r.source_ref_type ?? null,
				source_ref_id: r.source_ref_id ?? null,
				before_balance_nanos: r.before_balance ?? null,
				after_balance_nanos: r.after_balance ?? null,
			}));
		}
	} catch (e) {
		console.log("[ERROR] unexpected recent transactions error:", String(e));
	}

	const latestPaymentSuccessAt = (() => {
		let latest: number | null = null;
		for (const tx of recentTransactions) {
			const status = String(tx.status ?? "").toLowerCase();
			if (status !== "paid" && status !== "succeeded") continue;
			if ((tx.amount_nanos ?? 0) <= 0) continue;
			const ts = tx.created_at ? new Date(tx.created_at).getTime() : NaN;
			if (!Number.isFinite(ts)) continue;
			if (latest === null || ts > latest) latest = ts;
		}
		return latest ? new Date(latest).toISOString() : null;
	})();

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
		tiers,
	});

	const currency = "USD";
	const badgeSavingsFormatted =
		projectedSavings > 0 ? money(projectedSavings, currency) : null;
	const badgeRemainingFormatted =
		!topTier && remainingToNext > 0
			? money(remainingToNext, currency)
			: null;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between gap-3">
				<h1 className="text-2xl font-bold">Credits</h1>
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
			</div>

			<Banner
				queryString={queryString ?? null}
				latestPaymentSuccessAt={latestPaymentSuccessAt}
			/>

			<CurrentCredits balance={initialBalance} />

			<div className="space-y-6">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<BuyCreditsClient
						wallet={wallet}
						stripeInfo={stripeInfo}
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
					<AutoTopUpClient wallet={wallet} stripeInfo={stripeInfo} />
				</div>
			</div>

			<RecentTransactions
				transactions={recentTransactions}
				stripeCustomerId={
					wallet?.stripe_customer_id ?? stripeInfo?.customer?.id
				}
			/>
		</div>
	);
}
