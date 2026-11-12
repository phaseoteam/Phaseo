import { describe, expect, it } from "vitest";
import { attachmentDetail, attachmentShape } from "./MessageAttachments";

const file = (name: string, kind: "text" | "image" | "audio" | "video", mimeType: string, size = 2048, pages?: number) => ({ name, kind, mimeType, size, ...(pages ? { pages } : {}) });

describe("sent attachment shapes", () => {
	it("draws media as media, long pastes as pasted text and everything else as a file card", () => {
		expect(attachmentShape(file("photo.png", "image", "image/png"))).toBe("image");
		expect(attachmentShape(file("clip.mp4", "video", "video/mp4"))).toBe("video");
		expect(attachmentShape(file("note.m4a", "audio", "audio/mp4"))).toBe("audio");
		expect(attachmentShape(file("pasted-text.txt", "text", "text/plain"))).toBe("pasted-text");
		expect(attachmentShape(file("pasted-text (2).txt", "text", "text/plain"))).toBe("pasted-text");
		expect(attachmentShape(file("notes.txt", "text", "text/plain"))).toBe("file");
		expect(attachmentShape(file("report.pdf", "text", "application/pdf"))).toBe("file");
	});
	it("describes a file by type, size and pages, and a paste by size alone", () => {
		expect(attachmentDetail(file("report.pdf", "text", "application/pdf", 1024 * 1024, 3))).toMatch(/^PDF · 1(\.0)? MB · 3 pages$/);
		expect(attachmentDetail(file("README.md", "text", "text/plain", 4096))).toMatch(/^MD · 4(\.0)? KB$/);
		expect(attachmentDetail(file("pasted-text.txt", "text", "text/plain", 4096))).toMatch(/^4(\.0)? KB$/);
		expect(attachmentDetail(file("Makefile", "text", "text/plain", 10))).toMatch(/^File · /);
	});
});
