import { beforeEach, describe, expect, it, vi } from "vitest";
import { serverRouteHandler } from "@/lib/testing/serverRoute";

vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("@/lib/server/activeTeamStripe", () => ({ requireActiveTeamStripeCustomer: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { isSameOriginRequest } from "./sameOrigin";
import { getStripe } from "@/lib/stripe";
import { requireActiveTeamStripeCustomer } from "@/lib/server/activeTeamStripe";
import { Route as PaymentMethodsRoute } from "@/routes/api/stripe/payment-methods/index";
import { Route as RefundRequestRoute } from "@/routes/api/stripe/refunds/request/index";

const createPaymentMethod = serverRouteHandler(PaymentMethodsRoute, "POST");
const deletePaymentMethod = serverRouteHandler(PaymentMethodsRoute, "DELETE");
const requestRefund = serverRouteHandler(RefundRequestRoute, "POST");

function request(headers: Record<string, string>, method = "POST") {
	return new Request("https://phaseo.app/api/stripe/payment-methods", {
		method,
		headers: { "content-type": "application/json", ...headers },
		body: "{}",
	});
}

describe("isSameOriginRequest", () => {
	it("accepts the site's own Origin", () => {
		expect(isSameOriginRequest(request({ origin: "https://phaseo.app" }))).toBe(true);
	});

	it("rejects another Origin, a null Origin and a lookalike host", () => {
		expect(isSameOriginRequest(request({ origin: "https://evil.example" }))).toBe(false);
		expect(isSameOriginRequest(request({ origin: "null" }))).toBe(false);
		expect(isSameOriginRequest(request({ origin: "https://phaseo.app.evil.example" }))).toBe(false);
		expect(isSameOriginRequest(request({ origin: "http://phaseo.app" }))).toBe(false);
	});

	it("without Origin, trusts only a same-origin or direct browser fetch", () => {
		expect(isSameOriginRequest(request({ "sec-fetch-site": "same-origin" }))).toBe(true);
		expect(isSameOriginRequest(request({ "sec-fetch-site": "none" }))).toBe(true);
		expect(isSameOriginRequest(request({ "sec-fetch-site": "same-site" }))).toBe(false);
		expect(isSameOriginRequest(request({ "sec-fetch-site": "cross-site" }))).toBe(false);
		expect(isSameOriginRequest(request({}))).toBe(false);
	});
});

describe("cookie-authenticated billing routes", () => {
	beforeEach(() => vi.clearAllMocks());

	it.each([
		["create a payment method", () => createPaymentMethod(request({ origin: "https://evil.example" }))],
		["delete a payment method", () => deletePaymentMethod(request({ origin: "https://evil.example" }, "DELETE"))],
		["request a refund", () => requestRefund(request({ "sec-fetch-site": "cross-site" }))],
	])("refuse a cross-site request to %s before touching Stripe", async (_name, call) => {
		const response = await call();

		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ error: "cross_origin_request" });
		expect(requireActiveTeamStripeCustomer).not.toHaveBeenCalled();
		expect(getStripe).not.toHaveBeenCalled();
	});
});
