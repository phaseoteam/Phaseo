import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setupTestRuntime, teardownTestRuntime } from "../../../../../tests/helpers/runtime";
import { installFetchMock, jsonResponse } from "../../../../../tests/helpers/mock-fetch";
import { execute } from "../adapter-bridge";

const saveVideoJobMetaMock = vi.fn(async () => undefined);
const state = vi.hoisted(() => ({
	reservationResult: null as Record<string, unknown> | null,
	reservationCalls: [] as Array<Record<string, unknown>>,
	releaseCalls: [] as Array<Record<string, unknown>>,
	saveVideoJobMetaError: null as Error | null,
}));

vi.mock("@core/video-reservations", () => ({
	isInsufficientVideoReservationStatus: (status: unknown) =>
		status === "insufficient_funds" || status === "insufficient_balance",
	reserveVideoGenerationCredits: vi.fn(async (args: Record<string, unknown>) => {
		state.reservationCalls.push(args);
		return state.reservationResult ?? {
			reservationId: "video_hold:req_bridge_video_1",
			held: false,
			amountNanos: 0,
			status: "skip_zero_cost",
		};
	}),
}));

vi.mock("@core/video-jobs", () => ({
	saveVideoJobMeta: (...args: unknown[]) => {
		if (state.saveVideoJobMetaError) throw state.saveVideoJobMetaError;
		return saveVideoJobMetaMock(...args);
	},
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

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("non-text adapter bridge", () => {
	beforeEach(() => {
		saveVideoJobMetaMock.mockClear();
		state.reservationResult = null;
		state.reservationCalls = [];
		state.releaseCalls = [];
		state.saveVideoJobMetaError = null;
	});

	it("routes ElevenLabs audio.speech and emits audio data + character usage", async () => {
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM"),
				response: new Response("AUDIO_BRIDGE", {
					status: 200,
					headers: {
						"Content-Type": "audio/mpeg",
						"request-id": "el_bridge_req_1",
					},
				}),
			},
		]);

		const result = await execute({
			ir: {
				model: "eleven-labs/eleven-v3",
				input: "Bridge level ElevenLabs TTS check",
				voice: "rachel",
				responseFormat: "mp3",
			},
			requestId: "req_bridge_tts_1",
			workspaceId: "team_test",
			providerId: "elevenlabs",
			endpoint: "audio.speech",
			byokMeta: [],
			pricingCard: {
				provider: "elevenlabs",
				model: "eleven-labs/eleven-v3",
				endpoint: "audio.speech",
				currency: "USD",
				rules: [
					{
						meter: "requests",
						unit: "request",
						unit_size: 1,
						price_per_unit: 1,
						currency: "USD",
						pricing_plan: "standard",
						note: null,
						match: [],
						priority: 100,
						effective_from: null,
						effective_to: null,
					},
				],
			},
			meta: {
				returnUpstreamRequest: true,
				echoUpstreamRequest: true,
			},
		} as any);

		mock.restore();

		expect(result.kind).toBe("completed");
		const irResult = result.ir as any;
		expect(irResult?.provider).toBe("elevenlabs");
		expect(irResult?.model).toBe("eleven-labs/eleven-v3");
		expect(irResult?.audio?.mimeType).toBe("audio/mpeg");
		expect(typeof irResult?.audio?.data).toBe("string");
		expect(irResult?.usage?.input_characters).toBe(
			"Bridge level ElevenLabs TTS check".length,
		);
		expect(result.mappedRequest).toContain("\"voice\":\"rachel\"");
	});

	it("passes OpenAI video fields through to compat providers and stores the async job id", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/videos"),
				response: jsonResponse({ id: "vid_456", status: "queued" }),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execute({
			ir: {
				model: "google/veo-3.1-generate-preview",
				prompt: "A quiet sunrise over the ocean.",
				seconds: 6,
				size: "1280x720",
				aspectRatio: "16:9",
				sampleCount: 1,
				compressionQuality: 70,
				negativePrompt: "low quality",
				seed: 42,
				generateAudio: true,
				rawRequest: {
					input_references: [
						{
							type: "image_url",
							reference_type: "style",
							image_url: { url: "https://example.com/style.png" },
						},
					],
				},
			},
			requestId: "req_bridge_video_1",
			workspaceId: "team_test",
			providerId: "novita",
			endpoint: "video.generation",
			byokMeta: [],
			pricingCard: {
				provider: "minimax",
				model: "google/veo-3.1-generate-preview",
				endpoint: "video.generation",
				currency: "USD",
				rules: [],
			},
			meta: {},
		} as any);

		mock.restore();

		expect(result.kind).toBe("completed");
		expect(capturedBody.model).toBe("google/veo-3.1-generate-preview");
		expect(capturedBody.prompt).toContain("sunrise");
		expect(capturedBody.seconds).toBe(6);
		expect(capturedBody.size).toBe("1280x720");
		expect(capturedBody.aspect_ratio).toBeUndefined();
		expect(capturedBody.sample_count).toBe(1);
		expect(capturedBody.compression_quality).toBe(70);
		expect(capturedBody.negative_prompt).toBe("low quality");
		expect(capturedBody.seed).toBe(42);
		expect(capturedBody.generate_audio).toBe(true);
		expect(capturedBody.input_reference).toBe("https://example.com/style.png");
		expect((result as any).ir?.nativeId).toBe("vid_456");
		expect(state.reservationCalls).toEqual([
			expect.objectContaining({
				workspaceId: "team_test",
				videoId: "req_bridge_video_1",
				providerId: "novita",
				model: "google/veo-3.1-generate-preview",
				seconds: 6,
			}),
		]);
		expect(saveVideoJobMetaMock).toHaveBeenCalledWith(
			"team_test",
			"req_bridge_video_1",
			expect.objectContaining({
				provider: "novita",
				providerTaskId: "vid_456",
				requestId: "req_bridge_video_1",
				reservationId: "video_hold:req_bridge_video_1",
				reservationStatus: "skip_zero_cost",
			}),
			"vid_456",
			"queued",
		);
	});

	it("releases a held video reservation when compat video success omits native id", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_bridge_video_1",
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

		const result = await execute({
			ir: {
				model: "google/veo-3.1-generate-preview",
				prompt: "A quiet sunrise over the ocean.",
				seconds: 6,
				size: "1280x720",
			},
			requestId: "req_bridge_video_1",
			workspaceId: "team_test",
			providerId: "novita",
			endpoint: "video.generation",
			byokMeta: [],
			pricingCard: {
				provider: "novita",
				model: "google/veo-3.1-generate-preview",
				endpoint: "video.generation",
				currency: "USD",
				rules: [],
			},
			meta: {},
		} as any);

		mock.restore();

		expect(result.upstream?.status).toBe(502);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: {
				type: "invalid_upstream_response",
			},
		});
		expect(result.ir).toBeUndefined();
		expect(saveVideoJobMetaMock).not.toHaveBeenCalled();
		expect(state.releaseCalls).toEqual([
			{
				workspaceId: "team_test",
				reservationId: "video_hold:req_bridge_video_1",
				releaseRefId: "req_bridge_video_1",
			},
		]);
	});

	it("fails the compat video response when async job metadata cannot be persisted", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_bridge_video_1",
			held: true,
			amountNanos: 123_000_000,
			status: "held",
		};
		state.saveVideoJobMetaError = new Error("async operation store unavailable");
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/videos"),
				response: jsonResponse({ id: "vid_bridge_meta_failed", status: "queued" }),
			},
		]);

		const result = await execute({
			ir: {
				model: "google/veo-3.1-generate-preview",
				prompt: "A quiet sunrise over the ocean.",
				seconds: 6,
				size: "1280x720",
			},
			requestId: "req_bridge_video_1",
			workspaceId: "team_test",
			providerId: "novita",
			endpoint: "video.generation",
			byokMeta: [],
			pricingCard: {
				provider: "novita",
				model: "google/veo-3.1-generate-preview",
				endpoint: "video.generation",
				currency: "USD",
				rules: [],
			},
			meta: {},
		} as any);

		mock.restore();

		expect(result.upstream?.status).toBe(502);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: {
				type: "async_job_persistence_failed",
				native_video_id: "vid_bridge_meta_failed",
				reservation_id: "video_hold:req_bridge_video_1",
				reservation_status: "held",
			},
		});
		expect(result.ir).toBeUndefined();
		expect(saveVideoJobMetaMock).not.toHaveBeenCalled();
		expect(state.releaseCalls).toEqual([]);
	});

	it("does not submit compat video upstream when reservation pricing dimensions are missing", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_bridge_video_1",
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

		const result = await execute({
			ir: {
				model: "google/veo-3.1-generate-preview",
				prompt: "A quiet sunrise over the ocean.",
				size: "1280x720",
			},
			requestId: "req_bridge_video_1",
			workspaceId: "team_test",
			providerId: "novita",
			endpoint: "video.generation",
			byokMeta: [],
			pricingCard: {
				provider: "novita",
				model: "google/veo-3.1-generate-preview",
				endpoint: "video.generation",
				currency: "USD",
				rules: [],
			},
			meta: {},
		} as any);

		mock.restore();

		expect(result.upstream?.status).toBe(400);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: {
				type: "missing_billing_dimensions",
			},
		});
		expect(result.ir).toBeUndefined();
		expect(saveVideoJobMetaMock).not.toHaveBeenCalled();
		expect(state.releaseCalls).toEqual([]);
		expect(mock.calls).toEqual([]);
	});

	it("preserves cancelled compat video lifecycle status instead of storing it as failed", async () => {
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/videos"),
				response: jsonResponse({ id: "vid_cancelled_456", status: "canceled" }),
			},
		]);

		const result = await execute({
			ir: {
				model: "google/veo-3.1-generate-preview",
				prompt: "A quiet sunrise over the ocean.",
				seconds: 6,
				size: "1280x720",
			},
			requestId: "req_bridge_video_cancelled",
			workspaceId: "team_test",
			providerId: "novita",
			endpoint: "video.generation",
			byokMeta: [],
			pricingCard: {
				provider: "novita",
				model: "google/veo-3.1-generate-preview",
				endpoint: "video.generation",
				currency: "USD",
				rules: [],
			},
			meta: {},
		} as any);

		mock.restore();

		expect(result.kind).toBe("completed");
		expect((result.ir as any)?.status).toBe("cancelled");
		expect(saveVideoJobMetaMock).toHaveBeenCalledWith(
			"team_test",
			"req_bridge_video_cancelled",
			expect.objectContaining({
				provider: "novita",
				providerTaskId: "vid_cancelled_456",
				requestId: "req_bridge_video_cancelled",
				reservationId: "video_hold:req_bridge_video_1",
			}),
			"vid_cancelled_456",
			"cancelled",
		);
		expect(state.releaseCalls).toEqual([]);
	});
});
