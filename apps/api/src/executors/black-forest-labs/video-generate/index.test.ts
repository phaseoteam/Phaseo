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

function args(extra: Record<string, unknown> = {}): ExecutorExecuteArgs {
	return { workspaceId: "ws", requestId: "video", providerId: "black-forest-labs", meta: {},
		ir: { model: "black-forest-labs/flux-3-video", prompt: "A landscape", duration: 5, ...extra } } as ExecutorExecuteArgs;
}
beforeEach(() => {
	vi.resetAllMocks();
	mocks.save.mockResolvedValue(undefined);
	mocks.status.mockResolvedValue(undefined);
	mocks.reserve.mockResolvedValue({ held: true, status: "held", reservationId: "hold", amountNanos: 208000000 });
});
describe("Black Forest Labs native video", () => {
	it("preserves continuation and draft pricing dimensions", async () => {
		mocks.fetch.mockResolvedValue(Response.json({ id: "native", polling_url: "https://api.bfl.ai/v1/get_result?id=native" }));
		await execute(args({ inputVideo: "https://example.com/source.mp4", providerParams: { draft: true } }));
		expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({ requestOptions: expect.objectContaining({ video_params: expect.objectContaining({ mode: "v2v", draft: true, resolution: "hd" }) }) }));
		expect(JSON.parse(mocks.fetch.mock.calls[0][2].body)).toMatchObject({ mode: "v2v", draft: true, start_video: "https://example.com/source.mp4" });
		expect(mocks.save).toHaveBeenLastCalledWith("ws", "video", expect.objectContaining({ bflMode: "v2v", bflDraft: true, bflPollingUrl: "https://api.bfl.ai/v1/get_result?id=native" }), "native", "queued");
	});
	it("retains the hold for an untrusted polling URL", async () => {
		mocks.fetch.mockResolvedValue(Response.json({ id: "native", polling_url: "https://example.com/steal-key" }));
		expect((await execute(args())).upstream?.status).toBe(502);
		expect(mocks.release).not.toHaveBeenCalled();
	});
	it("journals before submission and preserves the native task ID", async () => {
		mocks.fetch.mockResolvedValue(Response.json({ id: "native", polling_url: "https://api.bfl.ai/v1/get_result?id=native" }));
		const result = await execute(args({ inputReference: "https://example.com/start.png", lastFrame: "https://example.com/end.png", generateAudio: false }));
		expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.fetch.mock.invocationCallOrder[0]);
		expect(mocks.fetch.mock.calls[0][1]).toBe("https://api.bfl.ai/v1/flux-3-video");
		expect(JSON.parse(mocks.fetch.mock.calls[0][2].body)).toEqual({ mode: "i2v", prompt: "A landscape", keyframes: ["https://example.com/start.png", "https://example.com/end.png"], duration: 5, resolution: "hd", aspect_ratio: "auto", draft: false, generate_audio: false });
		expect(result.ir).toMatchObject({ nativeId: "native", status: "queued" });
		expect(mocks.save).toHaveBeenLastCalledWith("ws", "video", expect.objectContaining({ submissionState: "accepted", providerTaskId: "native" }), "native", "queued");
	});
	it("uses the model-specific text endpoint and numeric duration", async () => {
		mocks.fetch.mockResolvedValue(Response.json({ id: "native", polling_url: "https://api.bfl.ai/v1/get_result?id=native" }));
		await execute(args());
		expect(mocks.fetch.mock.calls[0][1]).toBe("https://api.bfl.ai/v1/flux-3-video");
		expect(JSON.parse(mocks.fetch.mock.calls[0][2].body)).toEqual({ mode: "t2v", prompt: "A landscape", duration: 5, resolution: "hd", aspect_ratio: "auto", draft: false, generate_audio: true });
	});
	it("sends qhd/uhd, 9:21 and safety_tolerance up to 7 with the matching pricing inputs", async () => {
		mocks.fetch.mockResolvedValue(Response.json({ id: "native", polling_url: "https://api.bfl.ai/v1/get_result?id=native" }));
		await execute(args({ resolution: "uhd", aspectRatio: "9:21", providerParams: { safety_tolerance: 7 } }));
		expect(JSON.parse(mocks.fetch.mock.calls[0][2].body)).toMatchObject({ resolution: "uhd", aspect_ratio: "9:21", safety_tolerance: 7 });
		expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({ seconds: 5, requestOptions: expect.objectContaining({ video_params: expect.objectContaining({ resolution: "uhd", mode: "t2v", draft: false }) }) }));
		mocks.fetch.mockClear();
		await execute(args({ size: "qhd", inputVideo: "https://example.com/source.mp4" }));
		expect(JSON.parse(mocks.fetch.mock.calls[0][2].body)).toMatchObject({ resolution: "qhd", mode: "v2v" });
	});
	it("refuses an unpriced resolution before submission", async () => {
		mocks.reserve.mockResolvedValue({ held: false, status: "skip_missing_seconds_or_pricing", reservationId: "hold", amountNanos: 0 });
		const result = await execute(args({ resolution: "qhd" }));
		expect(result.upstream?.status).toBe(400);
		expect(await result.upstream?.clone().json()).toMatchObject({ error: { message: expect.stringContaining("qhd") } });
		expect(mocks.fetch).not.toHaveBeenCalled();
		expect(mocks.save).not.toHaveBeenCalled();
	});
	it.each([{ duration: 30 }, { resolution: "1080p" }, { resolution: "qhd", providerParams: { draft: true } }, { providerParams: { safety_tolerance: 8 } }, { aspectRatio: "5:2" }, { providerParams: { service_tier: "flex" } }, { sampleCount: 2 }])("rejects unsupported dimensions before reservation", async (options) => {
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
