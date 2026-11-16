import { createFileRoute } from "@tanstack/react-router";
import { handleStripeWebhook } from "@/lib/server/stripeWebhook";

export const Route = createFileRoute("/api/webhooks/stripe-checkout/")({
	server: {
		handlers: {
			POST: ({ request }) => handleStripeWebhook(request, "live"),
		},
	},
});
