import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IRVideoGenerationRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute, __xAiVideoGenerateTestUtils } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

const saveVideoJobMetaMock = vi.fn(async () => undefined);

vi.mock("@core/video-reservations", () => ({
	reserveVideoGenerationCredits: vi.fn(async () => ({
		reservationId: "video_hold:req_xai_video_test",
		held: false,
		amountNanos: 0,
		status: "skip_zero_cost",
	})),
}));

vi.mock("@core/video-jobs", () => ({
	saveVideoJobMeta: (...args: unknown[]) => saveVideoJobMetaMock(...args),
}));

function buildArgs(ir: IRVideoGenerationRequest): ExecutorExecuteArgs {
	return {
		ir,
		requestId: "req_xai_video_test",
		workspaceId: "team_test",
		providerId: "x-ai",
		endpoint: "video.generation",
		protocol: "xai.video",
		capability: "video.generate",
		providerModelSlug: null,
		capabilityParams: null,
		byokMeta: [],
		pricingCard: null,
		meta: {},
	} as ExecutorExecuteArgs;
}

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("x-ai video executor", () => {
	it("normalizes Grok Imagine Video aliases", () => {
		expect(__xAiVideoGenerateTestUtils.normalizeXAiVideoModel("x-ai/grok-imagine-video")).toBe(
			"grok-imagine-video",
		);
		expect(__xAiVideoGenerateTestUtils.normalizeXAiVideoModel("grok-imagine-video-latest")).toBe(
			"grok-imagine-video",
		);
		expect(__xAiVideoGenerateTestUtils.normalizeXAiVideoModel("grok-video")).toBe("grok-video");
	});

	it("submits canonical imagine model id to upstream", async () => {
		saveVideoJobMetaMock.mockClear();
		let capturedBody: any = null;
		let capturedUrl = "";
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/videos/generations"),
				response: jsonResponse({
					id: "vid_123",
					status: "queued",
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
					capturedUrl = call.url;
				},
			},
		]);

		const result = await execute(buildArgs({
			model: "x-ai/grok-imagine-video-latest",
			prompt: "A neon city timelapse",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedUrl).toContain("/videos/generations");
		expect(capturedBody?.model).toBe("grok-imagine-video");
		expect((result as any).ir?.model).toBe("grok-imagine-video");
		expect((result as any).ir?.nativeId).toContain("xaivid_");
		expect(saveVideoJobMetaMock).toHaveBeenCalledWith(
			"team_test",
			"req_xai_video_test",
			expect.objectContaining({
				provider: "x-ai",
				providerTaskId: "vid_123",
			}),
			"vid_123",
			"queued",
		);
	});
});
