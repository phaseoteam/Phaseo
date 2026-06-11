import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { IRVideoGenerationRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

const state = vi.hoisted(() => ({
	reservationResult: null as Record<string, unknown> | null,
	releaseCalls: [] as Array<Record<string, unknown>>,
	saveVideoJobMetaError: null as Error | null,
	saveVideoJobMetaCalls: [] as Array<unknown[]>,
}));

vi.mock("@core/video-reservations", () => ({
	isInsufficientVideoReservationStatus: (status: unknown) =>
		status === "insufficient_funds" || status === "insufficient_balance",
	reserveVideoGenerationCredits: vi.fn(async () => (
		state.reservationResult ?? {
			reservationId: "video_hold:req_openai_video_test",
			held: false,
			amountNanos: 0,
			status: "skip_zero_cost",
		}
	)),
}));

vi.mock("@core/wallet-reservations", () => ({
	releaseWalletReservation: vi.fn(async (args: Record<string, unknown>) => {
		state.releaseCalls.push(args);
		return {
			status: "released",
			applied: true,
			alreadyApplied: false,
			amountNanos: 123_000_000,
			beforeBalanceNanos: null,
			afterBalanceNanos: null,
			beforeReservedNanos: null,
			afterReservedNanos: null,
		};
	}),
}));

vi.mock("@core/video-jobs", () => ({
	saveVideoJobMeta: vi.fn(async (...args: unknown[]) => {
		state.saveVideoJobMetaCalls.push(args);
		if (state.saveVideoJobMetaError) throw state.saveVideoJobMetaError;
	}),
}));

function buildArgs(ir: IRVideoGenerationRequest): ExecutorExecuteArgs {
	return {
		ir,
		requestId: "req_openai_video_test",
		workspaceId: "team_test",
		providerId: "openai",
		endpoint: "video.generation",
		protocol: "openai.video",
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

describe("openai video executor", () => {
	beforeEach(() => {
		state.reservationResult = null;
		state.releaseCalls = [];
		state.saveVideoJobMetaError = null;
		state.saveVideoJobMetaCalls = [];
	});

	it("forwards OpenAI Sora request fields and omits quality", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/videos"),
				response: jsonResponse({ id: "vid_openai_1", status: "queued" }),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execute(buildArgs({
			model: "openai/sora-2",
			prompt: "A storm over the ocean",
			seconds: 8,
			size: "1280x720",
			quality: "high",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedBody).toMatchObject({
			model: "openai/sora-2",
			prompt: "A storm over the ocean",
			seconds: "8",
			size: "1280x720",
		});
		expect(capturedBody?.quality).toBeUndefined();
	});

	it("maps input_image object to multipart input_reference", async () => {
		let sentForm: FormData | undefined;
		const mock = installFetchMock([
			{
				match: (url) => url === "https://example.com/reference.png",
				response: new Response(new Uint8Array([1, 2, 3]), {
					status: 200,
					headers: { "Content-Type": "image/png" },
				}),
			},
			{
				match: (url, init) => {
					if (!url.includes("/videos")) return false;
					const body = init?.body;
					if (body && typeof (body as any).get === "function") {
						sentForm = body as FormData;
					}
					return true;
				},
				response: jsonResponse({ id: "vid_openai_2", status: "queued" }),
			},
		]);

		const result = await execute(buildArgs({
			model: "openai/sora-2",
			prompt: "Pan through a futuristic city",
			seconds: 6,
			resolution: "1280x720",
			inputImage: {
				url: "https://example.com/reference.png",
			},
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(sentForm).toBeDefined();
		expect(String(sentForm?.get("model"))).toBe("openai/sora-2");
		expect(String(sentForm?.get("prompt"))).toBe("Pan through a futuristic city");
		expect(String(sentForm?.get("seconds"))).toBe("6");
		expect(String(sentForm?.get("size"))).toBe("1280x720");
		const inputRef = sentForm?.get("input_reference");
		expect(inputRef).toBeTruthy();
	});

	it("releases a held reservation when OpenAI returns success without a video id", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_openai_video_test",
			held: true,
			amountNanos: 123_000_000,
			status: "held",
		};
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/videos"),
				response: jsonResponse({ status: "queued" }),
			},
		]);

		const result = await execute(buildArgs({
			model: "openai/sora-2",
			prompt: "A generated scene with no id from upstream",
			seconds: 8,
			size: "1280x720",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(502);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: {
				type: "invalid_upstream_response",
			},
		});
		expect(result.ir).toBeUndefined();
		expect(state.releaseCalls).toEqual([
			{
				workspaceId: "team_test",
				reservationId: "video_hold:req_openai_video_test",
				releaseRefId: "req_openai_video_test",
			},
		]);
	});

	it("fails the gateway response when OpenAI video metadata cannot be persisted", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_openai_video_test",
			held: true,
			amountNanos: 123_000_000,
			status: "held",
		};
		state.saveVideoJobMetaError = new Error("async operation store unavailable");
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/videos"),
				response: jsonResponse({ id: "vid_openai_meta_failed", status: "queued" }),
			},
		]);

		const result = await execute(buildArgs({
			model: "openai/sora-2",
			prompt: "A generated scene that cannot be tracked",
			seconds: 8,
			size: "1280x720",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(502);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: {
				type: "async_job_persistence_failed",
				native_video_id: "vid_openai_meta_failed",
				reservation_id: "video_hold:req_openai_video_test",
				reservation_status: "held",
			},
		});
		expect(result.ir).toBeUndefined();
		expect(state.saveVideoJobMetaCalls).toHaveLength(1);
		expect(state.releaseCalls).toEqual([]);
	});

	it("does not submit upstream when reservation pricing dimensions are missing", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_openai_video_test",
			held: false,
			amountNanos: 0,
			status: "skip_missing_seconds_or_pricing",
		};
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/videos"),
				response: jsonResponse({ id: "vid_should_not_submit", status: "queued" }),
			},
		]);

		const result = await execute(buildArgs({
			model: "openai/sora-2",
			prompt: "A generated scene without duration pricing dimensions",
			size: "1280x720",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(400);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: {
				type: "missing_billing_dimensions",
			},
		});
		expect(result.ir).toBeUndefined();
		expect(state.releaseCalls).toEqual([]);
		expect(mock.calls).toEqual([]);
	});

	it("returns insufficient_funds without upstream submission for insufficient balance reservations", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_openai_video_test",
			held: false,
			amountNanos: 123_000_000,
			status: "insufficient_balance",
		};
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/videos"),
				response: jsonResponse({ id: "vid_should_not_submit", status: "queued" }),
			},
		]);

		const result = await execute(buildArgs({
			model: "openai/sora-2",
			prompt: "A generated scene without enough credits",
			seconds: 8,
			size: "1280x720",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(402);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: {
				type: "insufficient_funds",
				message: "Insufficient available credits for video reservation hold.",
			},
		});
		expect(result.ir).toBeUndefined();
		expect(state.releaseCalls).toEqual([]);
		expect(mock.calls).toEqual([]);
	});
});
