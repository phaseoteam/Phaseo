import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearRuntime, configureRuntime } from "@/runtime/env";

import {
	buildAsyncNotificationData,
	buildPublicAsyncWebhook,
	parseAsyncWebhookConfig,
	resolveAsyncNotificationKind,
	toAsyncLifecycleStatus,
} from "./async-notifications";
import type { AsyncOperationRecord } from "./async-operations";

describe("parseAsyncWebhookConfig", () => {
	it("accepts https webhooks and normalizes event names", () => {
		expect(
			parseAsyncWebhookConfig("batch", {
				url: "https://example.com/hooks/async",
				secret: " whsec_test ",
				events: ["completed", "batch.failed", "job.cancelled", "expired", "ignored"],
			}),
		).toEqual({
			url: "https://example.com/hooks/async",
			secret: "whsec_test",
			events: ["job.completed", "batch.failed", "job.cancelled", "job.expired"],
		});
	});

	it("canonicalizes canceled webhook subscriptions to cancelled", () => {
		expect(
			parseAsyncWebhookConfig("video", {
				url: "https://example.com/hooks/video",
				events: ["canceled", "job.canceled", "video.canceled"],
			}),
		).toEqual({
			url: "https://example.com/hooks/video",
			secret: null,
			events: ["job.cancelled", "video.cancelled"],
		});

		expect(
			parseAsyncWebhookConfig("batch", {
				url: "https://example.com/hooks/batch",
				events: ["batch.canceled"],
			}),
		).toEqual({
			url: "https://example.com/hooks/batch",
			secret: null,
			events: ["batch.cancelled"],
		});
	});

	it("accepts progress webhook subscriptions for generic and matching async kinds", () => {
		expect(
			parseAsyncWebhookConfig("batch", {
				url: "https://example.com/hooks/batch",
				events: ["progress", "job.progress", "batch.progress", "video.progress"],
			}),
		).toEqual({
			url: "https://example.com/hooks/batch",
			secret: null,
			events: ["job.progress", "batch.progress"],
		});

		expect(
			parseAsyncWebhookConfig("video", {
				url: "https://example.com/hooks/video",
				events: ["progress", "video.progress", "batch.progress"],
			}),
		).toEqual({
			url: "https://example.com/hooks/video",
			secret: null,
			events: ["job.progress", "video.progress"],
		});
	});

	it("rejects cross-kind specific webhook subscriptions", () => {
		expect(
			parseAsyncWebhookConfig("video", {
				url: "https://example.com/hooks/video",
				events: ["batch.completed", "job.failed", "video.expired"],
			}),
		).toEqual({
			url: "https://example.com/hooks/video",
			secret: null,
			events: ["job.failed", "video.expired"],
		});

		expect(
			parseAsyncWebhookConfig("batch", {
				url: "https://example.com/hooks/batch",
				events: ["video.completed"],
			}),
		).toBeNull();
	});

	it("rejects webhook configs when every supplied event is invalid", () => {
		expect(
			parseAsyncWebhookConfig("batch", {
				url: "https://example.com/hooks/batch",
				events: ["ignored", "video.completed"],
			}),
		).toBeNull();
		expect(
			parseAsyncWebhookConfig("video", {
				url: "https://example.com/hooks/video",
				events: "video.completed",
			}),
		).toBeNull();
	});

	it("allows localhost http callbacks for development", () => {
		expect(
			parseAsyncWebhookConfig("video", {
				url: "http://localhost:4010/webhooks/video",
			}),
		).toEqual({
			url: "http://localhost:4010/webhooks/video",
			secret: null,
			events: ["job.completed", "job.failed", "job.cancelled", "job.expired"],
		});
		expect(
			parseAsyncWebhookConfig("video", {
				url: "http://[::1]:4010/webhooks/video",
			}),
		).toMatchObject({
			url: "http://[::1]:4010/webhooks/video",
		});
	});

	it("rejects unsupported schemes and malformed payloads", () => {
		expect(parseAsyncWebhookConfig("video", null)).toBeNull();
		expect(
			parseAsyncWebhookConfig("video", {
				url: "javascript:alert(1)",
			}),
		).toBeNull();
		expect(
			parseAsyncWebhookConfig("video", {
				url: "http://example.com/insecure",
			}),
		).toBeNull();
	});

	it("rejects literal private or loopback webhook targets over HTTPS", () => {
		for (const url of [
			"https://localhost/hooks/video",
			"https://127.0.0.1/hooks/video",
			"https://10.0.0.5/hooks/video",
			"https://172.16.0.5/hooks/video",
			"https://172.31.255.255/hooks/video",
			"https://192.168.1.10/hooks/video",
			"https://169.254.10.20/hooks/video",
			"https://0.0.0.0/hooks/video",
			"https://[::1]/hooks/video",
			"https://[::]/hooks/video",
			"https://[fe80::1]/hooks/video",
			"https://[fc00::1]/hooks/video",
			"https://[fd00::1]/hooks/video",
			"https://[::ffff:10.0.0.1]/hooks/video",
		]) {
			expect(parseAsyncWebhookConfig("video", { url })).toBeNull();
		}
		expect(
			parseAsyncWebhookConfig("video", {
				url: "https://172.32.0.5/hooks/video",
			}),
		).toMatchObject({
			url: "https://172.32.0.5/hooks/video",
		});
		expect(
			parseAsyncWebhookConfig("video", {
				url: "https://[2607:f8b0:4004:800::2004]/hooks/video",
			}),
		).toMatchObject({
			url: "https://[2607:f8b0:4004:800::2004]/hooks/video",
		});
		expect(
			parseAsyncWebhookConfig("video", {
				url: "https://[::ffff:8.8.8.8]/hooks/video",
			}),
		).toMatchObject({
			url: "https://[::ffff:808:808]/hooks/video",
		});
	});
});

