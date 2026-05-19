import {
	buildAsyncJobWebhookSummary,
	parseAsyncJobWebhookAttempts,
} from "./asyncJobWebhook";

describe("parseAsyncJobWebhookAttempts", () => {
	test("normalizes and sorts attempts newest first", () => {
		const attempts = parseAsyncJobWebhookAttempts([
			{
				id: "older",
				delivery_key: "job.completed",
				event_type: "job.completed",
				status: "delivered",
				attempt_number: 1,
				max_attempts: 4,
				tried_at: "2026-05-03T10:01:34.000Z",
				delivered_at: "2026-05-03T10:01:35.000Z",
				response_status: 200,
			},
			{
				id: "newer",
				delivery_key: "batch.failed",
				event_type: "batch.failed",
				status: "scheduled_retry",
				attempt_number: 2,
				max_attempts: 4,
				tried_at: "2026-05-03T10:02:34.000Z",
				next_retry_at: "2026-05-03T10:03:34.000Z",
				response_status: 500,
				error_message: "Webhook returned HTTP 500",
			},
		]);

		expect(attempts.map((attempt) => attempt.id)).toEqual(["newer", "older"]);
		expect(attempts[0]).toMatchObject({
			status: "scheduled_retry",
			response_status: 500,
			error_message: "Webhook returned HTTP 500",
		});
	});
});

describe("buildAsyncJobWebhookSummary", () => {
	test("derives summary fields from raw stored metadata", () => {
		const summary = buildAsyncJobWebhookSummary({
			webhook: {
				url: "https://example.com/hooks/batch",
				secret: "whsec_batch",
				events: ["job.completed", "batch.failed"],
			},
			webhookDeliveries: {
				"job.completed": "2026-05-03T10:01:35.000Z",
			},
			webhookAttempts: [
				{
					id: "older",
					delivery_key: "job.completed",
					event_type: "job.completed",
					status: "delivered",
					attempt_number: 1,
					max_attempts: 4,
					tried_at: "2026-05-03T10:01:34.000Z",
					delivered_at: "2026-05-03T10:01:35.000Z",
					response_status: 200,
				},
				{
					id: "newer",
					delivery_key: "batch.failed",
					event_type: "batch.failed",
					status: "scheduled_retry",
					attempt_number: 2,
					max_attempts: 4,
					tried_at: "2026-05-03T10:02:34.000Z",
					next_retry_at: "2026-05-03T10:03:34.000Z",
					response_status: 500,
					error_message: "Webhook returned HTTP 500",
				},
			],
			webhookRetryQueue: {
				"batch.failed": {
					nextRetryAt: "2026-05-03T10:03:34.000Z",
				},
			},
		});

		expect(summary).toMatchObject({
			configured: true,
			url: "https://example.com/hooks/batch",
			events: ["job.completed", "batch.failed"],
			has_secret: true,
			delivered_events: 1,
			delivered_event_types: ["job.completed"],
			attempt_count: 2,
			pending_retries: 1,
			next_retry_at: "2026-05-03T10:03:34.000Z",
			last_attempt_at: "2026-05-03T10:02:34.000Z",
			last_attempt_status: "scheduled_retry",
			last_response_status: 500,
			last_delivered_at: "2026-05-03T10:01:35.000Z",
			last_failure_at: "2026-05-03T10:02:34.000Z",
			last_error_message: "Webhook returned HTTP 500",
		});
	});

	test("prefers the standardized public webhook delivery object when present", () => {
		const summary = buildAsyncJobWebhookSummary({
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
				attempts: [
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
			},
		});

		expect(summary).toMatchObject({
			configured: true,
			has_secret: true,
			delivered_event_types: ["video.completed"],
			last_response_status: 202,
			last_delivered_at: "2026-05-05T10:05:30.000Z",
		});
	});
});
