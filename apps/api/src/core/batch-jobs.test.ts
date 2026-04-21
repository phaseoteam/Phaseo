import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	getBatchFileMeta,
	getBatchJobMeta,
	saveBatchFileMeta,
	saveBatchJobMeta,
} from "./batch-jobs";

const { getAsyncOperationMock, upsertAsyncOperationMock } = vi.hoisted(() => ({
	getAsyncOperationMock: vi.fn(),
	upsertAsyncOperationMock: vi.fn(),
}));

vi.mock("@core/async-operations", () => ({
	getAsyncOperation: getAsyncOperationMock,
	upsertAsyncOperation: upsertAsyncOperationMock,
	isAsyncOperationBilled: vi.fn(async () => false),
	markAsyncOperationBilled: vi.fn(async () => true),
}));

describe("batch-jobs metadata", () => {
	beforeEach(() => {
		getAsyncOperationMock.mockReset();
		upsertAsyncOperationMock.mockReset();
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
});
