import type { NextRequest } from "next/server";

const mockGetStripe = jest.fn();
const mockCreateAdminClient = jest.fn();

jest.mock("@/lib/stripe", () => ({ getStripe: mockGetStripe }));
jest.mock("@/utils/supabase/admin", () => ({ createAdminClient: mockCreateAdminClient }));

const TOKEN = "internal-payments-token-for-tests";

// The route reads the token at module load, so re-import it after each env change.
async function loadRoute(): Promise<typeof import("./route")> {
	jest.resetModules();
	return import("./route");
}

function chargeRequest(headers: Record<string, string>): NextRequest {
	return new Request("https://phaseo.app/api/payments/charge-saved", {
		method: "POST",
		headers: { "content-type": "application/json", ...headers },
		body: JSON.stringify({ customerId: "cus_test", workspace_id: "ws_test", amount_pence: 1000 }),
	}) as unknown as NextRequest;
}

describe("POST /api/payments/charge-saved internal token", () => {
	const previous = { payments: process.env.INTERNAL_PAYMENTS_TOKEN, api: process.env.INTERNAL_API_TOKEN };

	beforeEach(() => {
		jest.resetAllMocks();
		process.env.INTERNAL_PAYMENTS_TOKEN = TOKEN;
		delete process.env.INTERNAL_API_TOKEN;
		jest.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
		if (previous.payments === undefined) delete process.env.INTERNAL_PAYMENTS_TOKEN;
		else process.env.INTERNAL_PAYMENTS_TOKEN = previous.payments;
		if (previous.api === undefined) delete process.env.INTERNAL_API_TOKEN;
		else process.env.INTERNAL_API_TOKEN = previous.api;
	});

	it.each([
		["missing", {}],
		["wrong", { "x-internal-payments-token": "not-the-token" }],
		["prefix of the real", { "x-internal-payments-token": TOKEN.slice(0, -1) }],
		["longer than the real", { "x-internal-payments-token": `${TOKEN}x` }],
	])("rejects a %s token with 403 before touching Stripe or the database", async (_label, headers) => {
		const { POST } = await loadRoute();
		const response = await POST(chargeRequest(headers));

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toEqual({ error: "unauthorised" });
		expect(mockGetStripe).not.toHaveBeenCalled();
		expect(mockCreateAdminClient).not.toHaveBeenCalled();
	});

	it("lets the correct token past the auth check", async () => {
		const { POST } = await loadRoute();
		// Stop right after auth: the first dependency the handler reaches throws.
		mockGetStripe.mockImplementation(() => { throw new Error("stop after auth"); });
		mockCreateAdminClient.mockImplementation(() => { throw new Error("stop after auth"); });
		jest.spyOn(console, "error").mockImplementation(() => {});

		const response = await POST(chargeRequest({ "x-internal-payments-token": TOKEN }));

		expect(response.status).not.toBe(403);
		expect(await response.json()).not.toEqual({ error: "unauthorised" });
	});

	it("fails closed when no token is configured", async () => {
		delete process.env.INTERNAL_PAYMENTS_TOKEN;
		jest.spyOn(console, "error").mockImplementation(() => {});
		const { POST } = await loadRoute();
		const response = await POST(chargeRequest({ "x-internal-payments-token": "" }));
		expect(response.status).toBe(500);
	});
});