describe("resolveAsyncNotificationKind", () => {
	it("only exposes video and batch as supported async notification kinds", () => {
		expect(resolveAsyncNotificationKind("video")).toBe("video");
		expect(resolveAsyncNotificationKind("batch")).toBe("batch");
		expect(resolveAsyncNotificationKind("music")).toBeNull();
		expect(resolveAsyncNotificationKind("")).toBeNull();
	});
});

describe("buildPublicAsyncWebhook", () => {
	it("returns only recent attempts while preserving full delivery totals", () => {
		const attempts = Array.from({ length: 12 }, (_, index) => {
			const attempt = index + 1;
			return {
				id: `video.completed:${attempt}`,
				delivery_key: "video.completed",
				event_type: "video.completed",
				status: attempt === 12 ? "delivered" : "scheduled_retry",
				attempt_number: attempt,
				max_attempts: 12,
				tried_at: `2026-05-03T10:${String(attempt).padStart(2, "0")}:00.000Z`,
				delivered_at: attempt === 12 ? "2026-05-03T10:12:01.000Z" : null,
				next_retry_at: attempt === 12 ? null : `2026-05-03T10:${String(attempt + 1).padStart(2, "0")}:00.000Z`,
				response_status: attempt === 12 ? 200 : 503,
				error_message: attempt === 12 ? null : "Webhook returned HTTP 503",
			};
		});

		expect(
			buildPublicAsyncWebhook("video", {
				webhook: {
					url: "https://example.com/hooks/video",
					events: ["video.completed"],
				},
				webhookDeliveries: {
					"video.completed": "2026-05-03T10:12:01.000Z",
				},
				webhookAttempts: attempts,
			}),
		).toMatchObject({
			url: "https://example.com/hooks/video",
			delivery: {
				total_attempts: 12,
				delivered_events: 1,
				last_attempt_status: "delivered",
				last_response_status: 200,
			},
			attempts: [
				{ id: "video.completed:3" },
				{ id: "video.completed:4" },
				{ id: "video.completed:5" },
				{ id: "video.completed:6" },
				{ id: "video.completed:7" },
				{ id: "video.completed:8" },
				{ id: "video.completed:9" },
				{ id: "video.completed:10" },
				{ id: "video.completed:11" },
				{ id: "video.completed:12" },
			],
		});
	});
});

describe("toAsyncLifecycleStatus", () => {
	it("normalizes provider casing and cancellation spelling variants", () => {
		expect(toAsyncLifecycleStatus("IN_PROGRESS")).toBe("running");
		expect(toAsyncLifecycleStatus("canceled")).toBe("cancelled");
		expect(toAsyncLifecycleStatus("cancelled")).toBe("cancelled");
		expect(toAsyncLifecycleStatus("expired")).toBe("expired");
	});
});

