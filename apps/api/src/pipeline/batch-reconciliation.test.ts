import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getBindingsMock,
	dispatchAsyncWebhookEventInBackgroundMock,
	listPendingBatchJobsMock,
	saveBatchFileMetaMock,
	saveBatchJobMetaMock,
	finalizeBatchJobMock,
	resolveProviderKeyMock,
	operationLog,
} = vi.hoisted(() => ({
	getBindingsMock: vi.fn(),
	dispatchAsyncWebhookEventInBackgroundMock: vi.fn(),
	listPendingBatchJobsMock: vi.fn(),
	saveBatchFileMetaMock: vi.fn(),
	saveBatchJobMetaMock: vi.fn(),
	finalizeBatchJobMock: vi.fn(),
	resolveProviderKeyMock: vi.fn(),
	operationLog: [] as string[],
}));

vi.mock("@/runtime/env", () => ({
	getBindings: getBindingsMock,
}));

vi.mock("@core/async-notifications", () => ({
	dispatchAsyncWebhookEventInBackground: dispatchAsyncWebhookEventInBackgroundMock,
}));

vi.mock("@core/batch-jobs", () => ({
	listPendingBatchJobs: listPendingBatchJobsMock,
	saveBatchFileMeta: saveBatchFileMetaMock,
	saveBatchJobMeta: saveBatchJobMetaMock,
}));

vi.mock("@core/batch-finalization", () => ({
	finalizeBatchJob: finalizeBatchJobMock,
}));

vi.mock("@providers/keys", () => ({
	resolveProviderKey: resolveProviderKeyMock,
}));

import { runBatchReconciliationJob } from "./batch-reconciliation";

