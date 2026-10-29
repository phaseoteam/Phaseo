import { NextRequest, NextResponse } from "next/server";
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
		if (!row || !token) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
		if (row.flow !== "saved_card") return NextResponse.json({ error: "use_checkout" }, { status: 400, headers: NO_STORE });

		// Ask for the country before confirming, so a missing one does not use up the request.
		const countryCode = await resolveTopupPurchaseCountry(admin, user.id, body.country_code);
		if (!countryCode) return NextResponse.json({ error: "country_required" }, { status: 400, headers: NO_STORE });

		const decision = await decideCreditTopup({ db: admin, id, token, userId: user.id, decision: "confirm" });
		if (decision.ok === false) return NextResponse.json({ error: decision.error }, { status: decision.httpStatus, headers: NO_STORE });
		if (decision.status !== "confirmed") {
			return NextResponse.json({ error: "not_pending", status: decision.status, reason: decision.reason }, { status: 409, headers: NO_STORE });
		}

		const confirmed = await loadCreditTopup(admin, id);
		if (!confirmed) throw new Error("credit top-up request disappeared");
		const payment = await chargeConfirmedCreditTopup({ db: admin, stripe: getStripe(), row: confirmed, countryCode });
		return NextResponse.json({ status: "confirmed", payment }, { headers: NO_STORE });
	} catch (error) {
		// eslint-disable-next-line no-console
		console.error("[credit-topups] confirm failed", { id, error: error instanceof Error ? error.message : String(error) });
		return NextResponse.json({ error: "confirm_failed" }, { status: 500, headers: NO_STORE });
	}
}
