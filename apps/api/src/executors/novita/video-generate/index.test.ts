import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
const mocks = vi.hoisted(() => ({ save: vi.fn(), status: vi.fn(), release: vi.fn(), fetch: vi.fn(), reserve: vi.fn() }));
vi.mock("@core/video-jobs", () => ({ saveVideoJobMeta: mocks.save, setVideoJobStatus: mocks.status }));
vi.mock("@core/wallet-reservations", () => ({ releaseWalletReservation: mocks.release }));
vi.mock("@core/video-reservations", () => ({ reserveVideoGenerationCredits: mocks.reserve }));
vi.mock("@executors/_shared/timing/upstream", () => ({ fetchUpstream: mocks.fetch }));
vi.mock("@providers/keys", () => ({ resolveProviderKey: () => ({ source: "gateway", key: "test", byokId: null }) }));
vi.mock("@/runtime/env", () => ({ getBindings: () => ({}) }));
import { execute } from "./index";
import { decodeOpenAIVideoRequestToIR } from "@/pipeline/surfaces/video-codec";

function args(extra: Record<string, unknown> = {}): ExecutorExecuteArgs {
	return { workspaceId: "ws", requestId: "video", providerId: "novita", meta: {},
		ir: { model: "bytedance/seedance-1.5-pro", prompt: "A landscape", duration: 4, ...extra } } as ExecutorExecuteArgs;
}
beforeEach(() => {
	vi.resetAllMocks();
	mocks.save.mockResolvedValue(undefined);
	mocks.status.mockResolvedValue(undefined);
	mocks.reserve.mockResolvedValue({ held: true, status: "held", reservationId: "hold", amountNanos: 208000000 });
});
describe("Novita native video", () => {
	it.each(["kling2.5_turbo_pro", "kling2.1_master"])("submits %s through the unified API without dropping job ownership", async model => {
		for (const image of [undefined, "https://example.com/start.png"]) {
			mocks.fetch.mockResolvedValue(Response.json({ task_id: "unified-task" }));
			const result = await execute(args({ model, duration: 10, inputReference: image, providerParams: { guidance_scale: 0.6 } }));
			expect(result.ir).toMatchObject({ status: "queued", nativeId: "unified-task", seconds: "10" });
			expect(mocks.fetch.mock.calls.at(-1)?.[1]).toBe("https://api.novita.ai/v3/video/create");
			expect(JSON.parse(mocks.fetch.mock.calls.at(-1)?.[2].body)).toEqual({ model: `${model}_${image ? "i2v" : "t2v"}`, prompt: "A landscape", duration: "10", guidance_scale: 0.6, ...(image ? { image } : { aspect_ratio: "16:9" }) });
			expect(mocks.save).toHaveBeenLastCalledWith("ws", "video", expect.objectContaining({ providerTaskId: "unified-task", seconds: 10, audio: false }), "unified-task", "queued");
		}
	});
	it.each([{ duration: 4 }, { generateAudio: true }, { lastFrame: "https://example.com/end.png" }, { seed: 2 }, { providerParams: { guidance_scale: 2 } }, { providerParams: { cfg_scale: 0.5 } }])("rejects incompatible unified controls before reservation", async extra => {
		expect((await execute(args({ model: "kling2.5_turbo_pro", duration: 5, ...extra }))).upstream.status).toBe(400);
		expect(mocks.reserve).not.toHaveBeenCalled();
		expect(mocks.fetch).not.toHaveBeenCalled();
	});
	it("does not infer retired unified model routes", async () => {
		expect((await execute(args({ model: "wan2.6_t2v", duration: 5 }))).upstream.status).toBe(400);
		expect(mocks.fetch).not.toHaveBeenCalled();
	});
	it.each(["std", "pro", "4k"])("dispatches canonical Kling %s to the appropriate native endpoint", async tier => {
		for (const image of [undefined, "https://example.com/start.png"]) {
			mocks.fetch.mockResolvedValue(Response.json({ task_id: "native" }));
			const request = args({ model: `kling/kling-v3.0-${tier}`, inputReference: image });
			request.providerModelSlug = `kling-v3.0-${tier}`;
			expect((await execute(request)).ir).toMatchObject({ status: "queued" });
			expect(mocks.fetch.mock.calls.at(-1)?.[1]).toBe(`https://api.novita.ai/v3/async/kling-v3.0-${tier}-${image ? "i2v" : "t2v"}`);
		}
	});
	it("accepts first and last frames decoded from the public API", async () => {
		mocks.fetch.mockResolvedValue(Response.json({ task_id: "native" }));
		const request = args();
		request.ir = decodeOpenAIVideoRequestToIR({ model: "kling-v3.0-std-i2v", prompt: "A landscape", frame_images: [
			{ type: "image_url", frame_type: "first_frame", image_url: { url: "https://example.com/start.png" } },
			{ type: "image_url", frame_type: "last_frame", image_url: { url: "https://example.com/end.png" } },
		] });
		expect((await execute(request)).ir).toMatchObject({ status: "queued" });
		expect(JSON.parse(mocks.fetch.mock.calls[0][2].body)).toMatchObject({ image: "https://example.com/start.png", end_image: "https://example.com/end.png" });
	});
	it.each(["std", "pro"])("maps Kling %s text with audio-aware reservation options", async tier => {
		mocks.fetch.mockResolvedValue(Response.json({ task_id: "kling-task" }));
		const request = args({ model: `kling-v3.0-${tier}-t2v`, duration: 15, aspectRatio: "9:16", generateAudio: true, negativePrompt: "blur", providerParams: { cfg_scale: 0.7 } });
		const result = await execute(request);
		expect(mocks.fetch.mock.calls[0][1]).toBe(`https://api.novita.ai/v3/async/kling-v3.0-${tier}-t2v`);
		expect(JSON.parse(mocks.fetch.mock.calls[0][2].body)).toEqual({ prompt: "A landscape", duration: 15, aspect_ratio: "9:16", sound: true, negative_prompt: "blur", cfg_scale: 0.7 });
		expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({ seconds: 15, requestOptions: expect.objectContaining({ audio: true }) }));
		expect(result.ir).toMatchObject({ nativeId: "kling-task", status: "queued" });
	});
	it("maps Kling first and last frames without inventing size controls", async () => {
		mocks.fetch.mockResolvedValue(Response.json({ task_id: "kling-task" }));
		await execute(args({ model: "kling-v3.0-pro-i2v", inputReference: "https://example.com/start.png", lastFrame: "https://example.com/end.png" }));
		expect(JSON.parse(mocks.fetch.mock.calls[0][2].body)).toEqual({ prompt: "A landscape", duration: 4, sound: false, image: "https://example.com/start.png", end_image: "https://example.com/end.png" });
	});
	it.each([{ duration: 16 }, { seed: 3 }, { size: "720p" }, { inputReference: "https://example.com/start.png" }, { providerParams: { cfg_scale: 2 } }, { providerParams: { endpoint: "untrusted" } }])("rejects unsupported Kling requests before reservation", async options => {
		const result = await execute(args({ model: "kling-v3.0-std-t2v", ...options }));
		expect(result.upstream?.status).toBe(400);
		expect(mocks.reserve).not.toHaveBeenCalled();
		expect(mocks.fetch).not.toHaveBeenCalled();
	});
	it("prevents fallback or duplicate submission after a transport failure", async () => {
		mocks.fetch.mockRejectedValue(new Error("connection lost"));
		const result = await execute(args({ model: "kling-v3.0-pro-t2v" }));
		expect(result).toMatchObject({ terminal: true });
		expect(mocks.release).not.toHaveBeenCalled();
	});
	it("preserves the hold and prevents replay if accepted-job persistence fails", async () => {
		mocks.fetch.mockResolvedValue(Response.json({ task_id: "native" }));
		mocks.save.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("database unavailable"));
		const result = await execute(args({ model: "kling-v3.0-pro-t2v" }));
		expect(result).toMatchObject({ terminal: true });
		expect(result.upstream?.status).toBe(502);
		expect(mocks.release).not.toHaveBeenCalled();
	});
	it("journals before submission and preserves the native task ID", async () => {
		mocks.fetch.mockResolvedValue(Response.json({ id: "native" }));
		const result = await execute(args({ inputReference: "https://example.com/start.png", lastFrame: "https://example.com/end.png", generateAudio: false }));
		expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.fetch.mock.invocationCallOrder[0]);
		expect(mocks.fetch.mock.calls[0][1]).toBe("https://api.novita.ai/v3/async/seedance-v1.5-pro-i2v");
		expect(JSON.parse(mocks.fetch.mock.calls[0][2].body)).toEqual({ prompt: "A landscape", image: "https://example.com/start.png", last_image: "https://example.com/end.png", duration: 4, resolution: "720p", ratio: "adaptive", generate_audio: false });
		expect(result.ir).toMatchObject({ nativeId: "native", status: "queued" });
		expect(mocks.save).toHaveBeenLastCalledWith("ws", "video", expect.objectContaining({ submissionState: "accepted", providerTaskId: "native" }), "native", "queued");
	});
	it("uses the model-specific text endpoint and numeric duration", async () => {
		mocks.fetch.mockResolvedValue(Response.json({ id: "native" }));
		await execute(args());
		expect(mocks.fetch.mock.calls[0][1]).toBe("https://api.novita.ai/v3/async/seedance-v1.5-pro-t2v");
		expect(JSON.parse(mocks.fetch.mock.calls[0][2].body)).toEqual({ prompt: "A landscape", duration: 4, resolution: "720p", ratio: "16:9", generate_audio: true });
	});
	it.each([{ duration: 30 }, { resolution: "1080p" }, { providerParams: { service_tier: "flex" } }, { sampleCount: 2 }])("rejects unsupported dimensions before reservation", async (options) => {
		expect((await execute(args(options))).upstream?.status).toBe(400);
		expect(mocks.reserve).not.toHaveBeenCalled();
		expect(mocks.fetch).not.toHaveBeenCalled();
	});
	it("retains the hold when a successful response omits its task ID", async () => {
		mocks.fetch.mockResolvedValue(Response.json({}));
		expect((await execute(args())).upstream?.status).toBe(502);
		expect(mocks.release).not.toHaveBeenCalled();
		expect(mocks.status).toHaveBeenCalledWith("ws", "video", "pending", { submissionState: "unknown" });
	});
	it("does not submit if its journal cannot be saved", async () => {
		mocks.save.mockRejectedValue(new Error("database unavailable"));
		await expect(execute(args())).rejects.toThrow("database unavailable");
		expect(mocks.fetch).not.toHaveBeenCalled();
		expect(mocks.release).toHaveBeenCalled();
	});
});