describe("runBatchReconciliationJob", () => {
	beforeEach(() => {
		getBindingsMock.mockReset();
		dispatchAsyncWebhookEventInBackgroundMock.mockReset();
		listPendingBatchJobsMock.mockReset();
		saveBatchFileMetaMock.mockReset();
		saveBatchJobMetaMock.mockReset();
		finalizeBatchJobMock.mockReset();
		resolveProviderKeyMock.mockReset();
		operationLog.length = 0;
		vi.restoreAllMocks();

		getBindingsMock.mockReturnValue({
			OPENAI_API_KEY: "sk_test_123",
			OPENAI_BASE_URL: "https://api.openai.example",
		});
		resolveProviderKeyMock.mockReturnValue({ key: "sk_test_123" });
		saveBatchFileMetaMock.mockResolvedValue(undefined);
		saveBatchJobMetaMock.mockResolvedValue(undefined);
		finalizeBatchJobMock.mockResolvedValue({
			status: "completed",
			charged: false,
			billed: true,
			reason: "test",
		});
		finalizeBatchJobMock.mockImplementation(async (args: Record<string, unknown>) => {
			operationLog.push(`finalize:${String(args.batchId)}:${String(args.status)}`);
			return {
				status: String(args.status ?? ""),
				charged: false,
				billed: true,
				reason: "test",
			};
		});
		dispatchAsyncWebhookEventInBackgroundMock.mockImplementation((args: Record<string, unknown>) => {
			operationLog.push(`webhook:${String(args.internalId)}:${String(args.phase)}`);
		});
	});

	it("reconciles completed, expired, and cancelled batches with file ownership persistence", async () => {
		listPendingBatchJobsMock.mockResolvedValue([
			{
				workspaceId: "ws_1",
				batchId: "batch_complete_123",
				provider: "openai",
				status: "in_progress",
				meta: { provider: "openai", status: "in_progress" },
			},
			{
				workspaceId: "ws_1",
				batchId: "batch_expired_123",
				nativeId: "batch_native_expired_123",
				provider: "openai",
				status: "in_progress",
				meta: { provider: "openai", status: "in_progress", nativeBatchId: "batch_native_expired_123" },
			},
			{
				workspaceId: "ws_1",
				batchId: "batch_cancelled_123",
				provider: "openai",
				status: "pending",
				meta: { provider: "openai", status: "pending" },
			},
		]);

		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.endsWith("/batches/batch_complete_123")) {
				return new Response(JSON.stringify({
					id: "batch_complete_123",
					status: "completed",
					model: "openai/gpt-5-mini",
					endpoint: "/v1/responses",
					completion_window: "24h",
					input_file_id: "file_in_123",
					output_file_id: "file_out_123",
					error_file_id: "file_err_123",
				}), { status: 200, headers: { "Content-Type": "application/json" } });
			}
			if (url.endsWith("/batches/batch_native_expired_123")) {
				return new Response(JSON.stringify({
					id: "batch_native_expired_123",
					status: "expired",
				}), { status: 200, headers: { "Content-Type": "application/json" } });
			}
			if (url.endsWith("/batches/batch_cancelled_123")) {
				return new Response(JSON.stringify({
					id: "batch_cancelled_123",
					status: "cancelled",
				}), { status: 200, headers: { "Content-Type": "application/json" } });
			}
			return new Response("not found", { status: 404 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const summary = await runBatchReconciliationJob({ concurrency: 1 });

		expect(summary.jobsScanned).toBe(3);
		expect(summary.jobsPolled).toBe(3);
		expect(summary.jobsUpdated).toBe(3);
		expect(summary.jobsCompleted).toBe(1);
		expect(summary.jobsFailed).toBe(0);
		expect(summary.jobsExpired).toBe(1);
		expect(summary.jobsCancelled).toBe(1);
		expect(summary.jobsErrored).toBe(0);

		expect(saveBatchJobMetaMock).toHaveBeenCalledTimes(3);
		expect(saveBatchFileMetaMock).toHaveBeenCalledWith("ws_1", "file_out_123", {
			provider: "openai",
			status: "available",
		});
		expect(saveBatchFileMetaMock).toHaveBeenCalledWith("ws_1", "file_err_123", {
			provider: "openai",
			status: "available",
		});

		expect(dispatchAsyncWebhookEventInBackgroundMock).toHaveBeenCalledWith({
			workspaceId: "ws_1",
			kind: "batch",
			internalId: "batch_complete_123",
			phase: "completed",
		});
		expect(dispatchAsyncWebhookEventInBackgroundMock).toHaveBeenCalledWith({
			workspaceId: "ws_1",
			kind: "batch",
			internalId: "batch_expired_123",
			phase: "expired",
		});
		expect(dispatchAsyncWebhookEventInBackgroundMock).toHaveBeenCalledWith({
			workspaceId: "ws_1",
			kind: "batch",
			internalId: "batch_cancelled_123",
			phase: "cancelled",
		});
		expect(finalizeBatchJobMock).toHaveBeenCalledTimes(3);
		expect(finalizeBatchJobMock).toHaveBeenCalledWith({
			workspaceId: "ws_1",
			batchId: "batch_complete_123",
			status: "completed",
		});
		expect(finalizeBatchJobMock).toHaveBeenCalledWith({
			workspaceId: "ws_1",
			batchId: "batch_expired_123",
			status: "expired",
		});
		expect(finalizeBatchJobMock).toHaveBeenCalledWith({
			workspaceId: "ws_1",
			batchId: "batch_cancelled_123",
			status: "cancelled",
		});
		expect(operationLog).toEqual([
			"finalize:batch_complete_123:completed",
			"webhook:batch_complete_123:completed",
			"finalize:batch_expired_123:expired",
			"webhook:batch_expired_123:expired",
			"finalize:batch_cancelled_123:cancelled",
			"webhook:batch_cancelled_123:cancelled",
		]);
	});

	it("dispatches progress webhooks from in-progress request counts", async () => {
		listPendingBatchJobsMock.mockResolvedValue([
			{
				workspaceId: "ws_1",
				batchId: "batch_progress_123",
				provider: "openai",
				status: "in_progress",
				meta: { provider: "openai", status: "in_progress" },
			},
		]);

		const fetchMock = vi.fn(async () =>
			new Response(JSON.stringify({
				id: "batch_progress_123",
				status: "in_progress",
				endpoint: "/v1/responses",
				request_counts: {
					total: 10,
					completed: 4,
					failed: 1,
				},
			}), { status: 200, headers: { "Content-Type": "application/json" } }),
		);
		vi.stubGlobal("fetch", fetchMock);

		const summary = await runBatchReconciliationJob({ concurrency: 1 });

		expect(summary).toMatchObject({
			jobsScanned: 1,
			jobsPolled: 1,
			jobsUpdated: 1,
			jobsCompleted: 0,
			jobsFailed: 0,
			jobsExpired: 0,
			jobsCancelled: 0,
			jobsErrored: 0,
		});
		expect(saveBatchJobMetaMock).toHaveBeenCalledWith(
			"ws_1",
			"batch_progress_123",
			expect.objectContaining({
				status: "in_progress",
				requestCounts: {
					total: 10,
					completed: 4,
					failed: 1,
				},
				lastPolledAt: expect.any(String),
				polledStatus: "in_progress",
			}),
		);
		expect(finalizeBatchJobMock).not.toHaveBeenCalled();
		expect(dispatchAsyncWebhookEventInBackgroundMock).toHaveBeenCalledWith({
			workspaceId: "ws_1",
			kind: "batch",
			internalId: "batch_progress_123",
			phase: "progress",
			progress: 50,
		});
	});

	it("finalizes and counts unchanged terminal batches without duplicate webhook events", async () => {
		listPendingBatchJobsMock.mockResolvedValue([
			{
				workspaceId: "ws_1",
				batchId: "batch_same_123",
				provider: "openai",
				status: "completed",
				meta: { provider: "openai", status: "completed" },
			},
		]);

		const fetchMock = vi.fn(async () => {
			throw new Error("Terminal batches should be finalized from stored state before upstream polling");
		});
		vi.stubGlobal("fetch", fetchMock);

		const summary = await runBatchReconciliationJob({ concurrency: 1 });

		expect(summary.jobsScanned).toBe(1);
		expect(summary.jobsPolled).toBe(0);
		expect(summary.jobsUpdated).toBe(1);
		expect(summary.jobsCompleted).toBe(1);
		expect(summary.jobsFailed).toBe(0);
		expect(summary.jobsCancelled).toBe(0);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(saveBatchJobMetaMock).not.toHaveBeenCalled();
		expect(dispatchAsyncWebhookEventInBackgroundMock).not.toHaveBeenCalled();
		expect(finalizeBatchJobMock).toHaveBeenCalledTimes(1);
		expect(finalizeBatchJobMock).toHaveBeenCalledWith({
			workspaceId: "ws_1",
			batchId: "batch_same_123",
			status: "completed",
		});
	});

	it("uses the finalized terminal status for stored terminal records without polling upstream", async () => {
		listPendingBatchJobsMock.mockResolvedValue([
			{
				workspaceId: "ws_1",
				batchId: "batch_stale_terminal_123",
				provider: "openai",
				status: "failed",
				meta: {
					provider: "openai",
					status: "failed",
					errorFileId: "file_error_stale_terminal_123",
				},
			},
		]);
		finalizeBatchJobMock.mockImplementation(async (args: Record<string, unknown>) => {
			operationLog.push(`finalize:${String(args.batchId)}:${String(args.status)}`);
			return {
				status: "failed",
				charged: false,
				billed: true,
				reason: "stale_terminal_status",
			};
		});
		dispatchAsyncWebhookEventInBackgroundMock.mockImplementation((args: Record<string, unknown>) => {
			operationLog.push(`webhook:${String(args.internalId)}:${String(args.phase)}`);
		});
		const fetchMock = vi.fn(async () => {
			throw new Error("Terminal batches should be finalized from stored state before upstream polling");
		});
		vi.stubGlobal("fetch", fetchMock);

		const summary = await runBatchReconciliationJob({ concurrency: 1 });

		expect(finalizeBatchJobMock).toHaveBeenCalledWith({
			workspaceId: "ws_1",
			batchId: "batch_stale_terminal_123",
			status: "failed",
		});
		expect(fetchMock).not.toHaveBeenCalled();
		expect(dispatchAsyncWebhookEventInBackgroundMock).not.toHaveBeenCalled();
		expect(saveBatchJobMetaMock).not.toHaveBeenCalled();
		expect(summary).toMatchObject({
			jobsCompleted: 0,
			jobsFailed: 1,
			jobsExpired: 0,
			jobsCancelled: 0,
			jobsErrored: 0,
		});
		expect(operationLog).toEqual([
			"finalize:batch_stale_terminal_123:failed",
		]);
	});
});
