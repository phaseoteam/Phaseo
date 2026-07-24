import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	getBatchFileMeta,
	getBatchJobMeta,
	isBatchJobBilled,
	listPendingBatchJobs,
	markBatchJobBilled,
	saveBatchFileMeta,
	saveBatchJobMeta,
} from "./batch-jobs";

const {
	claimAsyncOperationsForReconciliationMock,
	getAsyncOperationMock,
	isAsyncOperationBilledMock,
	markAsyncOperationBilledMock,
	updateAsyncOperationReconciliationMock,
	upsertAsyncOperationMock,
} = vi.hoisted(() => ({
	claimAsyncOperationsForReconciliationMock: vi.fn(),
	getAsyncOperationMock: vi.fn(),
	isAsyncOperationBilledMock: vi.fn(),
	markAsyncOperationBilledMock: vi.fn(),
	updateAsyncOperationReconciliationMock: vi.fn(),
	upsertAsyncOperationMock: vi.fn(),
}));

vi.mock("@core/async-operations", () => ({
	claimAsyncOperationsForReconciliation: claimAsyncOperationsForReconciliationMock,
	getAsyncOperation: getAsyncOperationMock,
	isAsyncOperationBilled: isAsyncOperationBilledMock,
	markAsyncOperationBilled: markAsyncOperationBilledMock,
	updateAsyncOperationReconciliation: updateAsyncOperationReconciliationMock,
	upsertAsyncOperation: upsertAsyncOperationMock,
	setAsyncOperationStatus: vi.fn(async () => undefined),
	patchAsyncOperationMeta: vi.fn(async () => undefined),
}));

