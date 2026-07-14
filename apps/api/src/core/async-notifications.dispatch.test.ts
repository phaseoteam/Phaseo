import { beforeEach, describe, expect, it, vi } from "vitest";

const getAsyncOperationMock = vi.fn();
const listAsyncOperationsMock = vi.fn();
const patchAsyncOperationMetaMock = vi.fn();
const claimAsyncWebhookDeliveryMock = vi.fn();
const completeAsyncWebhookDeliveryMock = vi.fn();
const releaseAsyncWebhookDeliveryClaimMock = vi.fn();
const getWebhookEndpointSigningConfigMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	dispatchBackground: (promise: Promise<unknown>) => void promise,
}));

vi.mock("@core/async-operations", () => ({
	claimAsyncWebhookDelivery: (...args: any[]) => claimAsyncWebhookDeliveryMock(...args),
	completeAsyncWebhookDelivery: (...args: any[]) => completeAsyncWebhookDeliveryMock(...args),
	getAsyncOperation: (...args: any[]) => getAsyncOperationMock(...args),
	listAsyncOperations: (...args: any[]) => listAsyncOperationsMock(...args),
	patchAsyncOperationMeta: (...args: any[]) => patchAsyncOperationMetaMock(...args),
	releaseAsyncWebhookDeliveryClaim: (...args: any[]) => releaseAsyncWebhookDeliveryClaimMock(...args),
}));

vi.mock("@core/video-public", () => ({
	buildVideoContentUrl: (_baseUrl: string, id: string, index: number) =>
		`https://gateway.test/v1/videos/${id}/content/${index}`,
	buildVideoPollingUrl: (_baseUrl: string, id: string) =>
		`https://gateway.test/v1/videos/${id}`,
	issueSignedVideoDownloadUrl: vi.fn(async () => null),
	resolveGatewayPublicBaseUrl: () => "https://gateway.test",
	toPublicVideoProviderId: (provider: string | null | undefined) => provider ?? null,
	toPublicVideoStatus: (status: string | null | undefined) => status ?? "pending",
}));

vi.mock("@core/webhook-endpoints", () => ({
	getWebhookEndpointSigningConfig: (...args: any[]) =>
		getWebhookEndpointSigningConfigMock(...args),
	validateWebhookEndpointUrl: (value: unknown) => {
		try {
			const url = new URL(String(value));
			return url.protocol === "https:"
				? { ok: true, url: url.toString() }
				: { ok: false, reason: "webhook_url_must_use_https" };
		} catch {
			return { ok: false, reason: "webhook_url_invalid" };
		}
	},
	validateWebhookEndpointUrlForDelivery: async (value: unknown) => {
		try {
			const url = new URL(String(value));
			return url.protocol === "https:"
				? { ok: true, url: url.toString() }
				: { ok: false, reason: "webhook_url_must_use_https" };
		} catch {
			return { ok: false, reason: "webhook_url_invalid" };
		}
	},
}));

import {
	dispatchAsyncWebhookEvent,
	runAsyncWebhookRetriesJob,
} from "./async-notifications";

function batchRecord(overrides: Record<string, unknown> = {}) {
	return {
		workspaceId: "ws_1",
		kind: "batch",
		internalId: "batch_1",
		requestId: "req_1",
		sessionId: "sess_1",
		appId: "00000000-0000-4000-8000-000000000001",
		provider: "openai",
		nativeId: "batch_native_1",
		model: "openai/gpt-5.4-nano",
		status: "completed",
		billedAt: "2026-06-17T16:00:00.000Z",
		createdAt: "2026-06-17T15:59:00.000Z",
		updatedAt: "2026-06-17T16:00:00.000Z",
		meta: {
			provider: "openai",
			model: "openai/gpt-5.4-nano",
			endpoint: "/v1/responses",
			completionWindow: "24h",
			requestCounts: {
				total: 2,
				completed: 2,
				failed: 0,
			},
			costNanos: 20250,
			costUsd: 0.00002025,
			charged: true,
			billingReason: "charged",
			webhook: {
				url: "https://receiver.test/webhooks/aistats",
				secret: "whsec_test_secret",
				events: ["batch.completed", "batch.failed"],
			},
		},
		...overrides,
	};
}

async function expectedSignature(secret: string, timestamp: string, body: string) {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(`${timestamp}.${body}`),
	);
	return Array.from(new Uint8Array(signature))
		.map((value) => value.toString(16).padStart(2, "0"))
		.join("");
}

