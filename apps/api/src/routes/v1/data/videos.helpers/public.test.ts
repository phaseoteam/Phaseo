import { beforeEach, describe, expect, it, vi } from "vitest";

const getBindingsMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getBindings: () => getBindingsMock(),
}));

import { toPublicVideoResponse } from "./public";

describe("public video response helper", () => {
	beforeEach(() => {
		getBindingsMock.mockReset();
		getBindingsMock.mockReturnValue({
			KEY_PEPPER: "test-video-secret",
			GATEWAY_PUBLIC_BASE_URL: "https://api.phaseo.app",
		});
	});

	it("builds the full completed public status payload with content and signed download access", async () => {
		const response = await toPublicVideoResponse({
			requestUrl: "https://api.phaseo.app/v1/videos/G-123",
			id: "G-123",
			payload: {
				status: "completed",
				provider: "bytedance-seed",
				model: "seedance-1",
				progress: 100,
				created_at: 1710000000,
				started_at: "2026-05-05T10:00:00.000Z",
				completed_at: "2026-05-05T10:05:00.000Z",
				audio: true,
				output: [
					{
						mime_type: "video/mp4",
						b64_json: "QUJDRA==",
					},
				],
				usage: {
					input_tokens: 123,
				},
			},
			record: {
				workspaceId: "team_123",
				billedAt: "2026-05-05T10:06:00.000Z",
				requestId: "gen_req_123",
				nativeId: "provider_video_123",
				provider: "bytedance-seed",
				model: "seedance-1",
			} as any,
			meta: {
				outputAccess: "both",
				seconds: 6,
				resolution: "1280x720",
				finalizedAt: "2026-05-05T10:05:00.000Z",
				requestId: "gen_req_123",
				keySource: "byok",
				costUsd: 1.23,
				costNanos: 1_230_000_000,
				reservationId: "video_hold:gen_req_123",
				reservedNanos: 1_300_000_000,
				reservationStatus: "released_and_charged_actual",
				pricedUsage: {
					pricing: {
						total_nanos: 1_230_000_000,
					},
				},
				webhook: {
					url: "https://example.com/hooks/video",
					secret: "whsec_video_secret",
					events: ["video.completed"],
				},
				webhookDeliveries: {
					"video.completed": "2026-05-05T10:05:30.000Z",
				},
				webhookAttempts: [
					{
						id: "video.completed:1",
						delivery_key: "video.completed",
						event_type: "video.completed",
						status: "delivered",
						attempt_number: 1,
						max_attempts: 4,
						tried_at: "2026-05-05T10:05:29.000Z",
						delivered_at: "2026-05-05T10:05:30.000Z",
						response_status: 202,
					},
				],
				nextWebhookRetryAt: "2026-05-05T10:06:30.000Z",
				lastWebhookProgress: 80,
				lastWebhookProgressAt: "2026-05-05T10:04:30.000Z",
				lastWebhookDispatchedAt: "2026-05-05T10:05:29.000Z",
			} as any,
		});

		expect(response).toMatchObject({
			id: "G-123",
			object: "video",
			status: "completed",
			lifecycle_status: "completed",
			output_access: "both",
			progress: 100,
			progress_source: "provider",
			poll_after_seconds: 20,
			websocket_url: "wss://api.phaseo.app/v1/async/video/G-123/ws",
			cancel_url: null,
			generation_id: "gen_req_123",
			native_video_id: "provider_video_123",
			created_at: 1710000000,
			started_at: "2026-05-05T10:00:00.000Z",
			completed_at: "2026-05-05T10:05:00.000Z",
			provider: "byteplus",
			model: "seedance-1",
			seconds: 6,
			size: "1280x720",
			audio: true,
			content_url: "https://api.phaseo.app/v1/videos/G-123/content",
			usage: {
				input_tokens: 123,
				cost: 1.23,
				cost_usd: 1.23,
				is_byok: true,
			},
			billing: {
				currency: "usd",
				estimated_provider_cost: "1.23",
				estimated_user_cost: "1.23",
				settled_provider_cost: "1.23",
				settled_user_cost: "1.23",
				state: "settled",
				billable: true,
				total_nanos: 1_230_000_000,
				estimated_nanos: 1_230_000_000,
				reserved_nanos: 1_300_000_000,
				reservation_id: "video_hold:gen_req_123",
				reservation_status: "released_and_charged_actual",
				charge_reason: null,
				charged: null,
				billed_at: "2026-05-05T10:06:00.000Z",
			},
			webhook: {
				url: "https://example.com/hooks/video",
				events: ["video.completed"],
				has_secret: true,
				delivery: {
					total_attempts: 1,
					delivered_events: 1,
					delivered_event_types: ["video.completed"],
					pending_retries: 0,
					next_retry_at: null,
					last_attempt_at: "2026-05-05T10:05:29.000Z",
					last_attempt_status: "delivered",
					last_response_status: 202,
					last_delivered_at: "2026-05-05T10:05:30.000Z",
					last_failure_at: null,
					last_error_message: null,
				},
			},
			next_webhook_retry_at: "2026-05-05T10:06:30.000Z",
			last_webhook_progress: 80,
			last_webhook_progress_at: "2026-05-05T10:04:30.000Z",
			last_webhook_dispatched_at: "2026-05-05T10:05:29.000Z",
		});

		expect(response.polling_url).toBe("https://api.phaseo.app/v1/videos/G-123");
		expect(response.content_url).toBe("https://api.phaseo.app/v1/videos/G-123/content");
		expect(response.asset).toEqual({
			id: "ast_123",
			mime_type: "video/mp4",
			bytes: 4,
			sha256: null,
			width: null,
			height: null,
			duration_seconds: 6,
		});
		expect(response.download_url).toEqual(expect.stringContaining("/v1/videos/G-123/content?"));
		expect(response.download_url).toEqual(expect.stringContaining("download_token="));
		expect(response.download_url).toEqual(expect.stringContaining("download_sig="));
		expect(response.expires_at).toEqual(expect.any(Number));
		expect(response.outputs).toEqual([
			expect.objectContaining({
				index: 0,
				mime_type: "video/mp4",
				bytes_available: true,
				content_url: "https://api.phaseo.app/v1/videos/G-123/content",
				download_url: expect.stringContaining("/v1/videos/G-123/content?"),
				expires_at: expect.any(Number),
			}),
		]);
	});

	it("shows held reservation estimates before video settlement", async () => {
		const response = await toPublicVideoResponse({
			requestUrl: "https://api.phaseo.app/v1/videos/G-hold",
			id: "G-hold",
			payload: {
				status: "processing",
				model: "sora-2",
				progress: 35,
				output: [],
			},
			record: {
				workspaceId: "team_hold",
				provider: "openai",
				model: "sora-2",
			} as any,
			meta: {
				seconds: 4,
				reservationId: "video_hold:req_hold",
				reservedNanos: 225_000_000,
				reservationStatus: "held",
				pricedUsage: {
					pricing: {
						total_nanos: 225_000_000,
					},
				},
			} as any,
		});

		expect(response).toMatchObject({
			id: "G-hold",
			status: "processing",
			lifecycle_status: "running",
			progress: 35,
			cancel_url: "https://api.phaseo.app/v1/videos/G-hold/cancel",
			billing: {
				currency: "usd",
				estimated_provider_cost: "0.23",
				estimated_user_cost: "0.23",
				settled_provider_cost: null,
				settled_user_cost: null,
				state: "estimated",
				billable: false,
				total_nanos: null,
				estimated_nanos: 225_000_000,
				reserved_nanos: 225_000_000,
				reservation_id: "video_hold:req_hold",
				reservation_status: "held",
				charge_reason: null,
				charged: null,
			},
		});
	});

	it("uses stored provider progress when no fresh provider payload is attached", async () => {
		const response = await toPublicVideoResponse({
			requestUrl: "https://api.phaseo.app/v1/videos/G-progress",
			id: "G-progress",
			payload: {
				status: "processing",
				model: "sora-2",
				output: [],
			},
			record: {
				workspaceId: "team_progress",
				provider: "openai",
				model: "sora-2",
			} as any,
			meta: {
				provider: "openai",
				seconds: 8,
				progress: 42,
				progressSource: "provider",
			} as any,
		});

		expect(response).toMatchObject({
			id: "G-progress",
			status: "processing",
			lifecycle_status: "running",
			progress: 42,
			progress_source: "provider",
		});
	});

	it("shows completed videos with failed capture as pending billing, not an active estimate", async () => {
		const response = await toPublicVideoResponse({
			requestUrl: "https://api.phaseo.app/v1/videos/G-capture-failed",
			id: "G-capture-failed",
			payload: {
				status: "completed",
				model: "sora-2",
				output: [],
			},
			record: {
				workspaceId: "team_capture_failed",
				provider: "openai",
				model: "sora-2",
			} as any,
			meta: {
				seconds: 4,
				reservationId: "video_hold:req_capture_failed",
				reservedNanos: 225_000_000,
				reservationStatus: "capture_failed",
				billingReason: "capture_failed",
				charged: false,
				pricedUsage: {
					pricing: {
						total_nanos: 225_000_000,
					},
				},
			} as any,
		});

		expect(response).toMatchObject({
			id: "G-capture-failed",
			status: "completed",
			billing: {
				state: "pending",
				billable: false,
				estimated_nanos: 225_000_000,
				reserved_nanos: 225_000_000,
				total_nanos: null,
				reservation_status: "capture_failed",
				charge_reason: "capture_failed",
				charged: false,
			},
		});
	});

	it("omits cancel urls for active videos whose provider cannot be cancelled", async () => {
		const response = await toPublicVideoResponse({
			requestUrl: "https://api.phaseo.app/v1/videos/G-unsupported",
			id: "G-unsupported",
			payload: {
				status: "processing",
				model: "veo-3",
				provider: "google-ai-studio",
				progress: 15,
				output: [],
			},
			record: {
				workspaceId: "team_unsupported",
				provider: "google-ai-studio",
				model: "veo-3",
			} as any,
			meta: {
				provider: "google-ai-studio",
			} as any,
		});

		expect(response).toMatchObject({
			id: "G-unsupported",
			status: "processing",
			lifecycle_status: "running",
			provider: "google-ai-studio",
			cancel_url: null,
		});
	});

	it("omits signed download fields when output access is bytes-only", async () => {
		const response = await toPublicVideoResponse({
			requestUrl: "https://api.phaseo.app/v1/videos/G-456",
			id: "G-456",
			payload: {
				status: "completed",
				model: "veo-2",
				output: [{ mime_type: "video/mp4" }],
			},
			record: {
				workspaceId: "team_456",
			} as any,
			meta: {
				outputAccess: "bytes",
			} as any,
		});

		expect(response.output_access).toBe("bytes");
		expect(response.lifecycle_status).toBe("completed");
		expect(response.cancel_url).toBeNull();
		expect(response.content_url).toBe("https://api.phaseo.app/v1/videos/G-456/content");
		expect(response).not.toHaveProperty("download_url");
		expect(response).not.toHaveProperty("expires_at");
		expect(response.outputs).toEqual([
			expect.objectContaining({
				index: 0,
				content_url: "https://api.phaseo.app/v1/videos/G-456/content",
			}),
		]);
	});
});
