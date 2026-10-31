// The Stripe webhook is the only place credits are applied for API/CLI top-ups. A repeated
// payment_intent.succeeded must credit once and mark the request paid each time (idempotent).

import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
const REQUEST = "00000000-0000-4000-8000-0000000000aa";
const WORKSPACE = "00000000-0000-4000-8000-000000000001";

const state = {
	credited: new Set<string>(),
	// credit_ledger rows by PaymentIntent id, as stripe_apply_payment_intent_credit and the webhook see them.
	ledger: new Map<string, { status: string }>(),
	creditCount: 0,
	rpcCalls: [] as Array<{ name: string; args: any }>,
	purchasedEvents: 0,
};

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({
		from(table: string) {
			const filters: Record<string, unknown> = {};
			let patch: Record<string, unknown> | null = null;
			const builder: any = {
				select: () => builder,
				eq: (column: string, value: unknown) => { filters[column] = value; return builder; },
				is: () => builder,
				update: (values: Record<string, unknown>) => { patch = values; return builder; },
				upsert: async () => ({ data: null, error: null }),
				maybeSingle: async () => ({ data: table === "wallets" ? { workspace_id: WORKSPACE, stripe_customer_id: "cus_1" } : null, error: null }),
				single: async () => ({ data: table === "workspaces" ? { tier: "basic" } : null, error: null }),
				then: (resolve: (value: unknown) => unknown) => {
					if (table === "credit_ledger" && patch) {
						const row = state.ledger.get(String(filters.ref_id));
						if (row && (filters.status === undefined || row.status === filters.status)) Object.assign(row, patch);
					}
					return Promise.resolve({ data: null, error: null }).then(resolve);
				},
			};
			return builder;
		},
		rpc: async (name: string, args: any) => {
			state.rpcCalls.push({ name, args });
			if (name === "claim_workspace_top_up_fee_policy") return { data: [{ fee_waived: false }], error: null };
			if (name === "stripe_apply_payment_intent_credit") {
				// Mirrors the SQL function: skips a PaymentIntent whose ledger entry is already Paid.
				const row = state.ledger.get(args.p_payment_intent_id);
				const applied = !(row && ["paid", "succeeded"].includes(row.status.toLowerCase()));
				if (applied) {
					state.creditCount += 1;
					state.ledger.set(args.p_payment_intent_id, { status: "Paid" });
				}
				state.credited.add(args.p_payment_intent_id);
				return { data: [{ applied, before_balance_nanos: 0, after_balance_nanos: args.p_amount_nanos }], error: null };
			}
			if (name === "record_credit_topup_payment") return { data: true, error: null };
			return { data: null, error: null };
		},
	}),
}));

const paymentIntent = (type: string) => ({
	id: "pi_topup_1",
	object: "payment_intent",
	status: type === "payment_intent.succeeded" ? "succeeded" : "requires_payment_method",
	amount: 2000,
	amount_received: type === "payment_intent.succeeded" ? 2000 : 0,
	currency: "usd",
	customer: "cus_1",
	payment_method: "pm_1",
	payment_method_types: ["card"],
	last_payment_error: type === "payment_intent.payment_failed" ? { code: "card_declined", decline_code: "insufficient_funds" } : null,
	metadata: { purpose: "top_up", workspace_id: WORKSPACE, country_code: "GB", topup_request_id: REQUEST, topup_flow: "saved_card" },
});

vi.mock("@/lib/stripe", () => ({
	getStripe: () => ({
		webhooks: { constructEvent: (body: string) => JSON.parse(body) },
		paymentIntents: { retrieve: async () => ({ ...paymentIntent("payment_intent.succeeded"), payment_method: { id: "pm_1", type: "card" } }) },
		paymentMethods: { attach: async () => ({}) },
		customers: { retrieve: async () => ({ id: "cus_1", email: "owner@acme.test", name: "Owner", invoice_settings: { default_payment_method: "pm_1" } }), update: async () => ({}) },
		checkout: { sessions: { list: async () => ({ data: [] }) } },
	}),
}));

