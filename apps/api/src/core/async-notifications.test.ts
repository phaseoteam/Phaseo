import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearRuntime, configureRuntime } from "@/runtime/env";

import {
	buildAsyncNotificationData,
	parseAsyncWebhookConfig,
	resolveAsyncNotificationKind,
} from "./async-notifications";
import type { AsyncOperationRecord } from "./async-operations";

describe("parseAsyncWebhookConfig", () => {
	it("accepts https webhooks and normalizes event names", () => {
		expect(
			parseAsyncWebhookConfig("batch", {
				url: "https://example.com/hooks/async",
				secret: " whsec_test ",
				events: ["completed", "batch.failed", "job.cancelled", "ignored"],
			}),
		).toEqual({
			url: "https://example.com/hooks/async",
			secret: "whsec_test",
			events: ["job.completed", "batch.failed", "job.cancelled"],
		});
	});

	it("allows localhost http callbacks for development", () => {
		expect(
			parseAsyncWebhookConfig("video", {
				url: "http://localhost:4010/webhooks/video",
			}),
		).toEqual({
			url: "http://localhost:4010/webhooks/video",
			secret: null,
			events: ["job.completed", "job.failed", "job.cancelled"],
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
});

describe("resolveAsyncNotificationKind", () => {
	it("only exposes video and batch as supported async notification kinds", () => {
		expect(resolveAsyncNotificationKind("video")).toBe("video");
		expect(resolveAsyncNotificationKind("batch")).toBe("batch");
		expect(resolveAsyncNotificationKind("music")).toBeNull();
		expect(resolveAsyncNotificationKind("")).toBeNull();
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
			request_id: "req_video_123",
			native_id: "vertex-op-123",
			session_id: "sess_video_123",
			app_id: "app_video_123",
			progress: 100,
			provider: "google-vertex",
			model: "google/veo-3.1-lite-generate-preview",
			polling_url: "https://api.phaseo.app/v1/videos/video_123",
			websocket_url: "wss://api.phaseo.app/v1/async/video/video_123/ws",
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
				charge_reason: "captured",
				charged: true,
				billed_at: "2026-05-03T10:05:00.000Z",
			},
			created_at: "2026-05-03T10:00:00.000Z",
			updated_at: "2026-05-03T10:05:00.000Z",
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
});
