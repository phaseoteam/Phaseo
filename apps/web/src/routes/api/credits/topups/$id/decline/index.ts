import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { creditTopupTokenMatches, decideCreditTopup, loadCreditTopup, reviewerAccess } from "@/lib/server/creditTopups";

const NO_STORE = { "Cache-Control": "no-store" };

// POST only, like confirm: following the emailed link never changes a request.
async function handlePost(req: Request, params: { id: string }) {
	const { id } = params;
	// JSON only, so a cross-site form post cannot reach the handler without a CORS preflight.
	if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
		return Response.json({ error: "unsupported_media_type" }, { status: 415, headers: NO_STORE });
	}
	const supabase = await createClient();
	const { data: { user } } = await supabase.auth.getUser();
	if (!user?.id) return Response.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });

	const body = await req.json().catch(() => ({})) as { token?: unknown };
	const token = typeof body.token === "string" ? body.token.trim() : "";

	try {
		const admin = createAdminClient();
		// A first top-up may already have a payable Checkout Session. Expire it before declining,
		// so nobody can pay a declined request; if it was already paid, refuse to decline. The
		// decline itself only commits for the session expired here (the database refuses it if
		// checkout attached another in the meantime); then expire that one and try again.
		for (let attempt = 0; attempt < 3; attempt += 1) {
			const row = await loadCreditTopup(admin, id);
			const sessionId = row?.status === "pending" ? row.stripe_checkout_session_id : null;
			if (row && sessionId) {
				if (!(await creditTopupTokenMatches(admin, id, token))) return Response.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
				if (!(await reviewerAccess(admin, row.workspace_id, user.id)).canDecide) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
				const stripe = getStripe();
				const session = await stripe.checkout.sessions.retrieve(sessionId);
				if (session.status === "open") {
					try {
						await stripe.checkout.sessions.expire(sessionId);
					} catch {
						// The payer finished checkout in the meantime.
						return Response.json({ error: "checkout_completed" }, { status: 409, headers: NO_STORE });
					}
				} else if (session.status === "complete") {
					return Response.json({ error: "checkout_completed" }, { status: 409, headers: NO_STORE });
				}
			}
			const decision = await decideCreditTopup({ db: admin, id, token, userId: user.id, decision: "decline", expectedCheckoutSessionId: sessionId });
			if (decision.ok === false && decision.error === "checkout_changed") continue;
			if (decision.ok === false) return Response.json({ error: decision.error }, { status: decision.httpStatus, headers: NO_STORE });
			if (decision.status !== "declined") {
				return Response.json({ error: "not_pending", status: decision.status, reason: decision.reason }, { status: 409, headers: NO_STORE });
			}
			return Response.json({ status: "declined", reason: decision.reason }, { headers: NO_STORE });
		}
		return Response.json({ error: "checkout_changed" }, { status: 409, headers: NO_STORE });
	} catch (error) {
		// eslint-disable-next-line no-console
		console.error("[credit-topups] decline failed", { id, error: error instanceof Error ? error.message : String(error) });
		return Response.json({ error: "decline_failed" }, { status: 500, headers: NO_STORE });
	}
}

export const Route = createFileRoute("/api/credits/topups/$id/decline/")({
	server: {
		handlers: {
			POST: ({ request, params }) => handlePost(request, params),
		},
	},
});
