import { beforeEach, describe, expect, it, vi } from "vitest";

const getAsyncOperationMock = vi.fn();
const isAsyncOperationBilledMock = vi.fn();
const markAsyncOperationBilledMock = vi.fn();
const claimAsyncOperationsForReconciliationMock = vi.fn();
const updateAsyncOperationReconciliationMock = vi.fn();
const upsertAsyncOperationMock = vi.fn();

vi.mock("@core/async-operations", () => ({
	claimAsyncOperationsForReconciliation: (...args: unknown[]) => claimAsyncOperationsForReconciliationMock(...args),
	getAsyncOperation: (...args: unknown[]) => getAsyncOperationMock(...args),
	isAsyncOperationBilled: (...args: unknown[]) => isAsyncOperationBilledMock(...args),
	markAsyncOperationBilled: (...args: unknown[]) => markAsyncOperationBilledMock(...args),
	updateAsyncOperationReconciliation: (...args: unknown[]) => updateAsyncOperationReconciliationMock(...args),
	upsertAsyncOperation: (...args: unknown[]) => upsertAsyncOperationMock(...args),
}));

import { getVideoJobMeta, isVideoJobBilled, listPendingVideoJobs, markVideoJobBilled, saveVideoJobMeta } from "./video-jobs";

describe("video-jobs", () => {
	beforeEach(() => {
		getAsyncOperationMock.mockReset();
		isAsyncOperationBilledMock.mockReset();
		markAsyncOperationBilledMock.mockReset();
		claimAsyncOperationsForReconciliationMock.mockReset();
		updateAsyncOperationReconciliationMock.mockReset();
		upsertAsyncOperationMock.mockReset();
	});

	it("reads metadata from DB", async () => {
		getAsyncOperationMock.mockResolvedValue({
			workspaceId: "team_1",
			kind: "video",
			internalId: "vid_1",
			provider: "openai",
			nativeId: "vid_1",
			model: "sora-2",
			status: null,
			meta: { seconds: 5, quality: "low" },
			billedAt: null,
			createdAt: null,
			updatedAt: null,
		});

		const meta = await getVideoJobMeta("team_1", "vid_1");
		expect(meta).toEqual({
			provider: "openai",
			model: "sora-2",
			seconds: 5,
			quality: "low",
		});
	});

	it("returns null when DB record is missing", async () => {
		getAsyncOperationMock.mockResolvedValue(null);
		const meta = await getVideoJobMeta("team_2", "gaiop_abc");
		expect(meta).toBeNull();
	});

	it("checks billed flag in DB", async () => {
		isAsyncOperationBilledMock.mockResolvedValue(true);

		const billed = await isVideoJobBilled("team_3", "vid_3");
		expect(billed).toBe(true);
	});

	it("marks billed state in DB", async () => {
		markAsyncOperationBilledMock.mockResolvedValue(true);

		await markVideoJobBilled("team_4", "vid_4");

		expect(markAsyncOperationBilledMock).toHaveBeenCalledWith("team_4", "video", "vid_4");
	});

	it("saves metadata to DB", async () => {
		upsertAsyncOperationMock.mockResolvedValue(undefined);

		await saveVideoJobMeta("team_5", "vid_5", {
			provider: "openai",
			model: "sora-2",
			seconds: 2,
			providerTaskId: "native_vid_5",
		}, "native_vid_5");

		expect(upsertAsyncOperationMock).toHaveBeenCalledWith(expect.objectContaining({
			workspaceId: "team_5",
			kind: "video",
			internalId: "vid_5",
			nativeId: "native_vid_5",
			provider: "openai",
			model: "sora-2",
			nextReconcileAt: expect.any(String),
		}));
	});

	it("claims due unbilled video jobs for reconciliation", async () => {
		claimAsyncOperationsForReconciliationMock.mockResolvedValueOnce([
			{
				workspaceId: "team_6",
				kind: "video",
				internalId: "vid_6",
				requestId: "req_6",
				sessionId: null,
				appId: null,
				provider: "openai",
				nativeId: "native_vid_6",
				model: "sora-2",
				status: "completed",
				meta: { provider: "openai", seconds: 4 },
				billedAt: null,
				nextReconcileAt: "2026-06-17T10:00:00.000Z",
				reconcileAttempts: 3,
				reconcileLockedAt: "2026-06-17T10:00:01.000Z",
				reconcileLockedBy: "worker-1",
				lastReconcileError: null,
				createdAt: "2026-06-17T09:59:00.000Z",
				updatedAt: "2026-06-17T10:00:01.000Z",
			},
		]);

		const jobs = await listPendingVideoJobs(250, {
			workerId: "worker-1",
			leaseSeconds: 180,
			shardCount: 8,
			shardIndex: 2,
		});

		expect(claimAsyncOperationsForReconciliationMock).toHaveBeenCalledWith({
			kind: "video",
			limit: 250,
			statuses: [null, "queued", "pending", "in_progress", "processing", "running", "completed", "failed"],
			workerId: "worker-1",
			leaseSeconds: 180,
			shardCount: 8,
			shardIndex: 2,
		});
		expect(jobs).toHaveLength(1);
		expect(jobs[0]).toMatchObject({
			workspaceId: "team_6",
			videoId: "vid_6",
			status: "completed",
			nextReconcileAt: "2026-06-17T10:00:00.000Z",
			reconcileAttempts: 3,
		});
	});
});
