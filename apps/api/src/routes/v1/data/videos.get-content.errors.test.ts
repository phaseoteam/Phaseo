import { afterEach, describe, expect, it, vi } from "vitest";
import * as videoHelpers from "./videos.helpers";

vi.mock("@pipeline/before/guards", () => ({
	guardAuth: vi.fn(async () => ({
		ok: true,
		value: {
			requestId: "req_video_content_error",
			workspaceId: "ws_video_content_error",
			apiKeyId: "key_video_content_error",
			apiKeyRef: null,
			apiKeyKid: null,
			internal: false,
		},
	})),
}));

vi.mock("./videos.helpers", async () => {
	const actual = await vi.importActual<typeof import("./videos.helpers")>("./videos.helpers");
	return {
		...actual,
		verifySignedVideoDownloadRequest: vi.fn(async () => null),
		finalizeVideoStatusIfTerminal: vi.fn(async () => {}),
		requireOwnedVideoJob: vi.fn(async () => ({
			record: {
				videoId: "video_xai_content_error",
				nativeId: "xai-native-content-123",
				provider: "x-ai",
				model: "x-ai/grok-video",
				status: "queued",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			meta: {
				provider: "x-ai",
				model: "x-ai/grok-video",
			},
		})),
		fetchXAiVideoStatus: vi.fn(async () =>
			new Response(
				JSON.stringify({
					error: {
						code: "PERMISSION_DENIED",
						message: "The caller does not have permission.",
					},
				}),
				{
					status: 403,
					headers: { "Content-Type": "application/json" },
				},
			),
		),
	};
});

import { getVideoContentHandler } from "./videos.get-content";

describe("getVideoContentHandler upstream error normalization", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("normalizes xAI content status fetch failures instead of proxying raw upstream JSON", async () => {
		const response = await getVideoContentHandler(
			new Request("https://api.phaseo.app/v1/videos/video_xai_content_error/content"),
		);

		expect(response.status).toBe(502);
		const payload = await response.json();
		expect(payload).toMatchObject({
			error: "upstream_error",
			reason: "xai_video_status_fetch_failed",
			request_id: "req_video_content_error",
			workspace_id: "ws_video_content_error",
			generation_id: "req_video_content_error",
			status_code: 502,
			error_type: "system",
			error_origin: "upstream",
			provider: "x-ai",
			upstream_status: 403,
			upstream_error: {
				code: "PERMISSION_DENIED",
				message: "The caller does not have permission.",
				description: "The caller does not have permission.",
			},
			provider_failure_diagnostics: {
				category: "provider_access_missing",
				provider: "x-ai",
			},
			video_native_id: "xai-native-content-123",
		});
	});

	it("normalizes xAI media download failures after a completed status poll", async () => {
		vi.mocked(videoHelpers.fetchXAiVideoStatus).mockImplementationOnce(async () =>
			new Response(
				JSON.stringify({
					status: "completed",
					model: "x-ai/grok-video",
					data: {
						output: [
							{ uri: "https://cdn.example/xai/video.mp4", mime_type: "video/mp4" },
						],
					},
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			),
		);
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				if (String(input) === "https://cdn.example/xai/video.mp4") {
					return new Response(
						JSON.stringify({
							error: {
								code: "PERMISSION_DENIED",
								message: "The caller does not have permission.",
							},
						}),
						{
							status: 403,
							headers: { "Content-Type": "application/json" },
						},
					);
				}
				throw new Error(`Unexpected fetch input: ${String(input)}`);
			}),
		);

		const response = await getVideoContentHandler(
			new Request("https://api.phaseo.app/v1/videos/video_xai_content_error/content"),
		);

		expect(response.status).toBe(502);
		const payload = await response.json();
		expect(payload).toMatchObject({
			error: "upstream_error",
			reason: "xai_video_content_fetch_failed",
			request_id: "req_video_content_error",
			workspace_id: "ws_video_content_error",
			provider: "x-ai",
			upstream_status: 403,
			upstream_error: {
				code: "PERMISSION_DENIED",
				message: "The caller does not have permission.",
				description: "The caller does not have permission.",
			},
			provider_failure_diagnostics: {
				category: "provider_access_missing",
				provider: "x-ai",
			},
			content_uri: "https://cdn.example/xai/video.mp4",
			video_native_id: "xai-native-content-123",
		});
	});
});
