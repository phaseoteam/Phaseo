import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const OTHER_WORKSPACE = "00000000-0000-4000-8000-000000000002";
const REQUEST = "00000000-0000-4000-8000-0000000000aa";
const OWNER = "00000000-0000-4000-8000-000000000011";
const ADMIN = "00000000-0000-4000-8000-000000000012";
const MEMBER = "00000000-0000-4000-8000-000000000013";

type Row = Record<string, any>;

const state = vi.hoisted(() => ({
	auth: null as any,
	tables: {} as Record<string, Row[]>,
	rpc: null as any,
	audit: null as any,
	bindings: {} as Record<string, string>,
	emails: {} as Record<string, string>,
}));

function query(table: string) {
	const filters: Array<(row: Row) => boolean> = [];
	let mode: "select" | "update" = "select";
	let patch: Row = {};
	const rows = () => (state.tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
	const run = async () => {
		if (mode === "update") {
			for (const row of rows()) Object.assign(row, patch);
			return { data: null, error: null };
		}
		return { data: rows(), error: null };
	};
	const builder: any = {
		select: () => builder,
		eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return builder; },
		in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return builder; },
		lte: (column: string, value: string) => { filters.push((row) => String(row[column]) <= value); return builder; },
		update: (values: Row) => { mode = "update"; patch = values; return builder; },
		upsert: async (values: Row[] | Row) => {
			state.tables[table] = [...(state.tables[table] ?? []), ...(Array.isArray(values) ? values : [values])];
			return { data: null, error: null };
		},
		maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
		then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => run().then(resolve, reject),
	};
	return builder;
}

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({
		from: (table: string) => query(table),
		rpc: (...args: unknown[]) => state.rpc(...args),
		auth: { admin: { getUserById: async (id: string) => ({ data: { user: state.emails[id] ? { email: state.emails[id] } : null }, error: null }) } },
	}),
	getBindings: () => state.bindings,
}));
vi.mock("@/pipeline/before/guards", () => ({ guardManagementAuth: vi.fn(async () => state.auth) }));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: (...args: unknown[]) => state.audit(...args) }));
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

async function post(body: Record<string, unknown>, headers: Record<string, string> = {}) {
	const { creditTopupsRoutes } = await import("./credit-topups");
	return creditTopupsRoutes.request("https://api.phaseo.app/", {
		method: "POST",
		headers: { "Content-Type": "application/json", ...headers },
		body: JSON.stringify(body),
	});
}

async function get(id: string) {
	const { creditTopupsRoutes } = await import("./credit-topups");
	return creditTopupsRoutes.request(`https://api.phaseo.app/${id}`);
}

function topupRow(extra: Row = {}): Row {
	return {
		id: REQUEST, workspace_id: WORKSPACE, flow: "saved_card", amount_cents: 2000, currency: "usd",
		payment_method_brand: "visa", payment_method_last4: "4242", status: "pending", reason: null,
		expires_at: new Date(Date.now() + 30 * 60_000).toISOString(), created_at: new Date().toISOString(),
		decided_at: null, paid_at: null, confirm_token_hash: "old", ...extra,
	};
}

let stripeCustomer: any;
let stripeMethods: any[];

function stubStripe() {
	vi.stubGlobal("fetch", vi.fn(async (url: string) => {
		if (url.includes("/payment_methods")) return new Response(JSON.stringify({ data: stripeMethods }), { status: 200 });
		if (url.includes("/customers/")) return new Response(JSON.stringify(stripeCustomer), { status: 200 });
		return new Response("{}", { status: 404 });
	}));
}

function createdCalls() {
	return state.rpc.mock.calls.filter(([name]: [string]) => name === "create_credit_topup_request");
}

function outbox() {
	return state.tables.email_outbox ?? [];
}

