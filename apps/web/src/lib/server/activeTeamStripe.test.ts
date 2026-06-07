export {};

const createClient = jest.fn();
const createAdminClient = jest.fn();
const getWorkspaceIdFromCookie = jest.fn();
const requireWorkspaceMembership = jest.fn();
const getStripe = jest.fn();

jest.mock("@/utils/supabase/server", () => ({
	createClient,
}));

jest.mock("@/utils/supabase/admin", () => ({
	createAdminClient,
}));

jest.mock("@/utils/workspaceCookie", () => ({
	getWorkspaceIdFromCookie,
}));

jest.mock("@/utils/serverActionAuth", () => ({
	requireWorkspaceMembership,
}));

jest.mock("@/lib/stripe", () => ({
	getStripe,
}));

describe("requireActiveTeamStripeCustomer", () => {
	beforeEach(() => {
		jest.resetModules();
		createClient.mockReset();
		createAdminClient.mockReset();
		getWorkspaceIdFromCookie.mockReset();
		requireWorkspaceMembership.mockReset();
		getStripe.mockReset();
	});

	it("repairs a stored customer id that is missing in the current Stripe account", async () => {
		const user = {
			id: "user_1",
			email: "owner@example.com",
			user_metadata: { full_name: "Owner User" },
		};

		const walletQuery: any = {
			select: jest.fn(() => walletQuery),
			eq: jest.fn(() => walletQuery),
			maybeSingle: jest.fn(async () => ({
				data: { workspace_id: "ws_1", stripe_customer_id: "cus_stale" },
				error: null,
			})),
		};

		createClient.mockResolvedValue({
			auth: {
				getUser: jest.fn(async () => ({
					data: { user },
					error: null,
				})),
			},
			from: jest.fn(() => walletQuery),
		} as any);

		const adminUpsert = jest.fn(async () => ({ error: null }));
		createAdminClient.mockReturnValue({
			from: jest.fn(() => ({
				upsert: adminUpsert,
			})),
		} as any);

		getWorkspaceIdFromCookie.mockResolvedValue("ws_1");
		requireWorkspaceMembership.mockResolvedValue(undefined);

		getStripe.mockReturnValue({
			customers: {
				retrieve: jest.fn(async () => {
					const error: any = new Error("No such customer: 'cus_stale'");
					error.code = "resource_missing";
					error.param = "id";
					throw error;
				}),
				search: jest.fn(async () => ({
					data: [{ id: "cus_test_mode" }],
				})),
				list: jest.fn(async () => ({ data: [] })),
				create: jest.fn(async () => ({ id: "cus_created" })),
			},
		});

		const { requireActiveTeamStripeCustomer } = await import("./activeTeamStripe");
		const result = await requireActiveTeamStripeCustomer();

		expect(result).toMatchObject({
			workspaceId: "ws_1",
			customerId: "cus_test_mode",
			userId: "user_1",
			userEmail: "owner@example.com",
		});
		expect(adminUpsert).toHaveBeenCalledWith(
			{ workspace_id: "ws_1", stripe_customer_id: "cus_test_mode" },
			{ onConflict: "workspace_id", ignoreDuplicates: false },
		);
	});
});
