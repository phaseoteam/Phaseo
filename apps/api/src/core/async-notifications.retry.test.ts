import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getAsyncOperationMock = vi.fn();
const listAsyncOperationsMock = vi.fn();
const patchAsyncOperationMetaMock = vi.fn();

vi.mock("@core/async-operations", () => ({
	getAsyncOperation: (...args: any[]) => getAsyncOperationMock(...args),
	listAsyncOperations: (...args: any[]) => listAsyncOperationsMock(...args),
	patchAsyncOperationMeta: (...args: any[]) => patchAsyncOperationMetaMock(...args),
}));

vi.mock("@/runtime/env", () => ({
	dispatchBackground: (promise: Promise<unknown>) => promise,
	getBindings: () => ({
		VIDEO_DOWNLOAD_SIGNING_SECRET: "test-video-download-secret",
		KEY_PEPPER: "test-key-pepper",
		GATEWAY_PUBLIC_BASE_URL: "https://api.phaseo.app",
		ASYNC_WEBHOOK_DELIVERY_TIMEOUT_MS: "1000",
	}),
}));

import { dispatchAsyncWebhookEvent, runAsyncWebhookRetriesJob } from "./async-notifications";

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
	return Array.from(new Uint8Array(signature)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

describe("dispatchAsyncWebhookEvent retries", () => {
	beforeEach(() => {
		getAsyncOperationMock.mockReset();
		listAsyncOperationsMock.mockReset();
		patchAsyncOperationMetaMock.mockReset();
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("records a scheduled retry after the first delivery failure", async () => {
		getAsyncOperationMock.mockResolvedValue({
			workspaceId: "ws_123",
			kind: "batch",
			internalId: "batch_123",
			requestId: "req_123",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "batch_123",
			model: "openai/gpt-5-mini",
			status: "completed",
			meta: {
				webhook: {
					url: "https://example.com/hooks/async",
					events: ["job.completed"],
				},
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:01:00.000Z",
		});
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response("upstream unavailable", { status: 503 }),
			),
		);

		const ok = await dispatchAsyncWebhookEvent({
			workspaceId: "ws_123",
			kind: "batch",
			internalId: "batch_123",
			phase: "completed",
			baseUrl: "https://api.phaseo.app",
		});

		expect(ok).toBe(false);
		expect(patchAsyncOperationMetaMock).toHaveBeenCalledTimes(1);
		const metaPatch = patchAsyncOperationMetaMock.mock.calls[0][0].metaPatch;
		expect(metaPatch.webhookAttempts).toHaveLength(1);
		expect(metaPatch.webhookAttempts[0]).toMatchObject({
			delivery_key: "batch.completed",
			event_type: "batch.completed",
			status: "scheduled_retry",
			attempt_number: 1,
			max_attempts: 4,
			response_status: 503,
		});
		expect(metaPatch.webhookRetryQueue["batch.completed"]).toMatchObject({
			deliveryKey: "batch.completed",
			eventType: "batch.completed",
			phase: "completed",
			attemptCount: 1,
		});
		expect(metaPatch.nextWebhookRetryAt).toBeTruthy();
		const fetchMock = globalThis.fetch as any;
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [, requestInit] = fetchMock.mock.calls[0];
		expect(requestInit.headers).toMatchObject({
			"Content-Type": "application/json",
			"User-Agent": "Phaseo-Async-Webhook/1.0",
			"x-phaseo-event-id": "evt_batch_batch_123_batch_completed",
			"x-phaseo-event-type": "batch.completed",
			"x-phaseo-delivery-key": "batch.completed",
			"x-phaseo-attempt": "1",
			"x-phaseo-max-attempts": "4",
		});
		expect(JSON.parse(requestInit.body)).toMatchObject({
			id: "evt_batch_batch_123_batch_completed",
			type: "batch.completed",
			delivery: {
				key: "batch.completed",
				attempt: 1,
				max_attempts: 4,
			},
			data: {
				id: "batch_123",
				kind: "batch",
			},
		});
	});

	it("records a scheduled retry when the destination does not respond before the delivery timeout", async () => {
		vi.useFakeTimers();
		getAsyncOperationMock.mockResolvedValue({
			workspaceId: "ws_123",
			kind: "video",
			internalId: "video_timeout_123",
			requestId: "req_video_timeout_123",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "vid_timeout_123",
			model: "openai/sora",
			status: "completed",
			meta: {
				webhook: {
					url: "https://example.com/hooks/timeout",
					events: ["video.completed"],
				},
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:01:00.000Z",
		});
		let abortListenerAttached!: () => void;
		const abortListenerAttachedPromise = new Promise<void>((resolve) => {
			abortListenerAttached = resolve;
		});
		vi.stubGlobal(
			"fetch",
			vi.fn((_url: string, init?: RequestInit) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () => {
						reject(new DOMException("The operation was aborted.", "AbortError"));
					});
					abortListenerAttached();
				}),
			),
		);

		const result = dispatchAsyncWebhookEvent({
			workspaceId: "ws_123",
			kind: "video",
			internalId: "video_timeout_123",
			phase: "completed",
			baseUrl: "https://api.phaseo.app",
		});
		await abortListenerAttachedPromise;
		await vi.advanceTimersByTimeAsync(1_000);
		const ok = await result;

		expect(ok).toBe(false);
		expect(globalThis.fetch).toHaveBeenCalledTimes(1);
		const [, requestInit] = (globalThis.fetch as any).mock.calls[0];
		expect(requestInit.signal).toBeInstanceOf(AbortSignal);
		expect(patchAsyncOperationMetaMock).toHaveBeenCalledTimes(1);
		const metaPatch = patchAsyncOperationMetaMock.mock.calls[0][0].metaPatch;
		expect(metaPatch.webhookAttempts[0]).toMatchObject({
			delivery_key: "video.completed",
			event_type: "video.completed",
			status: "scheduled_retry",
			attempt_number: 1,
			response_status: null,
			error_message: "Webhook request timed out after 1000ms",
			response_body_preview: null,
		});
		expect(metaPatch.webhookRetryQueue["video.completed"]).toMatchObject({
			deliveryKey: "video.completed",
			eventType: "video.completed",
			phase: "completed",
			attemptCount: 1,
			lastErrorMessage: "Webhook request timed out after 1000ms",
		});
	});

	it("signs webhook deliveries when a secret is configured", async () => {
		vi.spyOn(Date, "now").mockReturnValue(1_777_777_777_000);
		getAsyncOperationMock.mockResolvedValue({
			workspaceId: "ws_123",
			kind: "video",
			internalId: "video_123",
			requestId: "req_video_123",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "vid_123",
			model: "openai/sora",
			status: "completed",
			meta: {
				webhook: {
					url: "https://example.com/hooks/video",
					secret: "whsec_video_test",
					events: ["video.completed"],
				},
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:01:00.000Z",
		});
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response("ok", { status: 200 })),
		);

		const ok = await dispatchAsyncWebhookEvent({
			workspaceId: "ws_123",
			kind: "video",
			internalId: "video_123",
			phase: "completed",
			baseUrl: "https://api.phaseo.app",
		});

		expect(ok).toBe(true);
		const fetchMock = globalThis.fetch as any;
		const [, requestInit] = fetchMock.mock.calls[0];
		const timestamp = "1777777777";
		expect(requestInit.headers).toMatchObject({
			"x-phaseo-event-id": "evt_video_video_123_video_completed",
			"x-phaseo-event-type": "video.completed",
			"x-phaseo-delivery-key": "video.completed",
			"x-phaseo-timestamp": timestamp,
		});
		expect(requestInit.headers["x-phaseo-signature"]).toBe(
			await hmacSha256Hex("whsec_video_test", `${timestamp}.${requestInit.body}`),
		);
		expect(JSON.parse(requestInit.body)).toMatchObject({
			id: "evt_video_video_123_video_completed",
			type: "video.completed",
			delivery: {
				key: "video.completed",
				attempt: 1,
				max_attempts: 4,
			},
		});
	});

	it("does not resend progress webhooks after the progress bucket was delivered", async () => {
		vi.spyOn(Date, "now").mockReturnValue(1_777_777_777_000);
		const baseRecord = {
			workspaceId: "ws_123",
			kind: "video",
			internalId: "video_progress_123",
			requestId: "req_video_progress_123",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "vid_progress_123",
			model: "openai/sora",
			status: "in_progress",
			meta: {
				webhook: {
					url: "https://example.com/hooks/video-progress",
					events: ["video.progress"],
				},
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:01:00.000Z",
		};
		getAsyncOperationMock
			.mockResolvedValueOnce(baseRecord)
			.mockResolvedValueOnce({
				...baseRecord,
				meta: {
					...baseRecord.meta,
					webhookDeliveries: {
						"video.progress:50": "2026-05-03T10:02:00.000Z",
					},
				},
			});
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response("ok", { status: 200 })),
		);

		const first = await dispatchAsyncWebhookEvent({
			workspaceId: "ws_123",
			kind: "video",
			internalId: "video_progress_123",
			phase: "progress",
			progress: 52,
			baseUrl: "https://api.phaseo.app",
		});
		const second = await dispatchAsyncWebhookEvent({
			workspaceId: "ws_123",
			kind: "video",
			internalId: "video_progress_123",
			phase: "progress",
			progress: 54,
			baseUrl: "https://api.phaseo.app",
		});

		expect(first).toBe(true);
		expect(second).toBe(false);
		expect(globalThis.fetch).toHaveBeenCalledTimes(1);
		expect(patchAsyncOperationMetaMock).toHaveBeenCalledTimes(1);
		const metaPatch = patchAsyncOperationMetaMock.mock.calls[0][0].metaPatch;
		expect(metaPatch.webhookDeliveries).toMatchObject({
			"video.progress:50": expect.any(String),
		});
		expect(metaPatch.lastWebhookProgress).toBe(50);
		const [, requestInit] = (globalThis.fetch as any).mock.calls[0];
		expect(requestInit.headers).toMatchObject({
			"x-phaseo-event-type": "video.progress",
			"x-phaseo-delivery-key": "video.progress:50",
		});
		expect(JSON.parse(requestInit.body)).toMatchObject({
			id: "evt_video_video_progress_123_video_progress_50",
			type: "video.progress",
			delivery: {
				key: "video.progress:50",
				attempt: 1,
				max_attempts: 4,
			},
			data: {
				id: "video_progress_123",
				progress: 50,
			},
		});
	});

	it("sends bucketed progress in batch progress webhook payloads and retries", async () => {
		vi.spyOn(Date, "now").mockReturnValue(1_777_777_777_000);
		getAsyncOperationMock.mockResolvedValue({
			workspaceId: "ws_batch_progress",
			kind: "batch",
			internalId: "batch_progress_123",
			requestId: "req_batch_progress_123",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "batch_native_progress_123",
			model: "openai/gpt-5-mini",
			status: "in_progress",
			meta: {
				webhook: {
					url: "https://example.com/hooks/batch-progress",
					events: ["batch.progress"],
				},
				requestCounts: {
					total: 10,
					completed: 4,
					failed: 1,
				},
				webhookAttempts: [
					{
						id: "batch.progress:50:1",
						delivery_key: "batch.progress:50",
						event_type: "batch.progress",
						status: "scheduled_retry",
						attempt_number: 1,
						max_attempts: 4,
						tried_at: "2026-05-03T10:00:00.000Z",
						delivered_at: null,
						next_retry_at: "2026-05-03T10:01:00.000Z",
						response_status: 503,
						error_message: "Webhook returned HTTP 503",
					},
				],
				webhookRetryQueue: {
					"batch.progress:50": {
						deliveryKey: "batch.progress:50",
						eventType: "batch.progress",
						phase: "progress",
						progress: 50,
						attemptCount: 1,
						nextRetryAt: "2026-05-03T10:01:00.000Z",
						lastTriedAt: "2026-05-03T10:00:00.000Z",
						lastStatusCode: 503,
						lastErrorMessage: "Webhook returned HTTP 503",
					},
				},
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:01:00.000Z",
		});
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response("ok", { status: 200 })),
		);

		const ok = await dispatchAsyncWebhookEvent({
			workspaceId: "ws_batch_progress",
			kind: "batch",
			internalId: "batch_progress_123",
			phase: "progress",
			progress: 54,
			force: true,
			baseUrl: "https://api.phaseo.app",
		});

		expect(ok).toBe(true);
		const [, requestInit] = (globalThis.fetch as any).mock.calls[0];
		expect(requestInit.headers).toMatchObject({
			"x-phaseo-event-id": "evt_batch_batch_progress_123_batch_progress_50",
			"x-phaseo-event-type": "batch.progress",
			"x-phaseo-delivery-key": "batch.progress:50",
			"x-phaseo-attempt": "2",
		});
		expect(JSON.parse(requestInit.body)).toMatchObject({
			id: "evt_batch_batch_progress_123_batch_progress_50",
			type: "batch.progress",
			delivery: {
				key: "batch.progress:50",
				attempt: 2,
				max_attempts: 4,
			},
			data: {
				id: "batch_progress_123",
				kind: "batch",
				progress: 50,
				request_counts: {
					total: 10,
					completed: 4,
					failed: 1,
				},
			},
		});
		const metaPatch = patchAsyncOperationMetaMock.mock.calls[0][0].metaPatch;
		expect(metaPatch.webhookDeliveries["batch.progress:50"]).toBeTruthy();
		expect(metaPatch.lastWebhookProgress).toBe(50);
		expect(metaPatch.webhookRetryQueue).toEqual({});
	});

	it("records a delivered attempt and clears retry state after a retry succeeds", async () => {
		getAsyncOperationMock.mockResolvedValue({
			workspaceId: "ws_123",
			kind: "batch",
			internalId: "batch_123",
			requestId: "req_123",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "batch_123",
			model: "openai/gpt-5-mini",
			status: "completed",
			meta: {
				webhook: {
					url: "https://example.com/hooks/async",
					events: ["job.completed"],
				},
				webhookAttempts: [
					{
						id: "batch.completed:1",
						delivery_key: "batch.completed",
						event_type: "batch.completed",
						status: "scheduled_retry",
						attempt_number: 1,
						max_attempts: 4,
						tried_at: "2026-05-03T10:00:00.000Z",
						delivered_at: null,
						next_retry_at: "2026-05-03T10:01:00.000Z",
						response_status: 503,
						error_message: "Webhook returned HTTP 503",
						response_body_preview: "upstream unavailable",
					},
				],
				webhookRetryQueue: {
					"batch.completed": {
						deliveryKey: "batch.completed",
						eventType: "batch.completed",
						phase: "completed",
						progress: null,
						attemptCount: 1,
						nextRetryAt: "2026-05-03T10:01:00.000Z",
						lastTriedAt: "2026-05-03T10:00:00.000Z",
						lastStatusCode: 503,
						lastErrorMessage: "Webhook returned HTTP 503",
						responseBodyPreview: "upstream unavailable",
					},
				},
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:01:00.000Z",
		});
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response("ok", { status: 200 })),
		);

		const ok = await dispatchAsyncWebhookEvent({
			workspaceId: "ws_123",
			kind: "batch",
			internalId: "batch_123",
			phase: "completed",
			force: true,
			baseUrl: "https://api.phaseo.app",
		});

		expect(ok).toBe(true);
		expect(patchAsyncOperationMetaMock).toHaveBeenCalledTimes(1);
		const metaPatch = patchAsyncOperationMetaMock.mock.calls[0][0].metaPatch;
		expect(metaPatch.webhookDeliveries["batch.completed"]).toBeTruthy();
		expect(metaPatch.webhookRetryQueue).toEqual({});
		expect(metaPatch.nextWebhookRetryAt).toBeNull();
		const deliveredAttempt = metaPatch.webhookAttempts.find(
			(attempt: any) => attempt.status === "delivered",
		);
		expect(deliveredAttempt).toMatchObject({
			delivery_key: "batch.completed",
			event_type: "batch.completed",
			status: "delivered",
			attempt_number: 2,
			max_attempts: 4,
			response_status: 200,
		});
		const fetchMock = globalThis.fetch as any;
		const [, requestInit] = fetchMock.mock.calls[0];
		expect(requestInit.headers).toMatchObject({
			"x-phaseo-event-id": "evt_batch_batch_123_batch_completed",
			"x-phaseo-event-type": "batch.completed",
			"x-phaseo-delivery-key": "batch.completed",
			"x-phaseo-attempt": "2",
			"x-phaseo-max-attempts": "4",
		});
		expect(JSON.parse(requestInit.body)).toMatchObject({
			id: "evt_batch_batch_123_batch_completed",
			type: "batch.completed",
			delivery: {
				key: "batch.completed",
				attempt: 2,
				max_attempts: 4,
			},
		});
	});

	it("marks the final failed retry attempt permanent and clears the queue", async () => {
		getAsyncOperationMock.mockResolvedValue({
			workspaceId: "ws_123",
			kind: "batch",
			internalId: "batch_final_retry",
			requestId: "req_final_retry",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "batch_final_retry",
			model: "openai/gpt-5-mini",
			status: "completed",
			meta: {
				webhook: {
					url: "https://example.com/hooks/async",
					events: ["job.completed"],
				},
				webhookAttempts: [
					{
						id: "batch.completed:3",
						delivery_key: "batch.completed",
						event_type: "batch.completed",
						status: "scheduled_retry",
						attempt_number: 3,
						max_attempts: 4,
						tried_at: "2026-05-03T10:06:00.000Z",
						delivered_at: null,
						next_retry_at: "2026-05-03T10:21:00.000Z",
						response_status: 503,
						error_message: "Webhook returned HTTP 503",
					},
				],
				webhookRetryQueue: {
					"batch.completed": {
						deliveryKey: "batch.completed",
						eventType: "batch.completed",
						phase: "completed",
						progress: null,
						attemptCount: 3,
						nextRetryAt: "2026-05-03T10:21:00.000Z",
						lastTriedAt: "2026-05-03T10:06:00.000Z",
						lastStatusCode: 503,
						lastErrorMessage: "Webhook returned HTTP 503",
					},
				},
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:21:00.000Z",
		});
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response("still unavailable", { status: 503 })),
		);

		const ok = await dispatchAsyncWebhookEvent({
			workspaceId: "ws_123",
			kind: "batch",
			internalId: "batch_final_retry",
			phase: "completed",
			force: true,
			baseUrl: "https://api.phaseo.app",
		});

		expect(ok).toBe(false);
		expect(patchAsyncOperationMetaMock).toHaveBeenCalledTimes(1);
		const metaPatch = patchAsyncOperationMetaMock.mock.calls[0][0].metaPatch;
		expect(metaPatch.webhookRetryQueue).toEqual({});
		expect(metaPatch.nextWebhookRetryAt).toBeNull();
		expect(metaPatch.webhookAttempts.at(-1)).toMatchObject({
			delivery_key: "batch.completed",
			event_type: "batch.completed",
			status: "failed_permanently",
			attempt_number: 4,
			max_attempts: 4,
			response_status: 503,
			error_message: "Webhook returned HTTP 503",
			response_body_preview: "still unavailable",
			next_retry_at: null,
		});
		const fetchMock = globalThis.fetch as any;
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [, requestInit] = fetchMock.mock.calls[0];
		expect(requestInit.headers).toMatchObject({
			"x-phaseo-delivery-key": "batch.completed",
			"x-phaseo-attempt": "4",
			"x-phaseo-max-attempts": "4",
		});
		expect(JSON.parse(requestInit.body)).toMatchObject({
			delivery: {
				key: "batch.completed",
				attempt: 4,
				max_attempts: 4,
			},
		});
	});

	it("clears a queued retry when the webhook no longer subscribes to the event", async () => {
		const retryRecord = {
			workspaceId: "ws_123",
			kind: "batch",
			internalId: "batch_due_retry",
			requestId: "req_due_retry",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "batch_due_retry",
			model: "openai/gpt-5-mini",
			status: "completed",
			meta: {
				webhook: {
					url: "https://example.com/hooks/async",
					events: ["job.failed"],
				},
				webhookAttempts: [
					{
						id: "batch.completed:1",
						delivery_key: "batch.completed",
						event_type: "batch.completed",
						status: "scheduled_retry",
						attempt_number: 1,
						max_attempts: 4,
						tried_at: "2026-05-03T10:00:00.000Z",
						delivered_at: null,
						next_retry_at: "2026-05-03T10:01:00.000Z",
						response_status: 503,
						error_message: "Webhook returned HTTP 503",
					},
				],
				webhookRetryQueue: {
					"batch.completed": {
						deliveryKey: "batch.completed",
						eventType: "batch.completed",
						phase: "completed",
						progress: null,
						attemptCount: 1,
						nextRetryAt: "2026-05-03T10:01:00.000Z",
						lastTriedAt: "2026-05-03T10:00:00.000Z",
						lastStatusCode: 503,
						lastErrorMessage: "Webhook returned HTTP 503",
					},
				},
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:01:00.000Z",
		};
		const closedRecord = {
			...retryRecord,
			meta: {
				...retryRecord.meta,
				webhookAttempts: [
					...(retryRecord.meta.webhookAttempts as any[]),
					{
						id: "batch.completed:undeliverable",
						delivery_key: "batch.completed",
						event_type: "batch.completed",
						status: "failed_permanently",
						attempt_number: 1,
						max_attempts: 4,
						tried_at: "2026-05-03T10:02:00.000Z",
						delivered_at: null,
						next_retry_at: null,
						response_status: null,
						error_message: "Webhook configuration no longer subscribes to this event.",
					},
				],
				webhookRetryQueue: {},
			},
		};

		listAsyncOperationsMock.mockImplementation(async (args: any) => {
			if (args.kind === "batch" && args.offset === 0) return [retryRecord];
			return [];
		});
		getAsyncOperationMock
			.mockResolvedValueOnce(retryRecord)
			.mockResolvedValueOnce(closedRecord);
		vi.stubGlobal("fetch", vi.fn());

		const summary = await runAsyncWebhookRetriesJob({
			limitPerKind: 1,
			maxDeliveries: 1,
			baseUrl: "https://api.phaseo.app",
		});

		expect(globalThis.fetch).not.toHaveBeenCalled();
		expect(patchAsyncOperationMetaMock).toHaveBeenCalledTimes(1);
		const metaPatch = patchAsyncOperationMetaMock.mock.calls[0][0].metaPatch;
		expect(metaPatch.webhookRetryQueue).toEqual({});
		expect(metaPatch.nextWebhookRetryAt).toBeNull();
		expect(metaPatch.webhookAttempts.at(-1)).toMatchObject({
			delivery_key: "batch.completed",
			event_type: "batch.completed",
			status: "failed_permanently",
			attempt_number: 1,
			max_attempts: 4,
			response_status: null,
			error_message: "Webhook configuration no longer subscribes to this event.",
		});
		expect(summary).toMatchObject({
			deliveriesRetried: 1,
			deliveriesSucceeded: 0,
			deliveriesStillPending: 0,
			deliveriesFailedPermanently: 1,
		});
	});

	it("clears a queued retry when the webhook configuration is no longer valid", async () => {
		const retryRecord = {
			workspaceId: "ws_123",
			kind: "video",
			internalId: "video_due_retry",
			requestId: "req_video_due_retry",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "video_due_retry",
			model: "openai/sora",
			status: "completed",
			meta: {
				webhook: {
					url: "ftp://example.com/hooks/video",
					events: ["job.completed"],
				},
				webhookAttempts: [
					{
						id: "video.completed:1",
						delivery_key: "video.completed",
						event_type: "video.completed",
						status: "scheduled_retry",
						attempt_number: 1,
						max_attempts: 4,
						tried_at: "2026-05-03T10:00:00.000Z",
						delivered_at: null,
						next_retry_at: "2026-05-03T10:01:00.000Z",
						response_status: 503,
						error_message: "Webhook returned HTTP 503",
					},
				],
				webhookRetryQueue: {
					"video.completed": {
						deliveryKey: "video.completed",
						eventType: "video.completed",
						phase: "completed",
						progress: null,
						attemptCount: 1,
						nextRetryAt: "2026-05-03T10:01:00.000Z",
						lastTriedAt: "2026-05-03T10:00:00.000Z",
						lastStatusCode: 503,
						lastErrorMessage: "Webhook returned HTTP 503",
					},
				},
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:01:00.000Z",
		};
		const closedRecord = {
			...retryRecord,
			meta: {
				...retryRecord.meta,
				webhookAttempts: [
					...(retryRecord.meta.webhookAttempts as any[]),
					{
						id: "video.completed:undeliverable",
						delivery_key: "video.completed",
						event_type: "video.completed",
						status: "failed_permanently",
						attempt_number: 1,
						max_attempts: 4,
						tried_at: "2026-05-03T10:02:00.000Z",
						delivered_at: null,
						next_retry_at: null,
						response_status: null,
						error_message: "Webhook configuration is no longer valid.",
					},
				],
				webhookRetryQueue: {},
			},
		};

		listAsyncOperationsMock.mockImplementation(async (args: any) => {
			if (args.kind === "video" && args.offset === 0) return [retryRecord];
			return [];
		});
		getAsyncOperationMock
			.mockResolvedValueOnce(retryRecord)
			.mockResolvedValueOnce(closedRecord);
		vi.stubGlobal("fetch", vi.fn());

		const summary = await runAsyncWebhookRetriesJob({
			limitPerKind: 1,
			maxDeliveries: 1,
			baseUrl: "https://api.phaseo.app",
		});

		expect(globalThis.fetch).not.toHaveBeenCalled();
		expect(patchAsyncOperationMetaMock).toHaveBeenCalledTimes(1);
		const metaPatch = patchAsyncOperationMetaMock.mock.calls[0][0].metaPatch;
		expect(metaPatch.webhookRetryQueue).toEqual({});
		expect(metaPatch.nextWebhookRetryAt).toBeNull();
		expect(metaPatch.webhookAttempts.at(-1)).toMatchObject({
			delivery_key: "video.completed",
			event_type: "video.completed",
			status: "failed_permanently",
			attempt_number: 1,
			max_attempts: 4,
			response_status: null,
			error_message: "Webhook configuration is no longer valid.",
		});
		expect(summary).toMatchObject({
			deliveriesRetried: 1,
			deliveriesSucceeded: 0,
			deliveriesStillPending: 0,
			deliveriesFailedPermanently: 1,
		});
	});

	it("scans additional pages so due retries are not starved behind unrelated jobs", async () => {
		const firstPageRecord = {
			workspaceId: "ws_123",
			kind: "batch",
			internalId: "batch_without_retry",
			requestId: "req_no_retry",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "batch_without_retry",
			model: "openai/gpt-5-mini",
			status: "completed",
			meta: {},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:00:00.000Z",
		};
		const retryRecord = {
			workspaceId: "ws_123",
			kind: "batch",
			internalId: "batch_due_retry",
			requestId: "req_due_retry",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "batch_due_retry",
			model: "openai/gpt-5-mini",
			status: "completed",
			meta: {
				webhook: {
					url: "https://example.com/hooks/async",
					events: ["job.completed"],
				},
				webhookAttempts: [
					{
						id: "batch.completed:1",
						delivery_key: "batch.completed",
						event_type: "batch.completed",
						status: "scheduled_retry",
						attempt_number: 1,
						max_attempts: 4,
						tried_at: "2026-05-03T10:00:00.000Z",
						delivered_at: null,
						next_retry_at: "2026-05-03T10:01:00.000Z",
						response_status: 503,
						error_message: "Webhook returned HTTP 503",
					},
				],
				webhookRetryQueue: {
					"batch.completed": {
						deliveryKey: "batch.completed",
						eventType: "batch.completed",
						phase: "completed",
						progress: null,
						attemptCount: 1,
						nextRetryAt: "2026-05-03T10:01:00.000Z",
						lastTriedAt: "2026-05-03T10:00:00.000Z",
						lastStatusCode: 503,
						lastErrorMessage: "Webhook returned HTTP 503",
					},
				},
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:01:00.000Z",
		};
		const deliveredRecord = {
			...retryRecord,
			meta: {
				...retryRecord.meta,
				webhookDeliveries: {
					"batch.completed": "2026-05-03T10:02:00.000Z",
				},
				webhookAttempts: [
					...(retryRecord.meta.webhookAttempts as any[]),
					{
						id: "batch.completed:2",
						delivery_key: "batch.completed",
						event_type: "batch.completed",
						status: "delivered",
						attempt_number: 2,
						max_attempts: 4,
						tried_at: "2026-05-03T10:02:00.000Z",
						delivered_at: "2026-05-03T10:02:00.000Z",
						next_retry_at: null,
						response_status: 200,
						error_message: null,
					},
				],
				webhookRetryQueue: {},
			},
		};

		listAsyncOperationsMock.mockImplementation(async (args: any) => {
			if (args.kind === "video") return [];
			if (args.kind === "batch" && args.offset === 0) return [firstPageRecord];
			if (args.kind === "batch" && args.offset === 1) return [retryRecord];
			return [];
		});
		getAsyncOperationMock
			.mockResolvedValueOnce(retryRecord)
			.mockResolvedValueOnce(deliveredRecord);
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response("ok", { status: 200 })),
		);

		const summary = await runAsyncWebhookRetriesJob({
			limitPerKind: 1,
			maxDeliveries: 1,
			maxPagesPerKind: 2,
			baseUrl: "https://api.phaseo.app",
		});

		expect(listAsyncOperationsMock).toHaveBeenCalledWith({
			kind: "video",
			limit: 1,
			offset: 0,
		});
		expect(listAsyncOperationsMock).toHaveBeenCalledWith({
			kind: "batch",
			limit: 1,
			offset: 0,
		});
		expect(listAsyncOperationsMock).toHaveBeenCalledWith({
			kind: "batch",
			limit: 1,
			offset: 1,
		});
		expect(summary).toMatchObject({
			jobsScanned: 2,
			pagesScanned: 3,
			deliveriesRetried: 1,
			deliveriesSucceeded: 1,
			deliveriesStillPending: 0,
			deliveriesFailedPermanently: 0,
		});
		expect(globalThis.fetch).toHaveBeenCalledTimes(1);
	});

	it("uses the explicit retry clock to avoid early webhook retries", async () => {
		const retryRecord = {
			workspaceId: "ws_123",
			kind: "batch",
			internalId: "batch_future_retry",
			requestId: "req_future_retry",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "batch_future_retry",
			model: "openai/gpt-5-mini",
			status: "completed",
			meta: {
				webhook: {
					url: "https://example.com/hooks/async",
					events: ["job.completed"],
				},
				webhookRetryQueue: {
					"batch.completed": {
						deliveryKey: "batch.completed",
						eventType: "batch.completed",
						phase: "completed",
						progress: null,
						attemptCount: 1,
						nextRetryAt: "2026-05-03T10:05:00.000Z",
						lastTriedAt: "2026-05-03T10:00:00.000Z",
						lastStatusCode: 503,
						lastErrorMessage: "Webhook returned HTTP 503",
					},
				},
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:01:00.000Z",
		};
		listAsyncOperationsMock.mockImplementation(async (args: any) => {
			if (args.kind === "video") return [];
			if (args.kind === "batch") return [retryRecord];
			return [];
		});
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response("should not send yet", { status: 200 })),
		);

		const summary = await runAsyncWebhookRetriesJob({
			limitPerKind: 10,
			maxDeliveries: 1,
			baseUrl: "https://api.phaseo.app",
			now: "2026-05-03T10:04:59.000Z",
		});

		expect(getAsyncOperationMock).not.toHaveBeenCalled();
		expect(globalThis.fetch).not.toHaveBeenCalled();
		expect(patchAsyncOperationMetaMock).not.toHaveBeenCalled();
		expect(summary).toMatchObject({
			deliveriesRetried: 0,
			deliveriesSucceeded: 0,
			deliveriesStillPending: 0,
			deliveriesFailedPermanently: 0,
		});
	});

	it("classifies retry summaries by the retried delivery key instead of the job's latest attempt", async () => {
		const retryRecord = {
			workspaceId: "ws_123",
			kind: "batch",
			internalId: "batch_multi_delivery",
			requestId: "req_multi_delivery",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "batch_multi_delivery",
			model: "openai/gpt-5-mini",
			status: "completed",
			meta: {
				webhook: {
					url: "https://example.com/hooks/async",
					events: ["batch.completed", "batch.failed"],
				},
				webhookAttempts: [
					{
						id: "batch.completed:1",
						delivery_key: "batch.completed",
						event_type: "batch.completed",
						status: "scheduled_retry",
						attempt_number: 1,
						max_attempts: 4,
						tried_at: "2026-05-03T10:00:00.000Z",
						delivered_at: null,
						next_retry_at: "2026-05-03T10:01:00.000Z",
						response_status: 503,
						error_message: "Webhook returned HTTP 503",
					},
					{
						id: "batch.failed:1",
						delivery_key: "batch.failed",
						event_type: "batch.failed",
						status: "scheduled_retry",
						attempt_number: 1,
						max_attempts: 4,
						tried_at: "2026-05-03T10:02:00.000Z",
						delivered_at: null,
						next_retry_at: "2026-05-03T10:10:00.000Z",
						response_status: 500,
						error_message: "Webhook returned HTTP 500",
					},
				],
				webhookRetryQueue: {
					"batch.completed": {
						deliveryKey: "batch.completed",
						eventType: "batch.completed",
						phase: "completed",
						progress: null,
						attemptCount: 1,
						nextRetryAt: "2026-05-03T10:01:00.000Z",
						lastTriedAt: "2026-05-03T10:00:00.000Z",
						lastStatusCode: 503,
						lastErrorMessage: "Webhook returned HTTP 503",
					},
					"batch.failed": {
						deliveryKey: "batch.failed",
						eventType: "batch.failed",
						phase: "failed",
						progress: null,
						attemptCount: 1,
						nextRetryAt: "2099-05-03T10:10:00.000Z",
						lastTriedAt: "2026-05-03T10:02:00.000Z",
						lastStatusCode: 500,
						lastErrorMessage: "Webhook returned HTTP 500",
					},
				},
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:02:00.000Z",
		};
		const deliveredRecord = {
			...retryRecord,
			meta: {
				...retryRecord.meta,
				webhookDeliveries: {
					"batch.completed": "2026-05-03T10:03:00.000Z",
				},
				webhookAttempts: [
					...(retryRecord.meta.webhookAttempts as any[]),
					{
						id: "batch.completed:2",
						delivery_key: "batch.completed",
						event_type: "batch.completed",
						status: "delivered",
						attempt_number: 2,
						max_attempts: 4,
						tried_at: "2026-05-03T10:03:00.000Z",
						delivered_at: "2026-05-03T10:03:00.000Z",
						next_retry_at: null,
						response_status: 200,
						error_message: null,
					},
					{
						id: "batch.failed:2",
						delivery_key: "batch.failed",
						event_type: "batch.failed",
						status: "scheduled_retry",
						attempt_number: 2,
						max_attempts: 4,
						tried_at: "2026-05-03T10:03:01.000Z",
						delivered_at: null,
						next_retry_at: "2099-05-03T10:20:00.000Z",
						response_status: 500,
						error_message: "Webhook returned HTTP 500",
					},
				],
				webhookRetryQueue: {
					"batch.failed": (retryRecord.meta.webhookRetryQueue as any)["batch.failed"],
				},
			},
		};

		listAsyncOperationsMock.mockImplementation(async (args: any) => {
			if (args.kind === "video") return [];
			if (args.kind === "batch") return [retryRecord];
			return [];
		});
		getAsyncOperationMock
			.mockResolvedValueOnce(retryRecord)
			.mockResolvedValueOnce(deliveredRecord);
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response("ok", { status: 200 })),
		);

		const summary = await runAsyncWebhookRetriesJob({
			limitPerKind: 10,
			maxDeliveries: 1,
			baseUrl: "https://api.phaseo.app",
		});

		expect(summary).toMatchObject({
			deliveriesRetried: 1,
			deliveriesSucceeded: 1,
			deliveriesStillPending: 0,
			deliveriesFailedPermanently: 0,
		});
	});

	it("does not resend a due retry after the delivery key has already been delivered", async () => {
		const staleRetryRecord = {
			workspaceId: "ws_123",
			kind: "batch",
			internalId: "batch_delivered_retry",
			requestId: "req_delivered_retry",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "batch_delivered_retry",
			model: "openai/gpt-5-mini",
			status: "completed",
			meta: {
				webhook: {
					url: "https://example.com/hooks/async",
					events: ["job.completed"],
				},
				webhookDeliveries: {
					"batch.completed": "2026-05-03T10:02:00.000Z",
				},
				webhookAttempts: [
					{
						id: "batch.completed:2",
						delivery_key: "batch.completed",
						event_type: "batch.completed",
						status: "delivered",
						attempt_number: 2,
						max_attempts: 4,
						tried_at: "2026-05-03T10:02:00.000Z",
						delivered_at: "2026-05-03T10:02:00.000Z",
						next_retry_at: null,
						response_status: 200,
						error_message: null,
					},
				],
				webhookRetryQueue: {
					"batch.completed": {
						deliveryKey: "batch.completed",
						eventType: "batch.completed",
						phase: "completed",
						progress: null,
						attemptCount: 2,
						nextRetryAt: "2026-05-03T10:03:00.000Z",
						lastTriedAt: "2026-05-03T10:01:00.000Z",
						lastStatusCode: 503,
						lastErrorMessage: "Webhook returned HTTP 503",
					},
				},
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:02:00.000Z",
		};
		const cleanedRecord = {
			...staleRetryRecord,
			meta: {
				...staleRetryRecord.meta,
				webhookRetryQueue: {},
			},
		};

		listAsyncOperationsMock.mockImplementation(async (args: any) => {
			if (args.kind === "video") return [];
			if (args.kind === "batch") return [staleRetryRecord];
			return [];
		});
		getAsyncOperationMock
			.mockResolvedValueOnce(staleRetryRecord)
			.mockResolvedValueOnce(cleanedRecord);
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response("should not be sent", { status: 200 })),
		);

		const summary = await runAsyncWebhookRetriesJob({
			limitPerKind: 10,
			maxDeliveries: 1,
			baseUrl: "https://api.phaseo.app",
			now: "2026-05-03T10:04:00.000Z",
		});

		expect(globalThis.fetch).not.toHaveBeenCalled();
		expect(patchAsyncOperationMetaMock).toHaveBeenCalledWith({
			workspaceId: "ws_123",
			kind: "batch",
			internalId: "batch_delivered_retry",
			metaPatch: {
				webhookRetryQueue: {},
				nextWebhookRetryAt: null,
			},
		});
		expect(summary).toMatchObject({
			deliveriesRetried: 1,
			deliveriesSucceeded: 1,
			deliveriesStillPending: 0,
			deliveriesFailedPermanently: 0,
		});
	});

	it("does not start a fresh delivery cycle after a webhook failed permanently", async () => {
		getAsyncOperationMock.mockResolvedValue({
			workspaceId: "ws_123",
			kind: "video",
			internalId: "video_permanent_failure",
			requestId: "req_permanent_failure",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "vid_permanent_failure",
			model: "openai/sora",
			status: "completed",
			meta: {
				webhook: {
					url: "https://example.com/hooks/video",
					events: ["video.completed"],
				},
				webhookAttempts: [
					{
						id: "video.completed:4",
						delivery_key: "video.completed",
						event_type: "video.completed",
						status: "failed_permanently",
						attempt_number: 4,
						max_attempts: 4,
						tried_at: "2026-05-03T10:04:00.000Z",
						delivered_at: null,
						next_retry_at: null,
						response_status: 500,
						error_message: "Webhook returned HTTP 500",
					},
				],
				webhookRetryQueue: {},
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:04:00.000Z",
		});
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response("should not be sent", { status: 200 })),
		);

		const ok = await dispatchAsyncWebhookEvent({
			workspaceId: "ws_123",
			kind: "video",
			internalId: "video_permanent_failure",
			phase: "completed",
			baseUrl: "https://api.phaseo.app",
		});

		expect(ok).toBe(false);
		expect(globalThis.fetch).not.toHaveBeenCalled();
		expect(patchAsyncOperationMetaMock).not.toHaveBeenCalled();
	});
});