describe("async webhook dispatch", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-06-17T16:00:00.000Z"));
		getAsyncOperationMock.mockReset();
		listAsyncOperationsMock.mockReset();
		patchAsyncOperationMetaMock.mockReset();
		claimAsyncWebhookDeliveryMock.mockReset().mockResolvedValue(true);
		completeAsyncWebhookDeliveryMock.mockReset().mockResolvedValue(true);
		releaseAsyncWebhookDeliveryClaimMock.mockReset().mockResolvedValue(true);
		getWebhookEndpointSigningConfigMock.mockReset();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("delivers signed batch completion webhooks and stores delivery metadata", async () => {
		getAsyncOperationMock.mockResolvedValueOnce(batchRecord());
		vi.mocked(fetch).mockResolvedValueOnce(new Response("accepted", { status: 202 }));

		const delivered = await dispatchAsyncWebhookEvent({
			workspaceId: "ws_1",
			kind: "batch",
			internalId: "batch_1",
			phase: "completed",
			baseUrl: "https://gateway.test",
		});

		expect(delivered).toBe(true);
		expect(fetch).toHaveBeenCalledTimes(1);
		const [url, init] = vi.mocked(fetch).mock.calls[0]!;
		expect(url).toBe("https://receiver.test/webhooks/aistats");
		expect(init?.method).toBe("POST");
		expect(init?.redirect).toBe("manual");
		const headers = init?.headers as Record<string, string>;
		expect(headers["Content-Type"]).toBe("application/json");
		expect(headers["User-Agent"]).toBe("Phaseo-Async-Webhook/1.0");
		expect(headers["x-phaseo-timestamp"]).toBe("1781712000");
		expect(headers["x-phaseo-signature"]).toBe(
			await expectedSignature(
				"whsec_test_secret",
				"1781712000",
				String(init?.body),
			),
		);

		const payload = JSON.parse(String(init?.body));
		expect(payload).toMatchObject({
			id: "evt_batch_batch_1_batch_completed",
			type: "batch.completed",
			created_at: 1781712000,
			data: {
				id: "batch_1",
				object: "batch",
				kind: "batch",
				status: "completed",
				lifecycle_status: "completed",
				polling_url: "https://gateway.test/v1/batches/batch_1",
				request_counts: {
					total: 2,
					completed: 2,
					failed: 0,
				},
				billing: {
					currency: "usd",
					state: "settled",
					total_nanos: 20250,
					charged: true,
				},
			},
		});
		expect(payload.data.webhook).toMatchObject({
			url: "https://receiver.test/webhooks/aistats",
			has_secret: true,
		});

		expect(patchAsyncOperationMetaMock).toHaveBeenCalledWith({
			workspaceId: "ws_1",
			kind: "batch",
			internalId: "batch_1",
			metaPatch: expect.objectContaining({
				webhookDeliveries: {
					"batch.completed": "2026-06-17T16:00:00.000Z",
				},
				webhookRetryQueue: {},
				nextWebhookRetryAt: null,
				lastWebhookDispatchedAt: "2026-06-17T16:00:00.000Z",
			}),
		});
		expect(patchAsyncOperationMetaMock.mock.calls[0]?.[0]?.metaPatch.webhookAttempts).toEqual([
			expect.objectContaining({
				delivery_key: "batch.completed",
				event_type: "batch.completed",
				status: "delivered",
				attempt_number: 1,
				response_status: 202,
				response_body_preview: "accepted",
			}),
		]);
	});

	it("does not send when another worker owns the delivery claim", async () => {
		getAsyncOperationMock.mockResolvedValueOnce(batchRecord());
		claimAsyncWebhookDeliveryMock.mockResolvedValueOnce(false);

		await expect(dispatchAsyncWebhookEvent({
			workspaceId: "ws_1",
			kind: "batch",
			internalId: "batch_1",
			phase: "completed",
		})).resolves.toBe(false);
		expect(fetch).not.toHaveBeenCalled();
		expect(completeAsyncWebhookDeliveryMock).not.toHaveBeenCalled();
	});

	it("schedules retry metadata when the customer webhook fails", async () => {
		getAsyncOperationMock.mockResolvedValueOnce(batchRecord());
		vi.mocked(fetch).mockResolvedValueOnce(new Response("try later", { status: 503 }));

		const delivered = await dispatchAsyncWebhookEvent({
			workspaceId: "ws_1",
			kind: "batch",
			internalId: "batch_1",
			phase: "failed",
			baseUrl: "https://gateway.test",
		});

		expect(delivered).toBe(false);
		expect(patchAsyncOperationMetaMock).toHaveBeenCalledWith({
			workspaceId: "ws_1",
			kind: "batch",
			internalId: "batch_1",
			metaPatch: expect.objectContaining({
				webhookRetryQueue: {
					"batch.failed": expect.objectContaining({
						deliveryKey: "batch.failed",
						eventType: "batch.failed",
						phase: "failed",
						attemptCount: 1,
						nextRetryAt: "2026-06-17T16:01:00.000Z",
						lastStatusCode: 503,
						lastErrorMessage: "Webhook returned HTTP 503",
						responseBodyPreview: "try later",
					}),
				},
				nextWebhookRetryAt: "2026-06-17T16:01:00.000Z",
				lastWebhookDispatchedAt: "2026-06-17T16:00:00.000Z",
			}),
		});
		expect(patchAsyncOperationMetaMock.mock.calls[0]?.[0]?.metaPatch.webhookAttempts).toEqual([
			expect.objectContaining({
				delivery_key: "batch.failed",
				event_type: "batch.failed",
				status: "scheduled_retry",
				attempt_number: 1,
				next_retry_at: "2026-06-17T16:01:00.000Z",
				response_status: 503,
			}),
		]);
	});

	it("does not follow webhook redirects", async () => {
		getAsyncOperationMock.mockResolvedValueOnce(batchRecord());
		vi.mocked(fetch).mockResolvedValueOnce(new Response(null, {
			status: 307,
			headers: { Location: "https://127.0.0.1/internal" },
		}));
		const delivered = await dispatchAsyncWebhookEvent({
			workspaceId: "ws_1",
			kind: "batch",
			internalId: "batch_1",
			phase: "completed",
		});
		expect(delivered).toBe(false);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(patchAsyncOperationMetaMock.mock.calls[0]?.[0]?.metaPatch.webhookAttempts).toEqual([
			expect.objectContaining({ response_status: 307, error_message: "Webhook redirects are not allowed" }),
		]);
	});

	it("uses managed endpoint secrets and retries due webhook deliveries", async () => {
		listAsyncOperationsMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
			batchRecord({
				meta: {
					webhook: {
						endpoint_id: "we_1",
						events: ["batch.completed"],
					},
					webhookRetryQueue: {
						"batch.completed": {
							deliveryKey: "batch.completed",
							eventType: "batch.completed",
							phase: "completed",
							attemptCount: 1,
							nextRetryAt: "2026-06-17T15:59:00.000Z",
						},
					},
				},
			}),
		]);
		getWebhookEndpointSigningConfigMock.mockResolvedValue({
			id: "we_1",
			url: "https://managed-receiver.test/webhook",
			secret: "whsec_managed",
			events: ["batch.completed"],
		});
		getAsyncOperationMock
			.mockResolvedValueOnce(
				batchRecord({
					meta: {
						webhook: {
							endpoint_id: "we_1",
							events: ["batch.completed"],
						},
						webhookRetryQueue: {
							"batch.completed": {
								deliveryKey: "batch.completed",
								eventType: "batch.completed",
								phase: "completed",
								attemptCount: 1,
								nextRetryAt: "2026-06-17T15:59:00.000Z",
							},
						},
					},
				}),
			)
			.mockResolvedValueOnce(
				batchRecord({
					meta: {
						webhookAttempts: [
							{
								delivery_key: "batch.completed",
								event_type: "batch.completed",
								status: "delivered",
								attempt_number: 2,
								max_attempts: 4,
								tried_at: "2026-06-17T16:00:00.000Z",
								delivered_at: "2026-06-17T16:00:00.000Z",
								response_status: 204,
							},
						],
					},
				}),
			);
		vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));

		const summary = await runAsyncWebhookRetriesJob({
			limitPerKind: 10,
			maxDeliveries: 10,
			baseUrl: "https://gateway.test",
		});

		expect(summary).toMatchObject({
			jobsScanned: 1,
			deliveriesRetried: 1,
			deliveriesSucceeded: 1,
			deliveriesStillPending: 0,
			deliveriesFailedPermanently: 0,
		});
		expect(getWebhookEndpointSigningConfigMock).toHaveBeenCalledWith({
			workspaceId: "ws_1",
			endpointId: "we_1",
		});
		const [, init] = vi.mocked(fetch).mock.calls[0]!;
		const headers = init?.headers as Record<string, string>;
		expect(headers["x-phaseo-signature"]).toBe(
			await expectedSignature(
				"whsec_managed",
				"1781712000",
				String(init?.body),
			),
		);
	});
});
