import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPublicMedia } from "@core/public-media-fetch";
import { fetchRemoteMediaInline } from "./remote-media";

vi.mock("@core/public-media-fetch", () => ({ fetchPublicMedia: vi.fn() }));

const bytes = (text: string) => new TextEncoder().encode(text);

beforeEach(() => vi.resetAllMocks());

describe("fetchRemoteMediaInline", () => {
	it("downloads a text document once", async () => {
		vi.mocked(fetchPublicMedia).mockResolvedValue({ bytes: bytes("notes"), contentType: "text/plain; charset=utf-8", url: "https://files.example/notes.txt" });
		const result = await fetchRemoteMediaInline("https://files.example/notes.txt", { fallbackMimeType: "application/pdf", maxBytes: 1024 });
		expect(result).toEqual({ ok: true, mimeType: "text/plain", data: btoa("notes"), byteLength: 5 });
		expect(fetchPublicMedia).toHaveBeenCalledTimes(1);
	});

	it("downloads a Markdown or CSV document once", async () => {
		for (const contentType of ["text/markdown", "text/csv"]) {
			vi.mocked(fetchPublicMedia).mockReset().mockResolvedValue({ bytes: bytes("a,b"), contentType, url: "https://files.example/doc" });
			const result = await fetchRemoteMediaInline("https://files.example/doc", { fallbackMimeType: "text/plain", maxBytes: 1024 });
			expect(result).toMatchObject({ ok: true, mimeType: contentType });
			expect(fetchPublicMedia).toHaveBeenCalledTimes(1);
		}
	});

	it("still retries a document URL that answers with a web page", async () => {
		vi.mocked(fetchPublicMedia)
			.mockResolvedValueOnce({ bytes: bytes("<html>"), contentType: "text/html", url: "https://files.example/report.pdf" })
			.mockResolvedValueOnce({ bytes: bytes("%PDF"), contentType: "application/pdf", url: "https://files.example/report.pdf" });
		const result = await fetchRemoteMediaInline("https://files.example/report.pdf", { fallbackMimeType: "application/pdf", maxBytes: 1024 });
		expect(result).toMatchObject({ ok: true, mimeType: "application/pdf" });
		expect(fetchPublicMedia).toHaveBeenCalledTimes(2);
	});

	it("still retries an audio URL that answers with text", async () => {
		vi.mocked(fetchPublicMedia)
			.mockResolvedValueOnce({ bytes: bytes("denied"), contentType: "text/plain", url: "https://files.example/a.mp3" })
			.mockResolvedValueOnce({ bytes: new Uint8Array([1]), contentType: "audio/mpeg", url: "https://files.example/a.mp3" });
		const result = await fetchRemoteMediaInline("https://files.example/a.mp3", { fallbackMimeType: "audio/wav", maxBytes: 1024 });
		expect(result).toMatchObject({ ok: true, mimeType: "audio/mpeg" });
		expect(fetchPublicMedia).toHaveBeenCalledTimes(2);
	});

	it("still retries an image URL that answers with a web page", async () => {
		vi.mocked(fetchPublicMedia)
			.mockResolvedValueOnce({ bytes: bytes("<html>"), contentType: "text/html", url: "https://files.example/a.png" })
			.mockResolvedValueOnce({ bytes: new Uint8Array([137, 80]), contentType: "image/png", url: "https://files.example/a.png" });
		const result = await fetchRemoteMediaInline("https://files.example/a.png", { fallbackMimeType: "image/png", maxBytes: 1024 });
		expect(result).toMatchObject({ ok: true, mimeType: "image/png" });
		expect(fetchPublicMedia).toHaveBeenCalledTimes(2);
	});
});
