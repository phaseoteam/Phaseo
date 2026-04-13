import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IRMusicGenerateRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

const saveMusicJobMetaMock = vi.fn(async () => undefined);

vi.mock("@core/music-jobs", () => ({
	saveMusicJobMeta: (...args: unknown[]) => saveMusicJobMetaMock(...args),
}));

function buildArgs(
	ir: IRMusicGenerateRequest,
	providerModelSlug: string | null = "music-2.6-free",
): ExecutorExecuteArgs {
	return {
		ir,
		requestId: "req_minimax_music_test",
		teamId: "team_test",
		providerId: "minimax",
		endpoint: "music.generate",
		protocol: "minimax.music",
		capability: "music.generate",
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

describe("minimax music executor", () => {
	it("defaults prompt-only requests to instrumental mode instead of copying prompt into lyrics", async () => {
		let capturedBody: Record<string, unknown> | null = null;
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/v1/music_generation"),
				response: jsonResponse({
					task_id: "music_task_123",
					data: {
						status: 2,
						audio: "https://mini.example/generated.mp3",
					},
					base_resp: { status_code: 0, status_msg: "success" },
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson as Record<string, unknown>;
				},
			},
		]);

		const result = await execute(
			buildArgs({
				model: "minimax/music-2.6",
				prompt: "ambient cinematic with airy pads and subtle piano",
			}),
		);

		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.upstream?.status).toBe(200);
		expect(capturedBody?.prompt).toBe("ambient cinematic with airy pads and subtle piano");
		expect(capturedBody?.is_instrumental).toBe(true);
		expect(capturedBody?.lyrics).toBeUndefined();
	});

	it("returns validation error when non-instrumental is requested without lyrics", async () => {
		const result = await execute(
			buildArgs({
				model: "minimax/music-2.6",
				prompt: "epic orchestral pop",
				vendor: {
					minimax: {
						request: {
							is_instrumental: false,
						},
					},
				},
			}),
		);

		expect(result.kind).toBe("completed");
		expect(result.upstream?.status).toBe(400);
		const payload = await result.upstream?.json();
		expect(payload?.reason).toBe("lyrics_required_for_non_instrumental_minimax_music");
	});
});
