import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getBindingsMock,
	dispatchAsyncWebhookEventInBackgroundMock,
	listPendingBatchJobsMock,
	saveBatchFileMetaMock,
	saveBatchJobMetaMock,
	updateBatchJobReconciliationMock,
	finalizeBatchJobMock,
	resolveProviderKeyMock,
	releaseStaleOrphanBatchReservationsMock,
	findProviderBatchByGatewayMetadataMock,
} = vi.hoisted(() => ({
	getBindingsMock: vi.fn(),
	dispatchAsyncWebhookEventInBackgroundMock: vi.fn(),
	listPendingBatchJobsMock: vi.fn(),
	saveBatchFileMetaMock: vi.fn(),
	saveBatchJobMetaMock: vi.fn(),
	updateBatchJobReconciliationMock: vi.fn(),
	finalizeBatchJobMock: vi.fn(),
	resolveProviderKeyMock: vi.fn(),
	releaseStaleOrphanBatchReservationsMock: vi.fn(),
	findProviderBatchByGatewayMetadataMock: vi.fn(),
}));

vi.mock("@core/batch-provider-adapters", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@core/batch-provider-adapters")>();
	return {
		...actual,
		findProviderBatchByGatewayMetadata: findProviderBatchByGatewayMetadataMock,
	};
});

vi.mock("@/runtime/env", () => ({
	getBindings: getBindingsMock,
}));

vi.mock("@core/async-notifications", () => ({
	dispatchAsyncWebhookEventInBackground: dispatchAsyncWebhookEventInBackgroundMock,
}));

vi.mock("@core/batch-jobs", () => ({
	listPendingBatchJobs: listPendingBatchJobsMock,
	resolveBatchProviderNativeId: vi.fn((args: { batchId: string; nativeId?: string | null; meta?: Record<string, unknown> | null }) => {
		const nativeId = typeof args.nativeId === "string" && args.nativeId.trim() ? args.nativeId.trim() : null;
		const nativeBatchId =
			typeof args.meta?.nativeBatchId === "string" && args.meta.nativeBatchId.trim()
				? args.meta.nativeBatchId.trim()
				: null;
		return nativeId ?? nativeBatchId ?? args.batchId;
	}),
	saveBatchFileMeta: saveBatchFileMetaMock,
	saveBatchJobMeta: saveBatchJobMetaMock,
	updateBatchJobReconciliation: updateBatchJobReconciliationMock,
}));

vi.mock("@core/batch-finalization", () => ({
	finalizeBatchJob: finalizeBatchJobMock,
}));