describe("credit top-ups API", () => {
	beforeEach(() => {
		state.auth = { ok: true, value: { workspaceId: WORKSPACE, authMethod: "oauth", userId: MEMBER, oauthClientId: "phaseo_cli", scopes: [], oauthScopes: ["billing:write", "credits:read"], requestId: "req-1" } };
		state.tables = {
			workspace_members: [
				{ workspace_id: WORKSPACE, user_id: OWNER, role: "owner" },
				{ workspace_id: WORKSPACE, user_id: ADMIN, role: "admin" },
				{ workspace_id: WORKSPACE, user_id: MEMBER, role: "member" },
			],
			workspaces: [{ id: WORKSPACE, name: "Acme", owner_user_id: OWNER }],
			wallets: [{ workspace_id: WORKSPACE, stripe_customer_id: "cus_1" }],
			credit_topup_requests: [],
			email_outbox: [],
		};
		state.emails = { [OWNER]: "owner@acme.test", [ADMIN]: "admin@acme.test", [MEMBER]: "agent-owner@acme.test" };
		state.bindings = { TEST_STRIPE_SECRET_KEY: "sk_test_123", PHASEO_WEB_BASE_URL: "https://phaseo.test" };
		stripeCustomer = { id: "cus_1", invoice_settings: { default_payment_method: { id: "pm_1", type: "card", card: { brand: "visa", last4: "4242" } } } };
		stripeMethods = [];
		stubStripe();
		state.rpc = vi.fn(async (name: string, args: Row) => {
			if (name !== "create_credit_topup_request") return { data: null, error: null };
			const existing = state.tables.credit_topup_requests.find((row) => args.p_idempotency_key && row.idempotency_key === args.p_idempotency_key);
			if (existing) return { data: [{ request_id: existing.id, created: false }], error: null };
			state.tables.credit_topup_requests.push(topupRow({
				flow: args.p_flow, amount_cents: args.p_amount_cents, payment_method_brand: args.p_payment_method_brand,
				payment_method_last4: args.p_payment_method_last4, confirm_token_hash: args.p_confirm_token_hash, idempotency_key: args.p_idempotency_key,
			}));
			return { data: [{ request_id: REQUEST, created: true }], error: null };
		});
		state.audit = vi.fn(async () => true);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe("scope and role", () => {
		it("needs billing:write on OAuth tokens", async () => {
			state.auth.value.oauthScopes = ["credits:read"];
			const response = await post({ amount_usd: 20 });
			expect(response.status).toBe(403);
			expect(await response.json()).toMatchObject({ error: "insufficient_scope", message: "Token requires billing:write" });
			expect(createdCalls()).toHaveLength(0);
		});

		it("needs billing:write listed on management keys, even keys with no scope list", async () => {
			state.auth = { ok: true, value: { workspaceId: WORKSPACE, authMethod: "api_key", userId: null, scopes: [] } };
			expect((await post({ amount_usd: 20 })).status).toBe(403);
			state.auth.value.scopes = ["credits:read", "keys:write"];
			expect((await post({ amount_usd: 20 })).status).toBe(403);
			state.auth.value.scopes = ["billing:write"];
			const allowed = await post({ amount_usd: 20 });
			expect(allowed.status).toBe(201);
			expect(createdCalls()[0][1]).toMatchObject({ p_requested_via: "management_key", p_requested_by: null, p_oauth_client_id: null });
		});

		it("passes through rejected credentials such as inference keys", async () => {
			state.auth = { ok: false, response: new Response(JSON.stringify({ error: "unauthorised" }), { status: 401 }) };
			expect((await post({ amount_usd: 20 })).status).toBe(401);
			expect(createdCalls()).toHaveLength(0);
		});

		it("lets any workspace member start a top-up but not outsiders", async () => {
			expect((await post({ amount_usd: 20 })).status).toBe(201);
			state.auth.value.userId = "00000000-0000-4000-8000-000000000099";
			const outsider = await post({ amount_usd: 20 });
			expect(outsider.status).toBe(403);
			expect(await outsider.json()).toMatchObject({ message: "Workspace membership is required" });
		});

		it("refuses another workspace_id", async () => {
			const response = await post({ amount_usd: 20, workspace_id: OTHER_WORKSPACE });
			expect(response.status).toBe(403);
			expect(createdCalls()).toHaveLength(0);
		});
	});

	describe("amount limits", () => {
		it.each([
			[4.99, "amount_below_minimum"],
			[500.01, "amount_above_maximum"],
			[1000, "amount_above_maximum"],
			[12.345, "invalid_amount"],
			[-5, "invalid_amount"],
			["twenty", "invalid_amount"],
			[undefined, "invalid_amount"],
		])("rejects %s with %s", async (amount, error) => {
			const response = await post({ amount_usd: amount });
			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({ ok: false, error });
			expect(createdCalls()).toHaveLength(0);
		});

		it("accepts the $5 minimum and the $500 cap", async () => {
			expect((await post({ amount_usd: 5 })).status).toBe(201);
			expect(createdCalls()[0][1].p_amount_cents).toBe(500);
			state.tables.credit_topup_requests = [];
			expect((await post({ amount_usd: "500" })).status).toBe(201);
			expect(createdCalls()[1][1].p_amount_cents).toBe(50_000);
		});
	});

	describe("saved card", () => {
		it("creates a pending request and emails every owner and admin, never the requester's token", async () => {
			const response = await post({ amount_usd: 20 });
			expect(response.status).toBe(201);
			const body = await response.json() as any;
			expect(body.topup).toMatchObject({
				id: REQUEST, status: "pending", final: false, flow: "saved_card", amount_usd: 20, amount_cents: 2000,
				payment_method: { brand: "visa", last4: "4242" }, checkout_url: null, next_action: "await_email_confirmation", confirmation_recipients: 2,
			});
			expect(createdCalls()[0][1]).toMatchObject({
				p_workspace_id: WORKSPACE, p_requested_by: MEMBER, p_requested_via: "oauth", p_oauth_client_id: "phaseo_cli",
				p_flow: "saved_card", p_payment_method_id: "pm_1", p_ttl_seconds: 1800, p_max_pending: 5,
			});
			expect(outbox().map((row) => row.to_email).sort()).toEqual(["admin@acme.test", "owner@acme.test"]);
			const email = outbox()[0];
			expect(email).toMatchObject({ kind: "credit_topup_confirmation", template: "credit_topup_confirmation", subject: "Confirm $20.00 of Phaseo credits" });
			expect(email.payload).toMatchObject({ workspace_name: "Acme", amount_cents: 2000, card_last4: "4242", requested_by_email: "agent-owner@acme.test" });
			const link = new URL(email.payload.confirm_url);
			expect(link.origin + link.pathname).toBe(`https://phaseo.test/settings/credits/topups/${REQUEST}`);
			const token = link.searchParams.get("token")!;
			expect(createdCalls()[0][1].p_confirm_token_hash).toBe(createHash("sha256").update(token).digest("hex"));
			expect(JSON.stringify(body)).not.toContain(token);
			expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "credit_topup.requested", targetId: REQUEST, actorUserId: MEMBER }));
		});

		it("falls back to the newest saved card when there is no default", async () => {
			stripeCustomer = { id: "cus_1", invoice_settings: { default_payment_method: null } };
			stripeMethods = [{ id: "pm_2", type: "card", card: { brand: "mastercard", last4: "4444" } }];
			const body = await (await post({ amount_usd: 20 })).json() as any;
			expect(body.topup).toMatchObject({ flow: "saved_card", payment_method: { brand: "mastercard", last4: "4444" } });
			expect(createdCalls()[0][1].p_payment_method_id).toBe("pm_2");
		});

		it("refuses when nobody could confirm", async () => {
			state.emails = {};
			const response = await post({ amount_usd: 20 });
			expect(response.status).toBe(409);
			expect(await response.json()).toMatchObject({ error: "no_confirmers" });
			expect(createdCalls()).toHaveLength(0);
		});
	});

	describe("first purchase", () => {
		it("returns a Phaseo checkout link and sends no email when there is no saved card", async () => {
			stripeCustomer = { id: "cus_1", invoice_settings: { default_payment_method: null } };
			const response = await post({ amount_usd: 20 });
			expect(response.status).toBe(201);
			const body = await response.json() as any;
			expect(body.topup).toMatchObject({ flow: "checkout", status: "pending", next_action: "open_checkout_url", payment_method: null });
			const link = new URL(body.topup.checkout_url);
			expect(link.pathname).toBe(`/settings/credits/topups/${REQUEST}`);
			expect(createdCalls()[0][1].p_confirm_token_hash).toBe(createHash("sha256").update(link.searchParams.get("token")!).digest("hex"));
			expect(outbox()).toHaveLength(0);
		});

		it("uses checkout when the workspace has no Stripe customer yet", async () => {
			state.tables.wallets = [];
			const body = await (await post({ amount_usd: 20 })).json() as any;
			expect(body.topup.flow).toBe("checkout");
			expect(fetch).not.toHaveBeenCalled();
		});
	});

	describe("idempotency and rate limit", () => {
		it("returns the same request for a repeated idempotency key without emailing again", async () => {
			const first = await post({ amount_usd: 20, idempotency_key: "run-1" });
			expect(first.status).toBe(201);
			expect(outbox()).toHaveLength(2);
			const again = await post({ amount_usd: 20 }, { "Idempotency-Key": "run-1" });
			expect(again.status).toBe(200);
			expect((await again.json() as any).topup.id).toBe(REQUEST);
			expect(outbox()).toHaveLength(2);
			expect(createdCalls()[1][1].p_idempotency_key).toBe("run-1");
			expect(state.audit).toHaveBeenCalledTimes(1);
		});

		it("gives a replayed checkout request a fresh link", async () => {
			stripeCustomer = { id: "cus_1", invoice_settings: { default_payment_method: null } };
			const first = await (await post({ amount_usd: 20, idempotency_key: "run-2" })).json() as any;
			const again = await (await post({ amount_usd: 20, idempotency_key: "run-2" })).json() as any;
			const token = new URL(again.topup.checkout_url).searchParams.get("token")!;
			expect(again.topup.checkout_url).not.toBe(first.topup.checkout_url);
			expect(state.tables.credit_topup_requests[0].confirm_token_hash).toBe(createHash("sha256").update(token).digest("hex"));
		});

		it("maps the pending cap and key conflicts", async () => {
			state.rpc = vi.fn(async () => ({ data: null, error: { message: "credit_topup_too_many_pending" } }));
			const capped = await post({ amount_usd: 20 });
			expect(capped.status).toBe(429);
			expect(capped.headers.get("Retry-After")).toBe("300");
			expect(await capped.json()).toMatchObject({ error: "too_many_pending_topups" });
			state.rpc = vi.fn(async () => ({ data: null, error: { message: "credit_topup_idempotency_conflict" } }));
			const conflict = await post({ amount_usd: 20, idempotency_key: "run-1" });
			expect(conflict.status).toBe(409);
			expect(await conflict.json()).toMatchObject({ error: "idempotency_conflict" });
			expect(outbox()).toHaveLength(0);
		});

		it("refuses over-long idempotency keys", async () => {
			expect((await post({ amount_usd: 20, idempotency_key: "x".repeat(256) })).status).toBe(400);
		});
	});

	it("reports billing as unavailable without a Stripe key", async () => {
		state.bindings = {};
		const response = await post({ amount_usd: 20 });
		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({ error: "billing_unavailable" });
	});

	describe("status", () => {
		it("returns the request with credits:read alone", async () => {
			state.auth.value.oauthScopes = ["credits:read"];
			state.tables.credit_topup_requests = [topupRow()];
			const response = await get(REQUEST);
			expect(response.status).toBe(200);
			const body = await response.json() as any;
			expect(body.topup).toMatchObject({ id: REQUEST, status: "pending", final: false, next_action: "await_email_confirmation" });
			expect(body.topup).not.toHaveProperty("confirm_token_hash");
		});

		it("needs credits:read or billing:write", async () => {
			state.auth.value.oauthScopes = ["keys:read"];
			state.tables.credit_topup_requests = [topupRow()];
			expect((await get(REQUEST)).status).toBe(403);
		});

		it("expires a pending request past its deadline and tells agents not to retry", async () => {
			state.tables.credit_topup_requests = [topupRow({ expires_at: new Date(Date.now() - 1000).toISOString() })];
			const body = await (await get(REQUEST)).json() as any;
			expect(body.topup).toMatchObject({ status: "expired", reason: "expired", final: true, next_action: null });
			expect(body.topup.message).toContain("Do not retry");
			expect(state.tables.credit_topup_requests[0].status).toBe("expired");
		});

		it.each([
			["declined", "declined"],
			["failed", "card_declined"],
		])("reports %s as final with its reason", async (status, reason) => {
			state.tables.credit_topup_requests = [topupRow({ status, reason })];
			const body = await (await get(REQUEST)).json() as any;
			expect(body.topup).toMatchObject({ status, reason, final: true });
			expect(body.topup.message).toContain("Do not retry");
		});

		it("reports paid as final", async () => {
			state.tables.credit_topup_requests = [topupRow({ status: "paid", paid_at: new Date().toISOString() })];
			const body = await (await get(REQUEST)).json() as any;
			expect(body.topup).toMatchObject({ status: "paid", final: true, reason: null });
		});

		it("hides other workspaces' requests and validates the id", async () => {
			state.tables.credit_topup_requests = [topupRow({ workspace_id: OTHER_WORKSPACE })];
			expect((await get(REQUEST)).status).toBe(404);
			expect((await get("not-a-uuid")).status).toBe(400);
		});
	});
});

describe("parseTopupAmount", () => {
	it("converts dollars to cents", async () => {
		const { parseTopupAmount } = await import("./credit-topups");
		expect(parseTopupAmount(12.5)).toEqual({ ok: true, cents: 1250 });
		expect(parseTopupAmount("19.99")).toEqual({ ok: true, cents: 1999 });
		expect(parseTopupAmount(0.1 + 0.2 + 9.7)).toEqual({ ok: true, cents: 1000 });
	});
});
