import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AttachmentService, mediaMime } from "./attachments";
import { attachmentPrompt } from "./attachmentPrompt";
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
	it("recognises audio and video by their bytes and gives agents their paths", async () => {
		const ftyp = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from(`ftyp${brand}`, "ascii"), Buffer.alloc(12)]);
		expect(mediaMime(ftyp("isom"))).toEqual({ kind: "video", mimeType: "video/mp4" });
		expect(mediaMime(ftyp("qt  "))).toEqual({ kind: "video", mimeType: "video/quicktime" });
		expect(mediaMime(ftyp("M4A "))).toEqual({ kind: "audio", mimeType: "audio/mp4" });
		expect(mediaMime(Buffer.concat([Buffer.from("RIFF\0\0\0\0WAVE", "ascii"), Buffer.alloc(8)]))).toEqual({ kind: "audio", mimeType: "audio/wav" });
		expect(mediaMime(Buffer.from("ID3\x04\0\0", "latin1"))).toEqual({ kind: "audio", mimeType: "audio/mpeg" });
		expect(mediaMime(Buffer.from([0xff, 0xfb, 0x90, 0x00]))).toEqual({ kind: "audio", mimeType: "audio/mpeg" });
		expect(mediaMime(Buffer.from([0xff, 0xf1, 0x50, 0x80]))).toEqual({ kind: "audio", mimeType: "audio/aac" });
		// A UTF-16 text file and stray 0xFF bytes are not audio.
		expect(mediaMime(Buffer.from("﻿hello", "utf16le"))).toBeUndefined();
		expect(mediaMime(Buffer.from([0xff, 0xfb, 0xff, 0x00]))).toBeUndefined();
		const matroska = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0]);
		expect(mediaMime(matroska, "clip.webm")).toEqual({ kind: "video", mimeType: "video/webm" });
		expect(mediaMime(matroska, "voice.weba")).toEqual({ kind: "audio", mimeType: "audio/webm" });
		expect(mediaMime(Buffer.from("plain text", "utf8"))).toBeUndefined();
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-attachments-")); const records = new Map<string, Attachment>();
		const service = new AttachmentService(path.join(root, "attachments"), { getAttachment: id => records.get(id), saveAttachment: value => { records.set(value.id, value); } });
		try {
			const voice = await service.prepare("task", "voice.m4a", ftyp("M4A ")); records.set(voice.id, voice);
			expect(voice).toMatchObject({ kind: "audio", mimeType: "audio/mp4", name: "voice.m4a" });
			const content = await service.read(voice.id);
			expect(content.dataUrl).toMatch(/^data:audio\/mp4;base64,/);
			const prompt = attachmentPrompt("Transcribe this", [content]);
			expect(prompt).toContain("paths only");
			expect(prompt).toContain(content.filePath);
			expect(prompt).not.toContain("base64");
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
