import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { IRVideoGenerationRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

const state = vi.hoisted(() => ({
	reservationResult: null as Record<string, unknown> | null,
	reservationCalls: [] as Array<unknown[]>,
	releaseCalls: [] as Array<Record<string, unknown>>,
	batchFileMeta: null as Record<string, unknown> | null,
	batchFileMetaError: null as Error | null,
	batchFileMetaCalls: [] as Array<unknown[]>,
	saveVideoJobMetaError: null as Error | null,
	saveVideoJobMetaCalls: [] as Array<unknown[]>,
}));

vi.mock("@core/video-reservations", () => ({
	isInsufficientVideoReservationStatus: (status: unknown) =>
		status === "insufficient_funds" || status === "insufficient_balance",
	reserveVideoGenerationCredits: vi.fn(async (...args: unknown[]) => {
		state.reservationCalls.push(args);
		return state.reservationResult ?? {
			reservationId: "video_hold:req_openai_video_test",
			held: false,
			amountNanos: 0,
			status: "skip_zero_cost",
		};
	}),
}));

vi.mock("@core/batch-jobs", () => ({
	getBatchFileMeta: vi.fn(async (...args: unknown[]) => {
		state.batchFileMetaCalls.push(args);
		if (state.batchFileMetaError) throw state.batchFileMetaError;
		return state.batchFileMeta;
	}),
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
		if (state.saveVideoJobMetaError && (args[2] as any).submissionState !== "submitting") throw state.saveVideoJobMetaError;
	}),
}));

