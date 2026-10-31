import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { createHash } from "node:crypto";

const REQUEST = "00000000-0000-4000-8000-0000000000aa";
const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const OWNER = "00000000-0000-4000-8000-000000000011";
const TOKEN = "token-from-email";

const state: {
	userId: string | null;
	rows: Array<Record<string, any>>;
	users: Array<Record<string, any>>;
	members: Array<Record<string, any>>;
	decide: Mock;
	paymentIntentsCreate: Mock;
	checkout: Mock;
	sessionRetrieve: Mock;
	sessionExpire: Mock;
	beforeDecide: (() => Promise<void>) | null;
} = {} as any;

vi.mock("@/utils/supabase/server", () => ({
	createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.userId ? { id: state.userId } : null } }) } }),
}));

vi.mock("@/utils/supabase/admin", () => ({
	createAdminClient: () => ({
		from(table: string) {
			const source = table === "credit_topup_requests" ? state.rows
				: table === "users" ? state.users
					: table === "workspace_members" ? state.members
						: table === "workspaces" ? [{ id: WORKSPACE, name: "Acme", owner_user_id: OWNER }]
							: table === "wallets" ? [{ workspace_id: WORKSPACE, stripe_customer_id: "cus_1" }]
								: [];
			const filters: Array<(row: Record<string, any>) => boolean> = [];
			let update: Record<string, any> | null = null;
			const rows = () => source.filter((row) => filters.every((filter) => filter(row)));
			const builder: any = {
				select: () => builder,
				update: (values: Record<string, any>) => { update = values; return builder; },
				eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return builder; },
				is: (column: string, value: unknown) => { filters.push((row) => (row[column] ?? null) === value); return builder; },
				maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
				then: (resolve: (value: unknown) => unknown) => {
					// A conditional UPDATE: only matching rows change; .select() returns them.
					const matched = update ? rows() : [];
					for (const row of matched) Object.assign(row, update);
					return Promise.resolve({ data: update ? matched.map((row) => ({ id: row.id })) : null, error: null }).then(resolve);
				},
			};
			return builder;
		},
		rpc: async (name: string, args: any) => {
			if (name === "decide_credit_topup_request") {
				const hook = state.beforeDecide;
				state.beforeDecide = null;
				if (hook) await hook();
				return state.decide(args);
			}
			return { data: true, error: null };
		},
	}),
}));

vi.mock("@/lib/stripe", () => ({
	getStripe: () => ({
		paymentIntents: { create: (...args: unknown[]) => state.paymentIntentsCreate(...args), retrieve: vi.fn() },
		checkout: { sessions: { retrieve: (...args: unknown[]) => state.sessionRetrieve(...args), expire: (...args: unknown[]) => state.sessionExpire(...args) } },
	}),
}));

vi.mock("@/lib/server/createStripeCheckoutResponse", () => ({
	createStripeCheckoutResponse: (...args: unknown[]) => state.checkout(...args),
}));

import { serverRouteHandler } from "@/lib/testing/serverRoute";
import { Route as ConfirmRoute } from "./confirm/index";
import { Route as DeclineRoute } from "./decline/index";
import { Route as CheckoutRoute } from "./checkout/index";

const confirmRoute = { POST: serverRouteHandler(ConfirmRoute, "POST") };
const declineRoute = { POST: serverRouteHandler(DeclineRoute, "POST") };
const checkoutRoute = { POST: serverRouteHandler(CheckoutRoute, "POST") };

function post(handler: (req: any, ctx: any) => Promise<Response>, body: Record<string, unknown>, contentType = "application/json") {
	const req = new Request(`https://phaseo.app/api/credits/topups/${REQUEST}/x`, {
		method: "POST",
		headers: { "content-type": contentType, origin: "https://phaseo.app" },
		body: JSON.stringify(body),
	});
	return handler(req as any, { params: Promise.resolve({ id: REQUEST }) });
}

function pendingRow(extra: Record<string, any> = {}) {
	return {
		id: REQUEST, workspace_id: WORKSPACE, requested_by: null, flow: "saved_card", amount_cents: 2000, currency: "usd",
		payment_method_id: "pm_1", payment_method_brand: "visa", payment_method_last4: "4242", status: "pending", reason: null,
		stripe_payment_intent_id: null, stripe_checkout_session_id: null, expires_at: new Date(Date.now() + 60_000).toISOString(),
		created_at: new Date().toISOString(), decided_at: null, paid_at: null,
		confirm_token_hash: createHash("sha256").update(TOKEN).digest("hex"), ...extra,
	};
}

