import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import app from "@/index";

const secret = "whsec_cloudflare_boundary_test";
const payload = JSON.stringify({
	id: "evt_test_ignored",
	object: "event",
	type: "customer.created",
	data: { object: { id: "cus_test", object: "customer" } },
});

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
	STRIPE_SECRET_KEY: "sk_test_boundary",
	STRIPE_WEBHOOK_SECRET: secret,
};

describe("Stripe webhook Worker boundary", () => {
	it("rejects unsigned requests without exposing a cacheable response", async () => {
		const response = await app.request("https://phaseo.app/api/webhooks/stripe-checkout", {
			method: "POST",
			body: payload,
		}, env);
		expect(response.status).toBe(400);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
	});

	it("verifies the raw payload and accepts an ignored Stripe event", async () => {
		const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
		const response = await app.request("https://phaseo.app/api/webhooks/stripe-checkout", {
			method: "POST",
			headers: { "stripe-signature": signature },
			body: payload,
		}, env);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ignored: true });
		expect(response.headers.get("cache-control")).toBe("private, no-store");
	});
});