function buildArgs(ir: IRVideoGenerationRequest, overrides: Partial<ExecutorExecuteArgs> = {}): ExecutorExecuteArgs {
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
		...overrides,
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
		state.reservationCalls = [];
		state.releaseCalls = [];
		state.batchFileMeta = null;
		state.batchFileMetaError = null;
		state.batchFileMetaCalls = [];
		state.saveVideoJobMetaError = null;
		state.saveVideoJobMetaCalls = [];
	});

	it("forwards OpenAI Sora request fields and omits quality", async () => {
		let capturedBody: FormData | null = null;
		const mock = installFetchMock([
			{
				match: (url, init) => {
					if (!url.includes("/videos")) return false;
					capturedBody = init?.body as FormData;
					return true;
				},
				response: jsonResponse({ id: "vid_openai_1", status: "queued" }),
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
		expect(capturedBody).toBeInstanceOf(FormData);
		expect(capturedBody?.get("model")).toBe("openai/sora-2");
		expect(capturedBody?.get("prompt")).toBe("A storm over the ocean");
		expect(capturedBody?.get("seconds")).toBe("8");
		expect(capturedBody?.get("size")).toBe("1280x720");
		expect(capturedBody?.get("quality")).toBeNull();
	});

	it("preserves the OpenAI video lifecycle fields in IR", async () => {
		const mock = installFetchMock([{ match: (url) => url.includes("/videos"), response: jsonResponse({
			id: "video_native", object: "video", model: "sora-2", status: "in_progress", progress: 42,
			created_at: 1_712_697_600, completed_at: null, expires_at: null, error: null,
			prompt: "A storm", remixed_from_video_id: null, seconds: "8", size: "1280x720", quality: "standard",
		}) }]);
		const result = await execute(buildArgs({ model: "sora-2", prompt: "A storm", seconds: "8", size: "1280x720" }));
		mock.restore();
		expect(result.ir).toMatchObject({ nativeId: "video_native", status: "in_progress", progress: 42, createdAt: 1_712_697_600, seconds: "8", size: "1280x720", quality: "standard" });
	});

	it("sends JSON input_reference objects as JSON rather than multipart", async () => {
		state.batchFileMeta = { provider: "openai", keySource: "gateway" };
		let body: any;
		const mock = installFetchMock([{ match: (url) => url.includes("/videos"), response: jsonResponse({ id: "video_json", status: "queued" }), onRequest: (call) => { body = call.bodyJson; } }]);
		const result = await execute(buildArgs({ model: "sora-2-pro", prompt: "Reference a file", seconds: "12", size: "1792x1024", inputReference: { file_id: "file_123" } }));
		mock.restore();
		expect(result.upstream?.status).toBe(200);
		expect(state.batchFileMetaCalls).toEqual([["team_test", "file_123"]]);
		expect(body).toMatchObject({ model: "sora-2-pro", seconds: "12", size: "1792x1024", input_reference: { file_id: "file_123" } });
	});

	it.each([
		{
			label: "seconds",
			request: { model: "sora-2", prompt: "Unsupported duration", seconds: 20, size: "1280x720" },
			param: "seconds",
		},
		{
			label: "fractional seconds",
			request: { model: "sora-2", prompt: "Unsupported duration", seconds: 4.5, size: "1280x720" },
			param: "seconds",
		},
		{
			label: "size",
			request: { model: "sora-2", prompt: "Unsupported size", seconds: 8, size: "1920x1080" },
			param: "size",
		},
	])("rejects unsupported OpenAI video $label before reserving credits", async ({ request, param }) => {
		const mock = installFetchMock([
			{ match: () => true, response: jsonResponse({ id: "should_not_run" }) },
		]);
		const result = await execute(buildArgs(request));
		mock.restore();

		expect(result.upstream?.status).toBe(400);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: { type: "invalid_request_error", param },
		});
		expect(state.reservationCalls).toEqual([]);
		expect(mock.calls).toEqual([]);
	});

	it("accepts legacy workspace-owned OpenAI files without key source metadata", async () => {
		state.batchFileMeta = { provider: "openai" };
		const mock = installFetchMock([{
			match: (url) => url.includes("/videos"),
			response: jsonResponse({ id: "video_legacy_file", status: "queued" }),
		}]);
		const result = await execute(buildArgs({
			model: "sora-2",
			prompt: "Use a legacy workspace-owned file",
			seconds: "8",
			inputReference: { file_id: "file_legacy" },
		}));
		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(state.batchFileMetaCalls).toEqual([["team_test", "file_legacy"]]);
	});

	it("rejects an unowned gateway file before reserving credits or calling OpenAI", async () => {
		const mock = installFetchMock([
			{ match: (url) => url.includes("/videos"), response: jsonResponse({ id: "should_not_run" }) },
		]);

		const result = await execute(buildArgs({
			model: "sora-2",
			prompt: "Use another workspace's file",
			seconds: "8",
			inputReference: { file_id: "file_other_workspace" },
		}));
		mock.restore();

		expect(result.upstream?.status).toBe(404);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: { type: "file_not_found_or_not_owned" },
		});
		expect(state.batchFileMetaCalls).toEqual([["team_test", "file_other_workspace"]]);
		expect(state.reservationCalls).toEqual([]);
		expect(mock.calls).toEqual([]);
	});

	it("rejects gateway files registered for another provider or key source", async () => {
		for (const fileMeta of [
			{ provider: "mistral", keySource: "gateway" },
			{ provider: "openai", keySource: "byok" },
		]) {
			state.batchFileMeta = fileMeta;
			const result = await execute(buildArgs({
				model: "sora-2",
				prompt: "Use mismatched file metadata",
				seconds: "8",
				inputReference: { file_id: "file_mismatch" },
			}));
			expect(result.upstream?.status).toBe(404);
		}
		expect(state.reservationCalls).toEqual([]);
	});

	it("fails closed when gateway file ownership cannot be checked", async () => {
		state.batchFileMetaError = new Error("ownership store unavailable");
		const result = await execute(buildArgs({
			model: "sora-2",
			prompt: "Use a file while ownership storage is unavailable",
			seconds: "8",
			inputReference: { file_id: "file_unknown" },
		}));

		expect(result.upstream?.status).toBe(503);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: { type: "file_ownership_unavailable" },
		});
		expect(state.reservationCalls).toEqual([]);
	});

	it("allows BYOK file IDs without consulting gateway ownership metadata", async () => {
		let body: any;
		const mock = installFetchMock([{
			match: (url) => url.includes("/videos"),
			response: jsonResponse({ id: "video_byok", status: "queued" }),
			onRequest: (call) => { body = call.bodyJson; },
		}]);
		const result = await execute(buildArgs({
			model: "sora-2",
			prompt: "Use a file owned by the BYOK account",
			seconds: "8",
			inputReference: { file_id: "file_byok" },
		}, {
			byokMeta: [{
				id: "byok_openai",
				providerId: "openai",
				fingerprintSha256: "fingerprint",
				keyVersion: null,
				alwaysUse: true,
				key: "sk-byok-test",
			}],
		}));
		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(result.keySource).toBe("byok");
		expect(state.batchFileMetaCalls).toEqual([]);
		expect(body.input_reference).toEqual({ file_id: "file_byok" });
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
			seconds: 4,
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
		expect(String(sentForm?.get("seconds"))).toBe("4");
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
		expect(state.releaseCalls).toEqual([]);
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
		expect(state.saveVideoJobMetaCalls).toHaveLength(2);
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
