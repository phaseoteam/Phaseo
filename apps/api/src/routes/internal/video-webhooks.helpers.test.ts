import { beforeEach, describe, expect, it, vi } from "vitest";

const getBindingsMock = vi.fn();
const findVideoJobRecordByNativeIdMock = vi.fn();
const finalizeVideoJobMock = vi.fn();
const markProviderEventProcessedMock = vi.fn();
const buildVideoPricingRequestOptionsMock = vi.fn();
const dispatchVideoWebhookEventInBackgroundMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getBindings: () => getBindingsMock(),
}));

vi.mock("@core/video-jobs", () => ({
	findVideoJobRecordByNativeId: (...args: any[]) => findVideoJobRecordByNativeIdMock(...args),
}));

vi.mock("@core/video-finalization", () => ({
	finalizeVideoJob: (...args: any[]) => finalizeVideoJobMock(...args),
}));

vi.mock("@core/provider-events", () => ({
	markProviderEventProcessed: (...args: any[]) => markProviderEventProcessedMock(...args),
}));

vi.mock("@core/video-request-options", () => ({
	buildVideoPricingRequestOptions: (...args: any[]) => buildVideoPricingRequestOptionsMock(...args),
}));

vi.mock("@core/video-user-webhooks", () => ({
	dispatchVideoWebhookEventInBackground: (...args: any[]) =>
		dispatchVideoWebhookEventInBackgroundMock(...args),
}));

import {
	encodeDashscopeTaskId,
	processAlibabaVideoWebhook,
	processOpenAiVideoWebhook,
	verifyAlibabaWebhookAuth,
} from "./video-webhooks.helpers";

