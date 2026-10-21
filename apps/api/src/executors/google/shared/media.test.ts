import { afterEach, describe, expect, it, vi } from "vitest";
import { irPartToGeminiPart } from "./media";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
	vi.restoreAllMocks();
});

describe("google shared media mapping", () => {
	it("maps data-url image input to inline_data", async () => {
		const part = await irPartToGeminiPart({
			type: "image",
			source: "url",
			data: "data:image/png;base64,aGVsbG8=",
		});

		expect(part).toEqual({
			inline_data: {
				mime_type: "image/png",
				data: "aGVsbG8=",
			},
		});
	});

	it("fetches remote image urls and inlines as base64", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue(
			new Response(Uint8Array.from([1, 2, 3]), {
				status: 200,
				headers: {
					"content-type": "image/png",
					"content-length": "3",
				},
			}),
		) as any;

		const part = await irPartToGeminiPart({
			type: "image",
			source: "url",
			data: "https://cdn.example.com/cat.png",
		});

		expect(globalThis.fetch).toHaveBeenCalledWith(
			"https://cdn.example.com/cat.png",
			expect.objectContaining({
				redirect: "manual",
				signal: expect.any(AbortSignal),
			}),
		);
		expect(part).toEqual({
			inline_data: {
				mime_type: "image/png",
				data: "AQID",
			},
		});
	});

	it("falls back to file_data when remote media cannot be fetched", async () => {
		globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down")) as any;

		const part = await irPartToGeminiPart({
			type: "video",
			source: "url",
			url: "https://cdn.example.com/clip.mp4",
		});

		expect(part).toEqual({
			file_data: {
				mime_type: "video/mp4",
				file_uri: "https://cdn.example.com/clip.mp4",
			},
		});
	});
	it.each([
		"https://www.youtube.com/watch?v=9hE5-98ZeCg",
		"https://youtu.be/9hE5-98ZeCg",
		"https://m.youtube.com/shorts/abc123",
	])("sends YouTube link %s as file_data without downloading the page", async (url) => {
		globalThis.fetch = vi.fn() as any;

		const part = await irPartToGeminiPart({ type: "video", source: "url", url });

		expect(globalThis.fetch).not.toHaveBeenCalled();
		expect(part).toEqual({ file_data: { mime_type: "video/mp4", file_uri: url } });
	});

	it("does not inline a web page served for an image URL", async () => {
		globalThis.fetch = vi.fn().mockImplementation(async () => new Response("<html>login</html>", {
			status: 200,
			headers: { "content-type": "text/html; charset=utf-8" },
		})) as any;

		const part = await irPartToGeminiPart({ type: "image", source: "url", data: "https://cdn.example.com/photo.jpg" });

		expect(part).toEqual({ file_data: { mime_type: "image/jpeg", file_uri: "https://cdn.example.com/photo.jpg" } });
	});

	it("sends a Gemini Files API image reference as file_data and refuses other file ids", async () => {
		expect(await irPartToGeminiPart({ type: "image", source: "id", data: "files/img123", mimeType: "image/png" }))
			.toEqual({ file_data: { mime_type: "image/png", file_uri: "files/img123" } });
		await expect(irPartToGeminiPart({ type: "image", source: "id", data: "file-abc" }))
			.rejects.toMatchObject({ code: "unsupported_parameter" });
	});
});

