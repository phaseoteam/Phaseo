import {
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
