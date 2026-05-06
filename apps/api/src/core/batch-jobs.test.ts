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
	getAsyncOperationMock,
	isAsyncOperationBilledMock,
	listAsyncOperationsMock,
	markAsyncOperationBilledMock,
	upsertAsyncOperationMock,
} = vi.hoisted(() => ({
	getAsyncOperationMock: vi.fn(),
	isAsyncOperationBilledMock: vi.fn(),
	listAsyncOperationsMock: vi.fn(),
	markAsyncOperationBilledMock: vi.fn(),
	upsertAsyncOperationMock: vi.fn(),
}));

vi.mock("@core/async-operations", () => ({
	getAsyncOperation: getAsyncOperationMock,
	isAsyncOperationBilled: isAsyncOperationBilledMock,
	listAsyncOperations: listAsyncOperationsMock,
	markAsyncOperationBilled: markAsyncOperationBilledMock,
	upsertAsyncOperation: upsertAsyncOperationMock,
	setAsyncOperationStatus: vi.fn(async () => undefined),
	patchAsyncOperationMeta: vi.fn(async () => undefined),
}));

describe("batch-jobs metadata", () => {
	beforeEach(() => {
		getAsyncOperationMock.mockReset();
		isAsyncOperationBilledMock.mockReset();
		listAsyncOperationsMock.mockReset();
		markAsyncOperationBilledMock.mockReset();
		upsertAsyncOperationMock.mockReset();
		isAsyncOperationBilledMock.mockResolvedValue(false);
		listAsyncOperationsMock.mockResolvedValue([]);
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

	it("delegates billed state helpers through async operations storage", async () => {
		isAsyncOperationBilledMock.mockResolvedValueOnce(true);
		markAsyncOperationBilledMock.mockResolvedValueOnce(true);

		await expect(isBatchJobBilled("team_1", "batch_1")).resolves.toBe(true);
		await expect(markBatchJobBilled("team_1", "batch_1")).resolves.toBe(true);

		expect(isAsyncOperationBilledMock).toHaveBeenCalledWith("team_1", "batch", "batch_1");
		expect(markAsyncOperationBilledMock).toHaveBeenCalledWith("team_1", "batch", "batch_1");
	});

	it("lists only pending batch jobs from shared async operations storage", async () => {
		listAsyncOperationsMock.mockResolvedValueOnce([
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
				billedAt: "2026-05-05T00:02:00.000Z",
				createdAt: "2026-05-05T00:00:00.000Z",
				updatedAt: "2026-05-05T00:02:00.000Z",
			},
		]);

		const jobs = await listPendingBatchJobs(25);

		expect(listAsyncOperationsMock).toHaveBeenCalledWith({
			kind: "batch",
			limit: 25,
			statuses: [null, "validating", "pending", "in_progress", "finalizing", "cancelling"],
		});
		expect(jobs).toHaveLength(1);
		expect(jobs[0]).toMatchObject({
			workspaceId: "team_1",
			batchId: "batch_pending",
			status: "pending",
			provider: "openai",
		});
	});
});
