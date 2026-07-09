import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@pipeline/before/guards", () => ({
	guardAuth: vi.fn(async () => ({
		ok: true,
		value: {
			requestId: "req_video_status_error",
			workspaceId: "ws_video_status_error",
			apiKeyId: "key_video_status_error",
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
		requireOwnedVideoJob: vi.fn(async () => ({
			record: {
				videoId: "video_xai_error",
				nativeId: "xai-native-123",
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

import { getVideoByIdHandler } from "./videos.get-by-id";

describe("getVideoByIdHandler upstream error normalization", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("normalizes SpaceXAI status fetch failures instead of proxying raw upstream JSON", async () => {
		const response = await getVideoByIdHandler(
			new Request("https://api.phaseo.ai/v1/videos/video_xai_error"),
		);

		expect(response.status).toBe(502);
		const payload = await response.json();
		expect(payload).toMatchObject({
			error: "upstream_error",
			reason: "xai_video_status_fetch_failed",
			request_id: "req_video_status_error",
			workspace_id: "ws_video_status_error",
			generation_id: "req_video_status_error",
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
			video_native_id: "xai-native-123",
		});
	});
});
