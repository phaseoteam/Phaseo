import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ provider: "fal" }));

vi.mock("@pipeline/before/guards", () => ({
	guardAuth: vi.fn(async () => ({
		ok: true,
		value: {
			requestId: "req_fal_cancelled",
			workspaceId: "ws_fal_cancelled",
			apiKeyId: "key_fal_cancelled",
			apiKeyRef: null,
			apiKeyKid: null,
			internal: false,
		},
	})),
}));

vi.mock("@core/video-reconciliation", () => ({
	fetchVideoProviderStatus: vi.fn(async () => ({
		status: "cancelled",
		providerId: state.provider,
		model: "fal/kling-video/v2.5/turbo/pro/text-to-video",
		raw: { status: "CANCELLED" },
	})),
}));

vi.mock("./videos.helpers", async () => {
	const actual = await vi.importActual<typeof import("./videos.helpers")>("./videos.helpers");
	return {
		...actual,
		verifySignedVideoDownloadRequest: vi.fn(async () => null),
		requireOwnedVideoJob: vi.fn(async () => ({
			record: {
				workspaceId: "ws_fal_cancelled",
				videoId: "video_fal_cancelled",
				nativeId: "fal-task-cancelled",
				provider: state.provider,
				model: "fal/kling-video/v2.5/turbo/pro/text-to-video",
				status: "in_progress",
				createdAt: "2026-08-10T20:00:00.000Z",
				updatedAt: "2026-08-10T20:01:00.000Z",
			},
			meta: { provider: state.provider },
		})),
		finalizeVideoStatusIfTerminal: vi.fn(async () => undefined),
	};
});

import { getVideoContentHandler } from "./videos.get-content";
import * as videoHelpers from "./videos.helpers";

describe("getVideoContentHandler Fal cancellation", () => {
	it.each(["fal", "ltx"])("persists %s cancellation and returns an unavailable response", async (provider) => {
		state.provider = provider;
		const response = await getVideoContentHandler(
			new Request("https://api.phaseo.app/v1/videos/video_fal_cancelled/content"),
		);

		expect(response.ok).toBe(false);
		await expect(response.json()).resolves.toMatchObject({
			reason: "video_cancelled",
			request_id: "req_fal_cancelled",
			workspace_id: "ws_fal_cancelled",
			video_id: "video_fal_cancelled",
		});
		expect(videoHelpers.finalizeVideoStatusIfTerminal).toHaveBeenCalledWith(
			expect.objectContaining({
				videoId: "video_fal_cancelled",
				providerId: provider,
				status: "cancelled",
			}),
		);
	});
});
