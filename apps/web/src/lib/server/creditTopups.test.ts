import { describe, it, expect, vi, type Mock } from "vitest";
import { createHash } from "node:crypto";
import {
	chargeConfirmedCreditTopup,
	decideCreditTopup,
	loadCreditTopupForReviewer,
	needsAuthenticationResume,
	recordCreditTopupPaymentFromWebhook,
	type CreditTopupRow,
} from "@/lib/server/creditTopups";

const REQUEST = "00000000-0000-4000-8000-0000000000aa";
const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const OWNER = "00000000-0000-4000-8000-000000000011";
const MEMBER = "00000000-0000-4000-8000-000000000013";

type Call = { table?: string; op: string; args?: unknown };

function fakeDb(tables: Record<string, Array<Record<string, any>>>, rpc: (name: string, args: any) => any = () => ({ data: null, error: null })) {
	const calls: Call[] = [];
	const db = {
		calls,
		from(table: string) {
			const filters: Array<(row: Record<string, any>) => boolean> = [];
			let update: Record<string, any> | null = null;
			const rows = () => (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
			const builder: any = {
				select: () => { calls.push({ table, op: "select" }); return builder; },
				update: (values: Record<string, any>) => { calls.push({ table, op: "update", args: values }); update = values; return builder; },
				eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return builder; },
				is: (column: string, value: unknown) => { filters.push((row) => (row[column] ?? null) === value); return builder; },
				maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
				then: (resolve: (value: unknown) => unknown) => {
					if (update) for (const row of rows()) Object.assign(row, update);
					return Promise.resolve({ data: null, error: null }).then(resolve);
				},
			};
			return builder;
		},
		rpc: async (name: string, args: any) => { calls.push({ op: `rpc:${name}`, args }); return rpc(name, args); },
	};
	return db;
}

function row(extra: Partial<CreditTopupRow> = {}): CreditTopupRow {
	return {
		id: REQUEST, workspace_id: WORKSPACE, requested_by: MEMBER, flow: "saved_card", amount_cents: 2000, currency: "usd",
		payment_method_id: "pm_1", payment_method_brand: "visa", payment_method_last4: "4242", status: "confirmed", reason: null,
		stripe_payment_intent_id: null, stripe_checkout_session_id: null, expires_at: new Date(Date.now() + 60_000).toISOString(),
		created_at: new Date().toISOString(), decided_at: null, paid_at: null, ...extra,
	};
}

describe("loadCreditTopupForReviewer", () => {
	const tables = () => ({
		credit_topup_requests: [row({ status: "pending" })],
		workspace_members: [{ workspace_id: WORKSPACE, user_id: OWNER, role: "owner" }, { workspace_id: WORKSPACE, user_id: MEMBER, role: "member" }],
		workspaces: [{ id: WORKSPACE, name: "Acme", owner_user_id: OWNER }],
	});

	it("only reads: opening the review page (a GET) never decides or charges", async () => {
		const db = fakeDb(tables());
		const review = await loadCreditTopupForReviewer({ db, id: REQUEST, userId: OWNER, lookupEmail: async () => "dev@acme.test" });
		expect(review).toMatchObject({ canDecide: true, workspaceName: "Acme", requesterEmail: "dev@acme.test", row: { status: "pending" } });
		expect(db.calls.every((call) => call.op === "select")).toBe(true);
	});

	it("hides the details from members", async () => {
		const review = await loadCreditTopupForReviewer({ db: fakeDb(tables()), id: REQUEST, userId: MEMBER, lookupEmail: async () => "x" });
		expect(review).toMatchObject({ canDecide: false, requesterEmail: null, workspaceName: "" });
	});

	it("returns null for unknown or malformed ids", async () => {
		expect(await loadCreditTopupForReviewer({ db: fakeDb(tables()), id: "nope", userId: OWNER, lookupEmail: async () => null })).toBeNull();
		expect(await loadCreditTopupForReviewer({ db: fakeDb(tables()), id: "00000000-0000-4000-8000-0000000000bb", userId: OWNER, lookupEmail: async () => null })).toBeNull();
	});
});

