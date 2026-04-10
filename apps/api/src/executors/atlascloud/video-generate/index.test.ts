import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IRVideoGenerationRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

const saveVideoJobMetaMock = vi.fn(async () => undefined);

vi.mock("@core/video-reservations", () => ({
	reserveVideoGenerationCredits: vi.fn(async () => ({
		reservationId: "video_hold:req_atlas_video_test",
		held: false,
		amountNanos: 0,
		status: "skip_zero_cost",
	})),
}));

vi.mock("@core/video-jobs", () => ({
	saveVideoJobMeta: (...args: unknown[]) => saveVideoJobMetaMock(...args),
}));

function buildArgs(ir: IRVideoGenerationRequest, providerId = "atlascloud"): ExecutorExecuteArgs {
	return {
		ir,
		requestId: "req_atlas_video_test",
		teamId: "team_test",
		providerId,
		endpoint: "video.generation",
		protocol: "openai",
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

describe("atlascloud video executor", () => {
	it("submits async atlas task and stores prediction id", async () => {
		saveVideoJobMetaMock.mockClear();
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/api/v1/model/generateVideo"),
				response: jsonResponse({
					data: {
						id: "atlas_pred_123",
						status: "processing",
					},
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execute(buildArgs({
			model: "bytedance/seedance-2.0-pro",
			prompt: "A cinematic drone shot over Icelandic cliffs",
			duration: 6,
			size: "1280x720",
		}));

		mock.restore();

		expect(capturedBody?.model).toBe("bytedance/seedance-2.0-pro");
		expect(capturedBody?.prompt).toBe("A cinematic drone shot over Icelandic cliffs");
		expect((result as any).ir?.nativeId).toContain("atlsvid_");
		expect(saveVideoJobMetaMock).toHaveBeenCalledWith(
			"team_test",
			"req_atlas_video_test",
			expect.objectContaining({
				provider: "atlascloud",
				providerTaskId: "atlas_pred_123",
			}),
			"atlas_pred_123",
			"in_progress",
		);
	});
});
