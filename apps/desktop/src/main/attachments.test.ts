import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AttachmentService } from "./attachments";
import type { Attachment } from "../shared/workspace";

describe("attachment snapshots", () => {
	it("retains text and image bytes independently of their source files", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-attachments-")); const records = new Map<string, Attachment>();
		const service = new AttachmentService(path.join(root, "attachments"), { getAttachment: id => records.get(id), saveAttachment: value => { records.set(value.id, value); } });
		try {
			const source = path.join(root, "notes.txt"); writeFileSync(source, "Research 🌍");
			const text = await service.import("task", source); writeFileSync(source, "Changed"); expect((await service.read(text.id)).text).toBe("Research 🌍");
			const png = path.join(root, "image.png"); const pixels = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3n8AAAAASUVORK5CYII=", "base64"); writeFileSync(png, pixels);
			const image = await service.import("task", png); expect((await service.read(image.id)).dataUrl).toBe(`data:image/png;base64,${pixels.toString("base64")}`); expect(readFileSync((await service.read(image.id)).filePath)).toEqual(pixels);
			await expect(service.read("../outside")).rejects.toThrow("Invalid");
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
	it("rejects binary documents and oversized input before retaining it", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-attachments-")); const service = new AttachmentService(path.join(root, "attachments"), { getAttachment: () => undefined, saveAttachment: () => { throw new Error("Unexpected save"); } });
		try {
			const source = path.join(root, "document.bin"); writeFileSync(source, Buffer.from([0, 1, 2])); await expect(service.import("task", source)).rejects.toThrow("UTF-8 text");
			writeFileSync(source, Buffer.alloc(10 * 1024 * 1024 + 1)); await expect(service.import("task", source)).rejects.toThrow("up to 10 MB");
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
});
