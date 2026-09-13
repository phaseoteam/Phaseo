import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ provider: "fal" }));

vi.mock("@pipeline/before/guards", () => ({
	guardAuth: vi.fn(async () => ({
		ok: true,
		value: {
			requestId: "req_fal_cached",
			workspaceId: "ws_fal_cached",
			apiKeyId: "key_fal_cached",
			apiKeyRef: null,
			apiKeyKid: null,
			internal: false,
		},
	})),
}));

vi.mock("@core/video-reconciliation", () => ({
	fetchVideoProviderStatus: vi.fn(async () => null),
}));

vi.mock("./videos.helpers", async () => {
	const actual = await vi.importActual<typeof import("./videos.helpers")>("./videos.helpers");
	return {
		...actual,
		requireOwnedVideoJob: vi.fn(async () => ({
			record: {
				workspaceId: "ws_fal_cached",
				videoId: "video_fal_cached",
				nativeId: "fal-task-cached",
				provider: state.provider,
				model: "fal/kling-video/v2.5/turbo/pro/text-to-video",
				status: "completed",
				createdAt: "2026-08-10T20:00:00.000Z",
				updatedAt: "2026-08-10T20:01:00.000Z",
			},
			meta: {
				provider: state.provider,
				downloadUrl: "https://cdn.example.com/fal-output.mp4",
			},
		})),
		toPublicVideoResponse: vi.fn(async ({ payload }: { payload: Record<string, unknown> }) => payload),
	};
});

import { fetchVideoProviderStatus } from "@core/video-reconciliation";
import { getVideoByIdHandler } from "./videos.get-by-id";

describe("getVideoByIdHandler cached Fal terminal status", () => {
	it.each(["fal", "ltx"])("returns persisted %s results when polling is unavailable", async (provider) => {
		state.provider = provider;
		vi.mocked(fetchVideoProviderStatus).mockClear();
		const response = await getVideoByIdHandler(
			new Request("https://api.phaseo.app/v1/videos/video_fal_cached"),
		);

		expect(fetchVideoProviderStatus).toHaveBeenCalledTimes(1);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			id: "video_fal_cached",
			status: "completed",
			provider,
			output: [{ uri: "https://cdn.example.com/fal-output.mp4", mime_type: "video/mp4" }],
		});
	});
});
