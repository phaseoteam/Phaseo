import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import RecentTransactions from "@/components/(gateway)/credits/RecentTransactions";
import EnterpriseInvoices from "@/components/(gateway)/credits/EnterpriseInvoices";
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
	let teamTier = "basic";
	let billingMode: "wallet" | "invoice" = "wallet";

	try {
		const { data: teamRow, error: teamErr } = await supabase
			.from("teams")
			.select("tier,billing_mode")
			.eq("id", teamId)
			.maybeSingle();

		if (!teamErr && teamRow) {
			teamTier = String(teamRow.tier ?? "basic").toLowerCase();
			billingMode =
				String(teamRow.billing_mode ?? "wallet").toLowerCase() === "invoice"
					? "invoice"
					: "wallet";
		}
	} catch {
		teamTier = "basic";
		billingMode = "wallet";
	}

	const isEnterpriseInvoiceMode =
		teamTier === "enterprise" && billingMode === "invoice";

	if (isEnterpriseInvoiceMode) {
		let invoices: any[] = [];
		try {
			const { data: rows, error: rowsErr } = await supabase
				.from("team_invoices")
				.select(
					"id,period_start,period_end,amount_nanos,currency,status,stripe_invoice_id,stripe_invoice_number,due_at,issued_at,paid_at,created_at,updated_at",
				)
				.eq("team_id", teamId)
				.order("period_end", { ascending: false })
				.limit(250);

			if (!rowsErr && rows) {
				invoices = (rows as any[]).map((r) => ({
					id: String(r.id),
					period_start: String(r.period_start),
					period_end: String(r.period_end),
					amount_nanos: Number(r.amount_nanos ?? 0),
					currency: r.currency ?? "USD",
					status: String(r.status ?? "draft"),
					stripe_invoice_id: r.stripe_invoice_id ?? null,
					stripe_invoice_number: r.stripe_invoice_number ?? null,
					due_at: r.due_at ?? null,
					issued_at: r.issued_at ?? null,
					paid_at: r.paid_at ?? null,
					created_at: r.created_at ?? null,
					updated_at: r.updated_at ?? null,
				}));
			}
		} catch {
			invoices = [];
		}

		return (
			<div className="space-y-6">
				<SettingsPageHeader
					title="Invoices"
					description="Enterprise billing records and invoice documents."
				/>
				<EnterpriseInvoices invoices={invoices} />
			</div>
		);
	}

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

