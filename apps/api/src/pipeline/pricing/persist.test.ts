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

	it("retains a high-balance snapshot only on explicit database approval", async () => {
		rpcMock.mockResolvedValue({ data: { status: "top_up_not_required", applied: true, invalidate_credit_cache: false }, error: null });
		const { recordUsageAndCharge } = await import("./persist");
		await recordUsageAndCharge({ requestId: "r", workspaceId: "ws", cost_nanos: 100, creditSnapshotBalanceNanos: 100_000_000_000_000 });
		expect(rpcMock).toHaveBeenCalledWith("gateway_charge_with_credit_cache", {
			p_workspace_id: "ws", p_request_id: "r", p_cost_nanos: 100, p_credit_snapshot_balance_nanos: 100_000_000_000_000,
		});
		expect(invalidateGatewayCreditCacheMock).not.toHaveBeenCalled();
	});

	it("invalidates a replay when the database requests it without repeating top-up side effects", async () => {
		rpcMock.mockResolvedValue({ data: { status: "top_up_required", already_applied: true, invalidate_credit_cache: true }, error: null });
		const { recordUsageAndCharge } = await import("./persist");
		await recordUsageAndCharge({ requestId: "r", workspaceId: "ws", cost_nanos: 100 });
		expect(invalidateGatewayCreditCacheMock).toHaveBeenCalledWith("ws");
		expect(enqueueAutoTopUpFailedEmailMock).not.toHaveBeenCalled();
	});

	it("invalidates stale admission credit when charging fails", async () => {
		const error = { message: "insufficient_unreserved_balance" };
		rpcMock.mockResolvedValue({ data: null, error });
		const { recordUsageAndCharge } = await import("./persist");
		await expect(recordUsageAndCharge({ requestId: "r", workspaceId: "ws", cost_nanos: 100 })).rejects.toEqual(error);
		expect(invalidateGatewayCreditCacheMock).toHaveBeenCalledWith("ws");
	});

	it.each(["applied", "already_applied"])("never treats a missing wallet as settled despite legacy %s", async flag => {
		rpcMock.mockResolvedValue({ data: { status: "wallet_not_found", [flag]: true, invalidate_credit_cache: false }, error: null });
		const { recordUsageAndCharge } = await import("./persist");
		await expect(recordUsageAndCharge({ requestId: "immutable", workspaceId: "ws", cost_nanos: 100 }))
			.rejects.toThrow("gateway_charge_wallet_not_found");
		expect(invalidateGatewayCreditCacheMock).toHaveBeenCalledExactlyOnceWith("ws");
		expect(enqueueAutoTopUpFailedEmailMock).not.toHaveBeenCalled();
		expect(releaseRuntimeMock).toHaveBeenCalledOnce();
	});

	it("passes a recovery abort signal to the debit and preserves uncertain-debit invalidation", async () => {
		const abort = new AbortController();
		const error = { message: "AbortError: debit outcome unknown" };
		const abortSignal = vi.fn().mockResolvedValue({ data: null, error });
		rpcMock.mockReturnValue({ abortSignal });
		const { recordUsageAndCharge } = await import("./persist");
		await expect(recordUsageAndCharge({ requestId: "immutable", workspaceId: "ws", cost_nanos: 100,
			debitSignal: abort.signal })).rejects.toEqual(error);
		expect(abortSignal).toHaveBeenCalledExactlyOnceWith(abort.signal);
		expect(rpcMock).toHaveBeenCalledExactlyOnceWith("gateway_charge_with_credit_cache", {
			p_workspace_id: "ws", p_request_id: "immutable", p_cost_nanos: 100, p_credit_snapshot_balance_nanos: null,
		});
		expect(invalidateGatewayCreditCacheMock).toHaveBeenCalledExactlyOnceWith("ws");
		expect(releaseRuntimeMock).toHaveBeenCalledOnce();
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
			dedupeId: expect.stringMatching(/^no_payment_method:workspace_123:\d+$/),
			reason: "No saved payment method is available for Auto Top-Up.",
		});
	});

	it("deduplicates missing payment-method notifications across requests in the cooldown window", async () => {
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

		await recordUsageAndCharge({ requestId: "req_one", workspaceId: "workspace_123", cost_nanos: 123 });
		await recordUsageAndCharge({ requestId: "req_two", workspaceId: "workspace_123", cost_nanos: 123 });

		const dedupeIds = enqueueAutoTopUpFailedEmailMock.mock.calls.map(([call]) => call.dedupeId);
		expect(dedupeIds).toHaveLength(2);
		expect(dedupeIds[0]).toBe(dedupeIds[1]);
	});
});
