import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({
		rpc: (...args: any[]) => rpcMock(...args),
	}),
}));

import {
	captureWalletReservation,
	releaseWalletReservation,
	reserveWalletCredits,
} from "./wallet-reservations";

describe("wallet reservation RPC compatibility", () => {
	beforeEach(() => {
		rpcMock.mockReset();
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
});
