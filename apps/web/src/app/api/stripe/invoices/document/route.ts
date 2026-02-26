import { NextRequest, NextResponse } from "next/server";

import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";

function parseStripeInvoiceId(body: any): string | null {
	const raw = body?.stripeInvoiceId ?? body?.stripe_invoice_id ?? null;
	if (!raw) return null;
	const id = String(raw).trim();
	return id.startsWith("in_") ? id : null;
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

		const teamId = await getTeamIdFromCookie();
		if (!teamId) {
			return NextResponse.json({ error: "Missing active team" }, { status: 400 });
		}

		const { data: membership, error: membershipErr } = await supabase
			.from("team_members")
			.select("role")
			.eq("team_id", teamId)
			.eq("user_id", user.id)
			.maybeSingle();
		if (membershipErr || !membership) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
		}

		const admin = createAdminClient();
		const { data: invoiceRow, error: invoiceErr } = await admin
			.from("team_invoices")
			.select("team_id,stripe_invoice_id")
			.eq("team_id", teamId)
			.eq("stripe_invoice_id", stripeInvoiceId)
			.maybeSingle();

		if (invoiceErr) throw invoiceErr;
		if (!invoiceRow) {
			return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
		}

		const stripe = getStripe();
		const invoice = await stripe.invoices.retrieve(stripeInvoiceId);
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
