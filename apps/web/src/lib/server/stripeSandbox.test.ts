import { beforeEach, describe, expect, it, vi } from "vitest";

const checkout = { wallet: null as { stripe_customer_id: string } | null, upserts: [] as unknown[], sessions: [] as Array<Record<string, any>>, customersCreated: 0 };

vi.mock("@/utils/supabase/admin", () => ({
	createAdminClient: () => ({
		from: () => {
			const builder: any = {
				select: () => builder,
				eq: () => builder,
				maybeSingle: async () => ({ data: checkout.wallet, error: null }),
				upsert: async (row: unknown) => { checkout.upserts.push(row); return { error: null }; },
			};
			return builder;
		},
	}),
}));
vi.mock("@/i18n/server", () => ({ getTranslations: async () => (key: string) => (key === "billingCopy.sandboxTest.productName" ? "Phaseo credits (sandbox test)" : key) }));
vi.mock("@/lib/stripe", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/stripe")>()),
	getSandboxStripe: () => ({
		customers: {
			retrieve: async (id: string) => { if (id === "cus_live_unknown_to_sandbox") throw new Error("No such customer"); return { id }; },
			create: async () => { checkout.customersCreated += 1; return { id: "cus_sandbox_new" }; },
		},
		checkout: { sessions: { create: async (params: Record<string, any>) => { checkout.sessions.push(params); return { id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" }; } } },
	}),
}));

import type Stripe from "stripe";
import { resolveSandboxStripeSecretKey, resolveStripeSecretKey } from "@/lib/stripe";
import { sandboxEventIsAllowed } from "@/lib/server/stripeWebhook";
import { createStripeSandboxCheckout, isStripeSandboxConfigured, SANDBOX_TOP_UP_CENTS } from "@/lib/server/stripeSandboxCheckout";

const SANDBOX = "909aa1dc-8286-4215-966c-ff68666cc0f0";
const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;
const event = (overrides: { livemode?: boolean; type?: string; workspaceId?: string }) =>
	({
		livemode: overrides.livemode ?? false,
		type: overrides.type ?? "payment_intent.succeeded",
		data: { object: { metadata: overrides.workspaceId === undefined ? {} : { workspace_id: overrides.workspaceId } } },
	}) as unknown as Stripe.Event;

describe("Stripe sandbox keys", () => {
	it("only accepts a test-mode sandbox key", () => {
		expect(resolveSandboxStripeSecretKey(env({ STRIPE_SANDBOX_SECRET_KEY: "sk_test_1" }))).toBe("sk_test_1");
		expect(() => resolveSandboxStripeSecretKey(env({ STRIPE_SANDBOX_SECRET_KEY: "sk_live_1" }))).toThrow("test-mode");
		expect(() => resolveSandboxStripeSecretKey(env({}))).toThrow("missing");
	});

	it("live checkout never reads the sandbox key", () => {
		expect(() => resolveStripeSecretKey(env({ STRIPE_SANDBOX_SECRET_KEY: "sk_test_1", NODE_ENV: "development" }))).toThrow("STRIPE_SECRET_KEY is missing");
	});

	it("is configured only with key, webhook secret and workspace", () => {
		expect(isStripeSandboxConfigured(env({ STRIPE_SANDBOX_SECRET_KEY: "sk_test_1", STRIPE_SANDBOX_WEBHOOK_SECRET: "whsec_1", STRIPE_SANDBOX_WORKSPACE_ID: SANDBOX }))).toBe(true);
		expect(isStripeSandboxConfigured(env({ STRIPE_SANDBOX_SECRET_KEY: "sk_test_1", STRIPE_SANDBOX_WORKSPACE_ID: SANDBOX }))).toBe(false);
	});
});

describe("sandboxEventIsAllowed", () => {
	it("allows test-mode payment events for the sandbox workspace", () => {
		expect(sandboxEventIsAllowed(event({ workspaceId: SANDBOX }), SANDBOX)).toBe(true);
	});

	it.each([
		["a live-mode event", event({ livemode: true, workspaceId: SANDBOX })],
		["another workspace", event({ workspaceId: "00000000-0000-4000-8000-000000000001" })],
		["no workspace metadata", event({})],
		["a refund event", event({ type: "refund.created", workspaceId: SANDBOX })],
		["a subscription event", event({ type: "customer.subscription.updated", workspaceId: SANDBOX })],
	])("ignores %s", (_label, candidate) => {
		expect(sandboxEventIsAllowed(candidate, SANDBOX)).toBe(false);
	});

	it("ignores everything when no sandbox workspace is configured", () => {
		expect(sandboxEventIsAllowed(event({ workspaceId: SANDBOX }), null)).toBe(false);
	});
});

describe("createStripeSandboxCheckout", () => {
	beforeEach(() => {
		process.env.STRIPE_SANDBOX_WORKSPACE_ID = SANDBOX;
		process.env.PUBLIC_WEBSITE_URL = "https://phaseo.app";
		checkout.wallet = null;
		checkout.upserts = [];
		checkout.sessions = [];
		checkout.customersCreated = 0;
	});

	it("creates a sandbox customer for the sandbox wallet and a $10 card-saving session for the sandbox workspace", async () => {
		checkout.wallet = { stripe_customer_id: "cus_live_unknown_to_sandbox" };
		const result = await createStripeSandboxCheckout();

		expect(result).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_1", workspaceId: SANDBOX });
		expect(checkout.customersCreated).toBe(1);
		expect(checkout.upserts).toEqual([{ workspace_id: SANDBOX, stripe_customer_id: "cus_sandbox_new" }]);
		expect(checkout.sessions[0]).toMatchObject({
			mode: "payment",
			customer: "cus_sandbox_new",
			line_items: [{ price_data: { currency: "usd", unit_amount: SANDBOX_TOP_UP_CENTS, product_data: { name: "Phaseo credits (sandbox test)" } } }],
			payment_intent_data: { setup_future_usage: "off_session", metadata: { purpose: "top_up", workspace_id: SANDBOX, stripe_sandbox: "true" } },
			success_url: "https://phaseo.app/settings/credits?stripe_sandbox=success",
		});
	});

	it("reuses the sandbox customer already on the wallet", async () => {
		checkout.wallet = { stripe_customer_id: "cus_sandbox_existing" };
		await createStripeSandboxCheckout();
		expect(checkout.customersCreated).toBe(0);
		expect(checkout.sessions[0]).toMatchObject({ customer: "cus_sandbox_existing" });
	});
});
