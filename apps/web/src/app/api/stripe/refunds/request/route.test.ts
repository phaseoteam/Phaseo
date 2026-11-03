// The self-serve refund route checks eligibility and debits the wallet in SQL
// (stripe_claim_self_serve_refund) before any money moves, then links the debit to the Stripe
// refund id (stripe_apply_refund_once). It never sums usage rows in JS or applies a raw wallet delta.

const WORKSPACE = "00000000-0000-4000-8000-000000000001";

const state = {
	rpcCalls: [] as Array<{ name: string; args: any }>,
	tables: [] as string[],
	claim: { ok: true, reason: null as string | null, amount_nanos: 19_000_000_000 },
	refundsCreate: jest.fn(),
};

jest.mock("@/lib/server/activeTeamStripe", () => ({
	requireActiveTeamStripeCustomer: async () => ({ workspaceId: WORKSPACE, customerId: "cus_1", userId: "user_1" }),
}));

jest.mock("@/utils/supabase/admin", () => ({
	createAdminClient: () => ({
		from(table: string) {
			state.tables.push(table);
			// What the pre-fix route read: an eligible, unused purchase and no usage.
			const data = table === "credit_ledger"
				? { workspace_id: WORKSPACE, event_time: new Date().toISOString(), kind: "top_up", amount_nanos: 19_000_000_000, before_balance_nanos: 0, status: "Paid" }
				: table === "wallets" ? { balance_nanos: 0 } : null;
			const builder: any = {
				select: () => builder,
				eq: () => builder,
				gte: () => builder,
				update: () => builder,
				upsert: async () => ({ data: null, error: null }),
				maybeSingle: async () => ({ data, error: null }),
				then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
			};
			return builder;
		},
		rpc: async (name: string, args: any) => {
			state.rpcCalls.push({ name, args });
			if (name === "stripe_claim_self_serve_refund") return { data: [state.claim], error: null };
			return { data: [{ applied: false }], error: null };
		},
	}),
}));

jest.mock("@/lib/stripe", () => ({
	getStripe: () => ({
		paymentIntents: { retrieve: async () => ({ id: "pi_1", amount: 2000, latest_charge: { amount: 2000, amount_refunded: 0 } }) },
		refunds: { create: (...args: unknown[]) => state.refundsCreate(...args) },
	}),
}));

import { POST } from "./route";

function request() {
	return POST(new Request("https://phaseo.app/api/stripe/refunds/request", {
		method: "POST",
		body: JSON.stringify({ paymentIntentId: "pi_1", reason: "accidental_purchase" }),
	}) as any);
}

beforeAll(() => {
	jest.spyOn(console, "warn").mockImplementation(() => undefined);
	jest.spyOn(console, "error").mockImplementation(() => undefined);
});

beforeEach(() => {
	state.rpcCalls = [];
	state.tables = [];
	state.claim = { ok: true, reason: null, amount_nanos: 19_000_000_000 };
	state.refundsCreate = jest.fn(async () => ({ id: "re_1", amount: 2000, status: "succeeded" }));
});

describe("self-serve refund route", () => {
	it("refuses without creating a Stripe refund when the SQL claim says the credits were used", async () => {
		state.claim = { ok: false, reason: "lot_used", amount_nanos: 0 };
		const response = await request();
		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toEqual({ error: "This top-up has already been used, so it is not eligible for self-serve refund." });
		expect(state.refundsCreate).not.toHaveBeenCalled();
		expect(state.tables).not.toContain("gateway_requests");
		expect(state.rpcCalls.map((call) => call.name)).toEqual(["stripe_claim_self_serve_refund"]);
	});

	it("claims and debits in SQL first, then links the debit to the Stripe refund id", async () => {
		const response = await request();
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({ ok: true, refundId: "re_1", status: "succeeded" });

		expect(state.rpcCalls).toEqual([
			{ name: "stripe_claim_self_serve_refund", args: { p_team_id: WORKSPACE, p_payment_intent_id: "pi_1", p_user_id: "user_1" } },
			{ name: "stripe_apply_refund_once", args: { p_workspace_id: WORKSPACE, p_payment_intent_id: "pi_1", p_refund_id: "re_1", p_refund_net_nanos: 19_000_000_000, p_status: "succeeded" } },
		]);
		expect(state.refundsCreate).toHaveBeenCalledWith(
			expect.objectContaining({ payment_intent: "pi_1", amount: 2000 }),
			{ idempotencyKey: `self_serve_refund:${WORKSPACE}:pi_1` },
		);
		expect(state.tables).not.toContain("gateway_requests");
	});

	it("gives the claimed credits back when Stripe refuses the refund", async () => {
		state.refundsCreate = jest.fn(async () => { throw new Error("card_declined"); });
		const response = await request();
		expect(response.status).toBe(500);
		expect(state.rpcCalls.map((call) => call.name)).toEqual(["stripe_claim_self_serve_refund", "stripe_apply_refund_once"]);
		expect(state.rpcCalls[1].args).toEqual({ p_workspace_id: WORKSPACE, p_payment_intent_id: "pi_1", p_refund_id: null, p_refund_net_nanos: null, p_status: "failed" });
	});
});
