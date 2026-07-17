import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const invalidateGatewayCreditCacheMock = vi.fn();
const setKeyVersionMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({
		rpc: (...args: any[]) => rpcMock(...args),
	}),
}));

vi.mock("@core/gateway-credit-cache", () => ({
	invalidateGatewayCreditCache: (...args: unknown[]) => invalidateGatewayCreditCacheMock(...args),
}));

vi.mock("@core/kv", () => ({
	setKeyVersion: (...args: unknown[]) => setKeyVersionMock(...args),
}));

import {
	captureWalletReservation,
	releaseWalletReservation,
	releaseStaleOrphanBatchReservations,
	reserveWalletCredits,
	settleWalletReservation,
} from "./wallet-reservations";

describe("wallet reservation RPC compatibility", () => {
	beforeEach(() => {
		rpcMock.mockReset();
		invalidateGatewayCreditCacheMock.mockReset();
		setKeyVersionMock.mockReset();
	});

	it("retries reserve calls against legacy p_team_id signatures", async () => {
		rpcMock
			.mockResolvedValueOnce({
				data: null,
				error: {
					code: "PGRST202",
					hint: "Perhaps you meant to call the function public.gateway_wallet_reserve_once(p_amount_nanos, p_hold_ref_id, p_reservation_id, p_team_id)",
				},
			})
			.mockResolvedValueOnce({
				data: [
					{
						applied: true,
						already_applied: false,
						status: "held",
						amount_nanos: 150000000,
						before_balance_nanos: 500000000,
						after_balance_nanos: 500000000,
						before_reserved_nanos: 0,
						after_reserved_nanos: 150000000,
					},
				],
				error: null,
			});

		const result = await reserveWalletCredits({
			workspaceId: "6108396e-0e12-425d-91ff-a02d39a346e0",
			reservationId: "video_reservation:req_123",
			amountNanos: 150000000,
			holdRefId: "req_123",
			keyId: "key_123",
			requestCount: 2,
		});

		expect(result.status).toBe("held");
		expect(result.applied).toBe(true);
		expect(rpcMock).toHaveBeenCalledTimes(2);
		expect(rpcMock.mock.calls[0]?.[1]).toMatchObject({
			p_workspace_id: "6108396e-0e12-425d-91ff-a02d39a346e0",
		});
		expect(rpcMock.mock.calls[1]?.[1]).toMatchObject({
			p_team_id: "6108396e-0e12-425d-91ff-a02d39a346e0",
		});
		expect(rpcMock.mock.calls[1]?.[1]).not.toHaveProperty("p_workspace_id");
		expect(invalidateGatewayCreditCacheMock).toHaveBeenCalledWith("6108396e-0e12-425d-91ff-a02d39a346e0");
		expect(setKeyVersionMock).toHaveBeenCalledWith("id", "key_123", expect.any(Number));
	});

	it("retries capture and release calls against legacy p_team_id signatures", async () => {
		rpcMock
			.mockResolvedValueOnce({
				data: null,
				error: {
					code: "PGRST202",
					message: "Could not find the function public.gateway_wallet_capture_once(p_capture_ref_id, p_reservation_id, p_workspace_id) in the schema cache",
				},
			})
			.mockResolvedValueOnce({
				data: [{ status: "captured", amount_nanos: 150000000 }],
				error: null,
			})
			.mockResolvedValueOnce({
				data: null,
				error: {
					code: "PGRST202",
					details: "Searched for the function public.gateway_wallet_release_once with parameters p_release_ref_id, p_reservation_id, p_workspace_id",
					hint: "Perhaps you meant to call the function public.gateway_wallet_release_once(p_release_ref_id, p_reservation_id, p_team_id)",
				},
			})
			.mockResolvedValueOnce({
				data: [{ status: "released", amount_nanos: 150000000 }],
				error: null,
			});

		const workspaceId = "6108396e-0e12-425d-91ff-a02d39a346e0";
		await expect(
			captureWalletReservation({
				workspaceId,
				reservationId: "video_reservation:req_123",
				captureRefId: "req_123",
			}),
		).resolves.toMatchObject({ status: "captured" });
		await expect(
			releaseWalletReservation({
				workspaceId,
				reservationId: "video_reservation:req_124",
				releaseRefId: "req_124",
			}),
		).resolves.toMatchObject({ status: "released" });

		expect(rpcMock).toHaveBeenCalledTimes(4);
		expect(rpcMock.mock.calls[1]?.[1]).toMatchObject({ p_team_id: workspaceId });
		expect(rpcMock.mock.calls[3]?.[1]).toMatchObject({ p_team_id: workspaceId });
	});

	it("normalizes current reservation RPC shapes and settles an exact batch cost", async () => {
		rpcMock
			.mockResolvedValueOnce({ data: [{ ok: true, applied: true, reason: null, amount_nanos: 500 }], error: null })
			.mockResolvedValueOnce({ data: [{ ok: true, applied: true, reason: null, amount_nanos: 320 }], error: null });
		await expect(reserveWalletCredits({
			workspaceId: "ws_1",
			reservationId: "batch_hold:req_1",
			amountNanos: 500,
		})).resolves.toMatchObject({ status: "held", applied: true });
		await expect(settleWalletReservation({
			workspaceId: "ws_1",
			reservationId: "batch_hold:req_1",
			actualNanos: 320,
			settleRefId: "batch_1",
		})).resolves.toMatchObject({ status: "captured", applied: true, amountNanos: 320 });
		expect(rpcMock.mock.calls[1]).toEqual(["gateway_wallet_settle_once", {
			p_workspace_id: "ws_1",
			p_reservation_id: "batch_hold:req_1",
			p_actual_nanos: 320,
			p_settle_ref_id: "batch_1",
		}]);
		expect(invalidateGatewayCreditCacheMock).toHaveBeenCalledTimes(2);
	});

	it("invalidates caches when an idempotent retry reports an already-applied transition", async () => {
		rpcMock.mockResolvedValueOnce({
			data: [{ ok: true, applied: false, already_applied: false, reason: "already_reserved", amount_nanos: 500 }],
			error: null,
		});
		await expect(reserveWalletCredits({
			workspaceId: "ws_retry",
			reservationId: "batch_hold:req_retry",
			amountNanos: 500,
			keyId: "key_retry",
		})).resolves.toMatchObject({ status: "held", alreadyApplied: true });
		expect(invalidateGatewayCreditCacheMock).toHaveBeenCalledWith("ws_retry");
		expect(setKeyVersionMock).toHaveBeenCalledWith("id", "key_retry", expect.any(Number));
	});

	it("releases stale orphan batch holds through the bounded reaper RPC", async () => {
		rpcMock.mockResolvedValueOnce({ data: 3, error: null });
		await expect(releaseStaleOrphanBatchReservations({ olderThanSeconds: 60, limit: 5000 })).resolves.toBe(3);
		expect(rpcMock).toHaveBeenCalledWith("gateway_wallet_release_stale_orphan_batch_reservations", {
			p_older_than_seconds: 300,
			p_limit: 1000,
		});
	});
});
