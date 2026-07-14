import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

export type SettingsCreditsTransactionsInitialData = {
	billingMode: "wallet" | "invoice";
	invoices: any[];
	isEnterpriseInvoiceMode: boolean;
	stripeCustomerId: string | null;
	teamTier: string;
	transactions: any[];
	workspaceId: string | null;
};

export async function GET() {
	const supabase = await createClient();
	const workspaceId = await getWorkspaceIdFromCookie();
	let teamTier = "basic";
	let billingMode: "wallet" | "invoice" = "wallet";

	if (!workspaceId) {
		return NextResponse.json({
			billingMode,
			invoices: [],
			isEnterpriseInvoiceMode: false,
			stripeCustomerId: null,
			teamTier,
			transactions: [],
			workspaceId: null,
		} satisfies SettingsCreditsTransactionsInitialData);
	}

	try {
		const { data: teamRow, error: teamErr } = await supabase
			.from("workspaces")
			.select("tier,billing_mode")
			.eq("id", workspaceId)
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
				.from("workspace_invoices")
				.select(
					"id,period_start,period_end,amount_nanos,currency,status,stripe_invoice_id,stripe_invoice_number,due_at,issued_at,paid_at,created_at,updated_at",
				)
				.eq("workspace_id", workspaceId)
				.order("period_end", { ascending: false })
				.limit(250);

			if (!rowsErr && rows) {
				invoices = (rows as any[]).map((row) => ({
					id: String(row.id),
					period_start: String(row.period_start),
					period_end: String(row.period_end),
					amount_nanos: Number(row.amount_nanos ?? 0),
					currency: row.currency ?? "USD",
					status: String(row.status ?? "draft"),
					stripe_invoice_id: row.stripe_invoice_id ?? null,
					stripe_invoice_number: row.stripe_invoice_number ?? null,
					due_at: row.due_at ?? null,
					issued_at: row.issued_at ?? null,
					paid_at: row.paid_at ?? null,
					created_at: row.created_at ?? null,
					updated_at: row.updated_at ?? null,
				}));
			}
		} catch {
			invoices = [];
		}

		return NextResponse.json({
			billingMode,
			invoices,
			isEnterpriseInvoiceMode,
			stripeCustomerId: null,
			teamTier,
			transactions: [],
			workspaceId,
		} satisfies SettingsCreditsTransactionsInitialData);
	}

	let stripeCustomerId: string | null = null;
	let transactions: any[] = [];

	try {
		const { data: walletRow, error: walletErr } = await supabase
			.from("wallets")
			.select("stripe_customer_id")
			.eq("workspace_id", workspaceId)
			.maybeSingle();
		if (!walletErr) {
			stripeCustomerId = walletRow?.stripe_customer_id ?? null;
		}
	} catch {
		stripeCustomerId = null;
	}

	try {
		const { data: tx, error: txErr } = await supabase
			.from("credit_ledger")
			.select(
				"id,event_time,kind,amount_nanos,before_balance_nanos,after_balance_nanos,status,ref_type,ref_id,source_ref_type,source_ref_id,created_at",
			)
			.eq("workspace_id", workspaceId)
			.order("event_time", { ascending: false })
			.limit(250);

		if (!txErr && tx) {
			transactions = (tx as any[]).map((row) => ({
				id: row.id,
				amount_nanos: Number(row.amount_nanos ?? 0),
				description:
					row.kind ??
					(row.ref_type ? `${row.ref_type}:${row.ref_id}` : "Purchase"),
				created_at: row.event_time ?? row.created_at ?? null,
				status: row.status ?? null,
				kind: row.kind ?? null,
				ref_type: row.ref_type ?? null,
				ref_id: row.ref_id ?? null,
				source_ref_type: row.source_ref_type ?? null,
				source_ref_id: row.source_ref_id ?? null,
				before_balance_nanos:
					row.before_balance_nanos != null
						? Number(row.before_balance_nanos)
						: null,
				after_balance_nanos:
					row.after_balance_nanos != null
						? Number(row.after_balance_nanos)
						: null,
			}));
		}
	} catch {
		transactions = [];
	}

	return NextResponse.json({
		billingMode,
		invoices: [],
		isEnterpriseInvoiceMode,
		stripeCustomerId,
		teamTier,
		transactions,
		workspaceId,
	} satisfies SettingsCreditsTransactionsInitialData);
}
