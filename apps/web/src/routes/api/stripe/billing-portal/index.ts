import { createFileRoute } from "@tanstack/react-router";
import { getStripe } from "@/lib/stripe";
import { requireActiveTeamStripeCustomer } from "@/lib/server/activeTeamStripe";

function resolveSafeReturnUrl(request: Request, candidate: unknown): string {
    const siteBase = process.env.WEBSITE_URL || new URL(request.url).origin;
    const siteOrigin = new URL(siteBase).origin;
    const fallback = new URL("/settings/credits", siteOrigin).toString();

    if (typeof candidate !== "string" || !candidate.trim()) {
        return fallback;
    }

    try {
        const parsed = new URL(candidate, siteOrigin);
        if (parsed.origin !== siteOrigin) {
            return fallback;
        }
        return parsed.toString();
    } catch {
        return fallback;
    }
}

async function handlePost(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const workspaceId = String(body?.workspaceId ?? "").trim();
        const { customerId } = await requireActiveTeamStripeCustomer({ workspaceId });
        const returnUrl = resolveSafeReturnUrl(request, body?.returnUrl);

        const stripe = getStripe();

        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: returnUrl,
        });

        return Response.json({ url: session.url });
    } catch (err: any) {
        if (err?.message === "unauthorized") {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (err?.message === "missing_team" || err?.message === "missing_stripe_customer") {
            return Response.json({ error: err.message }, { status: 400 });
        }
        console.log("[ERROR] /api/stripe/billing-portal:", String(err));
        return Response.json({ error: err?.message || String(err) }, { status: 500 });
    }
}

export const Route = createFileRoute("/api/stripe/billing-portal/")({
	server: {
		handlers: {
			POST: ({ request }) => handlePost(request),
		},
	},
});
