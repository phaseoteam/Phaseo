import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	auth: {
		ok: true as const,
		value: {
			requestId: "req_video_collection_test",
			workspaceId: "ws_video_collection_test",
			apiKeyId: "key_video_collection_test",
			apiKeyRef: null,
			apiKeyKid: null,
			internal: false,
		},
	},
	records: [
		{
			videoId: "video_1",
			status: "completed",
			provider: "openai",
			model: "openai/sora",
			createdAt: "2026-05-05T00:00:00.000Z",
			updatedAt: "2026-05-05T00:01:00.000Z",
			meta: {},
		},
	],
	catalogue: [
		{
			model_id: "openai/sora",
			name: "Sora",
			status: "active",
			input_types: ["text"],
			output_types: ["video"],
			supported_params: ["duration"],
			providers: [
				{
					api_provider_id: "openai",
					params: ["duration"],
				},
			],
			pricing: {
				unit: "second",
			},
		},
	],
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

vi.mock("@core/video-jobs", async () => {
	const actual = await vi.importActual<typeof import("@core/video-jobs")>("@core/video-jobs");
	return {
		...actual,
		listTeamVideoJobs: vi.fn(async () => state.records),
		setVideoJobStatus: vi.fn(),
	};
});

vi.mock("../control/models.catalogue", () => ({
	fetchCatalogue: vi.fn(async () => state.catalogue),
}));

vi.mock("./videos.helpers", async () => {
	const actual = await vi.importActual<typeof import("./videos.helpers")>("./videos.helpers");
	return {
		...actual,
		toPublicVideoResponse: vi.fn(async ({ id, payload }: any) => ({
			id,
			object: "video",
			status: payload.status,
			provider: payload.provider,
			model: payload.model,
		})),
	};
});

import { listTeamVideoJobs } from "@core/video-jobs";
import { fetchCatalogue } from "../control/models.catalogue";
import { videosRoutes } from "./videos";

describe("videosRoutes collection endpoints", () => {
	beforeEach(() => {
		state.auth = {
			ok: true,
			value: {
				requestId: "req_video_collection_test",
				workspaceId: "ws_video_collection_test",
				apiKeyId: "key_video_collection_test",
				apiKeyRef: null,
				apiKeyKid: null,
				internal: false,
			},
		};
		state.records = [
			{
				videoId: "video_1",
				status: "completed",
				provider: "openai",
				model: "openai/sora",
				createdAt: "2026-05-05T00:00:00.000Z",
				updatedAt: "2026-05-05T00:01:00.000Z",
				meta: {},
			},
		];
		state.catalogue = [
			{
				model_id: "openai/sora",
				name: "Sora",
				status: "active",
				input_types: ["text"],
				output_types: ["video"],
				supported_params: ["duration"],
				providers: [
					{
						api_provider_id: "openai",
						params: ["duration"],
					},
				],
				pricing: {
					unit: "second",
				},
			},
		];
		vi.clearAllMocks();
	});

	it("lists owned videos using parsed limit and status filters", async () => {
		const response = await videosRoutes.request(
			"https://example.com/?limit=2&status=completed&status=failed",
			{
				method: "GET",
			},
			{
				VIDEO_API_ENABLED: "true",
			},
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			object: "list",
			data: [
				{
					id: "video_1",
					object: "video",
					status: "completed",
					provider: "openai",
					model: "openai/sora",
				},
			],
		});
		expect(listTeamVideoJobs).toHaveBeenCalledWith({
			workspaceId: "ws_video_collection_test",
			limit: 2,
			statuses: ["completed", "complete", "success", "succeeded", "failed", "error"],
		});
	});

	it("lists active video model capabilities", async () => {
		const response = await videosRoutes.request(
			"https://example.com/models",
			{
				method: "GET",
			},
			{
				VIDEO_API_ENABLED: "true",
			},
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			object: "list",
			data: [
				{
					model: "openai/sora",
					name: "Sora",
					status: "active",
					input_types: ["text"],
					output_types: ["video"],
					supported_params: ["duration"],
					providers: [
						{
							id: "openai",
							supported_params: ["duration"],
						},
					],
					pricing: {
						unit: "second",
					},
				},
			],
		});
		expect(fetchCatalogue).toHaveBeenCalledWith({
			endpoints: ["video.generation"],
			statuses: ["active"],
		});
	});
});
