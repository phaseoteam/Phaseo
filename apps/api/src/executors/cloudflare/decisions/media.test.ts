import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPublicMedia } from "@core/public-media-fetch";
import { prepareClefOmniMedia } from "./media";
import type { ExecutorExecuteArgs } from "@executors/types";
vi.mock("@core/public-media-fetch", () => ({ fetchPublicMedia: vi.fn() }));
const args = {} as ExecutorExecuteArgs;
const ir = { model: "cloudflare/clef-omni", state: "Review", questions: {} };
beforeEach(() => vi.resetAllMocks());
describe("Clef Omni media", () => {
	it("embeds remote media through the bounded public fetcher without provider credentials", async () => {
		vi.mocked(fetchPublicMedia).mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), contentType: "video/mp4", url: "https://media.example/clip.mp4" });
		expect(await prepareClefOmniMedia({ ...ir, videos: ["https://media.example/clip.mp4"] }, args))
			.toEqual({ videos: ["data:video/mp4;base64,AQID"] });
		expect(fetchPublicMedia).toHaveBeenCalledWith({ url: "https://media.example/clip.mp4", maxBytes: 16 * 1024 * 1024, upstreamTiming: undefined });
	});
	it("fails closed when the public fetcher rejects a private URL or redirect", async () => {
		vi.mocked(fetchPublicMedia).mockRejectedValue(new Error("remote_media_url_rejected_private_host"));
		await expect(prepareClefOmniMedia({ ...ir, videos: ["https://127.0.0.1/clip.mp4"] }, args)).rejects.toThrow();
	});
	it("rejects the wrong content type and invalid base64", async () => {
		vi.mocked(fetchPublicMedia).mockResolvedValue({ bytes: new Uint8Array([1]), contentType: "text/html", url: "https://media.example/page" });
		await expect(prepareClefOmniMedia({ ...ir, videos: ["https://media.example/page"] }, args)).rejects.toThrow();
		for (const video of ["data:video/mp4;base64,A", "data:video/mp4;base64,!!", "data:audio/wav;base64,AQID"])
			await expect(prepareClefOmniMedia({ ...ir, videos: [video] }, args)).rejects.toThrow();
	});
	it("rejects excessive counts before fetching anything", async () => {
		await expect(prepareClefOmniMedia({ ...ir, videos: Array(3).fill("https://media.example/clip.mp4") }, args)).rejects.toThrow();
		expect(fetchPublicMedia).not.toHaveBeenCalled();
	});
	it("enforces per-clip and combined decoded limits", async () => {
		const eightMiB = btoa("a".repeat(8 * 1024 * 1024));
		const audio = { type: "audio" as const, source: "data" as const, format: "wav" as const, data: eightMiB };
		await expect(prepareClefOmniMedia({ ...ir, audio: [audio, audio], videos: ["data:video/mp4;base64,AQID"] }, args)).rejects.toThrow();
		await expect(prepareClefOmniMedia({ ...ir, audio: [{ ...audio, data: btoa("a".repeat(8 * 1024 * 1024 + 1)) }] }, args)).rejects.toThrow();
	});
});
