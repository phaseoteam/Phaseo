import Stripe from "stripe";
import { getBindings, getSupabaseAdmin } from "@/runtime/env";

type DueInvoiceRun = {
	team_id: string;
	stripe_customer_id: string;
	billing_day: number;
	payment_terms_days: number;
	period_start: string;
	period_end: string;
	amount_nanos: number;
};

type InvoiceRunSummary = {
	processed: number;
	issued: number;
	skippedZero: number;
	failed: number;
};

function toBool(value: string | undefined, fallback = false): boolean {
	if (value === undefined) return fallback;
	const normalized = value.trim().toLowerCase();
	if (!normalized) return fallback;
	return ["1", "true", "yes", "on"].includes(normalized);
}

function nanosToCents(nanos: number): number {
	return Math.max(0, Math.round(nanos / 10_000_000));
}

function unixToIso(value: number | null | undefined): string | null {
	if (value == null || !Number.isFinite(value)) return null;
	const ms = Number(value) * 1000;
	return new Date(ms).toISOString();
}

function mapStripeInvoiceStatus(
	status?: Stripe.Invoice.Status | null
): "draft" | "open" | "paid" | "void" | "uncollectible" {
	switch (status) {
		case "open":
			return "open";
		case "paid":
			return "paid";
		case "void":
			return "void";
		case "uncollectible":
			return "uncollectible";
		default:
			return "draft";
	}
}

async function upsertInvoiceRow(args: {
	run: DueInvoiceRun;
	status: "draft" | "open" | "paid" | "void" | "uncollectible";
	stripeInvoiceId?: string | null;
	stripeInvoiceNumber?: string | null;
	dueAt?: string | null;
	issuedAt?: string | null;
	paidAt?: string | null;
}) {
	const supabase = getSupabaseAdmin();
	const nowIso = new Date().toISOString();
	const row = {
		team_id: args.run.team_id,
		period_start: args.run.period_start,
		period_end: args.run.period_end,
		amount_nanos: Math.max(0, Number(args.run.amount_nanos ?? 0)),
		currency: "USD",
		status: args.status,
		stripe_invoice_id: args.stripeInvoiceId ?? null,
		stripe_invoice_number: args.stripeInvoiceNumber ?? null,
		due_at: args.dueAt ?? null,
		issued_at: args.issuedAt ?? null,
		paid_at: args.paidAt ?? null,
		updated_at: nowIso,
	};

	const { error } = await supabase.from("team_invoices").upsert([row], {
		onConflict: "team_id,period_start,period_end",
	});
	if (error) throw error;
}

async function createAndFinalizeStripeInvoice(args: { run: DueInvoiceRun; stripe: Stripe }) {
	const { run, stripe } = args;
	const cents = nanosToCents(Number(run.amount_nanos ?? 0));
	if (cents <= 0) return null;
	const idempotencyBase = `enterprise-invoice:${run.team_id}:${run.period_start}:${run.period_end}`;

	const created = await stripe.invoices.create({
		customer: run.stripe_customer_id,
		collection_method: "send_invoice",
		days_until_due: Math.max(1, Number(run.payment_terms_days ?? 30)),
		auto_advance: false,
		currency: "usd",
		description: `AI Stats usage (${run.period_start} - ${run.period_end})`,
		metadata: {
			source: "ai_stats_enterprise_invoice_job",
			team_id: run.team_id,
			period_start: run.period_start,
			period_end: run.period_end,
			billing_day: String(run.billing_day),
		},
	}, {
		idempotencyKey: `${idempotencyBase}:create`,
	});

	await stripe.invoiceItems.create({
		customer: run.stripe_customer_id,
		invoice: created.id,
		amount: cents,
		currency: "usd",
		description: `AI Stats usage ${run.period_start} to ${run.period_end}`,
		metadata: {
			source: "ai_stats_enterprise_invoice_job",
			team_id: run.team_id,
		},
	}, {
		idempotencyKey: `${idempotencyBase}:item`,
	});

	const finalized = await stripe.invoices.finalizeInvoice(created.id, {
		auto_advance: true,
	}, {
		idempotencyKey: `${idempotencyBase}:finalize`,
	});
	return finalized;
}

export async function runEnterpriseInvoicingJob(args?: {
	scheduledAtIso?: string;
}): Promise<InvoiceRunSummary> {
	const summary: InvoiceRunSummary = {
		processed: 0,
		issued: 0,
		skippedZero: 0,
		failed: 0,
	};

	const bindings = getBindings();
	if (!toBool(bindings.ENTERPRISE_INVOICING_ENABLED, true)) {
		return summary;
	}

	const stripeKey = bindings.STRIPE_SECRET_KEY ?? bindings.TEST_STRIPE_SECRET_KEY;
	if (!stripeKey) {
		console.warn("[enterprise-invoice-job] STRIPE_SECRET_KEY is missing; skipping run");
		return summary;
	}

	const stripe = new Stripe(stripeKey, { apiVersion: "2025-06-30" as any });
	const supabase = getSupabaseAdmin();
	const runAtIso = args?.scheduledAtIso ?? new Date().toISOString();

	const { data, error } = await supabase.rpc("get_due_enterprise_invoice_runs", {
		p_run_at: runAtIso,
	});
	if (error) {
		console.error("[enterprise-invoice-job] failed to fetch due runs:", error.message);
		throw error;
	}

	const dueRuns = (Array.isArray(data) ? data : []) as DueInvoiceRun[];
	for (const run of dueRuns) {
		summary.processed += 1;
		try {
			const amountNanos = Math.max(0, Number(run.amount_nanos ?? 0));
			if (amountNanos <= 0) {
				const nowIso = new Date().toISOString();
				await upsertInvoiceRow({
					run,
					status: "paid",
					issuedAt: nowIso,
					paidAt: nowIso,
				});
				summary.skippedZero += 1;
				continue;
			}

			const finalized = await createAndFinalizeStripeInvoice({ run, stripe });
			if (!finalized) {
				summary.skippedZero += 1;
				continue;
			}

			await upsertInvoiceRow({
				run,
				status: mapStripeInvoiceStatus(finalized.status),
				stripeInvoiceId: finalized.id,
				stripeInvoiceNumber: finalized.number ?? null,
				dueAt: unixToIso(finalized.due_date),
				issuedAt: unixToIso(finalized.status_transitions?.finalized_at),
				paidAt: unixToIso(finalized.status_transitions?.paid_at),
			});

			summary.issued += 1;
		} catch (err: any) {
			summary.failed += 1;
			console.error("[enterprise-invoice-job] failed for team", {
				teamId: run.team_id,
				periodStart: run.period_start,
				periodEnd: run.period_end,
				error: err?.message ?? String(err),
			});
		}
	}

	return summary;
}