beforeEach(() => {
	state.userId = OWNER;
	state.rows = [pendingRow()];
	state.users = [{ user_id: OWNER, declared_country_code: "GB" }];
	state.members = [{ workspace_id: WORKSPACE, user_id: OWNER, role: "owner" }];
	state.decide = vi.fn(async (args: any) => {
		const row = state.rows[0];
		if (args.p_confirm_token_hash !== row.confirm_token_hash) return { data: null, error: { message: "credit_topup_not_found" } };
		if (row.status !== "pending") return { data: [{ status: row.status, reason: row.reason, changed: false }], error: null };
		// public.decide_credit_topup_request: a decline commits only for the session the caller saw.
		if (args.p_decision === "decline" && "p_expected_checkout_session_id" in args
			&& (row.stripe_checkout_session_id ?? null) !== args.p_expected_checkout_session_id) {
			return { data: null, error: { message: "credit_topup_checkout_changed" } };
		}
		row.status = args.p_decision === "confirm" ? "confirmed" : "declined";
		row.reason = args.p_decision === "confirm" ? null : "declined";
		return { data: [{ status: row.status, reason: row.reason, changed: true }], error: null };
	});
	state.paymentIntentsCreate = vi.fn(async () => ({ id: "pi_1", status: "succeeded", client_secret: "secret" }));
	state.checkout = vi.fn(async () => Response.json({ url: "https://checkout.stripe.com/c/pay/cs_test_1" }));
	state.sessionRetrieve = vi.fn();
	state.sessionExpire = vi.fn(async () => ({ status: "expired" }));
	state.beforeDecide = null;
});

