import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getStripe } from "@/lib/stripe";
import {
	chargeConfirmedCreditTopup,
	decideCreditTopup,
	loadCreditTopup,
	resolveTopupPurchaseCountry,
} from "@/lib/server/creditTopups";

const NO_STORE = { "Cache-Control": "no-store" };

// POST only: email link scanners issue GETs, which must never confirm a charge.
async function handlePost(req: Request, params: { id: string }) {
	const { id } = params;
	// JSON only, so a cross-site form post cannot reach the handler without a CORS preflight.
	if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
		return Response.json({ error: "unsupported_media_type" }, { status: 415, headers: NO_STORE });
	}
	const supabase = await createClient();
	const { data: { user } } = await supabase.auth.getUser();
	if (!user?.id) return Response.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });

	const body = await req.json().catch(() => ({})) as { token?: unknown; country_code?: unknown };
	const token = typeof body.token === "string" ? body.token.trim() : "";
	const admin = createAdminClient();

	try {
		const row = await loadCreditTopup(admin, id);
		if (!row || !token) return Response.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
		if (row.flow !== "saved_card") return Response.json({ error: "use_checkout" }, { status: 400, headers: NO_STORE });

		// Ask for the country before confirming, so a missing one does not use up the request.
		const countryCode = await resolveTopupPurchaseCountry(admin, user.id, body.country_code);
		if (!countryCode) return Response.json({ error: "country_required" }, { status: 400, headers: NO_STORE });

		const decision = await decideCreditTopup({ db: admin, id, token, userId: user.id, decision: "confirm" });
		if (decision.ok === false) return Response.json({ error: decision.error }, { status: decision.httpStatus, headers: NO_STORE });
		if (decision.status !== "confirmed") {
			return Response.json({ error: "not_pending", status: decision.status, reason: decision.reason }, { status: 409, headers: NO_STORE });
		}

		const confirmed = await loadCreditTopup(admin, id);
		if (!confirmed) throw new Error("credit top-up request disappeared");
		const payment = await chargeConfirmedCreditTopup({ db: admin, stripe: getStripe(), row: confirmed, countryCode });
		return Response.json({ status: "confirmed", payment }, { headers: NO_STORE });
	} catch (error) {
		// eslint-disable-next-line no-console
		console.error("[credit-topups] confirm failed", { id, error: error instanceof Error ? error.message : String(error) });
		return Response.json({ error: "confirm_failed" }, { status: 500, headers: NO_STORE });
	}
}

export const Route = createFileRoute("/api/credits/topups/$id/confirm/")({
	server: {
		handlers: {
			POST: ({ request, params }) => handlePost(request, params),
		},
	},
});
