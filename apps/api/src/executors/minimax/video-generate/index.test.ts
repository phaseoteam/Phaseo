import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IRVideoGenerationRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

const saveVideoJobMetaMock = vi.fn(async () => undefined);

vi.mock("@core/video-reservations", () => ({
	reserveVideoGenerationCredits: vi.fn(async () => ({
		reservationId: "video_hold:req_minimax_video_test",
		held: false,
		amountNanos: 0,
		status: "skip_zero_cost",
	})),
}));

vi.mock("@core/video-jobs", () => ({
	saveVideoJobMeta: (...args: unknown[]) => saveVideoJobMetaMock(...args),
}));

function buildArgs(
	ir: IRVideoGenerationRequest,
	providerModelSlug: string | null = null,
): ExecutorExecuteArgs {
	return {
		ir,
		requestId: "req_minimax_video_test",
		workspaceId: "team_test",
		providerId: "minimax",
		endpoint: "video.generation",
		protocol: "minimax.video",
		capability: "video.generate",
		providerModelSlug,
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

describe("minimax video executor", () => {
	it("stores upstream minimax task id for later polling", async () => {
		saveVideoJobMetaMock.mockClear();
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/v1/video_generation"),
				response: jsonResponse({ task_id: "task_123", status: "queued" }),
			},
		]);

		const result = await execute(
			buildArgs(
				{
					model: "minimax/hailuo-2.3",
					prompt: "A lantern floating on a river at dusk",
					size: "1080P",
					duration: 6,
					inputReference: "https://example.com/first-frame.png",
				},
				"MiniMax-Hailuo-2.3",
			),
		);

		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.ir && (result.ir as any).nativeId).toContain("mmxvid_");
		expect(saveVideoJobMetaMock).toHaveBeenCalledWith(
			"team_test",
			"req_minimax_video_test",
			expect.objectContaining({
				provider: "minimax",
				providerTaskId: "task_123",
			}),
			"task_123",
			"queued",
		);
	});

	it("rejects Hailuo 2.3 Fast without an input reference", async () => {
		const result = await execute(
			buildArgs(
				{
					model: "minimax/hailuo-2.3-fast",
					prompt: "A cat jumping over a puddle",
					size: "768P",
					duration: 6,
				},
				"MiniMax-Hailuo-2.3-Fast",
			),
		);

		expect(result.upstream?.status).toBe(400);
		const payload = await result.upstream?.json();
		expect(payload?.error?.type).toBe("input_reference_required");
	});

	it("maps video size to MiniMax resolution and omits size", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/v1/video_generation"),
				response: jsonResponse({ task_id: "task_123", status: "queued" }),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execute(
			buildArgs(
				{
					model: "minimax/hailuo-2.3",
					prompt: "A paper boat drifting through a moonlit canal",
					size: "1080P",
					duration: 6,
					inputReference: "https://example.com/first-frame.png",
				},
				"MiniMax-Hailuo-2.3",
			),
		);

		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedBody?.model).toBe("MiniMax-Hailuo-2.3");
		expect(capturedBody?.resolution).toBe("1080P");
		expect(capturedBody?.size).toBeUndefined();
		expect(capturedBody?.first_frame_image).toBe("https://example.com/first-frame.png");
	});
});
