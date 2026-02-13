import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import RecentTransactions from "@/components/(gateway)/credits/RecentTransactions";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Transactions - Settings",
};

export default function TransactionsPage() {
	return (
		<div className="space-y-6">
			<Suspense fallback={<SettingsSectionFallback />}>
				<TransactionsContent />
			</Suspense>
		</div>
	);
}

async function TransactionsContent() {
	const supabase = await createClient();
	const teamId = await getTeamIdFromCookie();

	let stripeCustomerId: string | null = null;
	let transactions: any[] = [];

	// Wallet: stripe customer id for portal links (best-effort)
	try {
		const { data: walletRow, error: walletErr } = await supabase
			.from("wallets")
			.select("stripe_customer_id")
			.eq("team_id", teamId)
			.maybeSingle();
		if (!walletErr) {
			stripeCustomerId = walletRow?.stripe_customer_id ?? null;
		}
	} catch {
		stripeCustomerId = null;
	}

	// Transactions (best-effort)
	try {
		const { data: tx, error: txErr } = await supabase
			.from("credit_ledger")
			.select(
				"id,event_time,kind,amount_nanos,before_balance_nanos,after_balance_nanos,status,ref_type,ref_id,source_ref_type,source_ref_id,created_at",
			)
			.eq("team_id", teamId)
			.order("event_time", { ascending: false })
			.limit(250);

		if (!txErr && tx) {
			transactions = (tx as any[]).map((r) => ({
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
	} catch {
		transactions = [];
	}

	return (
		<div className="space-y-6">
			<SettingsPageHeader title="Transactions" />
			<RecentTransactions
				transactions={transactions}
				stripeCustomerId={stripeCustomerId}
			/>
		</div>
	);
}

