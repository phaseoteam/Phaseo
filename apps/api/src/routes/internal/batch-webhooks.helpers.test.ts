import { beforeEach, describe, expect, it, vi } from "vitest";

const getBindingsMock = vi.fn();
const dispatchAsyncWebhookEventMock = vi.fn();
const batchMetaFromProviderPayloadMock = vi.fn();
const fetchProviderBatchStatusMock = vi.fn();
const finalizeBatchJobMock = vi.fn();
const findBatchJobRecordByNativeIdMock = vi.fn();
const saveBatchFileMetaMock = vi.fn();
const saveBatchJobMetaMock = vi.fn();
const markProviderEventProcessedMock = vi.fn();
const deferProviderEventMock = vi.fn();
const listUnprocessedProviderEventsMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getBindings: () => getBindingsMock(),
}));

vi.mock("@core/async-notifications", () => ({
	dispatchAsyncWebhookEvent: (...args: any[]) => dispatchAsyncWebhookEventMock(...args),
}));

vi.mock("@core/batch-provider-adapters", () => ({
	GOOGLE_AI_STUDIO_BATCH_PROVIDER_ID: "google-ai-studio",
	batchMetaFromProviderPayload: (...args: any[]) => batchMetaFromProviderPayloadMock(...args),
	fetchProviderBatchStatus: (...args: any[]) => fetchProviderBatchStatusMock(...args),
}));

vi.mock("@core/batch-finalization", () => ({
	finalizeBatchJob: (...args: any[]) => finalizeBatchJobMock(...args),
}));

vi.mock("@core/batch-jobs", () => ({
	findBatchJobRecordByNativeId: (...args: any[]) => findBatchJobRecordByNativeIdMock(...args),
	saveBatchFileMeta: (...args: any[]) => saveBatchFileMetaMock(...args),
	saveBatchJobMeta: (...args: any[]) => saveBatchJobMetaMock(...args),
}));

vi.mock("@core/provider-events", () => ({
	deferProviderEvent: (...args: any[]) => deferProviderEventMock(...args),
	listUnprocessedProviderEvents: (...args: any[]) => listUnprocessedProviderEventsMock(...args),
	markProviderEventProcessed: (...args: any[]) => markProviderEventProcessedMock(...args),
}));

import {
	mapOpenAiBatchTerminal,
	processGoogleAiStudioBatchWebhook,
	processOpenAiBatchWebhook,
	readProviderWebhookBody,
	runBatchProviderWebhookReplayJob,
	verifyGoogleAiStudioBatchWebhookSignature,
	verifyOpenAiBatchWebhookSignature,
} from "./batch-webhooks.helpers";
import { signHmacSha256 } from "./video-webhooks.helpers";

