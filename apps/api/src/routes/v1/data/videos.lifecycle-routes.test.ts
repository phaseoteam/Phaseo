import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	auth: {
		ok: true as const,
		value: {
			requestId: "req_video_lifecycle_test",
			workspaceId: "ws_video_lifecycle_test",
			apiKeyId: "key_video_lifecycle_test",
			apiKeyRef: null,
			apiKeyKid: null,
			internal: false,
		},
	},
	ownedVideo: {
		record: {
			videoId: "video_terminal",
			workspaceId: "ws_video_lifecycle_test",
			status: "completed",
		},
		meta: {},
	} as Response | {
		record: Record<string, unknown>;
		meta: Record<string, unknown>;
	},
	refreshedVideo: null as null | {
		record: Record<string, unknown>;
		meta: Record<string, unknown>;
	},
}));

vi.mock("@pipeline/before/guards", () => ({
	guardAuth: vi.fn(async () => state.auth),
}));

vi.mock("../../utils", () => ({
	withRuntime:
		(handler: (req: Request) => Promise<Response>) =>
		async (c: { req: { raw: Request } }) =>
			handler(c.req.raw),
}));

vi.mock("./videos.get-by-id", () => ({
	getVideoByIdHandler: vi.fn(),
}));

vi.mock("./videos.get-content", () => ({
	getVideoContentHandler: vi.fn(),
}));

vi.mock("./videos.helpers", async () => {
	const actual = await vi.importActual<typeof import("./videos.helpers")>("./videos.helpers");
	return {
		...actual,
		requireOwnedVideoJob: vi.fn(async () => state.ownedVideo),
		refreshOwnedVideoJob: vi.fn(async () => state.refreshedVideo),
		cancelOpenAIVideo: vi.fn(async () => new Response(JSON.stringify({
			id: "video_native",
			status: "cancelled",
			model: "sora-2",
			seconds: 4,
			size: "720p",
		}), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})),
		cancelDashscopeTask: vi.fn(async () => new Response(JSON.stringify({
			output: { task_status: "CANCELED" },
		}), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})),
		cancelRunwayTask: vi.fn(async () => new Response(null, {
			status: 204,
		})),
		finalizeVideoStatusIfTerminal: vi.fn(async () => {}),
	};
});

vi.mock("@core/video-jobs", async () => {
	const actual = await vi.importActual<typeof import("@core/video-jobs")>("@core/video-jobs");
	return {
		...actual,
		setVideoJobStatus: vi.fn(async () => {}),
	};
});

import { videosRoutes } from "./videos";
import * as videoHelpers from "./videos.helpers";
import { setVideoJobStatus } from "@core/video-jobs";
import { guardAuth } from "@pipeline/before/guards";