describe("buildAsyncNotificationData", () => {
	beforeEach(() => {
		configureRuntime({
			SUPABASE_URL: "https://example.supabase.co",
			SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
			GATEWAY_CACHE: {} as KVNamespace,
			NODE_ENV: "test",
			GATEWAY_PUBLIC_BASE_URL: "https://api.phaseo.app",
			KEY_PEPPER: "test-video-secret",
		} as any);
	});

	afterEach(() => {
		clearRuntime();
	});

	it("builds video payloads with request correlation and settled billing details", async () => {
		const record: AsyncOperationRecord = {
			workspaceId: "team_video_123",
			kind: "video",
			internalId: "video_123",
			requestId: "req_video_123",
			sessionId: "sess_video_123",
			appId: "app_video_123",
			provider: "google-vertex",
			nativeId: "vertex-op-123",
			model: "google/veo-3.1-lite-generate-preview",
			status: "completed",
			meta: {
				provider: "google-vertex",
				model: "google/veo-3.1-lite-generate-preview",
				seconds: 5,
				durationMs: 12000,
				latencyMs: 800,
				generationMs: 11200,
				resolution: "720p",
				quality: "standard",
				outputAccess: "both",
				keySource: "byok",
				byokKeyId: "byok_key_123",
				costNanos: 150000000,
				costUsd: 0.15,
				charged: true,
				billingReason: "captured",
				nextWebhookRetryAt: "2026-05-03T10:06:00.000Z",
				lastWebhookProgress: 90,
				lastWebhookProgressAt: "2026-05-03T10:04:45.000Z",
				lastWebhookDispatchedAt: "2026-05-03T10:05:12.000Z",
				reservationId: "video_hold:req_video_123",
				reservedNanos: 150000000,
				reservationStatus: "captured",
				finalizedAt: "2026-05-03T10:05:00.000Z",
				lastPolledAt: "2026-05-03T10:04:30.000Z",
				polledStatus: "completed",
				lastReconciledAt: "2026-05-03T10:05:10.000Z",
				pricingBreakdown: {
					total_nanos: 150000000,
					total_usd_str: "0.150000000",
				},
			},
			billedAt: "2026-05-03T10:05:00.000Z",
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:05:00.000Z",
		};

		const payload = await buildAsyncNotificationData({
			baseUrl: "https://api.phaseo.app",
			record,
			progress: 100,
		});

		expect(payload).toMatchObject({
			id: "video_123",
			object: "video",
			kind: "video",
			status: "completed",
			lifecycle_status: "completed",
			request_id: "req_video_123",
			native_id: "vertex-op-123",
			session_id: "sess_video_123",
			app_id: "app_video_123",
			progress: 100,
			provider: "google-vertex",
			model: "google/veo-3.1-lite-generate-preview",
			polling_url: "https://api.phaseo.app/v1/videos/video_123",
			websocket_url: "wss://api.phaseo.app/v1/async/video/video_123/ws",
			cancel_url: null,
			content_url: "https://api.phaseo.app/v1/videos/video_123/content",
			duration_seconds: 5,
			duration_ms: 12000,
			total_duration_ms: 12000,
			latency_ms: 800,
			generation_ms: 11200,
			resolution: "720p",
			quality: "standard",
			output_access: "both",
			key_source: "byok",
			byok_key_id: "byok_key_123",
			reservation_id: "video_hold:req_video_123",
			reservation_status: "captured",
			next_webhook_retry_at: "2026-05-03T10:06:00.000Z",
			last_webhook_progress: 90,
			last_webhook_progress_at: "2026-05-03T10:04:45.000Z",
			last_webhook_dispatched_at: "2026-05-03T10:05:12.000Z",
			finalized_at: "2026-05-03T10:05:00.000Z",
			last_polled_at: "2026-05-03T10:04:30.000Z",
			polled_status: "completed",
			last_reconciled_at: "2026-05-03T10:05:10.000Z",
			pricing_breakdown: {
				total_nanos: 150000000,
				total_usd_str: "0.150000000",
			},
			billing: {
				currency: "usd",
				estimated_provider_cost: "0.15",
				estimated_user_cost: "0.15",
				settled_provider_cost: "0.15",
				settled_user_cost: "0.15",
				state: "settled",
				billable: true,
				total_nanos: 150000000,
				estimated_nanos: 150000000,
				reserved_nanos: 150000000,
				reservation_id: "video_hold:req_video_123",
				reservation_status: "captured",
				charge_reason: "captured",
				charged: true,
				billed_at: "2026-05-03T10:05:00.000Z",
			},
			created_at: "2026-05-03T10:00:00.000Z",
			updated_at: "2026-05-03T10:05:00.000Z",
		});
	});

	it("builds in-progress video billing from reserved hold metadata", async () => {
		const record: AsyncOperationRecord = {
			workspaceId: "team_video_hold",
			kind: "video",
			internalId: "video_hold_123",
			requestId: "req_video_hold_123",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "vid_native_123",
			model: "openai/sora-2",
			status: "in_progress",
			meta: {
				provider: "openai",
				model: "openai/sora-2",
				seconds: 4,
				reservationId: "video_hold:req_video_hold_123",
				reservedNanos: 225000000,
				reservationStatus: "held",
				pricedUsage: {
					pricing: {
						total_nanos: 225000000,
						total_usd_str: "0.225000000",
					},
				},
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:01:00.000Z",
		};

		const payload = await buildAsyncNotificationData({
			baseUrl: "https://api.phaseo.app",
			record,
			progress: 40,
		});

		expect(payload).toMatchObject({
			id: "video_hold_123",
			status: "processing",
			lifecycle_status: "running",
			cancel_url: "https://api.phaseo.app/v1/videos/video_hold_123/cancel",
			reservation_id: "video_hold:req_video_hold_123",
			reservation_status: "held",
			billing: {
				currency: "usd",
				estimated_provider_cost: "0.23",
				estimated_user_cost: "0.23",
				settled_provider_cost: null,
				settled_user_cost: null,
				state: "estimated",
				billable: false,
				total_nanos: null,
				estimated_nanos: 225000000,
				reserved_nanos: 225000000,
				reservation_id: "video_hold:req_video_hold_123",
				reservation_status: "held",
				charge_reason: null,
				charged: null,
			},
		});
	});

	it("builds completed video capture failures as pending billing", async () => {
		const record: AsyncOperationRecord = {
			workspaceId: "team_video_capture_failed",
			kind: "video",
			internalId: "video_capture_failed",
			requestId: "req_video_capture_failed",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "vid_capture_failed",
			model: "openai/sora-2",
			status: "completed",
			meta: {
				provider: "openai",
				model: "openai/sora-2",
				seconds: 4,
				reservationId: "video_hold:req_video_capture_failed",
				reservedNanos: 225000000,
				reservationStatus: "capture_failed",
				billingReason: "capture_failed",
				charged: false,
				pricedUsage: {
					pricing: {
						total_nanos: 225000000,
					},
				},
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:05:00.000Z",
		};

		const payload = await buildAsyncNotificationData({
			baseUrl: "https://api.phaseo.app",
			record,
		});

		expect(payload).toMatchObject({
			id: "video_capture_failed",
			status: "completed",
			lifecycle_status: "completed",
			billing: {
				state: "pending",
				billable: false,
				total_nanos: null,
				estimated_nanos: 225000000,
				reserved_nanos: 225000000,
				reservation_status: "capture_failed",
				charge_reason: "capture_failed",
				charged: false,
			},
		});
	});

	it("omits video cancel urls for active unsupported providers in async payloads", async () => {
		const record: AsyncOperationRecord = {
			workspaceId: "team_video_unsupported",
			kind: "video",
			internalId: "video_unsupported_123",
			requestId: "req_video_unsupported_123",
			sessionId: null,
			appId: null,
			provider: "google-ai-studio",
			nativeId: "operation_unsupported_123",
			model: "google/veo-3",
			status: "in_progress",
			meta: {
				provider: "google-ai-studio",
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:01:00.000Z",
		};

		const payload = await buildAsyncNotificationData({
			baseUrl: "https://api.phaseo.app",
			record,
			progress: 25,
		});

		expect(payload).toMatchObject({
			id: "video_unsupported_123",
			status: "processing",
			lifecycle_status: "running",
			provider: "google-ai-studio",
			polling_url: "https://api.phaseo.app/v1/videos/video_unsupported_123",
			cancel_url: null,
		});
	});

	it("builds batch payloads with polling, cancel, and websocket urls", async () => {
		const record: AsyncOperationRecord = {
			workspaceId: "team_123",
			kind: "batch",
			internalId: "batch_123",
			requestId: "req_123",
			sessionId: "sess_123",
			appId: "app_123",
			provider: "openai",
			nativeId: "batch_123",
			model: "openai/gpt-5-mini",
			status: "in_progress",
			meta: {
				provider: "openai",
				webhook: {
					url: "https://example.com/hooks/batch",
					secret: "whsec_batch_secret",
					events: ["job.completed", "batch.failed"],
				},
				webhookDeliveries: {
					"job.completed": "2026-05-03T10:01:35.000Z",
				},
				webhookAttempts: [
					{
						id: "batch.completed:1",
						delivery_key: "batch.completed",
						event_type: "batch.completed",
						status: "delivered",
						attempt_number: 1,
						max_attempts: 4,
						tried_at: "2026-05-03T10:01:34.000Z",
						delivered_at: "2026-05-03T10:01:35.000Z",
						response_status: 200,
					},
				],
				webhookRetryQueue: {
					"batch.failed": {
						deliveryKey: "batch.failed",
						eventType: "batch.failed",
						phase: "failed",
						attemptCount: 2,
						nextRetryAt: "2026-05-03T10:02:00.000Z",
						lastTriedAt: "2026-05-03T10:01:40.000Z",
						lastStatusCode: 500,
						lastErrorMessage: "Webhook returned HTTP 500",
					},
				},
				endpoint: "/v1/responses",
				completionWindow: "24h",
				inputFileId: "file_in",
				outputFileId: "file_out",
				errorFileId: "file_err",
				keySource: "byok",
				byokKeyId: "byok_batch_key_123",
				pricedUsage: {
					pricing: {
						lines: [
							{
								dimension: "batch_requests",
								units: 7,
								total_nanos: 125000000,
							},
						],
					},
				},
				nextWebhookRetryAt: "2026-05-03T10:02:00.000Z",
				lastWebhookProgress: 60,
				lastWebhookProgressAt: "2026-05-03T10:01:30.000Z",
				lastWebhookDispatchedAt: "2026-05-03T10:01:40.000Z",
				lastPolledAt: "2026-05-03T10:01:45.000Z",
				polledStatus: "in_progress",
				finalizedAt: "2026-05-03T10:01:50.000Z",
				requestCounts: {
					total: 12,
					completed: 7,
					failed: 2,
				},
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:01:00.000Z",
		};

		await expect(
			buildAsyncNotificationData({
				baseUrl: "https://api.phaseo.app",
				record,
			}),
		).resolves.toMatchObject({
			id: "batch_123",
			object: "batch",
			kind: "batch",
			status: "in_progress",
			lifecycle_status: "running",
			request_id: "req_123",
			session_id: "sess_123",
			app_id: "app_123",
			native_id: "batch_123",
			provider: "openai",
			model: "openai/gpt-5-mini",
			polling_url: "https://api.phaseo.app/v1/batches/batch_123",
			websocket_url: "wss://api.phaseo.app/v1/async/batch/batch_123/ws",
			cancel_url: "https://api.phaseo.app/v1/batches/batch_123/cancel",
			webhook: {
				url: "https://example.com/hooks/batch",
				events: ["job.completed", "batch.failed"],
				has_secret: true,
				delivery: {
					total_attempts: 1,
					delivered_events: 1,
					delivered_event_types: ["job.completed"],
					pending_retries: 1,
					next_retry_at: "2026-05-03T10:02:00.000Z",
					last_attempt_at: "2026-05-03T10:01:34.000Z",
					last_attempt_status: "delivered",
					last_response_status: 200,
					last_delivered_at: "2026-05-03T10:01:35.000Z",
					last_failure_at: null,
					last_error_message: null,
				},
				attempts: [
					{
						id: "batch.completed:1",
						delivery_key: "batch.completed",
						event_type: "batch.completed",
						status: "delivered",
						attempt_number: 1,
						max_attempts: 4,
						tried_at: "2026-05-03T10:01:34.000Z",
						delivered_at: "2026-05-03T10:01:35.000Z",
						response_status: 200,
						error_message: null,
						next_retry_at: null,
						response_body_preview: null,
					},
				],
			},
			endpoint: "/v1/responses",
			completion_window: "24h",
			input_file_id: "file_in",
			output_file_id: "file_out",
			error_file_id: "file_err",
			key_source: "byok",
			byok_key_id: "byok_batch_key_123",
			pricing_lines: [
				{
					dimension: "batch_requests",
					units: 7,
					total_nanos: 125000000,
				},
			],
			next_webhook_retry_at: "2026-05-03T10:02:00.000Z",
			last_webhook_progress: 60,
			last_webhook_progress_at: "2026-05-03T10:01:30.000Z",
			last_webhook_dispatched_at: "2026-05-03T10:01:40.000Z",
			last_polled_at: "2026-05-03T10:01:45.000Z",
			polled_status: "in_progress",
			finalized_at: "2026-05-03T10:01:50.000Z",
			request_counts: {
				total: 12,
				completed: 7,
				failed: 2,
			},
			billing: {
				currency: "usd",
				settled_provider_cost: null,
				settled_user_cost: null,
				state: "pending",
				billable: false,
				total_nanos: null,
				charge_reason: null,
				charged: null,
			},
			created_at: "2026-05-03T10:00:00.000Z",
			updated_at: "2026-05-03T10:01:00.000Z",
		});
	});

	it("omits batch cancel urls for active unsupported providers in async payloads", async () => {
		const record: AsyncOperationRecord = {
			workspaceId: "team_custom_batch",
			kind: "batch",
			internalId: "batch_custom_123",
			requestId: "req_custom_batch_123",
			sessionId: null,
			appId: null,
			provider: "custom-provider",
			nativeId: "native_custom_batch_123",
			model: "custom/model",
			status: "in_progress",
			meta: {
				provider: "custom-provider",
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:01:00.000Z",
		};

		const payload = await buildAsyncNotificationData({
			baseUrl: "https://api.phaseo.app",
			record,
		});

		expect(payload).toMatchObject({
			id: "batch_custom_123",
			status: "in_progress",
			lifecycle_status: "running",
			provider: "custom-provider",
			polling_url: "https://api.phaseo.app/v1/batches/batch_custom_123",
			cancel_url: null,
		});
	});

	it("includes progress on batch progress webhook payloads", async () => {
		const record: AsyncOperationRecord = {
			workspaceId: "team_batch_progress",
			kind: "batch",
			internalId: "batch_progress_123",
			requestId: "req_batch_progress_123",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "batch_progress_123",
			model: "openai/gpt-5-mini",
			status: "in_progress",
			meta: {
				provider: "openai",
				requestCounts: {
					total: 10,
					completed: 4,
					failed: 1,
				},
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:01:00.000Z",
		};

		const payload = await buildAsyncNotificationData({
			baseUrl: "https://api.phaseo.app",
			record,
			progress: 50,
		});

		expect(payload).toMatchObject({
			id: "batch_progress_123",
			object: "batch",
			status: "in_progress",
			lifecycle_status: "running",
			progress: 50,
			request_counts: {
				total: 10,
				completed: 4,
				failed: 1,
			},
		});
	});

	it("derives batch progress from stored request counts when no progress argument is supplied", async () => {
		const record: AsyncOperationRecord = {
			workspaceId: "team_batch_stored_progress",
			kind: "batch",
			internalId: "batch_stored_progress_123",
			requestId: "req_batch_stored_progress_123",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "batch_stored_progress_123",
			model: "openai/gpt-5-mini",
			status: "in_progress",
			meta: {
				provider: "openai",
				requestCounts: {
					total: 20,
					completed: 7,
					failed: 1,
				},
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:01:00.000Z",
		};

		const payload = await buildAsyncNotificationData({
			baseUrl: "https://api.phaseo.app",
			record,
		});

		expect(payload).toMatchObject({
			id: "batch_stored_progress_123",
			status: "in_progress",
			progress: 40,
			request_counts: {
				total: 20,
				completed: 7,
				failed: 1,
			},
		});
	});

	it("omits batch cancel url once the job is terminal", async () => {
		const record: AsyncOperationRecord = {
			workspaceId: "team_123",
			kind: "batch",
			internalId: "batch_456",
			requestId: "req_456",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "batch_456",
			model: "openai/gpt-5-mini",
			status: "completed",
			meta: {
				provider: "openai",
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:01:00.000Z",
		};

		const payload = await buildAsyncNotificationData({
			baseUrl: "https://api.phaseo.app",
			record,
		});
		expect(payload).toMatchObject({
			id: "batch_456",
			status: "completed",
			lifecycle_status: "completed",
			cancel_url: null,
			websocket_url: "wss://api.phaseo.app/v1/async/batch/batch_456/ws",
		});
	});

	it("includes settled batch billing details when finalization data exists", async () => {
		const record: AsyncOperationRecord = {
			workspaceId: "team_123",
			kind: "batch",
			internalId: "batch_789",
			requestId: "req_789",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "batch_789",
			model: "openai/gpt-5-mini",
			status: "completed",
			meta: {
				provider: "openai",
				costNanos: 550000000,
				costUsd: 0.55,
				charged: true,
				billingReason: "charged_partial_success",
			},
			billedAt: "2026-05-03T10:05:00.000Z",
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:05:00.000Z",
		};

		const payload = await buildAsyncNotificationData({
			baseUrl: "https://api.phaseo.app",
			record,
		});
		expect(payload).toMatchObject({
			id: "batch_789",
			request_id: "req_789",
			billing: {
				currency: "usd",
				settled_provider_cost: "0.55",
				settled_user_cost: "0.55",
				state: "settled",
				billable: true,
				total_nanos: 550000000,
				charge_reason: "charged_partial_success",
				charged: true,
				billed_at: "2026-05-03T10:05:00.000Z",
			},
		});
	});

	it("builds completed batch release failures as pending billing", async () => {
		const record: AsyncOperationRecord = {
			workspaceId: "team_batch_release_failed",
			kind: "batch",
			internalId: "batch_release_failed",
			requestId: "req_batch_release_failed",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "batch_release_failed",
			model: "openai/gpt-5-mini",
			status: "completed",
			meta: {
				provider: "openai",
				reservationId: "batch_hold:req_batch_release_failed",
				reservedNanos: 300000000,
				reservationStatus: "release_failed",
				billingReason: "release_failed",
				charged: false,
				estimatedUsage: {
					requests: 1,
					pricing: {
						total_nanos: 300000000,
					},
				},
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:05:00.000Z",
		};

		const payload = await buildAsyncNotificationData({
			baseUrl: "https://api.phaseo.app",
			record,
		});

		expect(payload).toMatchObject({
			id: "batch_release_failed",
			status: "completed",
			lifecycle_status: "completed",
			billing: {
				state: "pending",
				billable: false,
				total_nanos: null,
				estimated_nanos: 300000000,
				reserved_nanos: 300000000,
				reservation_status: "release_failed",
				charge_reason: "release_failed",
				charged: false,
			},
		});
	});

	it("derives batch pricing_lines from settled totals when explicit lines are absent", async () => {
		const record: AsyncOperationRecord = {
			workspaceId: "team_123",
			kind: "batch",
			internalId: "batch_pricing_fallback",
			requestId: "req_pricing_fallback",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "batch_pricing_fallback",
			model: "openai/gpt-5-mini",
			status: "completed",
			meta: {
				provider: "openai",
				endpoint: "/v1/responses",
				costNanos: 330000000,
				costUsd: 0.33,
				requestCounts: {
					total: 4,
					completed: 3,
					failed: 1,
				},
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:05:00.000Z",
		};

		const payload = await buildAsyncNotificationData({
			baseUrl: "https://api.phaseo.app",
			record,
		});
		expect(payload).toMatchObject({
			id: "batch_pricing_fallback",
			pricing_lines: [
				{
					dimension: "batch_requests",
					pricing_plan: "batch",
					service_tier: "batch",
					endpoint: "/v1/responses",
					units: 3,
					total_nanos: 330000000,
					total_usd_str: "0.330000000",
				},
			],
		});
	});

	it("falls back to settled batch pricing_lines when priced usage lines are empty", async () => {
		const record: AsyncOperationRecord = {
			workspaceId: "team_123",
			kind: "batch",
			internalId: "batch_empty_lines",
			requestId: "req_empty_lines",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "batch_empty_lines",
			model: "openai/gpt-image-1.5",
			status: "completed",
			meta: {
				provider: "openai",
				endpoint: "/v1/images/generations",
				costNanos: 500000000,
				costUsd: 0.5,
				pricedUsage: {
					requests: 1,
					output_image: 2,
					pricing: {
						total_nanos: 500000000,
						lines: [],
					},
				},
				requestCounts: {
					total: 1,
					completed: 1,
					failed: 0,
				},
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:05:00.000Z",
		};

		const payload = await buildAsyncNotificationData({
			baseUrl: "https://api.phaseo.app",
			record,
		});
		expect(payload).toMatchObject({
			id: "batch_empty_lines",
			pricing_lines: [
				{
					dimension: "batch_requests",
					pricing_plan: "batch",
					service_tier: "batch",
					endpoint: "/v1/images/generations",
					units: 1,
					total_nanos: 500000000,
					total_usd_str: "0.500000000",
				},
			],
			billing: {
				state: "settled",
				total_nanos: 500000000,
			},
		});
	});

	it("includes normalized failure diagnostics for failed video jobs", async () => {
		const record: AsyncOperationRecord = {
			workspaceId: "team_video_failed",
			kind: "video",
			internalId: "video_failed_123",
			requestId: "req_video_failed_123",
			sessionId: "sess_video_failed_123",
			appId: "app_video_failed_123",
			provider: "x-ai",
			nativeId: "xai-video-123",
			model: "x-ai/grok-video",
			status: "failed",
			meta: {
				provider: "x-ai",
				model: "x-ai/grok-video",
				upstreamError: {
					code: "PERMISSION_DENIED",
					message: "The caller does not have permission.",
					description: "Project is not allowed to access this model.",
					param: "model",
					status: 403,
				},
				providerFailureDiagnostics: {
					category: "provider_access_missing",
					provider: "x-ai",
					hint: "Enable the model for this project.",
				},
				failureSample: [
					{
						provider: "x-ai",
						type: "upstream_non_2xx",
						status: 403,
						retryable: false,
						upstream_error_code: "PERMISSION_DENIED",
						upstream_error_message: "The caller does not have permission.",
						upstream_error_description: "Project is not allowed to access this model.",
						upstream_error_param: "model",
					},
				],
				routingDiagnostics: {
					providerCountBefore: 3,
					providerCountAfter: 1,
				},
				providerEnablement: {
					capability: "video.generation",
					providersBefore: 3,
					providersAfter: 1,
				},
				providerCandidateDiagnostics: {
					totalProviders: 3,
					candidateCount: 1,
					droppedUnsupportedEndpoint: 2,
				},
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:05:00.000Z",
		};

		const payload = await buildAsyncNotificationData({
			baseUrl: "https://api.phaseo.app",
			record,
		});

		expect(payload).toMatchObject({
			id: "video_failed_123",
			status: "failed",
			lifecycle_status: "failed",
			upstream_error: {
				code: "PERMISSION_DENIED",
				message: "The caller does not have permission.",
				description: "Project is not allowed to access this model.",
				param: "model",
				status: 403,
			},
			provider_failure_diagnostics: {
				category: "provider_access_missing",
				provider: "x-ai",
				hint: "Enable the model for this project.",
			},
			failure_sample: [
				{
					provider: "x-ai",
					type: "upstream_non_2xx",
					status: 403,
					retryable: false,
					upstream_error_code: "PERMISSION_DENIED",
					upstream_error_message: "The caller does not have permission.",
					upstream_error_description: "Project is not allowed to access this model.",
					upstream_error_param: "model",
				},
			],
			routing_diagnostics: {
				providerCountBefore: 3,
				providerCountAfter: 1,
			},
			provider_enablement: {
				capability: "video.generation",
				providersBefore: 3,
				providersAfter: 1,
			},
			provider_candidate_diagnostics: {
				totalProviders: 3,
				candidateCount: 1,
				droppedUnsupportedEndpoint: 2,
			},
		});
	});

	it("includes normalized failure diagnostics for failed batch jobs", async () => {
		const record: AsyncOperationRecord = {
			workspaceId: "team_batch_failed",
			kind: "batch",
			internalId: "batch_failed_123",
			requestId: "req_batch_failed_123",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "batch_failed_123",
			model: "openai/gpt-5-mini",
			status: "failed",
			meta: {
				provider: "openai",
				error: {
					upstream_error: {
						code: "rate_limit_exceeded",
						message: "Rate limit exceeded.",
						description: "Reduce request volume and retry later.",
						status: 429,
					},
					provider_failure_diagnostics: {
						category: "provider_rate_limited",
						provider: "openai",
						hint: "Retry later or reduce concurrency.",
					},
					failure_sample: [
						{
							provider: "openai",
							type: "upstream_non_2xx",
							status: 429,
							retryable: true,
							upstream_error_code: "rate_limit_exceeded",
							upstream_error_message: "Rate limit exceeded.",
						},
					],
					routing_diagnostics: {
						providerCountBefore: 2,
						providerCountAfter: 1,
					},
					provider_enablement: {
						capability: "responses.create",
						providersBefore: 2,
						providersAfter: 1,
					},
					provider_candidate_diagnostics: {
						totalProviders: 2,
						candidateCount: 1,
						droppedUnsupportedEndpoint: 1,
					},
				},
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:05:00.000Z",
		};

		const payload = await buildAsyncNotificationData({
			baseUrl: "https://api.phaseo.app",
			record,
		});

		expect(payload).toMatchObject({
			id: "batch_failed_123",
			status: "failed",
			lifecycle_status: "failed",
			upstream_error: {
				code: "rate_limit_exceeded",
				message: "Rate limit exceeded.",
				description: "Reduce request volume and retry later.",
				status: 429,
			},
			provider_failure_diagnostics: {
				category: "provider_rate_limited",
				provider: "openai",
				hint: "Retry later or reduce concurrency.",
			},
			failure_sample: [
				{
					provider: "openai",
					type: "upstream_non_2xx",
					status: 429,
					retryable: true,
					upstream_error_code: "rate_limit_exceeded",
					upstream_error_message: "Rate limit exceeded.",
				},
			],
			routing_diagnostics: {
				providerCountBefore: 2,
				providerCountAfter: 1,
			},
			provider_enablement: {
				capability: "responses.create",
				providersBefore: 2,
				providersAfter: 1,
			},
			provider_candidate_diagnostics: {
				totalProviders: 2,
				candidateCount: 1,
				droppedUnsupportedEndpoint: 1,
			},
		});
	});

	it("preserves expired batch status and lifecycle in async payloads", async () => {
		const record: AsyncOperationRecord = {
			workspaceId: "team_batch_expired",
			kind: "batch",
			internalId: "batch_expired_123",
			requestId: "req_batch_expired_123",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "batch_native_expired_123",
			model: "openai/gpt-5-mini",
			status: "expired",
			meta: {
				provider: "openai",
				status: "expired",
				reservationId: "batch_hold:req_batch_expired_123",
				reservedNanos: 125000000,
				reservationStatus: "released_expired",
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:05:00.000Z",
		};

		const payload = await buildAsyncNotificationData({
			baseUrl: "https://api.phaseo.app",
			record,
		});

		expect(payload).toMatchObject({
			id: "batch_expired_123",
			object: "batch",
			status: "expired",
			lifecycle_status: "expired",
			native_id: "batch_native_expired_123",
			billing: {
				state: "void",
				settled_provider_cost: "0.00",
				settled_user_cost: "0.00",
				reservation_id: "batch_hold:req_batch_expired_123",
				reservation_status: "released_expired",
			},
		});
	});

	it("includes truncated batch hold estimation metadata in async payload billing", async () => {
		const record: AsyncOperationRecord = {
			workspaceId: "team_batch_large",
			kind: "batch",
			internalId: "batch_large_123",
			requestId: "req_batch_large_123",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "batch_native_large_123",
			model: "openai/gpt-5-mini",
			status: "in_progress",
			meta: {
				provider: "openai",
				status: "in_progress",
				reservationId: "batch_hold:req_batch_large_123",
				reservedNanos: 6_150_123_000_000,
				reservationStatus: "held",
				estimatedUsage: {
					requests: 50_001,
					estimated: true,
					estimation_truncated: true,
					estimation_sample_size: 50_000,
					estimation_total_rows: 50_001,
					pricing: {
						total_nanos: 6_150_123_000_000,
						total_usd_str: "6150.123000000",
					},
				},
			},
			billedAt: null,
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:01:00.000Z",
		};

		const payload = await buildAsyncNotificationData({
			baseUrl: "https://api.phaseo.app",
			record,
		});

		expect(payload).toMatchObject({
			id: "batch_large_123",
			status: "in_progress",
			lifecycle_status: "running",
			billing: {
				state: "estimated",
				estimated_nanos: 6_150_123_000_000,
				reserved_nanos: 6_150_123_000_000,
				estimation_truncated: true,
				estimation_sample_size: 50_000,
				estimation_total_rows: 50_001,
			},
		});
	});
});