describe("batch webhook helpers", () => {
	beforeEach(() => {
		getBindingsMock.mockReset();
		dispatchAsyncWebhookEventMock.mockReset();
		dispatchAsyncWebhookEventMock.mockResolvedValue(true);
		batchMetaFromProviderPayloadMock.mockReset();
		fetchProviderBatchStatusMock.mockReset();
		finalizeBatchJobMock.mockReset();
		finalizeBatchJobMock.mockResolvedValue({ status: "completed", charged: true, billed: true, reason: "charged" });
		findBatchJobRecordByNativeIdMock.mockReset();
		saveBatchFileMetaMock.mockReset();
		saveBatchJobMetaMock.mockReset();
		markProviderEventProcessedMock.mockReset();
		deferProviderEventMock.mockReset();
		listUnprocessedProviderEventsMock.mockReset().mockResolvedValue([]);

		getBindingsMock.mockReturnValue({
			OPENAI_BATCH_WEBHOOK_SECRET: "batch-secret",
			OPENAI_WEBHOOK_SECRET: "fallback-secret",
			GOOGLE_AI_STUDIO_BATCH_WEBHOOK_SECRET: "gemini-secret",
		});
		batchMetaFromProviderPayloadMock.mockImplementation((payload: any, base: any) => ({
			...base,
			status: payload?.status ?? base?.status ?? null,
			model: payload?.model ?? base?.model ?? null,
			nativeBatchId: payload?.native_batch_id ?? payload?.id ?? base?.nativeBatchId ?? null,
			requestCounts: payload?.request_counts ?? base?.requestCounts ?? null,
		}));
		fetchProviderBatchStatusMock.mockResolvedValue({
			id: "batch_gemini",
			native_batch_id: "batches/batch_gemini",
			status: "completed",
			model: "gemini-2.5-flash",
			request_counts: {
				total: 2,
				completed: 2,
				failed: 0,
			},
		});
		findBatchJobRecordByNativeIdMock.mockImplementation(async (provider: string, nativeId: string) => {
			if (provider === "google-ai-studio" && nativeId === "batches/batch_gemini") {
				return {
					workspaceId: "ws_gemini",
					batchId: "batch_internal_gemini",
					nativeId: "batches/batch_gemini",
					model: "gemini-2.5-flash",
					status: "in_progress",
					meta: {
						provider: "google-ai-studio",
						model: "gemini-2.5-flash",
						endpoint: "/v1beta/models/gemini-2.5-flash:batchGenerateContent",
						nativeBatchId: "batches/batch_gemini",
						keySource: "gateway",
					},
				};
			}
			if (provider === "google-ai-studio") return null;
			return {
				workspaceId: "ws_batch",
				batchId: "batch_internal_123",
				nativeId: "batch_native_123",
				model: "gpt-4.1-mini",
				status: "in_progress",
				meta: {
					provider: "openai",
					model: "gpt-4.1-mini",
					endpoint: "/v1/responses",
					inputFileId: "file_input_123",
					keySource: "gateway",
				},
			};
		});
	});

	it("verifies OpenAI batch webhook signatures with the batch-specific secret", async () => {
		const rawBody = JSON.stringify({
			id: "evt_openai_batch_123",
			type: "batch.completed",
			data: { id: "batch_native_123" },
		});
		const timestamp = String(Math.floor(Date.now() / 1000));
		const signature = await signHmacSha256(
			"batch-secret",
			`evt_openai_batch_123.${timestamp}.${rawBody}`,
		);
		const req = new Request("https://api.ai-stats.test/internal/batch-webhooks/openai", {
			method: "POST",
			headers: {
				"webhook-id": "evt_openai_batch_123",
				"webhook-timestamp": timestamp,
				"webhook-signature": `v1=${signature}`,
			},
			body: rawBody,
		});

		await expect(verifyOpenAiBatchWebhookSignature(req, rawBody)).resolves.toBe(true);

		const badReq = new Request("https://api.ai-stats.test/internal/batch-webhooks/openai", {
			method: "POST",
			headers: {
				"webhook-id": "evt_openai_batch_123",
				"webhook-timestamp": timestamp,
				"webhook-signature": "v1=bad-signature",
			},
			body: rawBody,
		});
		await expect(verifyOpenAiBatchWebhookSignature(badReq, rawBody)).resolves.toBe(false);
	});

	it("verifies Gemini batch webhook signatures with Standard Webhooks headers", async () => {
		const rawBody = JSON.stringify({
			type: "batch.succeeded",
			version: "v1",
			data: { id: "batch_gemini" },
		});
		const timestamp = String(Math.floor(Date.now() / 1000));
		const signature = await signHmacSha256(
			"gemini-secret",
			`evt_gemini_batch_123.${timestamp}.${rawBody}`,
		);
		const req = new Request("https://api.ai-stats.test/internal/batch-webhooks/gemini", {
			method: "POST",
			headers: {
				"webhook-id": "evt_gemini_batch_123",
				"webhook-timestamp": timestamp,
				"webhook-signature": `v1,${signature}`,
			},
			body: rawBody,
		});

		await expect(verifyGoogleAiStudioBatchWebhookSignature(req, rawBody)).resolves.toBe(true);
	});

	it("rejects stale OpenAI batch webhook signatures", async () => {
		const rawBody = JSON.stringify({
			id: "evt_openai_batch_stale",
			type: "batch.completed",
			data: { id: "batch_native_123" },
		});
		const staleTimestamp = String(Math.floor(Date.now() / 1000) - 600);
		const signature = await signHmacSha256(
			"batch-secret",
			`evt_openai_batch_stale.${staleTimestamp}.${rawBody}`,
		);
		const req = new Request("https://api.ai-stats.test/internal/batch-webhooks/openai", {
			method: "POST",
			headers: {
				"webhook-id": "evt_openai_batch_stale",
				"webhook-timestamp": staleTimestamp,
				"webhook-signature": `v1=${signature}`,
			},
			body: rawBody,
		});

		await expect(verifyOpenAiBatchWebhookSignature(req, rawBody)).resolves.toBe(false);
	});

	it("finalizes, stores file ownership, and dispatches completed OpenAI batch webhooks", async () => {
		fetchProviderBatchStatusMock.mockResolvedValueOnce({
			id: "batch_native_123",
			status: "completed",
			model: "gpt-4.1-mini-2025-04-14",
			endpoint: "/v1/responses",
			input_file_id: "file_input_123",
			output_file_id: "file_output_123",
			error_file_id: "file_error_123",
			request_counts: { total: 3, completed: 2, failed: 1 },
		});
		await processOpenAiBatchWebhook({
			eventId: "evt_openai_batch_123",
			eventType: "batch.completed",
			payload: {
				data: {
					id: "batch_native_123",
					status: "completed",
					model: "gpt-4.1-mini-2025-04-14",
					endpoint: "/v1/responses",
					input_file_id: "file_input_123",
					output_file_id: "file_output_123",
					error_file_id: "file_error_123",
					request_counts: {
						total: 3,
						completed: 2,
						failed: 1,
					},
				},
			},
		});

		expect(findBatchJobRecordByNativeIdMock).toHaveBeenCalledWith("openai", "batch_native_123");
		expect(saveBatchJobMetaMock).toHaveBeenCalledWith(
			"ws_batch",
			"batch_internal_123",
			expect.objectContaining({
				provider: "openai",
				status: "completed",
				model: "gpt-4.1-mini-2025-04-14",
				nativeBatchId: "batch_native_123",
				outputFileId: "file_output_123",
				errorFileId: "file_error_123",
				requestCounts: {
					total: 3,
					completed: 2,
					failed: 1,
				},
			}),
		);
		expect(saveBatchFileMetaMock).toHaveBeenCalledWith("ws_batch", "file_output_123", {
			provider: "openai",
			status: "available",
		});
		expect(saveBatchFileMetaMock).toHaveBeenCalledWith("ws_batch", "file_error_123", {
			provider: "openai",
			status: "available",
		});
		expect(finalizeBatchJobMock).toHaveBeenCalledWith({
			workspaceId: "ws_batch",
			batchId: "batch_internal_123",
			status: "completed",
		});
		expect(dispatchAsyncWebhookEventMock).toHaveBeenCalledWith({
			workspaceId: "ws_batch",
			kind: "batch",
			internalId: "batch_internal_123",
			phase: "completed",
		});
		expect(markProviderEventProcessedMock).toHaveBeenCalledWith({
			provider: "openai",
			providerEventId: "evt_openai_batch_123",
			workspaceId: "ws_batch",
			internalId: "batch_internal_123",
		});
	});

	it("fetches authoritative Gemini batch status before finalizing", async () => {
		await processGoogleAiStudioBatchWebhook({
			eventId: "evt_gemini_batch_123",
			eventType: "batch.succeeded",
			payload: {
				type: "batch.succeeded",
				data: {
					id: "batch_gemini",
					output_file_uri: "gs://bucket/results.jsonl",
				},
			},
		});

		expect(findBatchJobRecordByNativeIdMock).toHaveBeenCalledWith("google-ai-studio", "batch_gemini");
		expect(findBatchJobRecordByNativeIdMock).toHaveBeenCalledWith("google-ai-studio", "batches/batch_gemini");
		expect(fetchProviderBatchStatusMock).toHaveBeenCalledWith("google-ai-studio", "batches/batch_gemini");
		expect(saveBatchJobMetaMock).toHaveBeenCalledWith(
			"ws_gemini",
			"batch_internal_gemini",
			expect.objectContaining({
				provider: "google-ai-studio",
				status: "completed",
				model: "gemini-2.5-flash",
				nativeBatchId: "batches/batch_gemini",
				requestCounts: {
					total: 2,
					completed: 2,
					failed: 0,
				},
			}),
		);
		expect(finalizeBatchJobMock).toHaveBeenCalledWith({
			workspaceId: "ws_gemini",
			batchId: "batch_internal_gemini",
			status: "completed",
		});
		expect(dispatchAsyncWebhookEventMock).toHaveBeenCalledWith({
			workspaceId: "ws_gemini",
			kind: "batch",
			internalId: "batch_internal_gemini",
			phase: "completed",
		});
		expect(markProviderEventProcessedMock).toHaveBeenCalledWith({
			provider: "google-ai-studio",
			providerEventId: "evt_gemini_batch_123",
			workspaceId: "ws_gemini",
			internalId: "batch_internal_gemini",
		});
	});

	it("waits for customer delivery before marking a provider event processed", async () => {
		let resolveDispatch!: (value: boolean) => void;
		dispatchAsyncWebhookEventMock.mockReturnValueOnce(new Promise<boolean>((resolve) => {
			resolveDispatch = resolve;
		}));

		const processing = processGoogleAiStudioBatchWebhook({
			eventId: "evt_gemini_delivery_order",
			eventType: "batch.succeeded",
			payload: { data: { id: "batch_gemini" } },
		});
		await vi.waitFor(() => expect(dispatchAsyncWebhookEventMock).toHaveBeenCalledOnce());
		expect(markProviderEventProcessedMock).not.toHaveBeenCalled();

		resolveDispatch(true);
		await processing;
		expect(markProviderEventProcessedMock).toHaveBeenCalledWith({
			provider: "google-ai-studio",
			providerEventId: "evt_gemini_delivery_order",
			workspaceId: "ws_gemini",
			internalId: "batch_internal_gemini",
		});
	});

	it("marks non-terminal OpenAI batch webhooks as processed without finalizing", async () => {
		fetchProviderBatchStatusMock.mockResolvedValueOnce({
			id: "batch_native_123",
			status: "in_progress",
			request_counts: { total: 10, completed: 4, failed: 0 },
		});
		await processOpenAiBatchWebhook({
			eventId: "evt_openai_batch_progress",
			eventType: "batch.in_progress",
			payload: {
				data: {
					id: "batch_native_123",
					status: "in_progress",
					request_counts: {
						total: 10,
						completed: 4,
						failed: 0,
					},
				},
			},
		});

		expect(saveBatchJobMetaMock).toHaveBeenCalledWith(
			"ws_batch",
			"batch_internal_123",
			expect.objectContaining({
				status: "in_progress",
				requestCounts: {
					total: 10,
					completed: 4,
					failed: 0,
				},
			}),
		);
		expect(finalizeBatchJobMock).not.toHaveBeenCalled();
		expect(dispatchAsyncWebhookEventMock).not.toHaveBeenCalled();
		expect(markProviderEventProcessedMock).toHaveBeenCalledWith({
			provider: "openai",
			providerEventId: "evt_openai_batch_progress",
			workspaceId: "ws_batch",
			internalId: "batch_internal_123",
		});
	});

	it("maps expired OpenAI batches to failed user-webhook phase", () => {
		expect(mapOpenAiBatchTerminal("batch.expired", { data: { status: "expired" } })).toEqual({
			status: "expired",
			phase: "failed",
		});
		expect(mapOpenAiBatchTerminal("batch.canceled", { data: { status: "canceled" } })).toEqual({
			status: "cancelled",
			phase: "cancelled",
		});
	});

	it("does not notify users until terminal billing finalization succeeds", async () => {
		fetchProviderBatchStatusMock.mockResolvedValueOnce({ id: "batch_native_123", status: "completed", request_counts: { total: 1, completed: 1, failed: 0 } });
		finalizeBatchJobMock.mockResolvedValueOnce({ status: "completed", charged: false, billed: false, reason: "missing_usage" });
		await processOpenAiBatchWebhook({
			eventId: "evt_billing_blocked",
			eventType: "batch.completed",
			payload: { data: { id: "batch_native_123", status: "completed" } },
		});
		expect(dispatchAsyncWebhookEventMock).not.toHaveBeenCalled();
		expect(markProviderEventProcessedMock).not.toHaveBeenCalled();
		expect(deferProviderEventMock).toHaveBeenCalledWith(expect.objectContaining({
			reason: "batch_finalization_pending:missing_usage",
		}));
	});

	it("bounds provider webhook bodies before signature verification or persistence", async () => {
		const accepted = await readProviderWebhookBody(new Request("https://example.com", {
			method: "POST",
			body: JSON.stringify({ type: "batch.completed" }),
		}));
		expect(accepted).toEqual({ ok: true, rawBody: JSON.stringify({ type: "batch.completed" }) });

		const rejected = await readProviderWebhookBody(new Request("https://example.com", {
			method: "POST",
			headers: { "Content-Length": String(1024 * 1024 + 1) },
			body: "{}",
		}));
		expect(rejected).toEqual({ ok: false });

		const rejectedStream = await readProviderWebhookBody(new Request("https://example.com", {
			method: "POST",
			body: "x".repeat(1024 * 1024 + 1),
		}));
		expect(rejectedStream).toEqual({ ok: false });
	});

	it("defers a valid provider event until the accepted batch id has been persisted", async () => {
		findBatchJobRecordByNativeIdMock.mockResolvedValueOnce(null);
		await expect(processOpenAiBatchWebhook({
			eventId: "evt_fast_batch",
			eventType: "batch.completed",
			payload: { data: { id: "batch_not_persisted_yet" } },
		})).resolves.toBe(false);
		expect(deferProviderEventMock).toHaveBeenCalledWith({
			provider: "openai",
			providerEventId: "evt_fast_batch",
			reason: "batch_job_not_found",
		});
		expect(markProviderEventProcessedMock).not.toHaveBeenCalled();
	});

	it("replays persisted provider events that were accepted but not processed", async () => {
		listUnprocessedProviderEventsMock.mockResolvedValueOnce([
			{
				id: "row_1",
				provider: "openai",
				providerEventId: "evt_replay_openai",
				kind: "batch.completed",
				workspaceId: null,
				internalId: null,
				payload: { type: "batch.completed", data: { id: "batch_native_123" } },
				processedAt: null,
				createdAt: "2026-07-16T10:00:00.000Z",
			},
		]);
		fetchProviderBatchStatusMock.mockResolvedValueOnce({
			id: "batch_native_123",
			status: "completed",
			request_counts: { total: 1, completed: 1, failed: 0 },
		});

		await expect(runBatchProviderWebhookReplayJob({ limit: 25 })).resolves.toEqual({
			eventsScanned: 1,
			eventsProcessed: 1,
			eventsFailed: 0,
		});
		expect(listUnprocessedProviderEventsMock).toHaveBeenCalledWith({
			providers: ["openai", "google-ai-studio"],
			limit: 25,
		});
		expect(markProviderEventProcessedMock).toHaveBeenCalledWith(expect.objectContaining({
			provider: "openai",
			providerEventId: "evt_replay_openai",
		}));
	});

	it("backs off replay events when provider processing throws", async () => {
		listUnprocessedProviderEventsMock.mockResolvedValueOnce([
			{
				id: "row_failed",
				provider: "openai",
				providerEventId: "evt_replay_failed",
				kind: "batch.completed",
				workspaceId: null,
				internalId: null,
				payload: { type: "batch.completed", data: { id: "batch_native_123" } },
				processedAt: null,
				createdAt: "2026-07-16T10:00:00.000Z",
			},
		]);
		fetchProviderBatchStatusMock.mockRejectedValueOnce(new Error("provider unavailable"));

		await expect(runBatchProviderWebhookReplayJob()).resolves.toEqual({
			eventsScanned: 1,
			eventsProcessed: 0,
			eventsFailed: 1,
		});
		expect(deferProviderEventMock).toHaveBeenCalledWith({
			provider: "openai",
			providerEventId: "evt_replay_failed",
			reason: "provider unavailable",
		});
		expect(markProviderEventProcessedMock).not.toHaveBeenCalled();
	});
});
