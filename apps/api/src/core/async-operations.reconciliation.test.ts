import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, rpcMock, updateMock, eqMock } = vi.hoisted(() => ({
	fromMock: vi.fn(),
	rpcMock: vi.fn(),
	updateMock: vi.fn(),
	eqMock: vi.fn(),
}));

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({
		from: fromMock,
		rpc: rpcMock,
	}),
}));

import {
	claimAsyncOperationsForReconciliation,
	updateAsyncOperationReconciliation,
} from "./async-operations";

describe("async operation reconciliation storage", () => {
	beforeEach(() => {
		fromMock.mockReset();
		rpcMock.mockReset();
		updateMock.mockReset();
		eqMock.mockReset();
	});

	it("claims due operations through the private reconciliation RPC", async () => {
		rpcMock.mockResolvedValueOnce({
			data: [
				{
					workspace_id: "team_1",
					kind: "video",
					internal_id: "vid_1",
					request_id: "req_1",
					session_id: null,
					app_id: null,
					provider: "openai",
					native_id: "native_vid_1",
					model: "sora-2",
					status: "in_progress",
					meta: { provider: "openai" },
					billed_at: null,
					next_reconcile_at: "2026-06-17T10:00:00.000Z",
					reconcile_attempts: 2,
					reconcile_locked_at: "2026-06-17T10:00:01.000Z",
					reconcile_locked_by: "worker-1",
					last_reconcile_error: null,
					created_at: "2026-06-17T09:59:00.000Z",
					updated_at: "2026-06-17T10:00:01.000Z",
				},
			],
			error: null,
		});

		const records = await claimAsyncOperationsForReconciliation({
			kind: "video",
			limit: 5000,
			statuses: [null, "in_progress", "in_progress"],
			workerId: "worker-1",
			leaseSeconds: 5,
			shardCount: 999,
			shardIndex: 500,
		});

		expect(rpcMock).toHaveBeenCalledWith("claim_gateway_async_operations_for_reconciliation", {
			p_kind: "video",
			p_limit: 2000,
			p_statuses: ["", "in_progress"],
			p_worker_id: "worker-1",
			p_lease_seconds: 30,
			p_shard_count: 256,
			p_shard_index: 255,
		});
		expect(records).toEqual([
			expect.objectContaining({
				workspaceId: "team_1",
				internalId: "vid_1",
				nextReconcileAt: "2026-06-17T10:00:00.000Z",
				reconcileAttempts: 2,
				reconcileLockedBy: "worker-1",
			}),
		]);
	});

	it("releases a reconciliation lease and schedules the next attempt", async () => {
		eqMock.mockReturnThis();
		updateMock.mockReturnValue({ eq: eqMock });
		fromMock.mockReturnValue({ update: updateMock });

		await updateAsyncOperationReconciliation({
			workspaceId: "team_1",
			kind: "batch",
			internalId: "batch_1",
			nextReconcileAt: "2026-06-17T10:05:00.000Z",
			lastError: null,
		});

		expect(fromMock).toHaveBeenCalledWith("gateway_async_operations");
		expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
			next_reconcile_at: "2026-06-17T10:05:00.000Z",
			reconcile_locked_at: null,
			reconcile_locked_by: null,
			last_reconcile_error: null,
		}));
		expect(eqMock).toHaveBeenCalledWith("workspace_id", "team_1");
		expect(eqMock).toHaveBeenCalledWith("kind", "batch");
		expect(eqMock).toHaveBeenCalledWith("internal_id", "batch_1");
	});
});