describe("credit top-up review routes", () => {
	it("only accept POST, so a link scanner's GET cannot act", () => {
		for (const route of [confirmRoute, declineRoute, checkoutRoute]) {
			expect(Object.keys(route)).toEqual(["POST"]);
		}
	});

	it("refuse form posts and signed-out callers", async () => {
		expect((await post(confirmRoute.POST, { token: TOKEN }, "text/plain")).status).toBe(415);
		expect((await post(declineRoute.POST, { token: TOKEN }, "application/x-www-form-urlencoded")).status).toBe(415);
		state.userId = null;
		expect((await post(confirmRoute.POST, { token: TOKEN })).status).toBe(401);
		expect(state.decide).not.toHaveBeenCalled();
	});

	it("confirms with the emailed token and charges once", async () => {
		const response = await post(confirmRoute.POST, { token: TOKEN });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: "confirmed", payment: { state: "succeeded" } });
		expect(state.paymentIntentsCreate).toHaveBeenCalledTimes(1);
		expect(state.paymentIntentsCreate.mock.calls[0][1]).toEqual({ idempotencyKey: REQUEST });
		expect(state.rows[0].stripe_payment_intent_id).toBe("pi_1");
	});

	it("refuses a wrong token without charging", async () => {
		const response = await post(confirmRoute.POST, { token: "guess" });
		expect(response.status).toBe(404);
		expect(state.paymentIntentsCreate).not.toHaveBeenCalled();
		expect(state.rows[0].status).toBe("pending");
	});

	it("does not charge a declined or expired request", async () => {
		expect((await post(declineRoute.POST, { token: TOKEN })).status).toBe(200);
		const response = await post(confirmRoute.POST, { token: TOKEN });
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: "not_pending", status: "declined", reason: "declined" });
		state.rows = [pendingRow({ status: "expired", reason: "expired" })];
		expect((await post(confirmRoute.POST, { token: TOKEN })).status).toBe(409);
		expect(state.paymentIntentsCreate).not.toHaveBeenCalled();
	});

	it("asks for a purchase country before using up the request", async () => {
		state.users = [{ user_id: OWNER, declared_country_code: null }];
		const response = await post(confirmRoute.POST, { token: TOKEN });
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "country_required" });
		expect(state.decide).not.toHaveBeenCalled();
		expect((await post(confirmRoute.POST, { token: TOKEN, country_code: "de" })).status).toBe(200);
		expect(state.users[0].declared_country_code).toBe("DE");
	});

	it("sends checkout requests to the web checkout, tagged with the request", async () => {
		state.rows = [pendingRow({ flow: "checkout", payment_method_id: null })];
		expect((await post(confirmRoute.POST, { token: TOKEN })).status).toBe(400);
		const response = await post(checkoutRoute.POST, { token: TOKEN });
		expect(await response.json()).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_1" });
		const args = state.checkout.mock.calls[0][0];
		expect(args).toMatchObject({ kind: "pay_and_save", amountPence: 2000, countryCode: "GB", topUpRequest: { id: REQUEST, workspaceId: WORKSPACE } });
		await args.topUpRequest.onSessionCreated("cs_test_1");
		expect(state.rows[0].stripe_checkout_session_id).toBe("cs_test_1");
		expect(state.rows[0].status).toBe("pending");
	});

	it("reuses an open checkout session and refuses members and bad tokens", async () => {
		state.rows = [pendingRow({ flow: "checkout", payment_method_id: null, stripe_checkout_session_id: "cs_open" })];
		state.sessionRetrieve = vi.fn(async () => ({ status: "open", url: "https://checkout.stripe.com/c/pay/cs_open" }));
		expect(await (await post(checkoutRoute.POST, { token: TOKEN })).json()).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_open" });
		expect(state.checkout).not.toHaveBeenCalled();
		expect((await post(checkoutRoute.POST, { token: "guess" })).status).toBe(404);
		state.members = [{ workspace_id: WORKSPACE, user_id: "00000000-0000-4000-8000-000000000099", role: "member" }];
		state.userId = "00000000-0000-4000-8000-000000000099";
		expect((await post(checkoutRoute.POST, { token: TOKEN })).status).toBe(403);
	});

	it("expires an open checkout session before declining, and refuses once it was paid", async () => {
		state.rows = [pendingRow({ flow: "checkout", payment_method_id: null, stripe_checkout_session_id: "cs_open" })];
		state.sessionRetrieve = vi.fn(async () => ({ status: "open", url: "https://checkout.stripe.com/c/pay/cs_open" }));
		state.sessionExpire = vi.fn(async () => {
			expect(state.rows[0].status).toBe("pending");
			return { status: "expired" };
		});
		const declined = await post(declineRoute.POST, { token: TOKEN });
		expect(declined.status).toBe(200);
		expect(state.sessionExpire).toHaveBeenCalledWith("cs_open");
		expect(state.rows[0].status).toBe("declined");

		state.rows = [pendingRow({ flow: "checkout", payment_method_id: null, stripe_checkout_session_id: "cs_paid" })];
		state.sessionRetrieve = vi.fn(async () => ({ status: "complete" }));
		state.sessionExpire = vi.fn();
		state.decide.mockClear();
		const refused = await post(declineRoute.POST, { token: TOKEN });
		expect(refused.status).toBe(409);
		expect(await refused.json()).toEqual({ error: "checkout_completed" });
		expect(state.rows[0].status).toBe("pending");
		expect(state.decide).not.toHaveBeenCalled();
	});

	it("decline racing checkout: a session attached after decline read the request is expired, never left payable", async () => {
		state.rows = [pendingRow({ flow: "checkout", payment_method_id: null })];
		state.checkout = vi.fn(async (args: any) => {
			await args.topUpRequest.onSessionCreated("cs_race");
			return Response.json({ url: "https://checkout.stripe.com/c/pay/cs_race" });
		});
		state.sessionRetrieve = vi.fn(async (id: string) => ({ id, status: "open" }));
		// Interleaving: decline has read the request (no session yet); checkout now runs to the
		// end and attaches cs_race while the request is still pending; then decline commits.
		state.beforeDecide = async () => {
			const checkout = await post(checkoutRoute.POST, { token: TOKEN });
			expect(await checkout.json()).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_race" });
			expect(state.rows[0].stripe_checkout_session_id).toBe("cs_race");
		};
		const declined = await post(declineRoute.POST, { token: TOKEN });
		expect(declined.status).toBe(200);
		expect(state.rows[0].status).toBe("declined");
		expect(state.sessionExpire).toHaveBeenCalledWith("cs_race");
	});

	it("checkout racing decline: a session created after the decline committed is expired", async () => {
		state.rows = [pendingRow({ flow: "checkout", payment_method_id: null })];
		state.checkout = vi.fn(async (args: any) => {
			// The decline lands while Stripe is creating the session.
			expect((await post(declineRoute.POST, { token: TOKEN })).status).toBe(200);
			await args.topUpRequest.onSessionCreated("cs_late");
			return Response.json({ url: "https://checkout.stripe.com/c/pay/cs_late" });
		});
		const checkout = await post(checkoutRoute.POST, { token: TOKEN });
		expect(checkout.status).toBe(500);
		expect(state.rows[0]).toMatchObject({ status: "declined", stripe_checkout_session_id: null });
		expect(state.sessionExpire).toHaveBeenCalledWith("cs_late");
	});

	it("expires a checkout request past its deadline", async () => {
		state.rows = [pendingRow({ flow: "checkout", payment_method_id: null, expires_at: new Date(Date.now() - 1000).toISOString() })];
		const response = await post(checkoutRoute.POST, { token: TOKEN });
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: "not_pending", status: "expired", reason: "expired" });
		expect(state.rows[0].status).toBe("expired");
		expect(state.checkout).not.toHaveBeenCalled();
	});
});
