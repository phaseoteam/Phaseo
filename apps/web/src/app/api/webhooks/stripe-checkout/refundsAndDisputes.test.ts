// Refund and dispute webhooks apply the wallet change through SQL functions keyed on the Stripe
// refund or dispute id, so a refund is debited once however its events and the self-serve route
// interleave, and a chargeback takes the disputed credit out of the wallet.

const WORKSPACE = "00000000-0000-4000-8000-000000000001";

const state = {
	rpcCalls: [] as Array<{ name: string; args: any }>,
	purchase: { workspace_id: WORKSPACE, amount_nanos: 19_000_000_000 } as { workspace_id: string; amount_nanos: number } | null,
};

jest.mock("@supabase/supabase-js", () => ({
	createClient: () => ({
		from(table: string) {
			const builder: any = {
				select: () => builder,
				eq: () => builder,
				is: () => builder,
				update: () => builder,
				upsert: async () => ({ data: null, error: null }),
				maybeSingle: async () => ({ data: table === "credit_ledger" ? state.purchase : null, error: null }),
				then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
			};
			return builder;
		},
		rpc: async (name: string, args: any) => {
			state.rpcCalls.push({ name, args });
			return { data: [{ applied: true }], error: null };
		},
	}),
}));

jest.mock("@/lib/stripe", () => ({
	getStripe: () => ({
		webhooks: { constructEvent: (body: string) => JSON.parse(body) },
		paymentIntents: { retrieve: async () => ({ id: "pi_1", amount: 2000, amount_received: 2000 }) },
	}),
}));

jest.mock("@/lib/automations/resend-events", () => ({ deriveFirstName: () => "", sendCreditsPurchasedEvent: async () => undefined }));
jest.mock("@/lib/automations/billingDiscord", () => ({ sendBillingDiscordWebhook: async () => undefined }));

import { POST } from "./route";

function deliver(type: string, object: Record<string, unknown>) {
	const event = { id: `evt_${type}_${Math.random()}`, type, created: 1_800_000_000, data: { object } };
	return POST(new Request("https://phaseo.app/api/webhooks/stripe-checkout", {
		method: "POST",
		headers: { "stripe-signature": "t=1,v1=test" },
		body: JSON.stringify(event),
	}));
}

const refund = (status: string) => ({ id: "re_1", object: "refund", payment_intent: "pi_1", amount: 1000, status });
const dispute = (status: string) => ({ id: "dp_1", object: "dispute", payment_intent: "pi_1", amount: 2000, status });

beforeAll(() => {
	process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
	process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
	process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
	jest.spyOn(console, "log").mockImplementation(() => undefined);
	jest.spyOn(console, "warn").mockImplementation(() => undefined);
	jest.spyOn(console, "error").mockImplementation(() => undefined);
});

beforeEach(() => {
	state.rpcCalls = [];
	state.purchase = { workspace_id: WORKSPACE, amount_nanos: 19_000_000_000 };
});

describe("Stripe refund webhooks", () => {
	it("applies refund.created and refund.updated through the refund-id keyed function, never a raw wallet delta", async () => {
		expect((await deliver("refund.created", refund("pending"))).status).toBe(200);
		expect((await deliver("refund.updated", refund("succeeded"))).status).toBe(200);
		expect((await deliver("refund.updated", refund("succeeded"))).status).toBe(200);

		expect(state.rpcCalls.map((call) => call.name)).toEqual([
			"stripe_apply_refund_once",
			"stripe_apply_refund_once",
			"stripe_apply_refund_once",
		]);
		// Half the gross amount refunds half the credit bought.
		expect(state.rpcCalls[0].args).toEqual({
			p_workspace_id: WORKSPACE,
			p_payment_intent_id: "pi_1",
			p_refund_id: "re_1",
			p_refund_net_nanos: 9_500_000_000,
			p_status: "pending",
		});
		expect(state.rpcCalls[2].args).toMatchObject({ p_refund_id: "re_1", p_status: "succeeded" });
	});

	it("ignores refunds of payments that did not buy credits", async () => {
		state.purchase = null;
		expect((await deliver("refund.updated", refund("succeeded"))).status).toBe(200);
		expect(state.rpcCalls).toHaveLength(0);
	});
});

describe("Stripe dispute webhooks", () => {
	it("debits the disputed credit once per dispute id", async () => {
		expect((await deliver("charge.dispute.created", dispute("needs_response"))).status).toBe(200);
		expect((await deliver("charge.dispute.funds_withdrawn", dispute("needs_response"))).status).toBe(200);

		expect(state.rpcCalls).toEqual([
			{ name: "stripe_apply_dispute_once", args: { p_workspace_id: WORKSPACE, p_payment_intent_id: "pi_1", p_dispute_id: "dp_1", p_amount_nanos: 19_000_000_000, p_status: "needs_response" } },
			{ name: "stripe_apply_dispute_once", args: { p_workspace_id: WORKSPACE, p_payment_intent_id: "pi_1", p_dispute_id: "dp_1", p_amount_nanos: 19_000_000_000, p_status: "needs_response" } },
		]);
	});

	it("passes the closed status, and treats reinstated funds as a won dispute", async () => {
		await deliver("charge.dispute.closed", dispute("lost"));
		await deliver("charge.dispute.funds_reinstated", dispute("under_review"));
		expect(state.rpcCalls.map((call) => call.args.p_status)).toEqual(["lost", "won"]);
	});
});
