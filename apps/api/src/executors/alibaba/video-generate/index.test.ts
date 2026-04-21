import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IRVideoGenerationRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

const saveVideoJobMetaMock = vi.fn(async () => undefined);

vi.mock("@core/video-reservations", () => ({
	reserveVideoGenerationCredits: vi.fn(async () => ({
		reservationId: "video_hold:req_wan_video_test",
		held: false,
		amountNanos: 0,
		status: "skip_zero_cost",
	})),
}));

vi.mock("@core/video-jobs", () => ({
	saveVideoJobMeta: (...args: unknown[]) => saveVideoJobMetaMock(...args),
}));

function buildArgs(ir: IRVideoGenerationRequest, providerId = "alibaba"): ExecutorExecuteArgs {
	return {
		ir,
		requestId: "req_wan_video_test",
		workspaceId: "team_test",
		providerId,
		endpoint: "video.generation",
		protocol: "alibaba.video",
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

describe("alibaba wan video executor", () => {
	it("submits async wan task and stores upstream task id", async () => {
		saveVideoJobMetaMock.mockClear();
		let capturedBody: any = null;
		let capturedHeaders: Record<string, string> = {};
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/api/v1/services/aigc/video-generation/video-synthesis"),
				response: jsonResponse({
					output: {
						task_id: "wan_task_123",
						task_status: "PENDING",
					},
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
					capturedHeaders = call.headers;
				},
			},
		]);

		const result = await execute(buildArgs({
			model: "qwen/wan2.2-t2v-plus",
			prompt: "A calm mountain lake at sunrise",
			duration: 6,
			size: "1280x720",
		}));

		mock.restore();

		expect(capturedHeaders["X-DashScope-Async"]).toBe("enable");
		expect(capturedBody?.model).toBe("qwen/wan2.2-t2v-plus");
		expect(capturedBody?.input?.prompt).toBe("A calm mountain lake at sunrise");
		expect((result as any).ir?.nativeId).toContain("dscope_");
		expect(saveVideoJobMetaMock).toHaveBeenCalledWith(
			"team_test",
			"req_wan_video_test",
			expect.objectContaining({
				provider: "alibaba",
				providerTaskId: "wan_task_123",
			}),
			"wan_task_123",
			"queued",
		);
	});
});

