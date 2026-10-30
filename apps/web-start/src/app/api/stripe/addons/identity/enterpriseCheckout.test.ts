import { ENTERPRISE_PRICING_VERSION } from "@/lib/billing/enterprisePricing";

const mockRolloutEnabled = jest.fn();
const mockBillingAdmin = jest.fn();
const mockStripeCustomer = jest.fn();
const mockAdminClient = jest.fn();
const mockStripe = jest.fn();

jest.mock("@/lib/flags", () => ({ enterpriseSelfServePreviewEnabled: mockRolloutEnabled }));
jest.mock("@/lib/server/activeTeamStripe", () => ({
	requireActiveWorkspaceBillingAdmin: mockBillingAdmin,
	requireActiveWorkspaceStripeCustomer: mockStripeCustomer,
}));
jest.mock("@/utils/supabase/admin", () => ({ createAdminClient: mockAdminClient }));
jest.mock("@/lib/stripe", () => ({ getStripe: mockStripe }));

let quotePost: (request: Request) => Promise<Response>;
let checkoutPost: (request: Request) => Promise<Response>;

function request(path: string, body: Record<string, unknown>) {
	return new Request(`https://phaseo.app/api/stripe/addons/identity${path}`, {
		method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
	});
}

describe("Enterprise quote to checkout", () => {
	let currentMembers: number;
	let storedQuote: Record<string, any> | null;
	let createSession: jest.Mock;

	beforeEach(async () => {
		jest.clearAllMocks();
		quotePost = (await import("./quote/route")).POST;
		checkoutPost = (await import("./route")).POST;
		currentMembers = 10;
		storedQuote = null;
		mockRolloutEnabled.mockResolvedValue(true);
		mockBillingAdmin.mockResolvedValue({ workspaceId: "workspace_1" });
		mockStripeCustomer.mockResolvedValue({ workspaceId: "workspace_1", customerId: "cus_1" });
		createSession = jest.fn().mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/test" });
		mockStripe.mockReturnValue({ checkout: { sessions: { create: createSession } } });
		mockAdminClient.mockReturnValue({
			from: (table: string) => {
				const query: any = {
					select: jest.fn(() => query), eq: jest.fn(() => query), is: jest.fn(() => query), gt: jest.fn(() => query),
					insert: jest.fn((row) => {
						storedQuote = { ...row, id: "quote_1", expires_at: "2099-01-01T00:00:00Z" };
						return query;
					}),
					update: jest.fn(() => query),
					single: jest.fn(async () => ({ data: storedQuote, error: null })),
					maybeSingle: jest.fn(async () => ({ data: table === "workspace_enterprise_quotes" ? storedQuote : null, error: null })),
					then: (resolve: (result: unknown) => unknown) => Promise.resolve({ count: currentMembers, error: null }).then(resolve),
				};
				return query;
			},
		});
	});

	function quoteRequest(memberCount = 5) {
		return request("/quote", {
			workspaceId: "workspace_1", memberCount, expectedMonthlyTopUpUsd: 0,
			typicalTopUpUsd: 0, paymentPreference: "card", needsSso: true, needsScim: true,
		});
	}

	it("quotes a small team with the full allowance and charges Stripe $29", async () => {
		const response = await quotePost(quoteRequest());
		expect(response.status).toBe(200);
		const quote = await response.json();
		expect(quote.options[0]).toMatchObject({ monthlyUsd: 29, includedMembers: 100, feePolicy: "standard_5_percent" });
		expect(mockBillingAdmin).toHaveBeenCalledWith(["owner", "admin"], "workspace_1");
		const checkout = await checkoutPost(request("", { workspaceId: "workspace_1", quoteId: quote.quoteId, variant: "core" }));
		expect(checkout.status).toBe(200);
		expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
			mode: "subscription",
			line_items: [expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 2900, currency: "usd" }) })],
			metadata: expect.objectContaining({ pricing_version: ENTERPRISE_PRICING_VERSION, included_members: "100" }),
		}), expect.anything());
	});

	it("charges $79 for a 1,000-member allowance", async () => {
		await quotePost(quoteRequest(1_000));
		const checkout = await checkoutPost(request("", { workspaceId: "workspace_1", quoteId: "quote_1", variant: "core" }));
		expect(checkout.status).toBe(200);
		expect(createSession.mock.calls[0][0].line_items[0].price_data.unit_amount).toBe(7900);
	});

	it("rejects a workspace that exceeds the entry allowance", async () => {
		currentMembers = 101;
		expect((await quotePost(quoteRequest())).status).toBe(400);
		expect(storedQuote).toBeNull();
	});

	it("rechecks allowance if the workspace grows before checkout", async () => {
		await quotePost(quoteRequest());
		currentMembers = 101;
		expect((await checkoutPost(request("", { quoteId: "quote_1", variant: "core" }))).status).toBe(409);
		expect(createSession).not.toHaveBeenCalled();
	});

	it("rejects an old pricing version instead of silently changing a quote", async () => {
		await quotePost(quoteRequest());
		storedQuote!.pricing_version = "2026-08-21-enterprise-entry";
		expect((await checkoutPost(request("", { quoteId: "quote_1", variant: "core" }))).status).toBe(409);
		expect(createSession).not.toHaveBeenCalled();
	});

	it("rejects a stored quote whose amount no longer matches the server price", async () => {
		await quotePost(quoteRequest());
		storedQuote!.monthly_price_cents = 1;
		expect((await checkoutPost(request("", { quoteId: "quote_1", variant: "core" }))).status).toBe(409);
		expect(createSession).not.toHaveBeenCalled();
	});

	it("keeps billing authorization when rollout is open", async () => {
		mockBillingAdmin.mockRejectedValue(new Error("unauthorized"));
		expect((await quotePost(quoteRequest())).status).toBe(401);
		mockStripeCustomer.mockRejectedValue(new Error("unauthorized"));
		expect((await checkoutPost(request("", { quoteId: "quote_1", variant: "core" }))).status).toBe(401);
		expect(createSession).not.toHaveBeenCalled();
	});

	it("keeps quote and checkout closed when Statsig does not pass", async () => {
		mockRolloutEnabled.mockResolvedValue(false);
		expect((await quotePost(quoteRequest())).status).toBe(404);
		expect((await checkoutPost(request("", { quoteId: "quote_1", variant: "core" }))).status).toBe(404);
		expect(mockBillingAdmin).not.toHaveBeenCalled();
		expect(mockStripeCustomer).not.toHaveBeenCalled();
	});
});
