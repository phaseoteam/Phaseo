import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const invalidateGatewayCreditCacheMock = vi.fn();
const releaseRuntimeMock = vi.fn();

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

describe("recordUsageAndCharge", () => {
	beforeEach(() => {
		rpcMock.mockReset();
		invalidateGatewayCreditCacheMock.mockReset();
		releaseRuntimeMock.mockReset();
	});

	it("invalidates the workspace credit cache after a successful new charge", async () => {
		rpcMock.mockResolvedValue({
			data: { status: "charged", already_applied: false },
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
});
