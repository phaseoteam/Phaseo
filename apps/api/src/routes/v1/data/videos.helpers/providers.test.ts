import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { VideoJobMeta, VideoJobRecord } from "@core/video-jobs";
import { installFetchMock, jsonResponse } from "../../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../../tests/helpers/runtime";
import { cancelFalTask, decodeFalVideoIdentity, extractVideoOutputFromPayload, fetchMiniMaxVideoTask, resolveDashscopeTaskId, resolveXAiNativeId, resolveGoogleVertexOperationName, resolveGoogleAiStudioOperationName, resolveMiniMaxTaskId, resolveByteplusTaskId, resolveRunwayTaskId, resolveAtlasTaskId } from "./providers";

beforeAll(() => setupRuntimeFromEnv({
	FAL_KEY: "test-fal-key",
	FAL_QUEUE_BASE_URL: "https://queue.fal.test",
	MINIMAX_API_KEY: "test-minimax-key",
}));
afterAll(() => teardownTestRuntime());

function record(provider: string, nativeId: string): VideoJobRecord {
	return { provider, nativeId } as VideoJobRecord;
}

function meta(provider: string, providerTaskId: string): VideoJobMeta {
	return { provider, providerTaskId } as VideoJobMeta;
}

describe("video provider task id resolution", () => {
	it("keeps AI Studio and Vertex operation credentials separate", () => {
		const operation = "models/veo-3.1-lite-generate-preview/operations/task";
		const videoMeta = { provider: "google-ai-studio", googleOperationName: operation } as VideoJobMeta;
		expect(resolveGoogleVertexOperationName(record("google-ai-studio", operation), videoMeta, "G-test")).toBeNull();
		expect(resolveGoogleAiStudioOperationName(record("google-ai-studio", operation), videoMeta, "G-test")).toBe(operation);
		const vertex = "projects/project/locations/us-central1/publishers/google/models/veo/operations/task";
		expect(resolveGoogleAiStudioOperationName(record("google-vertex", vertex), { provider: "google-vertex", googleOperationName: vertex } as VideoJobMeta, "G-test")).toBeNull();
	});
	it("does not route another provider's stored task through MiniMax, BytePlus, Runway or Atlas", () => {
		for (const resolve of [resolveMiniMaxTaskId, resolveByteplusTaskId, resolveRunwayTaskId, resolveAtlasTaskId]) {
			expect(resolve(record("fal", "fal-task"), meta("fal", "fal-task"), "G-test")).toBeNull();
		}
	});
	it("recognizes all xAI provider aliases", () => {
		for (const provider of ["spacex-ai", "x-ai", "xai"]) {
			expect(resolveXAiNativeId(record(provider, "xai_request_1"), meta(provider, "xai_request_1"), "video_1"))
				.toBe("xai_request_1");
		}
	});

	it("does not treat another provider task id as an Alibaba or xAI id", () => {
		const minimaxRecord = record("minimax", "minimax_task_1");
		const minimaxMeta = meta("minimax", "minimax_task_1");
		expect(resolveDashscopeTaskId(minimaxRecord, minimaxMeta, "video_1")).toBeNull();
		expect(resolveXAiNativeId(minimaxRecord, minimaxMeta, "video_1")).toBeNull();
	});
});

describe("fal queue lifecycle", () => {
	it("decodes the stored endpoint identity and sends the documented cancellation request", async () => {
		const encoded = btoa(JSON.stringify({
			endpoint: "bytedance/seedance-2.0/text-to-video",
			requestId: "fal_request_123",
		})).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
		const nativeId = `falvid_${encoded}`;
		expect(decodeFalVideoIdentity(nativeId)).toEqual({
			endpoint: "bytedance/seedance-2.0/text-to-video",
			requestId: "fal_request_123",
		});

		const mock = installFetchMock([{
			match: (url, init) => url === "https://queue.fal.test/bytedance/seedance-2.0/text-to-video/requests/fal_request_123/cancel" && init?.method === "PUT",
			response: jsonResponse({ status: "CANCELLATION_REQUESTED" }, { status: 202 }),
		}]);
		try {
			const response = await cancelFalTask({
				workspaceId: "team_test",
				requestId: "req_cancel_fal",
			} as any, meta("fal", nativeId), nativeId);
			expect(response.status).toBe(202);
			expect(mock.calls[0]).toMatchObject({
				method: "PUT",
				headers: { Authorization: "Key test-fal-key" },
			});
		} finally {
			mock.restore();
		}
	});
});

describe("MiniMax V1/V2 lifecycle", () => {
	it("polls H3 tasks through the V2 path and extracts nested task content", async () => {
		const mock = installFetchMock([{
			match: (url, init) => url === "https://api.minimax.io/v2/query/video_generation/task_h3" && init?.method === "GET",
			response: jsonResponse({ task: { status: "succeeded", content: { url: "https://cdn.example.com/h3.mp4" } } }),
		}]);
		try {
			const response = await fetchMiniMaxVideoTask(
				{ workspaceId: "team_test", requestId: "req_h3" } as any,
				{ ...meta("minimax", "task_h3"), model: "MiniMax-H3" },
				"task_h3",
			);
			expect(response).toBeInstanceOf(Response);
			expect(mock.calls[0]?.url).toContain("/v2/query/video_generation/task_h3");
			const payload = await (response as Response).clone().json();
			expect(extractVideoOutputFromPayload(payload)).toEqual([{ index: 0, uri: "https://cdn.example.com/h3.mp4", mime_type: "video/mp4" }]);
		} finally {
			mock.restore();
		}
	});

	it("keeps legacy MiniMax models on the V1 polling path", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.minimax.io/v1/query/video_generation?task_id=task_v1",
			response: jsonResponse({ status: "Success", video_url: "https://cdn.example.com/v1.mp4" }),
		}]);
		try {
			await fetchMiniMaxVideoTask(
				{ workspaceId: "team_test", requestId: "req_v1" } as any,
				{ provider: "minimax", model: "MiniMax-Hailuo-2.3", providerTaskId: "task_v1" },
				"task_v1",
			);
			expect(mock.calls[0]?.url).toContain("/v1/query/video_generation?task_id=task_v1");
		} finally {
			mock.restore();
		}
	});
});
