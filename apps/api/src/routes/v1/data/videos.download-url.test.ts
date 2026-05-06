import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	auth: {
		ok: true as const,
		value: {
			requestId: "req_video_download_test",
			workspaceId: "ws_video_download_test",
			apiKeyId: "key_video_download_test",
			apiKeyRef: null,
			apiKeyKid: null,
			internal: false,
		},
	},
	ownedVideo: {
		record: {
			videoId: "video_completed",
			workspaceId: "ws_video_download_test",
			status: "completed",
		},
		meta: {},
	} as Response | {
		record: Record<string, unknown>;
		meta: Record<string, unknown>;
	},
	signed: {
		download_url: "https://download.example/video.mp4",
		expires_at: 1_717_171_717,
	} as { download_url: string; expires_at: number } | null,
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
		issueSignedVideoDownloadUrl: vi.fn(async () => state.signed),
	};
});

import { videosRoutes } from "./videos";
import * as videoHelpers from "./videos.helpers";

describe("videosRoutes download_url", () => {
	beforeEach(() => {
		state.auth = {
			ok: true,
			value: {
				requestId: "req_video_download_test",
				workspaceId: "ws_video_download_test",
				apiKeyId: "key_video_download_test",
				apiKeyRef: null,
				apiKeyKid: null,
				internal: false,
			},
		};
		state.ownedVideo = {
			record: {
				videoId: "video_completed",
				workspaceId: "ws_video_download_test",
				status: "completed",
			},
			meta: {},
		};
		state.signed = {
			download_url: "https://download.example/video.mp4",
			expires_at: 1_717_171_717,
		};
		vi.clearAllMocks();
	});

	it("returns invalid_json for malformed request bodies", async () => {
		const response = await videosRoutes.request("https://example.com/video_bad_json/download_url", {
			method: "POST",
			body: "{",
		}, {
			VIDEO_API_ENABLED: "true",
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "invalid_json",
			reason: "invalid_video_download_request_body",
			request_id: "req_video_download_test",
			workspace_id: "ws_video_download_test",
			video_id: "video_bad_json",
			status_code: 400,
			error_type: "user",
			error_origin: "user",
			generation_id: "req_video_download_test",
		});
		expect(videoHelpers.requireOwnedVideoJob).not.toHaveBeenCalled();
	});

	it("rejects download URLs for non-completed videos", async () => {
		state.ownedVideo = {
			record: {
				videoId: "video_queued",
				workspaceId: "ws_video_download_test",
				status: "queued",
			},
			meta: {},
		};

		const response = await videosRoutes.request("https://example.com/video_queued/download_url", {
			method: "POST",
			body: JSON.stringify({}),
			headers: {
				"Content-Type": "application/json",
			},
		}, {
			VIDEO_API_ENABLED: "true",
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "validation_error",
			reason: "video_download_requires_completed_status",
			request_id: "req_video_download_test",
			workspace_id: "ws_video_download_test",
			video_id: "video_queued",
			status: "queued",
			status_code: 400,
			error_type: "user",
			error_origin: "user",
			generation_id: "req_video_download_test",
		});
		expect(videoHelpers.issueSignedVideoDownloadUrl).not.toHaveBeenCalled();
	});

	it("returns gateway_error when download signing is not configured", async () => {
		state.signed = null;

		const response = await videosRoutes.request("https://example.com/video_completed/download_url", {
			method: "POST",
			body: JSON.stringify({}),
			headers: {
				"Content-Type": "application/json",
			},
		}, {
			VIDEO_API_ENABLED: "true",
		});

		expect(response.status).toBe(500);
		expect(await response.json()).toMatchObject({
			error: "gateway_error",
			reason: "video_download_signing_not_configured",
			request_id: "req_video_download_test",
			workspace_id: "ws_video_download_test",
			video_id: "video_completed",
			status_code: 500,
			error_type: "system",
			error_origin: "gateway",
			generation_id: "req_video_download_test",
		});
	});

	it("returns a signed download URL for completed videos", async () => {
		const response = await videosRoutes.request("https://example.com/video_completed/download_url", {
			method: "POST",
			body: JSON.stringify({
				ttl_seconds: 900,
				disposition: "inline",
				index: 2,
			}),
			headers: {
				"Content-Type": "application/json",
			},
		}, {
			VIDEO_API_ENABLED: "true",
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			download_url: "https://download.example/video.mp4",
			expires_at: 1_717_171_717,
		});
		expect(videoHelpers.issueSignedVideoDownloadUrl).toHaveBeenCalledWith({
			requestUrl: "https://example.com/video_completed/download_url",
			workspaceId: "ws_video_download_test",
			videoId: "video_completed",
			index: 2,
			ttlSeconds: 900,
			disposition: "inline",
		});
	});
});
