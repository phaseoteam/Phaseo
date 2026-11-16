import { createFileRoute } from "@tanstack/react-router";
import { handleStripeWebhook } from "@/lib/server/stripeWebhook";

// Stripe sandbox webhook endpoint for the admin test checkout. Point the sandbox account's webhook
// here; it is verified with STRIPE_SANDBOX_WEBHOOK_SECRET and only credits the sandbox workspace.
export const Route = createFileRoute("/api/webhooks/stripe-sandbox/")({
	server: {
		handlers: {
			POST: ({ request }) => handleStripeWebhook(request, "sandbox"),
		},
	},
});
