import { createFileRoute } from "@tanstack/react-router";
import { isAdminViewer } from "@/lib/auth/getViewerRole";
import { rejectCrossOriginRequest } from "@/lib/http/sameOrigin";
import { createStripeSandboxCheckout, isStripeSandboxConfigured } from "@/lib/server/stripeSandboxCheckout";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie" };

// Admin-only: opens a Stripe sandbox checkout that tops up the Stripe sandbox workspace.
async function handlePost(req: Request) {
	const crossOrigin = rejectCrossOriginRequest(req);
	if (crossOrigin) return crossOrigin;
	if (!(await isAdminViewer().catch(() => false))) return new Response(null, { status: 404, headers: PRIVATE_HEADERS });
	if (!isStripeSandboxConfigured()) return Response.json({ error: "stripe_sandbox_not_configured" }, { status: 503, headers: PRIVATE_HEADERS });
	try {
		const { url } = await createStripeSandboxCheckout();
		return Response.json({ url }, { headers: PRIVATE_HEADERS });
	} catch (error) {
		// eslint-disable-next-line no-console
		console.error("[stripe-sandbox] checkout failed", { error: error instanceof Error ? error.message : String(error) });
		return Response.json({ error: "stripe_sandbox_checkout_failed" }, { status: 500, headers: PRIVATE_HEADERS });
	}
}

async function handleGet() {
	if (!(await isAdminViewer().catch(() => false))) return new Response(null, { status: 404, headers: PRIVATE_HEADERS });
	return Response.json({ configured: isStripeSandboxConfigured() }, { headers: PRIVATE_HEADERS });
}

export const Route = createFileRoute("/api/stripe/sandbox-checkout/")({
	server: {
		handlers: {
			GET: () => handleGet(),
			POST: ({ request }) => handlePost(request),
		},
	},
});
