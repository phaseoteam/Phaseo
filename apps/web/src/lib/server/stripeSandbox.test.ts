import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import type Stripe from "stripe";
import { resolveSandboxStripeSecretKey, resolveStripeSecretKey } from "@/lib/stripe";
import { sandboxEventIsAllowed } from "@/lib/server/stripeWebhook";
import { isStripeSandboxConfigured } from "@/lib/server/stripeSandboxCheckout";

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
