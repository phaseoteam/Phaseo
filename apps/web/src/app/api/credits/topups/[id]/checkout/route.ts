import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { createStripeCheckoutResponse } from "@/lib/server/createStripeCheckoutResponse";
import {
	creditTopupTokenMatches,
	isTopupExpired,
	loadCreditTopup,
	resolveTopupPurchaseCountry,
	reviewerAccess,
} from "@/lib/server/creditTopups";

const NO_STORE = { "Cache-Control": "no-store" };

// First top-up from the API or CLI (no saved card): send an owner or admin to the same Stripe
// Checkout the credits page uses (pay_and_save), tagged with the request. The payment webhook
// credits the wallet and marks the request paid. POST only.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	// JSON only, so a cross-site form post cannot reach the handler without a CORS preflight.
	if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
		return NextResponse.json({ error: "unsupported_media_type" }, { status: 415, headers: NO_STORE });
	}
	const supabase = await createClient();
	const { data: { user } } = await supabase.auth.getUser();
	if (!user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });

	const body = await req.json().catch(() => ({})) as { token?: unknown; country_code?: unknown };
	const token = typeof body.token === "string" ? body.token.trim() : "";
	const admin = createAdminClient();

	try {
		const row = await loadCreditTopup(admin, id);
		if (!row || !(await creditTopupTokenMatches(admin, id, token))) {
			return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
		}
		if (row.flow !== "checkout") return NextResponse.json({ error: "use_confirm" }, { status: 400, headers: NO_STORE });
		if (!(await reviewerAccess(admin, row.workspace_id, user.id)).canDecide) {
			return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
		}
		if (isTopupExpired(row)) {
			await admin.from("credit_topup_requests")
				.update({ status: "expired", reason: "expired", updated_at: new Date().toISOString() })
				.eq("id", row.id)
				.eq("status", "pending");
			return NextResponse.json({ error: "not_pending", status: "expired", reason: "expired" }, { status: 409, headers: NO_STORE });
		}
		if (row.status !== "pending") {
			return NextResponse.json({ error: "not_pending", status: row.status, reason: row.reason }, { status: 409, headers: NO_STORE });
		}

		// Reuse an open session so a second click cannot start a second payment.
		if (row.stripe_checkout_session_id) {
			const session = await getStripe().checkout.sessions.retrieve(row.stripe_checkout_session_id);
			if (session.status === "open" && session.url) return NextResponse.json({ url: session.url }, { headers: NO_STORE });
			if (session.status === "complete") return NextResponse.json({ status: "processing" }, { headers: NO_STORE });
		}

		const countryCode = await resolveTopupPurchaseCountry(admin, user.id, body.country_code);
		if (!countryCode) return NextResponse.json({ error: "country_required" }, { status: 400, headers: NO_STORE });

		return await createStripeCheckoutResponse({
			kind: "pay_and_save",
			amountPence: row.amount_cents,
			countryCode,
			originHeader: req.headers.get("origin"),
			refererHeader: req.headers.get("referer"),
			topUpRequest: {
				id: row.id,
				workspaceId: row.workspace_id,
				onSessionCreated: async (sessionId) => {
					const { error } = await admin.from("credit_topup_requests")
						.update({ stripe_checkout_session_id: sessionId, updated_at: new Date().toISOString() })
						.eq("id", row.id);
					if (error) throw error;
				},
			},
		});
	} catch (error) {
		// eslint-disable-next-line no-console
		console.error("[credit-topups] checkout failed", { id, error: error instanceof Error ? error.message : String(error) });
		return NextResponse.json({ error: "checkout_failed" }, { status: 500, headers: NO_STORE });
	}
}
