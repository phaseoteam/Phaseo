import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const invalidateGatewayCreditCacheMock = vi.fn();
const releaseRuntimeMock = vi.fn();
const enqueueAutoTopUpFailedEmailMock = vi.fn();

vi.mock("stripe", () => ({
	default: class StripeMock {
		customers = { retrieve: vi.fn() };
		paymentMethods = { list: vi.fn() };
		paymentIntents = { create: vi.fn() };
	},
}));

function makeTableQuery() {
	return {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
	};
}

vi.mock("../../runtime/env", () => ({
	ensureRuntimeForBackground: vi.fn(() => releaseRuntimeMock),
	getSupabaseAdmin: vi.fn(() => ({
		rpc: rpcMock,
		from: vi.fn(() => makeTableQuery()),
	})),
}));

vi.mock("../../core/gateway-credit-cache", () => ({
	invalidateGatewayCreditCache: (...args: unknown[]) =>
		invalidateGatewayCreditCacheMock(...args),
}));

vi.mock("../notifications/low-balance", () => ({
	enqueueLowBalanceEmail: vi.fn(),
}));

vi.mock("../notifications/billing-alerts", () => ({
	enqueueAutoTopUpFailedEmail: (...args: unknown[]) => enqueueAutoTopUpFailedEmailMock(...args),
}));

describe("recordUsageAndCharge", () => {
	beforeEach(() => {
		rpcMock.mockReset();
		invalidateGatewayCreditCacheMock.mockReset();
		releaseRuntimeMock.mockReset();
		enqueueAutoTopUpFailedEmailMock.mockReset().mockResolvedValue(true);
		process.env.STRIPE_SECRET_KEY = "sk_test_example";
	});

	it("invalidates the workspace credit cache after a successful new charge", async () => {
		rpcMock.mockResolvedValue({
			data: { status: "charged", applied: true, already_applied: false },
			error: null,
		});
		const { recordUsageAndCharge } = await import("./persist");

		await recordUsageAndCharge({
			requestId: "req_123",
			workspaceId: "workspace_123",
			cost_nanos: 123,
		});

		expect(invalidateGatewayCreditCacheMock).toHaveBeenCalledWith("workspace_123");
		expect(releaseRuntimeMock).toHaveBeenCalledTimes(1);
	});

	it("does not invalidate the workspace credit cache for idempotent replays", async () => {
		rpcMock.mockResolvedValue({
			data: { status: "charged", already_applied: true },
			error: null,
		});
		const { recordUsageAndCharge } = await import("./persist");

		await recordUsageAndCharge({
			requestId: "req_123",
			workspaceId: "workspace_123",
			cost_nanos: 123,
		});

		expect(invalidateGatewayCreditCacheMock).not.toHaveBeenCalled();
		expect(releaseRuntimeMock).toHaveBeenCalledTimes(1);
	});

	it("queues an owner notification when Auto Top-Up has no payment method", async () => {
		rpcMock.mockResolvedValue({
			data: {
				status: "top_up_required",
				applied: true,
				already_applied: false,
				auto_top_up_amount_nanos: 25_000_000_000,
				auto_top_up_account_id: null,
				stripe_customer_id: null,
			},
			error: null,
		});
		const { recordUsageAndCharge } = await import("./persist");

		await recordUsageAndCharge({
			requestId: "req_no_card",
			workspaceId: "workspace_123",
			cost_nanos: 123,
		});

		expect(enqueueAutoTopUpFailedEmailMock).toHaveBeenCalledWith({
			workspaceId: "workspace_123",
			dedupeId: "no_payment_method:req_no_card",
			reason: "No saved payment method is available for Auto Top-Up.",
		});
	});
});