vi.mock("@core/wallet-reservations", () => ({
	releaseStaleOrphanBatchReservations: releaseStaleOrphanBatchReservationsMock,
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
		updateBatchJobReconciliationMock.mockReset();
		finalizeBatchJobMock.mockReset();
		resolveProviderKeyMock.mockReset();
		releaseStaleOrphanBatchReservationsMock.mockReset().mockResolvedValue(0);
		findProviderBatchByGatewayMetadataMock.mockReset().mockResolvedValue(null);
		vi.restoreAllMocks();

		getBindingsMock.mockReturnValue({
			OPENAI_API_KEY: "sk_test_123",
			OPENAI_BASE_URL: "https://api.openai.example",
			GOOGLE_AI_STUDIO_API_KEY: "google_test_123",
		});
		resolveProviderKeyMock.mockReturnValue({ key: "sk_test_123" });
		saveBatchFileMetaMock.mockResolvedValue(undefined);
		saveBatchJobMetaMock.mockResolvedValue(undefined);
		updateBatchJobReconciliationMock.mockResolvedValue(undefined);
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
		expect(updateBatchJobReconciliationMock).toHaveBeenCalledTimes(3);
		expect(updateBatchJobReconciliationMock).toHaveBeenCalledWith({
			workspaceId: "ws_1",
			batchId: "batch_complete_123",
			nextReconcileAt: null,
			lastError: null,
		});
	});

	it("quarantines stale submitting batches and retains the hold when provider acceptance is unknown", async () => {
		listPendingBatchJobsMock.mockResolvedValue([{
			workspaceId: "ws_1",
			batchId: "batch_stale_submit",
			requestId: "req_stale_submit",
			nativeId: null,
			provider: "openai",
			model: "openai/gpt-5.4-nano",
			status: "submitting",
			meta: {
				provider: "openai",
				status: "submitting",
				reservationId: "batch_hold:req_stale_submit",
				reservationStatus: "held",
			},
			reconcileAttempts: 0,
			createdAt: "2026-06-17T15:00:00.000Z",
			updatedAt: "2026-06-17T15:00:00.000Z",
		}]);
		vi.setSystemTime(new Date("2026-06-17T16:00:00.000Z"));

		const result = await runBatchReconciliationJob();

		expect(saveBatchJobMetaMock).toHaveBeenCalledWith("ws_1", "batch_stale_submit", expect.objectContaining({
			status: "submission_unknown",
			reservationStatus: "held",
			billingReason: "manual_recovery_required_provider_id_unknown",
		}));
		expect(result).toMatchObject({ jobsUpdated: 1, jobsErrored: 1, jobsPolled: 0 });
	});

	it("finalizes terminal jobs without native ids instead of polling a gateway id forever", async () => {
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
			throw new Error("Terminal jobs without native ids must not poll providers");
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
		expect(dispatchAsyncWebhookEventInBackgroundMock).toHaveBeenCalledWith({
			workspaceId: "ws_1",
			kind: "batch",
			internalId: "batch_same_123",
			phase: "completed",
		});
		expect(finalizeBatchJobMock).toHaveBeenCalledTimes(1);
		expect(finalizeBatchJobMock).toHaveBeenCalledWith({
			workspaceId: "ws_1",
			batchId: "batch_same_123",
			status: "completed",
		});
	});

	it("keeps terminal batches retryable when billing finalization is blocked", async () => {
		listPendingBatchJobsMock.mockResolvedValue([
			{
				workspaceId: "ws_1",
				batchId: "batch_missing_usage_123",
				provider: "openai",
				status: "in_progress",
				reconcileAttempts: 2,
				meta: { provider: "openai", status: "in_progress" },
			},
		]);
		finalizeBatchJobMock.mockResolvedValueOnce({
			status: "completed",
			charged: false,
			billed: false,
			reason: "missing_usage",
		});

		const fetchMock = vi.fn(async () =>
			new Response(JSON.stringify({
				id: "batch_missing_usage_123",
				status: "completed",
			}), { status: 200, headers: { "Content-Type": "application/json" } }),
		);
		vi.stubGlobal("fetch", fetchMock);

		const summary = await runBatchReconciliationJob({ concurrency: 1 });

		expect(summary.jobsScanned).toBe(1);
		expect(summary.jobsPolled).toBe(1);
		expect(summary.jobsUpdated).toBe(1);
		expect(summary.jobsCompleted).toBe(0);
		expect(summary.jobsErrored).toBe(1);
		expect(dispatchAsyncWebhookEventInBackgroundMock).not.toHaveBeenCalled();
		expect(updateBatchJobReconciliationMock).toHaveBeenCalledTimes(1);
		expect(updateBatchJobReconciliationMock).toHaveBeenCalledWith({
			workspaceId: "ws_1",
			batchId: "batch_missing_usage_123",
			nextReconcileAt: expect.any(String),
			lastError: "batch_billing_blocked:missing_usage",
		});
		expect(updateBatchJobReconciliationMock.mock.calls[0]?.[0]?.nextReconcileAt).not.toBeNull();
	});

	it("polls providers by stored native id while updating the public batch id", async () => {
		listPendingBatchJobsMock.mockResolvedValue([
			{
				workspaceId: "ws_1",
				batchId: "batch_public_123",
				nativeId: "batch_native_123",
				provider: "openai",
				status: "in_progress",
				meta: {
					provider: "openai",
					nativeBatchId: "batch_native_123",
					status: "in_progress",
				},
			},
		]);

		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			if (String(input) === "https://api.openai.example/v1/batches/batch_native_123") {
				return new Response(JSON.stringify({
					id: "batch_native_123",
					status: "completed",
				}), { status: 200, headers: { "Content-Type": "application/json" } });
			}
			return new Response("not found", { status: 404 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const summary = await runBatchReconciliationJob({ concurrency: 1 });

		expect(summary.jobsPolled).toBe(1);
		expect(saveBatchJobMetaMock).toHaveBeenCalledWith("ws_1", "batch_public_123", expect.objectContaining({
			provider: "openai",
			nativeBatchId: "batch_native_123",
			status: "completed",
		}));
		expect(finalizeBatchJobMock).toHaveBeenCalledWith({
			workspaceId: "ws_1",
			batchId: "batch_public_123",
			status: "completed",
		});
		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.openai.example/v1/batches/batch_native_123",
			expect.any(Object),
		);
	});

	it("recovers an unknown OpenAI submission from deterministic provider metadata", async () => {
		listPendingBatchJobsMock.mockResolvedValue([{
			workspaceId: "ws_1",
			batchId: "batch_public_unknown",
			requestId: "req_unknown",
			provider: "openai",
			status: "submission_unknown",
			reconcileAttempts: 1,
			meta: { provider: "openai", status: "submission_unknown", requestId: "req_unknown" },
		}]);
		findProviderBatchByGatewayMetadataMock.mockResolvedValueOnce({
			id: "batch_native_recovered",
			native_batch_id: "batch_native_recovered",
			status: "in_progress",
			metadata: { phaseo_batch_id: "batch_public_unknown" },
		});
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
			id: "batch_native_recovered",
			status: "in_progress",
		}), { status: 200, headers: { "Content-Type": "application/json" } })));

		const summary = await runBatchReconciliationJob({ concurrency: 1 });
		expect(summary.jobsPolled).toBe(1);
		expect(findProviderBatchByGatewayMetadataMock).toHaveBeenCalledWith({
			providerId: "openai",
			batchId: "batch_public_unknown",
			requestId: "req_unknown",
		});
		expect(saveBatchJobMetaMock).toHaveBeenCalledWith("ws_1", "batch_public_unknown", expect.objectContaining({
			nativeBatchId: "batch_native_recovered",
			submissionOutcome: "accepted",
		}));
	});

	it("polls native provider batch APIs and normalizes terminal statuses", async () => {
		listPendingBatchJobsMock.mockResolvedValue([
			{
				workspaceId: "ws_1",
				batchId: "batch_anthropic_public",
				nativeId: "batch_anthropic_native",
				provider: "anthropic",
				status: "in_progress",
				meta: { provider: "anthropic", nativeBatchId: "batch_anthropic_native", status: "in_progress" },
			},
			{
				workspaceId: "ws_1",
				batchId: "batch_gemini_public",
				nativeId: "batches/batch_gemini_native",
				provider: "google-ai-studio",
				status: "in_progress",
				meta: { provider: "google-ai-studio", nativeBatchId: "batches/batch_gemini_native", status: "in_progress" },
			},
			{
				workspaceId: "ws_1",
				batchId: "batch_mistral_public",
				nativeId: "batch_mistral_native",
				provider: "mistral",
				status: "in_progress",
				meta: { provider: "mistral", nativeBatchId: "batch_mistral_native", status: "in_progress" },
			},
			{
				workspaceId: "ws_1",
				batchId: "batch_xai_public",
				nativeId: "batch_xai_native",
				provider: "x-ai",
				status: "in_progress",
				meta: { provider: "x-ai", nativeBatchId: "batch_xai_native", status: "in_progress" },
			},
		]);

		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url === "https://api.anthropic.com/v1/messages/batches/batch_anthropic_native") {
				return new Response(JSON.stringify({
					id: "batch_anthropic_native",
					processing_status: "ended",
					request_counts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 },
				}), { status: 200, headers: { "Content-Type": "application/json" } });
			}
			if (url === "https://generativelanguage.googleapis.com/v1beta/batches/batch_gemini_native") {
				return new Response(JSON.stringify({
					name: "batches/batch_gemini_native",
					metadata: {
						state: "BATCH_STATE_FAILED",
						batchStats: { requestCount: 1, successfulRequestCount: 0, failedRequestCount: 1 },
					},
				}), { status: 200, headers: { "Content-Type": "application/json" } });
			}
			if (url === "https://api.mistral.ai/v1/batch/jobs/batch_mistral_native") {
				return new Response(JSON.stringify({
					id: "batch_mistral_native",
					status: "CANCELLED",
					total_requests: 1,
					succeeded_requests: 0,
					failed_requests: 1,
				}), { status: 200, headers: { "Content-Type": "application/json" } });
			}
			if (url === "https://api.x.ai/v1/batches/batch_xai_native") {
				return new Response(JSON.stringify({
					id: "batch_xai_native",
					status: "completed",
					state: { num_requests: 2, num_success: 2, num_error: 0 },
				}), { status: 200, headers: { "Content-Type": "application/json" } });
			}
			return new Response("not found", { status: 404 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const summary = await runBatchReconciliationJob({ concurrency: 1 });

		expect(summary.jobsPolled).toBe(4);
		expect(summary.jobsCompleted).toBe(2);
		expect(summary.jobsFailed).toBe(1);
		expect(summary.jobsCancelled).toBe(1);
		expect(saveBatchJobMetaMock).toHaveBeenCalledWith("ws_1", "batch_anthropic_public", expect.objectContaining({
			provider: "anthropic",
			status: "completed",
			nativeBatchId: "batch_anthropic_native",
		}));
		expect(saveBatchJobMetaMock).toHaveBeenCalledWith("ws_1", "batch_gemini_public", expect.objectContaining({
			provider: "google-ai-studio",
			status: "failed",
			nativeBatchId: "batches/batch_gemini_native",
		}));
		expect(saveBatchJobMetaMock).toHaveBeenCalledWith("ws_1", "batch_mistral_public", expect.objectContaining({
			provider: "mistral",
			status: "cancelled",
			nativeBatchId: "batch_mistral_native",
		}));
		expect(saveBatchJobMetaMock).toHaveBeenCalledWith("ws_1", "batch_xai_public", expect.objectContaining({
			provider: "x-ai",
			status: "completed",
			nativeBatchId: "batch_xai_native",
			requestCounts: {
				total: 2,
				completed: 2,
				failed: 0,
			},
		}));
		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.anthropic.com/v1/messages/batches/batch_anthropic_native",
			expect.any(Object),
		);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://generativelanguage.googleapis.com/v1beta/batches/batch_gemini_native",
			expect.any(Object),
		);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.mistral.ai/v1/batch/jobs/batch_mistral_native",
			expect.any(Object),
		);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.x.ai/v1/batches/batch_xai_native",
			expect.any(Object),
		);
	});
});
