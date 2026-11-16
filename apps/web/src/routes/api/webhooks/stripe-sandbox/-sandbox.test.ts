// The admin sandbox journey's settlement step: a test-mode payment_intent.succeeded on the sandbox
// endpoint credits the Stripe sandbox workspace, and nothing else ever gets credited through it.

import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
const SANDBOX = "909aa1dc-8286-4215-966c-ff68666cc0f0";

const state = { rpcCalls: [] as Array<{ name: string; args: any }>, purchasedEvents: 0, discordPosts: 0, liveKeyUsed: false };

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({
		from(table: string) {
			const builder: any = {
				select: () => builder,
				eq: () => builder,
				is: () => builder,
				update: () => builder,
				upsert: async () => ({ data: null, error: null }),
				maybeSingle: async () => ({ data: table === "wallets" ? { workspace_id: SANDBOX, stripe_customer_id: "cus_sandbox" } : null, error: null }),
				single: async () => ({ data: table === "workspaces" ? { tier: "basic" } : null, error: null }),
				then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
			};
			return builder;
		},
		rpc: async (name: string, args: any) => {
			state.rpcCalls.push({ name, args });
			if (name === "claim_workspace_top_up_fee_policy") return { data: [{ fee_waived: false }], error: null };
			if (name === "stripe_apply_payment_intent_credit") return { data: [{ applied: true, before_balance_nanos: 0, after_balance_nanos: args.p_amount_nanos }], error: null };
			return { data: null, error: null };
		},
	}),
}));

const paymentIntent = (workspaceId: string) => ({
	id: "pi_sandbox_1",
	object: "payment_intent",
	status: "succeeded",
	amount: 1000,
	amount_received: 1000,
	currency: "usd",
	customer: "cus_sandbox",
	payment_method: "pm_1",
	payment_method_types: ["card"],
	metadata: { purpose: "top_up", workspace_id: workspaceId, country_code: "GB", stripe_sandbox: "true" },
});

const sandboxStripe = {
	webhooks: { constructEventAsync: async (body: string) => JSON.parse(body) },
	paymentIntents: { retrieve: async () => ({ ...paymentIntent(SANDBOX), payment_method: { id: "pm_1", type: "card" } }) },
	paymentMethods: { attach: async () => ({}) },
	customers: { retrieve: async () => ({ id: "cus_sandbox", email: "admin@phaseo.test", name: "Admin", invoice_settings: { default_payment_method: "pm_1" } }), update: async () => ({}) },
	checkout: { sessions: { list: async () => ({ data: [] }) } },
};

vi.mock("@/lib/stripe", () => ({
	getStripe: () => { state.liveKeyUsed = true; throw new Error("live Stripe must not be used by the sandbox endpoint"); },
	getSandboxStripe: () => sandboxStripe,
	readStripeSandboxWorkspaceId: () => SANDBOX,
	isProductionDeployment: () => true,
}));
vi.mock("@/lib/automations/resend-events", () => ({ deriveFirstName: () => "", sendCreditsPurchasedEvent: async () => { state.purchasedEvents += 1; } }));
vi.mock("@/lib/automations/billingDiscord", () => ({ sendBillingDiscordWebhook: async () => { state.discordPosts += 1; } }));

import { serverRouteHandler } from "@/lib/testing/serverRoute";
import { Route } from "./index";

const POST = serverRouteHandler(Route, "POST");

function deliver(workspaceId: string, livemode = false) {
	const event = { id: "evt_sandbox", type: "payment_intent.succeeded", livemode, created: 1_800_000_000, data: { object: paymentIntent(workspaceId) } };
	return POST(new Request("https://phaseo.app/api/webhooks/stripe-sandbox", { method: "POST", headers: { "stripe-signature": "t=1,v1=test" }, body: JSON.stringify(event) }));
}

beforeAll(() => {
	process.env.STRIPE_SANDBOX_WEBHOOK_SECRET = "whsec_sandbox";
	process.env.PUBLIC_SUPABASE_URL = "https://supabase.test";
	process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
	vi.spyOn(console, "log").mockImplementation(() => undefined);
	vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

beforeEach(() => {
	state.rpcCalls = [];
	state.purchasedEvents = 0;
	state.discordPosts = 0;
	state.liveKeyUsed = false;
});

const credits = () => state.rpcCalls.filter((call) => call.name === "stripe_apply_payment_intent_credit");

describe("Stripe sandbox webhook", () => {
	it("credits the sandbox workspace with the sandbox client, and sends no email or Discord post", async () => {
		expect((await deliver(SANDBOX)).status).toBe(200);
		expect(credits()).toHaveLength(1);
		expect(credits()[0].args).toMatchObject({ p_payment_intent_id: "pi_sandbox_1" });
		expect(state.purchasedEvents).toBe(0);
		expect(state.discordPosts).toBe(0);
		expect(state.liveKeyUsed).toBe(false);
	});

	it("credits nothing for another workspace", async () => {
		const response = await deliver("00000000-0000-4000-8000-000000000001");
		expect(await response.json()).toMatchObject({ ignored: true, reason: "not_sandbox_workspace" });
		expect(state.rpcCalls).toHaveLength(0);
	});

	it("credits nothing for a live-mode event", async () => {
		await deliver(SANDBOX, true);
		expect(state.rpcCalls).toHaveLength(0);
	});
});
