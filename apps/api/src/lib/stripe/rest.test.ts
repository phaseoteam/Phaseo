import { describe, expect, it, vi } from "vitest";

import { STRIPE_API_VERSION, StripeApiError, createStripeRestClient, encodeStripeForm } from "./rest";

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: Array<Response | Error>) {
	const calls: Call[] = [];
	const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
		calls.push({ url: String(url), init: init ?? {} });
		const next = responses.shift();
		if (!next) throw new Error("unexpected extra request");
		if (next instanceof Error) throw next;
		return next;
	});
	return { fetch: fn as unknown as typeof fetch, calls };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const noSleep = { sleep: async () => {} };

describe("encodeStripeForm", () => {
	it("encodes nested objects, arrays, booleans, null and skips undefined like the SDK", () => {
		expect(
			encodeStripeForm({
				amount: 2500,
				confirm: true,
				customer: undefined,
				description: null,
				metadata: { workspace_id: "ws 1", "a&b": "x=y" },
				expand: ["latest_charge", "customer"],
			}),
		).toBe(
			"amount=2500&confirm=true&description=&metadata%5Bworkspace_id%5D=ws%201&metadata%5Ba%26b%5D=x%3Dy&expand%5B0%5D=latest_charge&expand%5B1%5D=customer",
		);
	});
});

describe("createStripeRestClient", () => {
	it("sends GET parameters as a query string with auth and API version headers", async () => {
		const { fetch, calls } = fakeFetch([json(200, { object: "list", data: [{ id: "pm_1" }] })]);
		const stripe = createStripeRestClient("sk_test_123", { fetch, ...noSleep });
		const list = await stripe.paymentMethods.list({ customer: "cus_1", type: "card", limit: 1 });
		expect(list.data[0].id).toBe("pm_1");
		expect(calls[0].url).toBe("https://api.stripe.com/v1/payment_methods?customer=cus_1&type=card&limit=1");
		const headers = calls[0].init.headers as Record<string, string>;
		expect(calls[0].init.method).toBe("GET");
		expect(headers.Authorization).toBe("Bearer sk_test_123");
		expect(headers["Stripe-Version"]).toBe(STRIPE_API_VERSION);
		expect(headers["Idempotency-Key"]).toBeUndefined();
		expect(calls[0].init.body).toBeUndefined();
	});

	it("escapes path ids", async () => {
		const { fetch, calls } = fakeFetch([json(200, { id: "cus_1", object: "customer" })]);
		await createStripeRestClient("sk", { fetch, ...noSleep }).customers.retrieve("cus/../x");
		expect(calls[0].url).toBe("https://api.stripe.com/v1/customers/cus%2F..%2Fx");
	});

	it("form-encodes POST bodies and keeps the caller's idempotency key across retries", async () => {
		const { fetch, calls } = fakeFetch([json(500, { error: { type: "api_error" } }), json(200, { id: "pi_1", status: "succeeded" })]);
		const stripe = createStripeRestClient("sk", { fetch, ...noSleep });
		const intent = await stripe.paymentIntents.create(
			{ amount: 2500, currency: "usd", off_session: true, confirm: true, metadata: { request_id: "r1" } },
			{ idempotencyKey: "auto-top-up:ws:r1" },
		);
		expect(intent.id).toBe("pi_1");
		expect(calls).toHaveLength(2);
		for (const call of calls) {
			const headers = call.init.headers as Record<string, string>;
			expect(call.init.method).toBe("POST");
			expect(call.url).toBe("https://api.stripe.com/v1/payment_intents");
			expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
			expect(headers["Idempotency-Key"]).toBe("auto-top-up:ws:r1");
			expect(call.init.body).toBe("amount=2500&currency=usd&off_session=true&confirm=true&metadata%5Brequest_id%5D=r1");
		}
	});

	it("generates one idempotency key for a POST without one, reused on retry", async () => {
		const { fetch, calls } = fakeFetch([json(409, { error: { type: "idempotency_error" } }), json(200, { id: "pi_2" })]);
		await createStripeRestClient("sk", { fetch, ...noSleep }).paymentIntents.create({ amount: 100, currency: "usd" });
		const keys = calls.map((c) => (c.init.headers as Record<string, string>)["Idempotency-Key"]);
		expect(keys[0]).toMatch(/^stripe-node-retry-[0-9a-f-]{36}$/);
		expect(keys[1]).toBe(keys[0]);
	});

	it("does not retry card errors and exposes the SDK error fields callers read", async () => {
		const failedIntent = { id: "pi_failed", status: "requires_payment_method" };
		const { fetch, calls } = fakeFetch([
			json(
				402,
				{ error: { type: "card_error", code: "card_declined", decline_code: "insufficient_funds", message: "Your card has insufficient funds.", payment_intent: failedIntent } },
				{ "request-id": "req_123" },
			),
		]);
		const err = await createStripeRestClient("sk", { fetch, ...noSleep })
			.paymentIntents.create({ amount: 100, currency: "usd" }, { idempotencyKey: "k" })
			.catch((e) => e);
		expect(calls).toHaveLength(1);
		expect(err).toBeInstanceOf(StripeApiError);
		expect(err.message).toBe("Your card has insufficient funds.");
		expect(err.type).toBe("card_error");
		expect(err.code).toBe("card_declined");
		expect(err.decline_code).toBe("insufficient_funds");
		expect(err.statusCode).toBe(402);
		expect(err.requestId).toBe("req_123");
		expect(err.payment_intent).toEqual(failedIntent);
		expect(err.raw.payment_intent).toEqual(failedIntent);
	});

	it("honours Stripe-Should-Retry: false on a 5xx", async () => {
		const { fetch, calls } = fakeFetch([json(503, { error: { type: "api_error", message: "nope" } }, { "stripe-should-retry": "false" })]);
		await expect(createStripeRestClient("sk", { fetch, ...noSleep }).customers.retrieve("cus_1")).rejects.toMatchObject({ statusCode: 503, message: "nope" });
		expect(calls).toHaveLength(1);
	});

	it("honours Stripe-Should-Retry: true on a 4xx", async () => {
		const { fetch, calls } = fakeFetch([json(429, { error: { type: "rate_limit_error" } }, { "stripe-should-retry": "true" }), json(200, { id: "cus_1" })]);
		await createStripeRestClient("sk", { fetch, ...noSleep }).customers.retrieve("cus_1");
		expect(calls).toHaveLength(2);
	});

	it("retries network errors twice, then throws a connection error", async () => {
		const { fetch, calls } = fakeFetch([new TypeError("socket hang up"), new TypeError("socket hang up"), new TypeError("socket hang up")]);
		const err = await createStripeRestClient("sk", { fetch, ...noSleep }).customers.retrieve("cus_1").catch((e) => e);
		expect(calls).toHaveLength(3);
		expect(err).toBeInstanceOf(StripeApiError);
		expect(err.type).toBe("api_connection_error");
		expect(err.message).toContain("socket hang up");
	});

	it("rejects a missing key up front", () => {
		expect(() => createStripeRestClient("  ")).toThrow("missing_stripe_secret_key");
	});
});