vi.mock("@/lib/automations/resend-events", () => ({
	deriveFirstName: () => "",
	sendCreditsPurchasedEvent: async () => { state.purchasedEvents += 1; },
}));
vi.mock("@/lib/automations/billingDiscord", () => ({ sendBillingDiscordWebhook: async () => undefined }));

import { serverRouteHandler } from "@/lib/testing/serverRoute";
import { Route } from "./index";

const POST = serverRouteHandler(Route, "POST");

function deliver(type: string) {
	const event = { id: `evt_${type}`, type, created: 1_800_000_000, data: { object: paymentIntent(type) } };
	return POST(new Request("https://phaseo.app/api/webhooks/stripe-checkout", {
		method: "POST",
		headers: { "stripe-signature": "t=1,v1=test" },
		body: JSON.stringify(event),
	}));
}

beforeAll(() => {
	process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
	process.env.PUBLIC_SUPABASE_URL = "https://supabase.test";
	process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
	vi.spyOn(console, "log").mockImplementation(() => undefined);
	vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

beforeEach(() => {
	state.credited.clear();
	state.ledger.clear();
	state.creditCount = 0;
	state.rpcCalls = [];
	state.purchasedEvents = 0;
});

describe("Stripe webhook for API/CLI top-ups", () => {
	it("credits a repeated payment_intent.succeeded once and marks the request paid", async () => {
		expect((await deliver("payment_intent.succeeded")).status).toBe(200);
		expect((await deliver("payment_intent.succeeded")).status).toBe(200);

		const credits = state.rpcCalls.filter((call) => call.name === "stripe_apply_payment_intent_credit");
		expect(credits).toHaveLength(2);
		expect(state.credited.size).toBe(1);
		expect(state.purchasedEvents).toBe(1);

		const records = state.rpcCalls.filter((call) => call.name === "record_credit_topup_payment");
		expect(records).toHaveLength(2);
		for (const record of records) {
			expect(record.args).toEqual({ p_request_id: REQUEST, p_workspace_id: WORKSPACE, p_payment_intent_id: "pi_topup_1", p_outcome: "paid", p_reason: null });
		}
		// The request is recorded only after the credit call, so a failed credit is retried first.
		const order = state.rpcCalls.map((call) => call.name);
		expect(order.indexOf("stripe_apply_payment_intent_credit")).toBeLessThan(order.indexOf("record_credit_topup_payment"));
	});

	it("never lets a late failure undo a credit, so a replayed success cannot credit twice", async () => {
		expect((await deliver("payment_intent.succeeded")).status).toBe(200);
		expect(state.ledger.get("pi_topup_1")?.status).toBe("Paid");
		// Out of order: a failure event for the same PaymentIntent arrives after it was credited.
		expect((await deliver("payment_intent.payment_failed")).status).toBe(200);
		expect(state.ledger.get("pi_topup_1")?.status).toBe("Paid");
		expect((await deliver("payment_intent.succeeded")).status).toBe(200);
		expect(state.creditCount).toBe(1);
	});

	it("marks a pending ledger entry failed", async () => {
		state.ledger.set("pi_topup_1", { status: "Processing" });
		expect((await deliver("payment_intent.payment_failed")).status).toBe(200);
		expect(state.ledger.get("pi_topup_1")?.status).toBe("Failed");
	});

	it("marks a failed saved-card payment failed with its reason and credits nothing", async () => {
		expect((await deliver("payment_intent.payment_failed")).status).toBe(200);
		expect(state.rpcCalls.find((call) => call.name === "stripe_apply_payment_intent_credit")).toBeUndefined();
		expect(state.rpcCalls.find((call) => call.name === "record_credit_topup_payment")?.args).toEqual({
			p_request_id: REQUEST, p_workspace_id: WORKSPACE, p_payment_intent_id: "pi_topup_1", p_outcome: "failed", p_reason: "insufficient_funds",
		});
	});
});
