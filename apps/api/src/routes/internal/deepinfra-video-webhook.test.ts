import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), finalize: vi.fn(), dispatch: vi.fn() }));
vi.mock("@core/video-jobs", () => ({ getVideoJobRecord: mocks.get, saveVideoJobMeta: mocks.save }));
vi.mock("@core/video-finalization", () => ({ finalizeVideoJob: mocks.finalize }));
vi.mock("@core/video-user-webhooks", () => ({ dispatchVideoWebhookEventInBackground: mocks.dispatch }));
import { handleDeepinfraVideoWebhook } from "./deepinfra-video-webhook";
import { deepinfraTokenHash } from "@providers/deepinfra/video";
const token = "a".repeat(72);
const request = () => new Request(`https://api.phaseo.app/internal/video-webhooks/deepinfra?workspace=ws&request=job&token=${token}`);
const payload = { request_id: "native", inference_status: { status: "succeeded", cost: 1.2 }, results: { status: "ok", videos: ["/outputs/video.mp4"] } };
beforeEach(async () => {
	vi.resetAllMocks();
	mocks.get.mockResolvedValue({ provider: "deepinfra", model: "google/veo-3.1", status: "queued", nativeId: "native", meta: { provider: "deepinfra", seconds: 8, deepinfraCallbackHash: await deepinfraTokenHash(token) } });
});
describe("DeepInfra video callbacks", () => {
	it("persists native cost and output before settlement", async () => {
		expect((await handleDeepinfraVideoWebhook(request(), JSON.stringify(payload))).status).toBe(200);
		expect(mocks.save.mock.calls[0][2]).toMatchObject({ deepinfraNativeCostUsd: 1.2, downloadUrl: "https://api.deepinfra.com/outputs/video.mp4", submissionState: "accepted" });
		expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.finalize.mock.invocationCallOrder[0]);
	});
	it("rejects forged credentials and mismatched native IDs", async () => {
		expect((await handleDeepinfraVideoWebhook(new Request(request().url.replace(token, "b".repeat(72))), JSON.stringify(payload))).status).toBe(401);
		expect((await handleDeepinfraVideoWebhook(request(), JSON.stringify({ ...payload, request_id: "other" }))).status).toBe(409);
		expect(mocks.save).not.toHaveBeenCalled();
	});
	it("does not overwrite terminal cost on callback retry", async () => {
		const job = await mocks.get(); mocks.get.mockResolvedValue({ ...job, status: "completed" });
		await handleDeepinfraVideoWebhook(request(), JSON.stringify(payload));
		expect(mocks.save).not.toHaveBeenCalled();
		expect(mocks.finalize).toHaveBeenCalled();
	});
	it("rejects incomplete usage and accepts a failed job without output", async () => {
		expect((await handleDeepinfraVideoWebhook(request(), JSON.stringify({ ...payload, inference_status: { status: "succeeded" } }))).status).toBe(400);
		expect((await handleDeepinfraVideoWebhook(request(), JSON.stringify({ request_id: "native", inference_status: { status: "failed", cost: 0 } }))).status).toBe(200);
		expect(mocks.finalize).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
	});
});
