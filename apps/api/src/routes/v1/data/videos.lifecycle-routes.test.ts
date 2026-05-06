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
		vi.clearAllMocks();
	});

	it("keeps the public cancel route disabled with the shared structured error contract", async () => {
		const response = await videosRoutes.request("https://example.com/video_cancel/cancel", {
			method: "POST",
		}, {
			VIDEO_API_ENABLED: "true",
		});

		expect(response.status).toBe(501);
		expect(await response.json()).toMatchObject({
			error: "not_implemented_yet",
			reason: "video_cancel_temporarily_disabled",
			request_id: "req_video_lifecycle_test",
			workspace_id: "ws_video_lifecycle_test",
			video_id: "video_cancel",
			status_code: 501,
			error_type: "user",
			error_origin: "user",
			generation_id: "req_video_lifecycle_test",
		});
	});

	it("returns the shared structured error response when the video API is disabled", async () => {
		const response = await videosRoutes.request("https://example.com/", {
			method: "GET",
		}, {
			VIDEO_API_ENABLED: "false",
		});

		expect(response.status).toBe(501);
		expect(await response.json()).toEqual({
			error: "not_implemented_yet",
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
			error: "validation_error",
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
			object: "video",
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

	it("preserves cancelled status when tombstoning cancelled videos", async () => {
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

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			id: "video_cancelled",
			object: "video",
			deleted: true,
		});
		expect(setVideoJobStatus).toHaveBeenCalledWith(
			"ws_video_lifecycle_test",
			"video_cancelled",
			"cancelled",
			expect.objectContaining({
				tombstoned: true,
				tombstonedAt: expect.any(String),
			}),
		);
	});
});
