import { describe, it, expect } from "vitest";
import {
	extractGeneratedImageUrls,
	isGeneratedDataImage,
	sanitizeGeneratedImageSrc,
	stripMarkdownLink,
	normalizeAttachmentFile,
	normalizeAttachmentFiles,
} from "./chatConversationHelpers";

describe("normalizeAttachmentFile", () => {
	it("infers HEIC and AVIF image types when dragged files have no MIME type", () => {
		const heic = new File(["heic"], "photo.HEIC", {
			type: "application/octet-stream",
		});
		const avif = new File(["avif"], "preview.avif");

		expect(normalizeAttachmentFile(heic).type).toBe("image/heic");
		expect(normalizeAttachmentFile(avif).type).toBe("image/avif");
	});

	it("keeps other sendable input categories classified when their type is missing", () => {
		const files = [
			new File(["png"], "photo.PNG"),
			new File(["audio"], "voice.m4a"),
			new File(["video"], "clip.MOV"),
			new File(["pdf"], "document.pdf"),
			new File(["text"], "notes.txt"),
		];

		expect(normalizeAttachmentFiles(files).map((file) => file.type)).toEqual([
			"image/png",
			"audio/mp4",
			"video/quicktime",
			"application/pdf",
			"text/plain",
		]);
	});

	it("keeps a declared MIME type and normalizes each file in a batch", () => {
		const declared = new File(["data"], "photo.heic", { type: "image/heic" });
		const unknown = new File(["data"], "data.bin");

		expect(normalizeAttachmentFile(declared)).toBe(declared);
		expect(normalizeAttachmentFiles([declared, unknown])).toEqual([
			declared,
			unknown,
		]);
	});
});

describe("generated images in assistant replies", () => {
	const svg = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=";
	const gif = "data:image/gif;base64,R0lGODlh";

	it("finds every generated image and strips them all from the text", () => {
		const content = `Here you go.\n\n![Generated image 1](${svg})\n\n![Generated image 2](${gif})`;
		const urls = extractGeneratedImageUrls(content).map((url) => sanitizeGeneratedImageSrc(url));
		expect(urls).toEqual([svg, gif]);
		expect(urls.reduce((text, url) => stripMarkdownLink(text, url!), content)).toBe("Here you go.");
	});

	it("allows base64 image data and http(s), and nothing else", () => {
		expect(sanitizeGeneratedImageSrc("data:image/png;base64,iVBORw0KGgo=")).toBe("data:image/png;base64,iVBORw0KGgo=");
		expect(sanitizeGeneratedImageSrc("https://example.com/a.png")).toBe("https://example.com/a.png");
		expect(sanitizeGeneratedImageSrc("data:text/html;base64,PHNjcmlwdD4=")).toBeNull();
		expect(sanitizeGeneratedImageSrc("data:image/svg+xml,<svg onload=alert(1)>")).toBeNull();
		expect(sanitizeGeneratedImageSrc("javascript:alert(1)")).toBeNull();
	});

	it("never offers a data image as a link target", () => {
		expect(isGeneratedDataImage(svg)).toBe(true);
		expect(isGeneratedDataImage("https://example.com/a.png")).toBe(false);
		const upper = sanitizeGeneratedImageSrc("DATA:image/svg+xml;base64,PHN2Zz48L3N2Zz4=");
		expect(upper).not.toBeNull();
		expect(isGeneratedDataImage(upper!)).toBe(true);
	});
});