describe("decideCreditTopup", () => {
	it("sends the token's SHA-256, never the token", async () => {
		const db = fakeDb({}, () => ({ data: [{ status: "confirmed", reason: null, changed: true }], error: null }));
		const result = await decideCreditTopup({ db, id: REQUEST.toUpperCase(), token: "tok", userId: OWNER, decision: "confirm" });
		expect(result).toEqual({ ok: true, status: "confirmed", reason: null, changed: true });
		expect(db.calls[0]).toEqual({
			op: "rpc:decide_credit_topup_request",
			args: { p_request_id: REQUEST, p_confirm_token_hash: createHash("sha256").update("tok").digest("hex"), p_user_id: OWNER, p_decision: "confirm" },
		});
	});

	it("maps database refusals", async () => {
		const refused = (message: string) => fakeDb({}, () => ({ data: null, error: { message } }));
		expect(await decideCreditTopup({ db: refused("credit_topup_not_found"), id: REQUEST, token: "t", userId: OWNER, decision: "confirm" })).toEqual({ ok: false, httpStatus: 404, error: "not_found" });
		expect(await decideCreditTopup({ db: refused("credit_topup_forbidden"), id: REQUEST, token: "t", userId: MEMBER, decision: "decline" })).toEqual({ ok: false, httpStatus: 403, error: "forbidden" });
		expect(await decideCreditTopup({ db: fakeDb({}), id: REQUEST, token: "", userId: OWNER, decision: "confirm" })).toEqual({ ok: false, httpStatus: 404, error: "not_found" });
	});
});

describe("chargeConfirmedCreditTopup", () => {
	function stripeWith(create: Mock, retrieve: Mock = vi.fn()) {
		return { paymentIntents: { create, retrieve } } as any;
	}

	it("charges the saved card customer-present, once per request", async () => {
		const request = row();
		const db = fakeDb({ wallets: [{ workspace_id: WORKSPACE, stripe_customer_id: "cus_1" }], credit_topup_requests: [request] });
		const create = vi.fn(async () => ({ id: "pi_1", status: "succeeded", client_secret: "secret" }));
		const result = await chargeConfirmedCreditTopup({ db, stripe: stripeWith(create), row: request, countryCode: "GB" });
		expect(result).toEqual({ state: "succeeded" });
		const [params, options] = create.mock.calls[0] as unknown as [Record<string, any>, Record<string, any>];
		expect(options).toEqual({ idempotencyKey: REQUEST });
		expect(params).toMatchObject({
			amount: 2000, currency: "usd", customer: "cus_1", payment_method: "pm_1", confirm: true,
			metadata: { purpose: "top_up", workspace_id: WORKSPACE, country_code: "GB", topup_request_id: REQUEST, topup_flow: "saved_card" },
		});
		expect(params).not.toHaveProperty("off_session");
		expect(request.stripe_payment_intent_id).toBe("pi_1");
		expect(db.calls.some((call) => call.op.startsWith("rpc:"))).toBe(false);
	});

	it("returns the client secret when 3D Secure is needed", async () => {
		const request = row();
		const db = fakeDb({ wallets: [{ workspace_id: WORKSPACE, stripe_customer_id: "cus_1" }], credit_topup_requests: [request] });
		const create = vi.fn(async () => ({ id: "pi_3ds", status: "requires_action", client_secret: "pi_3ds_secret" }));
		expect(await chargeConfirmedCreditTopup({ db, stripe: stripeWith(create), row: request, countryCode: "GB" })).toEqual({ state: "requires_action", clientSecret: "pi_3ds_secret" });
	});

	it("resumes the existing PaymentIntent instead of creating another", async () => {
		const create = vi.fn();
		const retrieve = vi.fn(async () => ({ id: "pi_1", status: "requires_action", client_secret: "again" }));
		const result = await chargeConfirmedCreditTopup({ db: fakeDb({}), stripe: stripeWith(create, retrieve), row: row({ stripe_payment_intent_id: "pi_1" }), countryCode: "GB" });
		expect(result).toEqual({ state: "requires_action", clientSecret: "again" });
		expect(create).not.toHaveBeenCalled();
		expect(retrieve).toHaveBeenCalledWith("pi_1");
	});

	it("records a card decline as failed with a reason code", async () => {
		const request = row();
		const db = fakeDb({ wallets: [{ workspace_id: WORKSPACE, stripe_customer_id: "cus_1" }], credit_topup_requests: [request] }, () => ({ data: true, error: null }));
		const create = vi.fn(async () => {
			throw Object.assign(new Error("Your card was declined."), { type: "StripeCardError", code: "card_declined", decline_code: "insufficient_funds", payment_intent: { id: "pi_declined" } });
		});
		expect(await chargeConfirmedCreditTopup({ db, stripe: stripeWith(create), row: request, countryCode: "GB" })).toEqual({ state: "failed", reason: "insufficient_funds" });
		expect(db.calls).toContainEqual({
			op: "rpc:record_credit_topup_payment",
			args: { p_request_id: REQUEST, p_workspace_id: WORKSPACE, p_payment_intent_id: "pi_declined", p_outcome: "failed", p_reason: "insufficient_funds" },
		});
	});

	it("refuses checkout requests", async () => {
		await expect(chargeConfirmedCreditTopup({ db: fakeDb({}), stripe: stripeWith(vi.fn()), row: row({ flow: "checkout", payment_method_id: null }), countryCode: "GB" })).rejects.toThrow("credit_topup_not_saved_card");
	});
});

