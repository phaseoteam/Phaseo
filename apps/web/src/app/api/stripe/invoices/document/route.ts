import { NextRequest, NextResponse } from "next/server";

import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

function parseStripeInvoiceId(body: any): string | null {
	const raw = body?.stripeInvoiceId ?? body?.stripe_invoice_id ?? null;
	if (!raw) return null;
	const id = String(raw).trim();
	return id.startsWith("in_") ? id : null;
}

function invoiceBelongsToWorkspace(
	invoice: Pick<Stripe.Invoice, "customer" | "metadata">,
	workspaceId: string,
	workspaceCustomerId: string,
): boolean {
	const customer = invoice.customer;
	const customerId = typeof customer === "string" ? customer : customer?.id ?? "";
	if (workspaceCustomerId && customerId === workspaceCustomerId) return true;
	const metadataWorkspaceId = invoice.metadata?.workspace_id;
	return typeof metadataWorkspaceId === "string" && metadataWorkspaceId.trim() === workspaceId;
}

function isStripeResourceMissing(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const candidate = error as { code?: string; raw?: { code?: string } };
	return candidate.code === "resource_missing" || candidate.raw?.code === "resource_missing";
}

export async function POST(req: NextRequest) {
	try {
		const body = await req.json().catch(() => ({}));
		const stripeInvoiceId = parseStripeInvoiceId(body);
		if (!stripeInvoiceId) {
			return NextResponse.json({ error: "Invalid stripe invoice id" }, { status: 400 });
		}

		const supabase = await createClient();
		const {
			data: { user },
			error: userErr,
		} = await supabase.auth.getUser();
		if (userErr || !user?.id) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const workspaceId = await getWorkspaceIdFromCookie();
		if (!workspaceId) {
			return NextResponse.json({ error: "Missing active team" }, { status: 400 });
		}

		const { data: membership, error: membershipErr } = await supabase
			.from("workspace_members")
			.select("role")
			.eq("workspace_id", workspaceId)
			.eq("user_id", user.id)
			.maybeSingle();
		if (membershipErr || !membership) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
		}

		// Stripe is the source of truth for invoices. Check the invoice belongs to
		// the active workspace's Stripe customer before handing out its document.
		const admin = createAdminClient();
		const { data: wallet, error: walletErr } = await admin
			.from("wallets")
			.select("stripe_customer_id")
			.eq("workspace_id", workspaceId)
			.maybeSingle();
		if (walletErr) throw walletErr;
		const workspaceCustomerId =
			typeof wallet?.stripe_customer_id === "string" ? wallet.stripe_customer_id.trim() : "";

		const stripe = getStripe();
		let invoice: Stripe.Invoice;
		try {
			invoice = await stripe.invoices.retrieve(stripeInvoiceId);
		} catch (err) {
			if (isStripeResourceMissing(err)) {
				return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
			}
			throw err;
		}
		if (!invoiceBelongsToWorkspace(invoice, workspaceId, workspaceCustomerId)) {
			return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
		}

		const invoiceUrl = invoice.hosted_invoice_url ?? invoice.invoice_pdf ?? null;
		if (!invoiceUrl) {
			return NextResponse.json({ error: "Invoice document unavailable" }, { status: 404 });
		}

		return NextResponse.json({ ok: true, type: "invoice", url: invoiceUrl });
	} catch (err: any) {
		return NextResponse.json(
			{ error: err?.message ?? "invoice_document_lookup_failed" },
			{ status: 500 },
		);
	}
}
