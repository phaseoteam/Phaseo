// An API/CLI top-up request must never get two payable Checkout Sessions: repeated or concurrent
// clicks create the session with the same idempotency key and the same params, so Stripe returns
// the first session instead of a second one.

import { describe, it, expect, beforeAll, vi } from "vitest";
const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const REQUEST = "00000000-0000-4000-8000-0000000000aa";

const sessions = { created: 0, byKey: new Map<string, { params: string; id: string }>() };

vi.mock("@/lib/stripe", () => ({
	getStripe: () => ({
		checkout: {
			sessions: {
				// Stripe idempotency: same key + same params returns the same object; other params error.
				create: async (params: unknown, options?: { idempotencyKey?: string }) => {
					const serialized = JSON.stringify(params);
					const key = options?.idempotencyKey;
					const previous = key ? sessions.byKey.get(key) : undefined;
					if (previous) {
						if (previous.params !== serialized) throw Object.assign(new Error("Keys for idempotent requests can only be used with the same parameters"), { type: "StripeIdempotencyError" });
						return { id: previous.id, url: `https://checkout.stripe.com/c/pay/${previous.id}` };
					}
					sessions.created += 1;
					const id = `cs_test_${sessions.created}`;
					if (key) sessions.byKey.set(key, { params: serialized, id });
					return { id, url: `https://checkout.stripe.com/c/pay/${id}` };
				},
			},
		},
	}),
}));
vi.mock("@/lib/server/activeTeamStripe", () => ({
	requireActiveWorkspaceStripeCustomer: async () => ({ workspaceId: WORKSPACE, customerId: "cus_1", userId: "user_1", userEmail: null, userDisplayName: null }),
}));
vi.mock("@/utils/supabase/admin", () => ({
	createAdminClient: () => ({
		rpc: async () => ({ data: true, error: null }),
		from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
	}),
}));
vi.mock("@/lib/automations/resend-events", () => ({ deriveFirstName: () => "", sendCheckoutStartedEvent: async () => undefined }));
vi.mock("@/lib/automations/billingDiscord", () => ({ sendBillingDiscordWebhook: async () => undefined }));

import { createStripeCheckoutResponse } from "@/lib/server/createStripeCheckoutResponse";

describe("createStripeCheckoutResponse for API/CLI top-up requests", () => {
	beforeAll(() => {
		process.env.PUBLIC_WEBSITE_URL = "https://phaseo.app";
	});

	it("returns one session for repeated and concurrent clicks on the same request", async () => {
		const stored: string[] = [];
		const call = () => createStripeCheckoutResponse({
			kind: "pay_and_save",
			amountPence: 2000,
			countryCode: "GB",
			originHeader: "https://phaseo.app",
			refererHeader: null,
			topUpRequest: {
				id: REQUEST,
				workspaceId: WORKSPACE,
				createdAt: "2026-10-28T15:00:00.000Z",
				expiresAt: "2026-10-28T15:30:00.000Z",
				onSessionCreated: async (sessionId) => { stored.push(sessionId); },
			},
		});
		const now = vi.spyOn(Date, "now");
		now.mockReturnValue(Date.parse("2026-10-28T15:05:00.000Z"));
		const [first, second] = await Promise.all([call(), call()]);
		now.mockReturnValue(Date.parse("2026-10-28T15:07:31.000Z"));
		const later = await call();
		now.mockRestore();

		const urls = await Promise.all([first, second, later].map(async (response) => (await response.json()).url));
		expect(new Set(urls)).toEqual(new Set(["https://checkout.stripe.com/c/pay/cs_test_1"]));
		expect(sessions.created).toBe(1);
		expect(new Set(stored)).toEqual(new Set(["cs_test_1"]));
	});
});
