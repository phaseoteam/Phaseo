import { createFileRoute } from "@tanstack/react-router";

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
	customerSharedWithOtherWorkspaces: boolean,
): boolean {
	// An invoice that names a workspace belongs to that workspace only.
	const metadataWorkspaceId = invoice.metadata?.workspace_id;
	if (typeof metadataWorkspaceId === "string" && metadataWorkspaceId.trim()) {
		return metadataWorkspaceId.trim() === workspaceId;
	}
	// Without metadata, fall back to the customer only when no other workspace uses it.
	const customer = invoice.customer;
	const customerId = typeof customer === "string" ? customer : customer?.id ?? "";
	return Boolean(workspaceCustomerId) && customerId === workspaceCustomerId && !customerSharedWithOtherWorkspaces;
}

function isStripeResourceMissing(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const candidate = error as { code?: string; raw?: { code?: string } };
	return candidate.code === "resource_missing" || candidate.raw?.code === "resource_missing";
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
		let customerSharedWithOtherWorkspaces = false;
		if (workspaceCustomerId) {
			const { count, error: sharedErr } = await admin
				.from("wallets")
				.select("workspace_id", { count: "exact", head: true })
				.eq("stripe_customer_id", workspaceCustomerId)
				.neq("workspace_id", workspaceId);
			if (sharedErr) throw sharedErr;
			customerSharedWithOtherWorkspaces = (count ?? 0) > 0;
		}

		const stripe = getStripe();
		let invoice: Stripe.Invoice;
		try {
			invoice = await stripe.invoices.retrieve(stripeInvoiceId);
		} catch (err) {
			if (isStripeResourceMissing(err)) {
				return Response.json({ error: "Invoice not found" }, { status: 404 });
			}
			throw err;
		}
		if (!invoiceBelongsToWorkspace(invoice, workspaceId, workspaceCustomerId, customerSharedWithOtherWorkspaces)) {
			return Response.json({ error: "Invoice not found" }, { status: 404 });
		}

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
