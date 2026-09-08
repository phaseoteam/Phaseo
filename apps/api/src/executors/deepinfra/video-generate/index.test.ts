import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ save: vi.fn(), status: vi.fn(), release: vi.fn(), fetch: vi.fn(), reserve: vi.fn() }));
vi.mock("@core/video-jobs", () => ({ saveVideoJobMeta: mocks.save, setVideoJobStatus: mocks.status }));
vi.mock("@core/wallet-reservations", () => ({ releaseWalletReservation: mocks.release }));
vi.mock("@core/video-reservations", () => ({ reserveVideoGenerationCredits: mocks.reserve }));
vi.mock("@executors/_shared/timing/upstream", () => ({ fetchUpstream: mocks.fetch }));
vi.mock("@providers/openai-compatible/config", () => ({ resolveOpenAICompatKey: () => ({ source: "gateway", key: "test", byokId: null }) }));
vi.mock("@/runtime/env", () => ({ getBindings: () => ({ GATEWAY_PUBLIC_BASE_URL: "https://api.phaseo.app" }) }));
import { executor } from "./index";
import { deepinfraTokenHash } from "@providers/deepinfra/video";
const args = (ir = {}) => ({ workspaceId: "ws", requestId: "video", providerId: "deepinfra", providerModelSlug: "google/veo-3.1", meta: {}, ir: { model: "google/veo-3.1", prompt: "Ocean", ...ir } }) as any;
beforeEach(() => {
	vi.resetAllMocks();
	mocks.save.mockResolvedValue(undefined);
	mocks.reserve.mockResolvedValue({ held: true, status: "held", reservationId: "hold", amountNanos: 3200000000 });
});
describe("DeepInfra native video submission", () => {
	it("journals a hashed callback credential before the billable request", async () => {
		mocks.fetch.mockResolvedValue(Response.json({ request_id: "native", inference_status: { status: "queued" } }));
		const result = await executor(args());
		const body = JSON.parse(mocks.fetch.mock.calls[0][2].body);
		const token = new URL(body.webhook).searchParams.get("token")!;
		expect(body).toMatchObject({ prompt: "Ocean", sample_count: 1, resolution: "720p", generate_audio: true });
		expect(mocks.save.mock.calls[0][2].deepinfraCallbackHash).toBe(await deepinfraTokenHash(token));
		expect(JSON.stringify(mocks.save.mock.calls)).not.toContain(token);
		expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.fetch.mock.invocationCallOrder[0]);
		expect(result.ir).toMatchObject({ id: "video", nativeId: "native", status: "queued" });
	});
	it("retains the reservation after transport failure", async () => {
		mocks.fetch.mockRejectedValue(new Error("connection lost"));
		await expect(executor(args())).rejects.toThrow("connection lost");
		expect(mocks.release).not.toHaveBeenCalled();
		expect(mocks.status).not.toHaveBeenCalled();
	});
	it("releases a definitive rejection and avoids dispatch if journaling fails", async () => {
		mocks.fetch.mockResolvedValue(Response.json({ error: "invalid" }, { status: 400 }));
		await executor(args());
		expect(mocks.release).toHaveBeenCalled();
		mocks.fetch.mockClear(); mocks.save.mockRejectedValue(new Error("database down"));
		await expect(executor(args())).rejects.toThrow("database down");
		expect(mocks.fetch).not.toHaveBeenCalled();
	});
	it.each([{ seconds: 5 }, { sampleCount: 2 }, { providerParams: { webhook: "https://untrusted.test" } }])("rejects unsupported controls before billing", async ir => {
		expect((await executor(args(ir))).upstream?.status).toBe(400);
		expect(mocks.reserve).not.toHaveBeenCalled();
	});
});
