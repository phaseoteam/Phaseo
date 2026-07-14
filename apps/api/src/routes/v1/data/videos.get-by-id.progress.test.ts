import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	ownedVideo: {
		record: {
			workspaceId: "ws_video_progress",
			videoId: "video_progress",
			nativeId: "video-native-progress",
			provider: "openai",
			model: "openai/sora-2",
			status: "in_progress",
			createdAt: "2026-05-03T10:00:00.000Z",
			updatedAt: "2026-05-03T10:00:00.000Z",
		},
		meta: {
			provider: "openai",
			model: "openai/sora-2",
			webhookUrl: "https://example.com/video-webhook",
		},
	} as {
		record: Record<string, unknown>;
		meta: Record<string, unknown>;
	},
	refreshedVideo: null as null | {
		record: Record<string, unknown>;
		meta: Record<string, unknown>;
	},
}));

vi.mock("@pipeline/before/guards", () => ({
	guardAuth: vi.fn(async () => ({
		ok: true,
		value: {
			requestId: "req_video_progress",
			workspaceId: "ws_video_progress",
			apiKeyId: "key_video_progress",
			apiKeyRef: null,
			apiKeyKid: null,
			internal: false,
		},
	})),
}));

vi.mock("@core/video-jobs", () => ({
	setVideoJobStatus: vi.fn(async (_workspaceId: string, _videoId: string, status: string, metaPatch?: Record<string, unknown>) => {
		state.refreshedVideo = {
			record: {
				...state.ownedVideo.record,
				status,
				updatedAt: "2026-05-03T10:01:00.000Z",
			},
			meta: {
				...state.ownedVideo.meta,
				...(metaPatch ?? {}),
			},
		};
	}),
}));

vi.mock("@core/video-user-webhooks", () => ({
	dispatchVideoWebhookEventInBackground: vi.fn(() => undefined),
}));

vi.mock("./videos.helpers", async () => {
	const actual = await vi.importActual<typeof import("./videos.helpers")>("./videos.helpers");
	return {
		...actual,
		requireOwnedVideoJob: vi.fn(async () => state.ownedVideo),
		refreshOwnedVideoJob: vi.fn(async () => state.refreshedVideo),
		fetchOpenAIVideoStatus: vi.fn(async () =>
			new Response(JSON.stringify({
				id: "video-native-progress",
				model: "openai/sora-2",
				status: "processing",
				progress: 42,
			}), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		),
	};
});

import { setVideoJobStatus } from "@core/video-jobs";
import { dispatchVideoWebhookEventInBackground } from "@core/video-user-webhooks";
import { getVideoByIdHandler } from "./videos.get-by-id";
import * as videoHelpers from "./videos.helpers";

describe("getVideoByIdHandler progress polling", () => {
	afterEach(() => {
		state.refreshedVideo = null;
		vi.clearAllMocks();
	});

	it("persists provider progress before dispatching OpenAI-compatible progress webhooks", async () => {
		const response = await getVideoByIdHandler(
			new Request("https://api.phaseo.ai/v1/videos/video_progress"),
		);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toMatchObject({
			id: "video_progress",
			status: "processing",
			progress: 42,
			progress_source: "provider",
		});

		expect(setVideoJobStatus).toHaveBeenCalledTimes(1);
		expect(setVideoJobStatus).toHaveBeenCalledWith(
			"ws_video_progress",
			"video_progress",
			"in_progress",
			expect.objectContaining({
				progress: 42,
				progressSource: "provider",
				lastPolledAt: expect.any(String),
				polledStatus: "in_progress",
			}),
		);
		expect(videoHelpers.refreshOwnedVideoJob).toHaveBeenCalledWith(
			expect.objectContaining({ workspaceId: "ws_video_progress" }),
			"video_progress",
		);
		expect(dispatchVideoWebhookEventInBackground).toHaveBeenCalledWith({
			workspaceId: "ws_video_progress",
			videoId: "video_progress",
			eventType: "video.progress",
			progress: 42,
		});
		expect(vi.mocked(setVideoJobStatus).mock.invocationCallOrder[0]).toBeLessThan(
			vi.mocked(dispatchVideoWebhookEventInBackground).mock.invocationCallOrder[0],
		);
	});
});
