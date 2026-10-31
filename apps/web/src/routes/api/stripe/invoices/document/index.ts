import { createFileRoute } from "@tanstack/react-router";

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

async function handlePost(req: Request) {
	try {
		const body = await req.json().catch(() => ({}));
		const stripeInvoiceId = parseStripeInvoiceId(body);
		if (!stripeInvoiceId) {
			return Response.json({ error: "Invalid stripe invoice id" }, { status: 400 });
		}

		const supabase = await createClient();
		const {
			data: { user },
			error: userErr,
		} = await supabase.auth.getUser();
		if (userErr || !user?.id) {
			return Response.json({ error: "Unauthorized" }, { status: 401 });
		}

		const workspaceId = await getWorkspaceIdFromCookie();
		if (!workspaceId) {
			return Response.json({ error: "Missing active team" }, { status: 400 });
		}

		const { data: membership, error: membershipErr } = await supabase
			.from("workspace_members")
			.select("role")
			.eq("workspace_id", workspaceId)
			.eq("user_id", user.id)
			.maybeSingle();
		if (membershipErr || !membership) {
			return Response.json({ error: "Unauthorized" }, { status: 403 });
		}

		const admin = createAdminClient();
		const { data: invoiceRow, error: invoiceErr } = await admin
			.from("workspace_invoices")
			.select("workspace_id,stripe_invoice_id")
			.eq("workspace_id", workspaceId)
			.eq("stripe_invoice_id", stripeInvoiceId)
			.maybeSingle();

		if (invoiceErr) throw invoiceErr;
		if (!invoiceRow) {
			return Response.json({ error: "Invoice not found" }, { status: 404 });
		}

		const stripe = getStripe();
		const invoice = await stripe.invoices.retrieve(stripeInvoiceId);
		const invoiceUrl = invoice.hosted_invoice_url ?? invoice.invoice_pdf ?? null;
		if (!invoiceUrl) {
			return Response.json({ error: "Invoice document unavailable" }, { status: 404 });
		}

		return Response.json({ ok: true, type: "invoice", url: invoiceUrl });
	} catch (err: any) {
		return Response.json(
			{ error: err?.message ?? "invoice_document_lookup_failed" },
			{ status: 500 },
		);
	}
}

export const Route = createFileRoute("/api/stripe/invoices/document/")({
	server: {
		handlers: {
			POST: ({ request }) => handlePost(request),
		},
	},
});
