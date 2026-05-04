import { describe, expect, it } from "vitest";

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
	it("builds batch payloads with polling, cancel, and websocket urls", async () => {
		const record: AsyncOperationRecord = {
			workspaceId: "team_123",
			kind: "batch",
			internalId: "batch_123",
			requestId: "req_123",
			sessionId: null,
			appId: null,
			provider: "openai",
			nativeId: "batch_123",
			model: "openai/gpt-5-mini",
			status: "in_progress",
			meta: {
				provider: "openai",
				endpoint: "/v1/responses",
				completionWindow: "24h",
				inputFileId: "file_in",
				outputFileId: "file_out",
				errorFileId: "file_err",
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
		).resolves.toEqual({
			id: "batch_123",
			object: "batch",
			kind: "batch",
			status: "in_progress",
			provider: "openai",
			model: "openai/gpt-5-mini",
			polling_url: "https://api.phaseo.app/v1/batches/batch_123",
			websocket_url: "wss://api.phaseo.app/v1/async/batch/batch_123/ws",
			cancel_url: "https://api.phaseo.app/v1/batches/batch_123/cancel",
			endpoint: "/v1/responses",
			completion_window: "24h",
			input_file_id: "file_in",
			output_file_id: "file_out",
			error_file_id: "file_err",
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
});
