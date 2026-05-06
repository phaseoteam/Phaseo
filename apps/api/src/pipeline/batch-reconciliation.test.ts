import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getBindingsMock,
	dispatchAsyncWebhookEventInBackgroundMock,
	listPendingBatchJobsMock,
	saveBatchFileMetaMock,
	saveBatchJobMetaMock,
	finalizeBatchJobMock,
	resolveProviderKeyMock,
} = vi.hoisted(() => ({
	getBindingsMock: vi.fn(),
	dispatchAsyncWebhookEventInBackgroundMock: vi.fn(),
	listPendingBatchJobsMock: vi.fn(),
	saveBatchFileMetaMock: vi.fn(),
	saveBatchJobMetaMock: vi.fn(),
	finalizeBatchJobMock: vi.fn(),
	resolveProviderKeyMock: vi.fn(),
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
		dispatchAsyncWebhookEventInBackgroundMock.mockImplementation(() => {});
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
				provider: "openai",
				status: "in_progress",
				meta: { provider: "openai", status: "in_progress" },
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
			if (url.endsWith("/batches/batch_expired_123")) {
				return new Response(JSON.stringify({
					id: "batch_expired_123",
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
		expect(summary.jobsFailed).toBe(1);
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
			phase: "failed",
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
	});

	it("does not dispatch terminal webhook events when the status does not change", async () => {
		listPendingBatchJobsMock.mockResolvedValue([
			{
				workspaceId: "ws_1",
				batchId: "batch_same_123",
				provider: "openai",
				status: "completed",
				meta: { provider: "openai", status: "completed" },
			},
		]);

		const fetchMock = vi.fn(async () =>
			new Response(JSON.stringify({
				id: "batch_same_123",
				status: "completed",
			}), { status: 200, headers: { "Content-Type": "application/json" } }),
		);
		vi.stubGlobal("fetch", fetchMock);

		const summary = await runBatchReconciliationJob({ concurrency: 1 });

		expect(summary.jobsScanned).toBe(1);
		expect(summary.jobsPolled).toBe(1);
		expect(summary.jobsUpdated).toBe(1);
		expect(summary.jobsCompleted).toBe(0);
		expect(summary.jobsFailed).toBe(0);
		expect(summary.jobsCancelled).toBe(0);
		expect(dispatchAsyncWebhookEventInBackgroundMock).not.toHaveBeenCalled();
		expect(finalizeBatchJobMock).toHaveBeenCalledTimes(1);
		expect(finalizeBatchJobMock).toHaveBeenCalledWith({
			workspaceId: "ws_1",
			batchId: "batch_same_123",
			status: "completed",
		});
	});
});