describe("video webhook helpers", () => {
	beforeEach(() => {
		getBindingsMock.mockReset();
		findVideoJobRecordByNativeIdMock.mockReset();
		finalizeVideoJobMock.mockReset();
		markProviderEventProcessedMock.mockReset();
		buildVideoPricingRequestOptionsMock.mockReset();
		dispatchVideoWebhookEventInBackgroundMock.mockReset();

		getBindingsMock.mockReturnValue({
			ALIBABA_VIDEO_WEBHOOK_SECRET: "alibaba-secret",
		});
		buildVideoPricingRequestOptionsMock.mockImplementation((value) => value);
		finalizeVideoJobMock.mockImplementation(async (args: any) => ({
			status: args.status,
			charged: false,
			reason: "test",
		}));
	});

	it("finalizes and dispatches OpenAI terminal video webhooks", async () => {
		findVideoJobRecordByNativeIdMock.mockResolvedValue({
			workspaceId: "ws_video",
			videoId: "video_123",
			model: "sora-2",
			meta: {
				resolution: "720p",
				quality: "standard",
				keySource: "byok",
			},
		});

		await processOpenAiVideoWebhook({
			eventId: "evt_openai_123",
			eventType: "video.completed",
			payload: {
				data: {
					id: "vid_native_123",
					model: "openai/sora-2",
					seconds: 5,
					resolution: "1080p",
					quality: "high",
				},
			},
		});

		expect(findVideoJobRecordByNativeIdMock).toHaveBeenCalledWith("openai", "vid_native_123");
		expect(finalizeVideoJobMock).toHaveBeenCalledWith({
			workspaceId: "ws_video",
			videoId: "video_123",
			providerId: "openai",
			status: "completed",
			model: "openai/sora-2",
			seconds: 5,
			requestOptions: {
				resolution: "1080p",
				quality: "high",
			},
			isByok: true,
			metaPatch: {
				webhookEventType: "video.completed",
				lastWebhookAt: expect.any(String),
			},
		});
		expect(dispatchVideoWebhookEventInBackgroundMock).toHaveBeenCalledWith({
			workspaceId: "ws_video",
			videoId: "video_123",
			eventType: "video.completed",
		});
		expect(markProviderEventProcessedMock).toHaveBeenCalledWith({
			provider: "openai",
			providerEventId: "evt_openai_123",
			workspaceId: "ws_video",
			internalId: "video_123",
		});
	});

	it("finalizes and dispatches OpenAI cancelled video webhooks as cancelled", async () => {
		findVideoJobRecordByNativeIdMock.mockResolvedValue({
			workspaceId: "ws_video",
			videoId: "video_cancelled",
			model: "sora-2",
			meta: {
				resolution: "720p",
				quality: "standard",
			},
		});

		await processOpenAiVideoWebhook({
			eventId: "evt_openai_cancelled",
			eventType: "video.cancelled",
			payload: {
				data: {
					id: "vid_native_cancelled",
					model: "openai/sora-2",
					status: "cancelled",
				},
			},
		});

		expect(finalizeVideoJobMock).toHaveBeenCalledWith(expect.objectContaining({
			workspaceId: "ws_video",
			videoId: "video_cancelled",
			providerId: "openai",
			status: "cancelled",
			model: "openai/sora-2",
		}));
		expect(dispatchVideoWebhookEventInBackgroundMock).toHaveBeenCalledWith({
			workspaceId: "ws_video",
			videoId: "video_cancelled",
			eventType: "video.cancelled",
		});
		expect(markProviderEventProcessedMock).toHaveBeenCalledWith({
			provider: "openai",
			providerEventId: "evt_openai_cancelled",
			workspaceId: "ws_video",
			internalId: "video_cancelled",
		});
	});

	it("dispatches OpenAI provider webhooks using the finalized terminal status", async () => {
		findVideoJobRecordByNativeIdMock.mockResolvedValue({
			workspaceId: "ws_video",
			videoId: "video_stale_openai",
			model: "sora-2",
			meta: {},
		});
		finalizeVideoJobMock.mockResolvedValueOnce({
			status: "failed",
			charged: false,
			reason: "already_terminal",
		});

		await processOpenAiVideoWebhook({
			eventId: "evt_openai_stale_completed",
			eventType: "video.completed",
			payload: {
				data: {
					id: "vid_native_stale_openai",
					status: "completed",
				},
			},
		});

		expect(finalizeVideoJobMock).toHaveBeenCalledWith(expect.objectContaining({
			workspaceId: "ws_video",
			videoId: "video_stale_openai",
			status: "completed",
		}));
		expect(dispatchVideoWebhookEventInBackgroundMock).toHaveBeenCalledWith({
			workspaceId: "ws_video",
			videoId: "video_stale_openai",
			eventType: "video.failed",
		});
	});

	it("marks non-terminal OpenAI video webhooks as processed without finalizing", async () => {
		findVideoJobRecordByNativeIdMock.mockResolvedValue({
			workspaceId: "ws_video",
			videoId: "video_123",
			model: "sora-2",
			meta: {},
		});

		await processOpenAiVideoWebhook({
			eventId: "evt_openai_progress",
			eventType: "video.in_progress",
			payload: {
				data: {
					id: "vid_native_123",
				},
			},
		});

		expect(finalizeVideoJobMock).not.toHaveBeenCalled();
		expect(dispatchVideoWebhookEventInBackgroundMock).not.toHaveBeenCalled();
		expect(markProviderEventProcessedMock).toHaveBeenCalledWith({
			provider: "openai",
			providerEventId: "evt_openai_progress",
			workspaceId: "ws_video",
			internalId: "video_123",
		});
	});

	it("finalizes and dispatches Alibaba terminal video webhooks", async () => {
		findVideoJobRecordByNativeIdMock.mockResolvedValue({
			workspaceId: "ws_video",
			videoId: "video_456",
			model: "wan-2.1",
			meta: {
				resolution: "720p",
				quality: "standard",
				keySource: "gateway",
			},
		});

		await processAlibabaVideoWebhook({
			eventId: "evt_alibaba_123",
			eventType: "TASK_FINISH",
			taskId: "task-123",
			payload: {
				data: {
					status: "SUCCEEDED",
					model: "alibaba/wan-2.1",
					duration: 6,
					resolution: "1080p",
					quality: "high",
				},
			},
		});

		expect(findVideoJobRecordByNativeIdMock).toHaveBeenCalledWith(
			"alibaba",
			encodeDashscopeTaskId("task-123"),
		);
		expect(finalizeVideoJobMock).toHaveBeenCalledWith({
			workspaceId: "ws_video",
			videoId: "video_456",
			providerId: "alibaba",
			status: "completed",
			model: "alibaba/wan-2.1",
			seconds: 6,
			requestOptions: {
				resolution: "1080p",
				quality: "high",
			},
			isByok: false,
			metaPatch: {
				webhookEventType: "TASK_FINISH",
				lastWebhookAt: expect.any(String),
			},
		});
		expect(dispatchVideoWebhookEventInBackgroundMock).toHaveBeenCalledWith({
			workspaceId: "ws_video",
			videoId: "video_456",
			eventType: "video.completed",
		});
		expect(markProviderEventProcessedMock).toHaveBeenCalledWith({
			provider: "alibaba",
			providerEventId: "evt_alibaba_123",
			workspaceId: "ws_video",
			internalId: "video_456",
		});
	});

	it("finalizes and dispatches Alibaba cancelled video webhooks as cancelled", async () => {
		findVideoJobRecordByNativeIdMock.mockResolvedValue({
			workspaceId: "ws_video",
			videoId: "video_alibaba_cancelled",
			model: "wan-2.1",
			meta: {
				resolution: "720p",
				quality: "standard",
			},
		});

		await processAlibabaVideoWebhook({
			eventId: "evt_alibaba_cancelled",
			eventType: "TASK_CANCELLED",
			taskId: "task-cancelled",
			payload: {
				data: {
					status: "CANCELED",
					model: "alibaba/wan-2.1",
				},
			},
		});

		expect(finalizeVideoJobMock).toHaveBeenCalledWith(expect.objectContaining({
			workspaceId: "ws_video",
			videoId: "video_alibaba_cancelled",
			providerId: "alibaba",
			status: "cancelled",
			model: "alibaba/wan-2.1",
		}));
		expect(dispatchVideoWebhookEventInBackgroundMock).toHaveBeenCalledWith({
			workspaceId: "ws_video",
			videoId: "video_alibaba_cancelled",
			eventType: "video.cancelled",
		});
		expect(markProviderEventProcessedMock).toHaveBeenCalledWith({
			provider: "alibaba",
			providerEventId: "evt_alibaba_cancelled",
			workspaceId: "ws_video",
			internalId: "video_alibaba_cancelled",
		});
	});

	it("dispatches Alibaba provider webhooks using the finalized terminal status", async () => {
		findVideoJobRecordByNativeIdMock.mockResolvedValue({
			workspaceId: "ws_video",
			videoId: "video_stale_alibaba",
			model: "wan-2.1",
			meta: {},
		});
		finalizeVideoJobMock.mockResolvedValueOnce({
			status: "cancelled",
			charged: false,
			reason: "already_terminal",
		});

		await processAlibabaVideoWebhook({
			eventId: "evt_alibaba_stale_failed",
			eventType: "TASK_FAILED",
			taskId: "task-stale-failed",
			payload: {
				data: {
					status: "FAILED",
				},
			},
		});

		expect(finalizeVideoJobMock).toHaveBeenCalledWith(expect.objectContaining({
			workspaceId: "ws_video",
			videoId: "video_stale_alibaba",
			status: "failed",
		}));
		expect(dispatchVideoWebhookEventInBackgroundMock).toHaveBeenCalledWith({
			workspaceId: "ws_video",
			videoId: "video_stale_alibaba",
			eventType: "video.cancelled",
		});
	});

	it("verifies Alibaba webhook bearer or token auth with timing-safe comparison", () => {
		const bearerReq = new Request("https://api.phaseo.app/internal/video-webhooks/alibaba", {
			headers: {
				authorization: "Bearer alibaba-secret",
			},
		});
		const tokenReq = new Request("https://api.phaseo.app/internal/video-webhooks/alibaba", {
			headers: {
				"x-webhook-token": "alibaba-secret",
			},
		});
		const badReq = new Request("https://api.phaseo.app/internal/video-webhooks/alibaba", {
			headers: {
				"x-webhook-token": "wrong-secret",
			},
		});

		expect(verifyAlibabaWebhookAuth(bearerReq)).toBe(true);
		expect(verifyAlibabaWebhookAuth(tokenReq)).toBe(true);
		expect(verifyAlibabaWebhookAuth(badReq)).toBe(false);
	});
});