describe("videosRoutes lifecycle routes", () => {
	beforeEach(() => {
		state.auth = {
			ok: true,
			value: {
				requestId: "req_video_lifecycle_test",
				workspaceId: "ws_video_lifecycle_test",
				apiKeyId: "key_video_lifecycle_test",
				apiKeyRef: null,
				apiKeyKid: null,
				internal: false,
			},
		};
		state.ownedVideo = {
			record: {
				videoId: "video_terminal",
				workspaceId: "ws_video_lifecycle_test",
				status: "completed",
			},
			meta: {},
		};
		state.refreshedVideo = null;
		vi.clearAllMocks();
	});

	it("rejects cancellation for active OpenAI videos", async () => {
		state.ownedVideo = {
			record: {
				videoId: "video_cancel",
				workspaceId: "ws_video_lifecycle_test",
				status: "in_progress",
				provider: "openai",
				nativeId: "video_native",
				model: "sora-2",
			},
			meta: {
				provider: "openai",
				model: "sora-2",
				seconds: 4,
				resolution: "720p",
			},
		};
		state.refreshedVideo = {
			record: {
				videoId: "video_cancel",
				workspaceId: "ws_video_lifecycle_test",
				status: "cancelled",
				provider: "openai",
				nativeId: "video_native",
				model: "sora-2",
			},
			meta: {
				provider: "openai",
				model: "sora-2",
				seconds: 4,
				resolution: "720p",
				cancelledAt: "2026-06-10T20:00:00.000Z",
			},
		};

		const response = await videosRoutes.request("https://example.com/video_cancel/cancel", {
			method: "POST",
		}, {
			VIDEO_API_ENABLED: "true",
		});

		expect(response.status).toBe(501);
		expect(await response.json()).toMatchObject({
			code: "not_implemented_yet",
			reason: "video_cancellation_disabled",
			video_id: "video_cancel",
		});
		expect(videoHelpers.cancelOpenAIVideo).not.toHaveBeenCalled();
		expect(videoHelpers.cancelDashscopeTask).not.toHaveBeenCalled();
		expect(videoHelpers.cancelRunwayTask).not.toHaveBeenCalled();
		expect(videoHelpers.finalizeVideoStatusIfTerminal).not.toHaveBeenCalled();
	});

	it("rejects cancellation for active DashScope videos", async () => {
		state.ownedVideo = {
			record: {
				videoId: "video_dashscope",
				workspaceId: "ws_video_lifecycle_test",
				status: "queued",
				provider: "alibaba",
				nativeId: "wan_task_123",
				model: "wan2.5-t2v-preview",
			},
			meta: {
				provider: "alibaba",
				model: "wan2.5-t2v-preview",
				providerTaskId: "wan_task_123",
				seconds: 5,
				resolution: "720p",
			},
		};

		const response = await videosRoutes.request("https://example.com/video_dashscope/cancel", {
			method: "POST",
		}, {
			VIDEO_API_ENABLED: "true",
		});

		expect(response.status).toBe(501);
		expect(await response.json()).toMatchObject({
			code: "not_implemented_yet",
			reason: "video_cancellation_disabled",
			video_id: "video_dashscope",
		});
		expect(videoHelpers.cancelOpenAIVideo).not.toHaveBeenCalled();
		expect(videoHelpers.cancelDashscopeTask).not.toHaveBeenCalled();
		expect(videoHelpers.cancelRunwayTask).not.toHaveBeenCalled();
		expect(videoHelpers.finalizeVideoStatusIfTerminal).not.toHaveBeenCalled();
	});

	it("rejects cancellation for active Runway videos", async () => {
		state.ownedVideo = {
			record: {
				videoId: "video_runway",
				workspaceId: "ws_video_lifecycle_test",
				status: "in_progress",
				provider: "runway",
				nativeId: "rwy_task_123",
				model: "gen4.5",
			},
			meta: {
				provider: "runway",
				model: "gen4.5",
				providerTaskId: "rwy_task_123",
				seconds: 6,
				resolution: "720p",
			},
		};

		const response = await videosRoutes.request("https://example.com/video_runway/cancel", {
			method: "POST",
		}, {
			VIDEO_API_ENABLED: "true",
		});

		expect(response.status).toBe(501);
		expect(await response.json()).toMatchObject({
			code: "not_implemented_yet",
			reason: "video_cancellation_disabled",
			video_id: "video_runway",
		});
		expect(videoHelpers.cancelOpenAIVideo).not.toHaveBeenCalled();
		expect(videoHelpers.cancelDashscopeTask).not.toHaveBeenCalled();
		expect(videoHelpers.cancelRunwayTask).not.toHaveBeenCalled();
		expect(videoHelpers.finalizeVideoStatusIfTerminal).not.toHaveBeenCalled();
	});

	it("rejects cancellation even when the stored video is already cancelled", async () => {
		state.ownedVideo = {
			record: {
				videoId: "video_cancelled_again",
				workspaceId: "ws_video_lifecycle_test",
				status: "cancelled",
				provider: "openai",
				nativeId: "video_native_cancelled_again",
				model: "sora-2",
				createdAt: "2026-06-10T20:00:00.000Z",
				updatedAt: "2026-06-10T20:02:00.000Z",
			},
			meta: {
				provider: "openai",
				model: "sora-2",
				cancelledAt: "2026-06-10T20:02:00.000Z",
			},
		};

		const response = await videosRoutes.request("https://example.com/video_cancelled_again/cancel", {
			method: "POST",
		}, {
			VIDEO_API_ENABLED: "true",
		});

		expect(response.status).toBe(501);
		expect(await response.json()).toMatchObject({
			code: "not_implemented_yet",
			reason: "video_cancellation_disabled",
			video_id: "video_cancelled_again",
		});
		expect(videoHelpers.cancelOpenAIVideo).not.toHaveBeenCalled();
		expect(videoHelpers.cancelDashscopeTask).not.toHaveBeenCalled();
		expect(videoHelpers.cancelRunwayTask).not.toHaveBeenCalled();
		expect(videoHelpers.finalizeVideoStatusIfTerminal).not.toHaveBeenCalled();
	});

	it("rejects ambiguous legacy cancel records with the global disabled response", async () => {
		state.ownedVideo = {
			record: {
				videoId: "video_ambiguous_cancel",
				workspaceId: "ws_video_lifecycle_test",
				status: "in_progress",
				nativeId: "provider-task-123",
				model: "unknown/video",
			},
			meta: {
				model: "unknown/video",
			},
		};

		const response = await videosRoutes.request("https://example.com/video_ambiguous_cancel/cancel", {
			method: "POST",
		}, {
			VIDEO_API_ENABLED: "true",
		});

		expect(response.status).toBe(501);
		expect(await response.json()).toMatchObject({
			code: "not_implemented_yet",
			reason: "video_cancellation_disabled",
			request_id: "req_video_lifecycle_test",
			workspace_id: "ws_video_lifecycle_test",
			video_id: "video_ambiguous_cancel",
		});
		expect(videoHelpers.cancelOpenAIVideo).not.toHaveBeenCalled();
		expect(videoHelpers.cancelDashscopeTask).not.toHaveBeenCalled();
		expect(videoHelpers.cancelRunwayTask).not.toHaveBeenCalled();
		expect(videoHelpers.finalizeVideoStatusIfTerminal).not.toHaveBeenCalled();
	});

	it("returns the shared structured error response when the video API is disabled", async () => {
		const response = await videosRoutes.request("https://example.com/", {
			method: "GET",
		}, {
			VIDEO_API_ENABLED: "false",
		});

		expect(response.status).toBe(501);
		expect(await response.json()).toEqual({
			error: {
				code: "not_implemented_yet",
				message: "Video endpoints are temporarily disabled while the public contract is finalized.",
				type: "server_error",
				param: null,
				metadata: { reason: "video_api_temporarily_disabled" },
			},
			code: "not_implemented_yet",
			reason: "video_api_temporarily_disabled",
			message: "Video endpoints are temporarily disabled while the public contract is finalized.",
			status_code: 501,
			error_type: "user",
			error_origin: "user",
		});
		expect(guardAuth).not.toHaveBeenCalled();
	});

	it("rejects deletes for non-terminal videos", async () => {
		state.ownedVideo = {
			record: {
				videoId: "video_in_progress",
				workspaceId: "ws_video_lifecycle_test",
				status: "in_progress",
			},
			meta: {},
		};

		const response = await videosRoutes.request("https://example.com/video_in_progress", {
			method: "DELETE",
		}, {
			VIDEO_API_ENABLED: "true",
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			code: "validation_error",
			reason: "video_delete_requires_terminal_status",
			request_id: "req_video_lifecycle_test",
			workspace_id: "ws_video_lifecycle_test",
			video_id: "video_in_progress",
			status: "processing",
			status_code: 400,
			error_type: "user",
			error_origin: "user",
			generation_id: "req_video_lifecycle_test",
		});
		expect(setVideoJobStatus).not.toHaveBeenCalled();
	});

	it("tombstones completed videos on delete", async () => {
		const response = await videosRoutes.request("https://example.com/video_terminal", {
			method: "DELETE",
		}, {
			VIDEO_API_ENABLED: "true",
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			id: "video_terminal",
			object: "video.deleted",
			deleted: true,
		});
		expect(setVideoJobStatus).toHaveBeenCalledTimes(1);
		expect(setVideoJobStatus).toHaveBeenCalledWith(
			"ws_video_lifecycle_test",
			"video_terminal",
			"completed",
			expect.objectContaining({
				tombstoned: true,
				tombstonedAt: expect.any(String),
			}),
		);
	});

	it("rejects deleting cancelled videos", async () => {
		state.ownedVideo = {
			record: {
				videoId: "video_cancelled",
				workspaceId: "ws_video_lifecycle_test",
				status: "cancelled",
			},
			meta: {},
		};

		const response = await videosRoutes.request("https://example.com/video_cancelled", {
			method: "DELETE",
		}, {
			VIDEO_API_ENABLED: "true",
		});

		expect(response.status).toBe(400);
		expect(setVideoJobStatus).not.toHaveBeenCalled();
	});
});