describe("needsAuthenticationResume", () => {
	const stripeWith = (status: string) => ({ paymentIntents: { retrieve: vi.fn(async () => ({ id: "pi_1", status })) } }) as any;

	it("offers Resume for a confirmed payment still waiting for 3D Secure", async () => {
		const stripe = stripeWith("requires_action");
		expect(await needsAuthenticationResume(stripe, row({ status: "confirmed", stripe_payment_intent_id: "pi_1" }))).toBe(true);
		expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith("pi_1");
	});

	it("does not offer Resume otherwise", async () => {
		expect(await needsAuthenticationResume(stripeWith("succeeded"), row({ status: "confirmed", stripe_payment_intent_id: "pi_1" }))).toBe(false);
		expect(await needsAuthenticationResume(stripeWith("requires_action"), row({ status: "pending", stripe_payment_intent_id: "pi_1" }))).toBe(false);
		const untouched = stripeWith("requires_action");
		expect(await needsAuthenticationResume(untouched, row({ status: "confirmed", stripe_payment_intent_id: null }))).toBe(false);
		expect(untouched.paymentIntents.retrieve).not.toHaveBeenCalled();
	});
});

describe("recordCreditTopupPaymentFromWebhook", () => {
	const pi = (metadata: Record<string, string>) => ({ id: "pi_1", metadata, last_payment_error: { code: "authentication_required" } }) as any;

	it("marks the request paid", async () => {
		const db = fakeDb({}, () => ({ data: true, error: null }));
		expect(await recordCreditTopupPaymentFromWebhook({ db, paymentIntent: pi({ topup_request_id: REQUEST, workspace_id: WORKSPACE, topup_flow: "checkout" }), outcome: "paid" })).toBe("recorded");
		expect(db.calls[0].args).toMatchObject({ p_request_id: REQUEST, p_workspace_id: WORKSPACE, p_payment_intent_id: "pi_1", p_outcome: "paid", p_reason: null });
	});

	it("records saved-card failures with a reason but leaves Checkout retries alone", async () => {
		const db = fakeDb({}, () => ({ data: true, error: null }));
		await recordCreditTopupPaymentFromWebhook({ db, paymentIntent: pi({ topup_request_id: REQUEST, workspace_id: WORKSPACE, topup_flow: "saved_card" }), outcome: "failed" });
		expect(db.calls[0].args).toMatchObject({ p_outcome: "failed", p_reason: "authentication_failed" });
		const checkoutDb = fakeDb({});
		expect(await recordCreditTopupPaymentFromWebhook({ db: checkoutDb, paymentIntent: pi({ topup_request_id: REQUEST, workspace_id: WORKSPACE, topup_flow: "checkout" }), outcome: "failed" })).toBe("ignored");
		expect(checkoutDb.calls).toHaveLength(0);
	});

	it("ignores other payments and reports a mismatched PaymentIntent", async () => {
		const db = fakeDb({}, () => ({ data: false, error: null }));
		expect(await recordCreditTopupPaymentFromWebhook({ db, paymentIntent: pi({ purpose: "top_up", workspace_id: WORKSPACE }), outcome: "paid" })).toBe("ignored");
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		expect(await recordCreditTopupPaymentFromWebhook({ db, paymentIntent: pi({ topup_request_id: REQUEST, workspace_id: WORKSPACE }), outcome: "paid" })).toBe("refused");
		warn.mockRestore();
	});
});
