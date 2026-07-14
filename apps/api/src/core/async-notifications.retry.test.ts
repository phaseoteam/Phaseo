import { beforeEach, describe, expect, it, vi } from "vitest";

const getAsyncOperationMock = vi.fn();
const listAsyncOperationsMock = vi.fn();
const patchAsyncOperationMetaMock = vi.fn();
const claimAsyncWebhookDeliveryMock = vi.fn();
const completeAsyncWebhookDeliveryMock = vi.fn();
const releaseAsyncWebhookDeliveryClaimMock = vi.fn();

vi.mock("@core/async-operations", () => ({
	claimAsyncWebhookDelivery: (...args: any[]) => claimAsyncWebhookDeliveryMock(...args),
	completeAsyncWebhookDelivery: (...args: any[]) => completeAsyncWebhookDeliveryMock(...args),
	getAsyncOperation: (...args: any[]) => getAsyncOperationMock(...args),
	listAsyncOperations: (...args: any[]) => listAsyncOperationsMock(...args),
	patchAsyncOperationMeta: (...args: any[]) => patchAsyncOperationMetaMock(...args),
	releaseAsyncWebhookDeliveryClaim: (...args: any[]) => releaseAsyncWebhookDeliveryClaimMock(...args),
}));

vi.mock("@/runtime/env", () => ({
	dispatchBackground: (promise: Promise<unknown>) => promise,
}));

import { dispatchAsyncWebhookEvent } from "./async-notifications";

describe("dispatchAsyncWebhookEvent retries", () => {
	beforeEach(() => {
		getAsyncOperationMock.mockReset();
		listAsyncOperationsMock.mockReset();
		patchAsyncOperationMetaMock.mockReset();
		claimAsyncWebhookDeliveryMock.mockReset().mockResolvedValue(true);
		completeAsyncWebhookDeliveryMock.mockReset().mockResolvedValue(true);
		releaseAsyncWebhookDeliveryClaimMock.mockReset().mockResolvedValue(true);
		vi.restoreAllMocks();
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
	});
});