describe("batch-jobs metadata", () => {
	beforeEach(() => {
		claimAsyncOperationsForReconciliationMock.mockReset();
		getAsyncOperationMock.mockReset();
		isAsyncOperationBilledMock.mockReset();
		markAsyncOperationBilledMock.mockReset();
		updateAsyncOperationReconciliationMock.mockReset();
		upsertAsyncOperationMock.mockReset();
		isAsyncOperationBilledMock.mockResolvedValue(false);
		claimAsyncOperationsForReconciliationMock.mockResolvedValue([]);
		markAsyncOperationBilledMock.mockResolvedValue(true);
	});

	it("stores batch meta with native batch id when provided", async () => {
		await saveBatchJobMeta("team_1", "batch_1", {
			provider: "openai",
			nativeBatchId: "b_native_1",
			status: "in_progress",
		});

		expect(upsertAsyncOperationMock).toHaveBeenCalledTimes(1);
		expect(upsertAsyncOperationMock).toHaveBeenCalledWith(expect.objectContaining({
			workspaceId: "team_1",
			kind: "batch",
			internalId: "batch_1",
			nativeId: "b_native_1",
			provider: "openai",
			status: "in_progress",
			nextReconcileAt: expect.any(String),
		}));
		expect(upsertAsyncOperationMock.mock.calls[0]?.[0]?.meta).toEqual(expect.objectContaining({
			resource: "job",
			provider: "openai",
			nativeBatchId: "b_native_1",
			status: "in_progress",
		}));
	});

	it("stores and reads batch-owned file metadata via prefixed internal ids", async () => {
		await saveBatchFileMeta("team_1", "file_1", {
			provider: "openai",
			status: "uploaded",
			purpose: "batch",
		});

		expect(upsertAsyncOperationMock).toHaveBeenCalledWith(expect.objectContaining({
			workspaceId: "team_1",
			kind: "batch",
			internalId: "__file__:file_1",
			nativeId: "file_1",
			provider: "openai",
		}));

		getAsyncOperationMock.mockResolvedValueOnce({
			workspace_id: "team_1",
			kind: "batch",
			internal_id: "__file__:file_1",
			provider: "openai",
			native_id: "file_1",
			model: null,
			status: "processed",
			meta: {
				resource: "file",
				provider: "openai",
				purpose: "batch",
				filename: "input.jsonl",
				bytes: 128,
			},
			billed_at: null,
			created_at: null,
			updated_at: null,
		});

		const meta = await getBatchFileMeta("team_1", "file_1");
		expect(meta).toEqual(expect.objectContaining({
			provider: "openai",
			status: "processed",
			purpose: "batch",
			filename: "input.jsonl",
			bytes: 128,
		}));
	});

	it("returns null for non-file batch records", async () => {
		getAsyncOperationMock.mockResolvedValueOnce({
			workspace_id: "team_1",
			kind: "batch",
			internal_id: "batch_1",
			provider: "openai",
			native_id: "batch_1",
			model: null,
			status: "completed",
			meta: {
				provider: "openai",
				status: "completed",
			},
			billed_at: null,
			created_at: null,
			updated_at: null,
		});

		const fileMeta = await getBatchFileMeta("team_1", "batch_1");
		expect(fileMeta).toBeNull();
	});

	it("reads extended batch metadata fields", async () => {
		getAsyncOperationMock.mockResolvedValueOnce({
			workspace_id: "team_1",
			kind: "batch",
			internal_id: "batch_2",
			provider: "openai",
			native_id: "batch_2",
			model: "gpt-4.1-mini",
			status: "completed",
			meta: {
				provider: "openai",
				status: "completed",
				endpoint: "/v1/responses",
				completionWindow: "24h",
				inputFileId: "file_in",
				outputFileId: "file_out",
				errorFileId: "file_err",
			},
			billed_at: null,
			created_at: null,
			updated_at: null,
		});

		const batchMeta = await getBatchJobMeta("team_1", "batch_2");
		expect(batchMeta).toEqual(expect.objectContaining({
			provider: "openai",
			status: "completed",
			model: "gpt-4.1-mini",
			endpoint: "/v1/responses",
			completionWindow: "24h",
			inputFileId: "file_in",
			outputFileId: "file_out",
			errorFileId: "file_err",
		}));
	});

	it("normalizes legacy inline input mode metadata to requests", async () => {
		getAsyncOperationMock.mockResolvedValueOnce({
			workspace_id: "team_1",
			kind: "batch",
			internal_id: "batch_legacy",
			provider: "openai",
			native_id: "batch_native",
			model: "gpt-4.1-mini",
			status: "completed",
			meta: {
				provider: "openai",
				status: "completed",
				inputMode: "inline",
			},
			billed_at: null,
			created_at: null,
			updated_at: null,
		});

		const batchMeta = await getBatchJobMeta("team_1", "batch_legacy");
		expect(batchMeta).toEqual(expect.objectContaining({
			provider: "openai",
			inputMode: "requests",
		}));
	});

	it("delegates billed state helpers through async operations storage", async () => {
		isAsyncOperationBilledMock.mockResolvedValueOnce(true);
		markAsyncOperationBilledMock.mockResolvedValueOnce(true);

		await expect(isBatchJobBilled("team_1", "batch_1")).resolves.toBe(true);
		await expect(markBatchJobBilled("team_1", "batch_1")).resolves.toBe(true);

		expect(isAsyncOperationBilledMock).toHaveBeenCalledWith("team_1", "batch", "batch_1");
		expect(markAsyncOperationBilledMock).toHaveBeenCalledWith("team_1", "batch", "batch_1");
	});

	it("claims due batch jobs while excluding batch-owned file records", async () => {
		claimAsyncOperationsForReconciliationMock.mockResolvedValueOnce([
			{
				workspaceId: "team_1",
				kind: "batch",
				internalId: "__file__:file_pending",
				requestId: null,
				sessionId: null,
				appId: null,
				provider: "openai",
				nativeId: "file_pending",
				model: null,
				status: "pending",
				meta: { resource: "file", provider: "openai", status: "pending" },
				billedAt: null,
				nextReconcileAt: "2026-05-05T00:01:00.000Z",
				reconcileAttempts: 1,
				reconcileLockedAt: "2026-05-05T00:01:01.000Z",
				reconcileLockedBy: "worker-1",
				lastReconcileError: null,
				createdAt: "2026-05-05T00:00:00.000Z",
				updatedAt: "2026-05-05T00:00:30.000Z",
			},
			{
				workspaceId: "team_1",
				kind: "batch",
				internalId: "batch_pending",
				requestId: null,
				sessionId: null,
				appId: null,
				provider: "openai",
				nativeId: "batch_pending",
				model: "openai/gpt-5-mini",
				status: "pending",
				meta: { provider: "openai", status: "pending" },
				billedAt: null,
				nextReconcileAt: "2026-05-05T00:01:00.000Z",
				reconcileAttempts: 1,
				reconcileLockedAt: "2026-05-05T00:01:01.000Z",
				reconcileLockedBy: "worker-1",
				lastReconcileError: null,
				createdAt: "2026-05-05T00:00:00.000Z",
				updatedAt: "2026-05-05T00:01:00.000Z",
			},
			{
				workspaceId: "team_1",
				kind: "batch",
				internalId: "batch_done",
				requestId: null,
				sessionId: null,
				appId: null,
				provider: "openai",
				nativeId: "batch_done",
				model: "openai/gpt-5-mini",
				status: "completed",
				meta: { provider: "openai", status: "completed" },
				billedAt: null,
				nextReconcileAt: "2026-05-05T00:02:00.000Z",
				reconcileAttempts: 2,
				reconcileLockedAt: "2026-05-05T00:02:01.000Z",
				reconcileLockedBy: "worker-1",
				lastReconcileError: null,
				createdAt: "2026-05-05T00:00:00.000Z",
				updatedAt: "2026-05-05T00:02:00.000Z",
			},
		]);

		const jobs = await listPendingBatchJobs(25, {
			workerId: "worker-1",
			leaseSeconds: 300,
			shardCount: 4,
			shardIndex: 1,
		});

		expect(claimAsyncOperationsForReconciliationMock).toHaveBeenCalledWith({
			kind: "batch",
			limit: 25,
			statuses: [
				null,
				"submitting",
				"submission_unknown",
				"validating",
				"pending",
				"in_progress",
				"finalizing",
				"cancelling",
				"completed",
				"failed",
				"expired",
				"cancelled",
				"canceled",
			],
			workerId: "worker-1",
			leaseSeconds: 300,
			shardCount: 4,
			shardIndex: 1,
		});
		expect(jobs).toHaveLength(2);
		expect(jobs[0]).toMatchObject({
			workspaceId: "team_1",
			batchId: "batch_pending",
			status: "pending",
			provider: "openai",
		});
		expect(jobs[1]).toMatchObject({
			workspaceId: "team_1",
			batchId: "batch_done",
			status: "completed",
			provider: "openai",
			reconcileAttempts: 2,
		});
	});
});
